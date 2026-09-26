import { PoolClient } from 'pg';
import {
  ApprovalUnavailableError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { pool } from '../../db/pool';
import { approvalThresholdsRepository } from '../approval-thresholds/approvalThresholds.repository';
import { approvalsRepository } from '../approvals/approvals.repository';
import { auditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { stockMovementsRepository } from '../inventory/stockMovements.repository';
import { paymentsRepository } from '../sales/payments.repository';
import { registerSessionsRepository } from '../registers/registerSessions.repository';
import { refundGateway } from './refundGateway';
import { ReturnDetail, ReturnRequestItem, ReturnRow } from './returns.types';
import { returnsRepository } from './returns.repository';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function localDateNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
}

function validateRequest(items: ReturnRequestItem[], reason: string): void {
  if (!reason.trim()) throw new ValidationError('reason is required');
  if (!items.length) throw new ValidationError('At least one return item is required');
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0)
      throw new ValidationError('Return quantities must be positive integers');
    if (typeof item.resellable !== 'boolean')
      throw new ValidationError('resellable is required for each item');
  }
}

async function issueRefunds(
  returnRow: ReturnRow,
  total: number,
  client: PoolClient,
): Promise<boolean> {
  if (returnRow.sale_id === null) {
    await returnsRepository.addRefund(returnRow.id, null, 'CASH', total, 'COMPLETED', null, client);
    return true;
  }
  const payments = await paymentsRepository.findCapturedBySaleId(returnRow.sale_id, client);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  if (paid <= 0 || total > paid) throw new ConflictError('Refund exceeds the original paid amount');

  let allocated = 0;
  let allCompleted = true;
  for (let index = 0; index < payments.length; index += 1) {
    const payment = payments[index];
    const amount =
      index === payments.length - 1
        ? round2(total - allocated)
        : round2(total * (Number(payment.amount) / paid));
    allocated = round2(allocated + amount);
    if (amount <= 0) continue;
    const status =
      payment.method === 'CARD' ? await refundGateway.refundCard(payment.id, amount) : 'COMPLETED';
    if (status === 'FAILED') allCompleted = false;
    await returnsRepository.addRefund(
      returnRow.id,
      payment.id,
      payment.method,
      amount,
      status,
      status === 'FAILED' ? 'CARD_REVERSAL_FAILED' : null,
      client,
    );
  }
  return allCompleted;
}

async function finalizeReturn(
  returnId: number,
  actorId: number,
  client: PoolClient,
): Promise<ReturnDetail> {
  const returnRow = await returnsRepository.findByIdForUpdate(returnId, client);
  if (!returnRow) throw new NotFoundError('Return not found');
  if (returnRow.status !== 'REQUESTED') throw new ConflictError('Return has already been decided');
  const detail = await returnsRepository.findDetail(returnId, client);
  if (!detail) throw new NotFoundError('Return not found');

  await returnsRepository.setStatus(returnId, 'APPROVED', client);
  for (const item of detail.items.filter((candidate) => candidate.resellable)) {
    const productResult = await client.query<{ current_stock: number }>(
      'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
      [item.product_id],
    );
    if (!productResult.rows[0]) throw new NotFoundError('Product not found');
    const resultingStock = productResult.rows[0].current_stock + item.quantity;
    await client.query('UPDATE products SET current_stock = $2, updated_at = now() WHERE id = $1', [
      item.product_id,
      resultingStock,
    ]);
    await stockMovementsRepository.insert(
      {
        productId: item.product_id,
        movementType: 'RETURN_RESTOCK',
        quantityDelta: item.quantity,
        resultingStock,
        referenceType: 'RETURN_ITEM',
        referenceId: item.id,
        reason: returnRow.reason,
        performedBy: actorId,
      },
      client,
    );
  }

  const completed = await issueRefunds(returnRow, detail.total_refund_amount, client);
  if (completed) await returnsRepository.setStatus(returnId, 'REFUNDED', client);
  await auditService.record(
    {
      actorId,
      actionType: 'RETURN_REFUNDED',
      entityType: 'RETURN',
      entityId: returnId,
      reason: returnRow.reason,
      afterSnapshot: {
        amount: detail.total_refund_amount,
        status: completed ? 'REFUNDED' : 'APPROVED',
      },
    },
    client,
  );
  return (await returnsRepository.findDetail(returnId, client))!;
}

export const returnsService = {
  async create(
    actingUser: AuthenticatedUser,
    input: { saleId?: number; items: ReturnRequestItem[]; reason: string },
  ): Promise<{ approval_pending: boolean; approval_id?: number; return: ReturnDetail }> {
    validateRequest(input.items, input.reason);
    const session =
      actingUser.role === 'CASHIER'
        ? await registerSessionsRepository.findOpenByCashierId(actingUser.id)
        : null;
    if (actingUser.role === 'CASHIER' && !session)
      throw new ConflictError('An open register session is required');
    const threshold = await approvalThresholdsRepository.getCurrentEffective(actingUser.roleId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let total = 0;
      const saleId: number | null = input.saleId ?? null;
      const calculated: Array<{
        saleItemId: number | null;
        productId: number;
        quantity: number;
        refundAmount: number;
        resellable: boolean;
      }> = [];

      if (saleId !== null) {
        const saleResult = await client.query<{ status: string; completed_at: Date | null }>(
          'SELECT status, completed_at FROM sales WHERE id = $1 FOR SHARE',
          [saleId],
        );
        const sale = saleResult.rows[0];
        if (!sale) throw new NotFoundError('Sale not found');
        if (sale.status !== 'COMPLETED' || !sale.completed_at)
          throw new ConflictError('Only completed sales can be returned');
        const days =
          (localDateNumber(new Date()) - localDateNumber(sale.completed_at)) / 86_400_000;
        if (days > 7) throw new ConflictError('The 7-day return window has expired');

        for (const requested of input.items) {
          if (!requested.saleItemId)
            throw new ValidationError('sale_item_id is required for receipted returns');
          const lineResult = await client.query<{
            id: number;
            sale_id: number;
            product_id: number;
            quantity: number;
            line_total: string;
          }>(
            'SELECT id, sale_id, product_id, quantity, line_total FROM sale_items WHERE id = $1 FOR UPDATE',
            [requested.saleItemId],
          );
          const line = lineResult.rows[0];
          if (!line || line.sale_id !== saleId)
            throw new ValidationError('Return item does not belong to the selected sale');
          const alreadyReturned = await returnsRepository.returnedQuantityForSaleItem(
            line.id,
            client,
          );
          if (alreadyReturned + requested.quantity > line.quantity)
            throw new ConflictError('Return quantity exceeds the remaining returnable quantity');
          const refundAmount = round2(
            (Number(line.line_total) * requested.quantity) / line.quantity,
          );
          total = round2(total + refundAmount);
          calculated.push({
            saleItemId: line.id,
            productId: line.product_id,
            quantity: requested.quantity,
            refundAmount,
            resellable: requested.resellable,
          });
        }
      } else {
        for (const requested of input.items) {
          if (!requested.productId)
            throw new ValidationError('product_id is required for no-receipt returns');
          const product = await client.query<{ id: number; current_price: string }>(
            'SELECT id, current_price FROM products WHERE id = $1 AND is_active = true',
            [requested.productId],
          );
          if (!product.rows[0]) throw new NotFoundError('Product not found');
          const refundAmount = round2(Number(product.rows[0].current_price) * requested.quantity);
          total = round2(total + refundAmount);
          calculated.push({
            saleItemId: null,
            productId: requested.productId,
            quantity: requested.quantity,
            refundAmount,
            resellable: requested.resellable,
          });
        }
      }

      const requiresManager =
        saleId === null || !threshold || total > Number(threshold.max_self_refund_amt);
      if (requiresManager && !(await approvalsRepository.hasActiveApprover())) {
        throw new ApprovalUnavailableError();
      }
      const created = await returnsRepository.create(
        {
          saleId,
          registerSessionId: session?.id ?? null,
          reason: input.reason.trim(),
          requiresManager,
          requestedBy: actingUser.id,
        },
        client,
      );
      for (const item of calculated) await returnsRepository.addItem(created.id, item, client);

      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'RETURN_REQUESTED',
          entityType: 'RETURN',
          entityId: created.id,
          reason: input.reason.trim(),
          afterSnapshot: { sale_id: saleId, amount: total, requires_manager: requiresManager },
        },
        client,
      );

      if (requiresManager) {
        const approval = await approvalsRepository.createReturn(
          created.id,
          saleId === null ? 'RETURN_NO_RECEIPT' : 'RETURN_WITH_RECEIPT',
          actingUser.id,
          total,
          { returnId: created.id, refundAmount: total },
          client,
        );
        await returnsRepository.attachApproval(created.id, approval.id, client);
        await client.query('COMMIT');
        return {
          approval_pending: true,
          approval_id: approval.id,
          return: (await returnsRepository.findDetail(created.id))!,
        };
      }

      const result = await finalizeReturn(created.id, actingUser.id, client);
      await client.query('COMMIT');
      return { approval_pending: false, return: result };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async get(actingUser: AuthenticatedUser, id: number): Promise<ReturnDetail> {
    const result = await returnsRepository.findDetail(id);
    if (!result) throw new NotFoundError('Return not found');
    if (actingUser.role === 'CASHIER' && result.requested_by !== actingUser.id)
      throw new AuthorizationError();
    return result;
  },

  async list(filters: { saleId?: number; status?: string }): Promise<ReturnDetail[]> {
    if (
      filters.status &&
      !['REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'].includes(filters.status)
    )
      throw new ValidationError('Invalid return status');
    return returnsRepository.list(filters);
  },

  async approveAndRefund(
    returnId: number,
    actorId: number,
    client: PoolClient,
  ): Promise<ReturnDetail> {
    return finalizeReturn(returnId, actorId, client);
  },

  async reject(
    returnId: number,
    actorId: number,
    reason: string | undefined,
    client: PoolClient,
  ): Promise<ReturnDetail> {
    const row = await returnsRepository.findByIdForUpdate(returnId, client);
    if (!row) throw new NotFoundError('Return not found');
    if (row.status !== 'REQUESTED') throw new ConflictError('Return has already been decided');
    await returnsRepository.setStatus(returnId, 'REJECTED', client);
    await auditService.record(
      { actorId, actionType: 'RETURN_REJECTED', entityType: 'RETURN', entityId: returnId, reason },
      client,
    );
    return (await returnsRepository.findDetail(returnId, client))!;
  },

  async retryRefund(actingUser: AuthenticatedUser, returnId: number): Promise<ReturnDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await returnsRepository.findByIdForUpdate(returnId, client);
      if (!row || row.status !== 'APPROVED')
        throw new ConflictError('Return has no failed refund to retry');
      const failed = await returnsRepository.failedRefundsForUpdate(returnId, client);
      if (!failed.length) throw new ConflictError('Return has no failed refund to retry');
      for (const refund of failed) {
        if (
          refund.method === 'CARD' &&
          (await refundGateway.refundCard(refund.payment_id!, Number(refund.amount))) === 'FAILED'
        ) {
          throw new ConflictError(
            'Card refund failed again; manual reconciliation is still required',
          );
        }
        await returnsRepository.completeRefund(refund.id, client);
      }
      await returnsRepository.setStatus(returnId, 'REFUNDED', client);
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'REFUND_RETRIED',
          entityType: 'RETURN',
          entityId: returnId,
        },
        client,
      );
      await client.query('COMMIT');
      return (await returnsRepository.findDetail(returnId))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
