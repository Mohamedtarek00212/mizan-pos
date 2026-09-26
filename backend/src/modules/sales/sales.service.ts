import { PoolClient } from 'pg';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ApprovalUnavailableError,
  CardDeclinedError,
  CardPaymentUncertainError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { pool } from '../../db/pool';
import { auditService } from '../audit/audit.service';
import { approvalsRepository } from '../approvals/approvals.repository';
import { DiscountApprovalPayload } from '../approvals/approvals.types';
import { approvalThresholdsRepository } from '../approval-thresholds/approvalThresholds.repository';
import { productsRepository } from '../products/products.repository';
import { registerSessionsRepository } from '../registers/registerSessions.repository';
import { taxRatesRepository } from '../tax-rates/taxRates.repository';
import { stockMovementsRepository } from '../inventory/stockMovements.repository';
import { promotionsRepository } from '../promotions/promotions.repository';
import { PromotionRow } from '../promotions/promotions.types';
import { cardPaymentGateway } from './cardPaymentGateway';
import { paymentsRepository } from './payments.repository';
import { salesRepository, toSaleItemSummary } from './sales.repository';
import { SaleDetail, SaleItemSummary } from './sales.types';

export interface DiscountInput {
  scope: 'ITEM' | 'SALE';
  discountType: 'PERCENT' | 'FIXED';
  value: number;
  itemId?: number;
  reason?: string;
}

export type DiscountResult =
  | { approval_pending: true; approval_id: number; amount_context: number }
  | { approval_pending: false; sale: SaleDetail };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes a line item total from unit price, quantity, discount and tax.
 * Tax is applied post-discount per the approved tax policy (TX-02).
 */
function computeLineTotal(
  unitPrice: number,
  quantity: number,
  discount: number,
  taxRate: number,
): number {
  const discountedSubtotal = round2(unitPrice * quantity - discount);
  const tax = round2(discountedSubtotal * (taxRate / 100));
  return round2(discountedSubtotal + tax);
}

async function resolveTaxRate(categoryId: number | null): Promise<number> {
  const rate = await taxRatesRepository.getCurrentEffective(categoryId);
  return rate ? Number(rate.rate_pct) : 0;
}

async function recalculateSale(
  saleId: number,
  items: SaleItemSummary[],
  client: PoolClient,
): Promise<{ subtotal: number; discount: number; tax: number; total: number }> {
  const subtotal = round2(
    items.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
  );
  const discount = round2(items.reduce((sum, item) => sum + item.discount_amount, 0));
  const tax = round2(items.reduce((sum, item) => sum + item.tax_amount, 0));
  const total = round2(items.reduce((sum, item) => sum + item.line_total, 0));

  await salesRepository.updateTotals(saleId, { subtotal, discount, tax, total }, client);
  return { subtotal, discount, tax, total };
}

async function ensureDraft(saleId: number, client?: PoolClient): Promise<void> {
  const sale = await salesRepository.findById(saleId, client);
  if (!sale) {
    throw new NotFoundError('Sale not found');
  }
  if (sale.status !== 'DRAFT' && sale.status !== 'PAYMENT_PENDING') {
    throw new ConflictError('Sale cannot be modified in its current state', {
      current_status: sale.status,
    });
  }
  if (sale.held_at) {
    throw new ConflictError('Held sale must be resumed before it can be modified');
  }
}

function validateDiscount(input: DiscountInput): void {
  if (!['ITEM', 'SALE'].includes(input.scope))
    throw new ValidationError('scope must be ITEM or SALE');
  if (!['PERCENT', 'FIXED'].includes(input.discountType))
    throw new ValidationError('discount_type must be PERCENT or FIXED');
  if (!Number.isFinite(input.value) || input.value <= 0)
    throw new ValidationError('value must be positive');
  if (input.discountType === 'PERCENT' && input.value > 100)
    throw new ValidationError('Percentage discount cannot exceed 100');
  if (input.scope === 'ITEM' && !Number.isInteger(input.itemId))
    throw new ValidationError('item_id is required for item discounts');
}

function discountFor(base: number, type: 'PERCENT' | 'FIXED', value: number): number {
  const amount = type === 'PERCENT' ? base * (value / 100) : value;
  if (amount > base) throw new ValidationError('Discount cannot exceed the eligible subtotal');
  return round2(amount);
}

async function applyDiscountLines(
  sale: SaleDetail,
  input: DiscountInput,
  actorId: number,
  source: 'MANUAL' | 'PROMOTION',
  referenceId: number | null,
  client: PoolClient,
  resetOtherLines = false,
  targetItemIds?: number[],
): Promise<SaleDetail> {
  if (sale.status !== 'DRAFT' || sale.held_at || sale.total_paid > 0) {
    throw new ConflictError('Discounts can only be applied to an active unpaid draft sale');
  }
  if (sale.items.length === 0) throw new ValidationError('Cannot discount an empty sale');

  const targets = targetItemIds
    ? sale.items.filter((item) => targetItemIds.includes(item.id))
    : input.scope === 'ITEM'
      ? sale.items.filter((item) => item.id === input.itemId)
      : sale.items;
  if (targets.length === 0) throw new NotFoundError('Sale item not found');
  const eligibleSubtotal = round2(
    targets.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
  );
  const totalDiscount = discountFor(eligibleSubtotal, input.discountType, input.value);
  let allocated = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    const base = round2(item.unit_price_snapshot * item.quantity);
    const discount =
      input.discountType === 'PERCENT'
        ? discountFor(base, input.discountType, input.value)
        : index === targets.length - 1
          ? round2(totalDiscount - allocated)
          : round2(totalDiscount * (base / eligibleSubtotal));
    allocated = round2(allocated + discount);
    const tax = round2((base - discount) * (item.tax_rate_snapshot / 100));
    const lineTotal = round2(base - discount + tax);
    await salesRepository.setItemDiscount(
      item.id,
      discount,
      tax,
      lineTotal,
      source,
      referenceId,
      client,
    );
  }

  if (resetOtherLines) {
    const targetIds = new Set(targets.map((item) => item.id));
    for (const item of sale.items.filter((candidate) => !targetIds.has(candidate.id))) {
      const base = round2(item.unit_price_snapshot * item.quantity);
      const tax = round2(base * (item.tax_rate_snapshot / 100));
      await salesRepository.setItemDiscount(
        item.id,
        0,
        tax,
        round2(base + tax),
        null,
        null,
        client,
      );
    }
  }

  const updatedItems = (await salesRepository.findItemsBySaleId(sale.id, client)).map(
    toSaleItemSummary,
  );
  await recalculateSale(sale.id, updatedItems, client);
  await auditService.record(
    {
      actorId,
      actionType: 'DISCOUNT_APPLIED',
      entityType: 'SALE',
      entityId: sale.id,
      reason: input.reason,
      beforeSnapshot: { discount_amount: sale.discount_amount },
      afterSnapshot: {
        source,
        reference_id: referenceId,
        amount: totalDiscount,
        scope: input.scope,
      },
    },
    client,
  );
  return (await salesRepository.findDetailById(sale.id, client)) as SaleDetail;
}

function promotionRank(scope: PromotionRow['scope']): number {
  return scope === 'PRODUCT' ? 3 : scope === 'CATEGORY' ? 2 : 1;
}

/**
 * Business/service layer for the POS checkout lifecycle (Step 5 A5/A8,
 * W-03/W-04/W-05/W-06/W-09, INV-STK-*, PR-*, TX-*).
 *
 * All state-changing operations run inside a single database transaction.
 * Stock is only decremented when a sale reaches COMPLETED.
 */
export const salesService = {
  async createSale(actingUser: AuthenticatedUser, registerSessionId: number): Promise<SaleDetail> {
    const session = await registerSessionsRepository.findById(registerSessionId);
    if (!session) {
      throw new NotFoundError('Register session not found');
    }
    if (session.status !== 'OPEN') {
      throw new ConflictError('Register session is not open');
    }
    if (session.cashier_id !== actingUser.id) {
      throw new ConflictError('Sale must be created on your own open register session');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await salesRepository.create(
        { registerSessionId, cashierId: actingUser.id },
        client,
      );
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'SALE_CREATED',
          entityType: 'SALE',
          entityId: sale.id,
          afterSnapshot: { register_session_id: sale.register_session_id, status: sale.status },
        },
        client,
      );
      await client.query('COMMIT');
      return (await salesRepository.findDetailById(sale.id, client)) as SaleDetail;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async addItem(
    actingUser: AuthenticatedUser,
    saleId: number,
    input: { productId: number; quantity: number },
  ): Promise<SaleDetail> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ValidationError('quantity must be a positive integer');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureDraft(saleId, client);

      const product = await productsRepository.findById(input.productId);
      if (!product) {
        throw new NotFoundError('Product not found');
      }
      if (!product.is_active) {
        throw new ConflictError('Product is not active');
      }

      const existingItems = await salesRepository.findItemsBySaleId(saleId, client);
      if (existingItems.some((item) => item.product_id === input.productId)) {
        throw new ConflictError('Product already exists on this sale; update quantity instead');
      }

      // INV-STK-02: informational stock check at add time.
      if (product.current_stock < input.quantity) {
        throw new ConflictError('Insufficient stock for this product', {
          current_stock: product.current_stock,
          requested_quantity: input.quantity,
        });
      }

      const taxRate = await resolveTaxRate(product.category_id);
      const unitPrice = Number(product.current_price);
      const discount = 0; // manual discounts/promotions are intentionally out of scope in this first POS phase
      const taxAmount = round2((unitPrice * input.quantity - discount) * (taxRate / 100));
      const lineTotal = computeLineTotal(unitPrice, input.quantity, discount, taxRate);

      const item = await salesRepository.addItem(
        saleId,
        {
          productId: input.productId,
          quantity: input.quantity,
          unitPriceSnapshot: unitPrice,
          discountAmount: discount,
          taxRateSnapshot: taxRate,
          taxAmount,
        },
        lineTotal,
        client,
      );

      const allItems = [
        ...existingItems.map((row) => toSaleItemSummary(row)),
        toSaleItemSummary(item),
      ];
      await recalculateSale(saleId, allItems, client);

      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'SALE_ITEM_ADDED',
          entityType: 'SALE_ITEM',
          entityId: item.id,
          afterSnapshot: {
            sale_id: saleId,
            product_id: input.productId,
            quantity: input.quantity,
            unit_price_snapshot: unitPrice,
            tax_rate_snapshot: taxRate,
            line_total: lineTotal,
          },
        },
        client,
      );

      await client.query('COMMIT');
      return (await salesRepository.findDetailById(saleId, client)) as SaleDetail;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateItem(
    actingUser: AuthenticatedUser,
    saleId: number,
    itemId: number,
    input: { quantity: number },
  ): Promise<SaleDetail> {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new ValidationError('quantity must be a non-negative integer');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureDraft(saleId, client);

      const item = await salesRepository.findItemById(itemId, client);
      if (!item || item.sale_id !== saleId) {
        throw new NotFoundError('Sale item not found');
      }

      if (input.quantity === 0) {
        await salesRepository.deleteItem(itemId, client);
      } else {
        const product = await productsRepository.findById(item.product_id);
        if (!product) {
          throw new NotFoundError('Product not found');
        }
        if (product.current_stock < input.quantity) {
          throw new ConflictError('Insufficient stock for this product', {
            current_stock: product.current_stock,
            requested_quantity: input.quantity,
          });
        }

        const unitPrice = Number(item.unit_price_snapshot);
        const taxRate = Number(item.tax_rate_snapshot);
        const discount = Number(item.discount_amount);
        const taxAmount = round2((unitPrice * input.quantity - discount) * (taxRate / 100));
        const lineTotal = computeLineTotal(unitPrice, input.quantity, discount, taxRate);

        await salesRepository.updateItem(
          itemId,
          {
            quantity: input.quantity,
            unitPriceSnapshot: unitPrice,
            discountAmount: discount,
            taxRateSnapshot: taxRate,
            taxAmount,
          },
          lineTotal,
          client,
        );

        await auditService.record(
          {
            actorId: actingUser.id,
            actionType: 'SALE_ITEM_UPDATED',
            entityType: 'SALE_ITEM',
            entityId: itemId,
            beforeSnapshot: { quantity: item.quantity, line_total: item.line_total },
            afterSnapshot: { quantity: input.quantity, line_total: lineTotal },
          },
          client,
        );
      }

      const remainingItems = (await salesRepository.findItemsBySaleId(saleId, client)).map(
        toSaleItemSummary,
      );
      await recalculateSale(saleId, remainingItems, client);

      await client.query('COMMIT');
      return (await salesRepository.findDetailById(saleId, client)) as SaleDetail;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getSale(saleId: number): Promise<SaleDetail> {
    const sale = await salesRepository.findDetailById(saleId);
    if (!sale) {
      throw new NotFoundError('Sale not found');
    }
    return sale;
  },

  async getSaleByReceipt(receiptNumber: number): Promise<SaleDetail> {
    const saleId = await salesRepository.findIdByReceiptNumber(receiptNumber);
    if (!saleId) throw new NotFoundError('Completed sale receipt not found');
    return this.getSale(saleId);
  },

  async listHeldSales(
    actingUser: AuthenticatedUser,
    registerSessionId: number,
  ): Promise<SaleDetail[]> {
    const session = await registerSessionsRepository.findById(registerSessionId);
    if (!session || session.status !== 'OPEN') {
      throw new NotFoundError('Open register session not found');
    }
    if (session.cashier_id !== actingUser.id) {
      throw new ConflictError('You can only view held sales from your own register session');
    }
    return salesRepository.findHeldBySession(registerSessionId, actingUser.id);
  },

  async holdSale(actingUser: AuthenticatedUser, saleId: number): Promise<SaleDetail> {
    const sale = await salesRepository.findById(saleId);
    if (!sale) throw new NotFoundError('Sale not found');
    if (sale.cashier_id !== actingUser.id)
      throw new ConflictError('You can only hold your own sale');
    if (sale.status !== 'DRAFT' || sale.held_at)
      throw new ConflictError('Only an active draft sale can be held');
    const held = await salesRepository.hold(saleId);
    if (!held) throw new ConflictError('Sale could not be held');
    await auditService.record({
      actorId: actingUser.id,
      actionType: 'SALE_HELD',
      entityType: 'SALE',
      entityId: saleId,
      beforeSnapshot: { held_at: null },
      afterSnapshot: { held_at: held.held_at },
    });
    return (await salesRepository.findDetailById(saleId)) as SaleDetail;
  },

  async resumeSale(actingUser: AuthenticatedUser, saleId: number): Promise<SaleDetail> {
    const sale = await salesRepository.findById(saleId);
    if (!sale) throw new NotFoundError('Sale not found');
    if (sale.cashier_id !== actingUser.id)
      throw new ConflictError('You can only resume your own sale');
    if (sale.status !== 'DRAFT' || !sale.held_at) throw new ConflictError('Sale is not held');
    const resumed = await salesRepository.resume(saleId);
    if (!resumed) throw new ConflictError('Sale could not be resumed');
    await auditService.record({
      actorId: actingUser.id,
      actionType: 'SALE_RESUMED',
      entityType: 'SALE',
      entityId: saleId,
      beforeSnapshot: { held_at: sale.held_at },
      afterSnapshot: { held_at: null },
    });
    return (await salesRepository.findDetailById(saleId)) as SaleDetail;
  },

  async applyManualDiscount(
    actingUser: AuthenticatedUser,
    saleId: number,
    input: DiscountInput,
  ): Promise<DiscountResult> {
    validateDiscount(input);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await salesRepository.findDetailById(saleId, client);
      if (!sale) throw new NotFoundError('Sale not found');
      if (sale.cashier_id !== actingUser.id)
        throw new ConflictError('You can only discount your own sale');
      if (sale.status !== 'DRAFT' || sale.held_at || sale.total_paid > 0) {
        throw new ConflictError('Discounts can only be applied to an active unpaid draft sale');
      }
      const targets =
        input.scope === 'ITEM' ? sale.items.filter((item) => item.id === input.itemId) : sale.items;
      if (targets.length === 0) throw new NotFoundError('Sale item not found');
      const base = round2(
        targets.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
      );
      const amount = discountFor(base, input.discountType, input.value);
      const percentEquivalent = base === 0 ? 0 : round2((amount / base) * 100);
      const threshold = await approvalThresholdsRepository.getCurrentEffective(actingUser.roleId);
      const allowedPercent = threshold ? Number(threshold.max_self_discount_pct) : 0;

      if (percentEquivalent > allowedPercent) {
        if (!(await approvalsRepository.hasActiveApprover())) throw new ApprovalUnavailableError();
        const payload: DiscountApprovalPayload = {
          ...input,
          percentEquivalent,
        };
        const approval = await approvalsRepository.createDiscount(
          saleId,
          actingUser.id,
          amount,
          payload,
          client,
        );
        await auditService.record(
          {
            actorId: actingUser.id,
            actionType: 'DISCOUNT_REQUESTED',
            entityType: 'APPROVAL',
            entityId: approval.id,
            reason: input.reason,
            afterSnapshot: { sale_id: saleId, amount, percent_equivalent: percentEquivalent },
          },
          client,
        );
        await client.query('COMMIT');
        return { approval_pending: true, approval_id: approval.id, amount_context: amount };
      }

      const updated = await applyDiscountLines(sale, input, actingUser.id, 'MANUAL', null, client);
      await client.query('COMMIT');
      return { approval_pending: false, sale: updated };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async applyApprovedDiscount(
    saleId: number,
    input: DiscountInput,
    approverId: number,
    approvalId: number,
    client: PoolClient,
  ): Promise<SaleDetail> {
    validateDiscount(input);
    const sale = await salesRepository.findDetailById(saleId, client);
    if (!sale) throw new NotFoundError('Sale not found');
    return applyDiscountLines(sale, input, approverId, 'MANUAL', approvalId, client);
  },

  async applyBestPromotion(actingUser: AuthenticatedUser, saleId: number): Promise<SaleDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await salesRepository.findDetailById(saleId, client);
      if (!sale) throw new NotFoundError('Sale not found');
      if (sale.cashier_id !== actingUser.id)
        throw new ConflictError('You can only modify your own sale');
      if (
        sale.status !== 'DRAFT' ||
        sale.held_at ||
        sale.total_paid > 0 ||
        sale.items.length === 0
      ) {
        throw new ConflictError('Promotions require an active unpaid sale with items');
      }

      const products = new Map<number, Awaited<ReturnType<typeof productsRepository.findById>>>();
      for (const item of sale.items)
        products.set(item.product_id, await productsRepository.findById(item.product_id));
      const candidates = (await promotionsRepository.listActive(client))
        .map((promotion) => {
          const eligibleItems = sale.items.filter((item) => {
            const product = products.get(item.product_id);
            if (promotion.scope === 'GENERAL') return true;
            if (promotion.scope === 'PRODUCT') return item.product_id === promotion.product_id;
            return product?.category_id === promotion.category_id;
          });
          const subtotal = round2(
            eligibleItems.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
          );
          const rawValue = Number(promotion.discount_value);
          const amount =
            subtotal === 0
              ? 0
              : promotion.discount_type === 'PERCENT'
                ? round2((subtotal * rawValue) / 100)
                : Math.min(rawValue, subtotal);
          return { promotion, eligibleItems, subtotal, amount };
        })
        .filter((candidate) => candidate.amount > 0);

      candidates.sort(
        (a, b) =>
          promotionRank(b.promotion.scope) - promotionRank(a.promotion.scope) ||
          b.amount - a.amount ||
          a.promotion.id - b.promotion.id,
      );
      const winner = candidates[0];
      if (!winner) throw new NotFoundError('No active promotion applies to this sale');
      const value =
        winner.promotion.discount_type === 'FIXED'
          ? winner.amount
          : Number(winner.promotion.discount_value);
      const input: DiscountInput = {
        scope: winner.eligibleItems.length === 1 ? 'ITEM' : 'SALE',
        itemId: winner.eligibleItems.length === 1 ? winner.eligibleItems[0].id : undefined,
        discountType: winner.promotion.discount_type,
        value,
        reason: winner.promotion.name,
      };
      const updated = await applyDiscountLines(
        sale,
        input,
        actingUser.id,
        'PROMOTION',
        winner.promotion.id,
        client,
        true,
        winner.eligibleItems.map((item) => item.id),
      );
      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async recordCashPayment(
    actingUser: AuthenticatedUser,
    saleId: number,
    amount: number,
  ): Promise<SaleDetail> {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = await salesRepository.findDetailById(saleId, client);
      if (!before) {
        throw new NotFoundError('Sale not found');
      }
      if (before.status !== 'DRAFT' && before.status !== 'PAYMENT_PENDING') {
        throw new ConflictError('Sale is not awaiting payment', { current_status: before.status });
      }
      if (before.held_at) throw new ConflictError('Held sale must be resumed before payment');
      if (await paymentsRepository.hasUnresolvedAmbiguousAttempt(saleId, client)) {
        throw new CardPaymentUncertainError();
      }

      await paymentsRepository.insert(saleId, { method: 'CASH', amount }, client);
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'SALE_PAYMENT_RECORDED',
          entityType: 'PAYMENT',
          entityId: saleId,
          afterSnapshot: { method: 'CASH', amount, status: 'CAPTURED' },
        },
        client,
      );
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'CASH_DRAWER_OPEN_REQUESTED',
          entityType: 'SALE',
          entityId: saleId,
          reason: 'Automatic request after captured cash payment',
          afterSnapshot: { trigger: 'CASH_PAYMENT', amount },
        },
        client,
      );

      await salesRepository.updateStatus(saleId, 'PAYMENT_PENDING', client);

      await client.query('COMMIT');
      return salesRepository.findDetailById(saleId, client) as Promise<SaleDetail>;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async recordCardPayment(
    actingUser: AuthenticatedUser,
    saleId: number,
    amount: number,
  ): Promise<SaleDetail> {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const before = await salesRepository.findDetailById(saleId, client);
      if (!before) {
        throw new NotFoundError('Sale not found');
      }
      if (before.status !== 'DRAFT' && before.status !== 'PAYMENT_PENDING') {
        throw new ConflictError('Sale is not awaiting payment', { current_status: before.status });
      }
      if (before.held_at) throw new ConflictError('Held sale must be resumed before payment');
      if (await paymentsRepository.hasUnresolvedAmbiguousAttempt(saleId, client)) {
        throw new CardPaymentUncertainError();
      }
      if (amount > before.remaining_balance) {
        throw new ValidationError('Card payment cannot exceed the remaining balance', {
          remaining_balance: before.remaining_balance,
        });
      }

      const outcome = await cardPaymentGateway.charge(saleId, amount);
      const paymentStatus = outcome === 'CAPTURED' ? 'CAPTURED' : 'FAILED';
      await paymentsRepository.insert(
        saleId,
        {
          method: 'CARD',
          amount,
          status: paymentStatus,
          failureCode: outcome === 'CAPTURED' ? null : outcome,
        },
        client,
      );
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'SALE_PAYMENT_RECORDED',
          entityType: 'PAYMENT',
          entityId: saleId,
          afterSnapshot: {
            method: 'CARD',
            amount,
            status: paymentStatus,
            gateway_outcome: outcome,
          },
        },
        client,
      );

      if (outcome === 'CAPTURED') {
        await salesRepository.updateStatus(saleId, 'PAYMENT_PENDING', client);
      }

      await client.query('COMMIT');
      committed = true;
      if (outcome === 'DECLINED') throw new CardDeclinedError();
      if (outcome === 'AMBIGUOUS') throw new CardPaymentUncertainError();
      return salesRepository.findDetailById(saleId, client) as Promise<SaleDetail>;
    } catch (err) {
      if (!committed) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  },

  async completeSale(actingUser: AuthenticatedUser, saleId: number): Promise<SaleDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await salesRepository.findDetailById(saleId, client);
      if (!sale) {
        throw new NotFoundError('Sale not found');
      }
      if (sale.status !== 'DRAFT' && sale.status !== 'PAYMENT_PENDING') {
        throw new ConflictError('Sale cannot be completed in its current state', {
          current_status: sale.status,
        });
      }
      if (sale.held_at) throw new ConflictError('Held sale must be resumed before completion');
      if (await paymentsRepository.hasUnresolvedAmbiguousAttempt(saleId, client)) {
        throw new CardPaymentUncertainError();
      }
      await completeSaleInternal(saleId, sale, actingUser, client);
      await client.query('COMMIT');
      return salesRepository.findDetailById(saleId, client) as Promise<SaleDetail>;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async voidSale(
    actingUser: AuthenticatedUser,
    saleId: number,
    reason?: string,
  ): Promise<SaleDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await salesRepository.findById(saleId, client);
      if (!sale) {
        throw new NotFoundError('Sale not found');
      }
      if (sale.status !== 'DRAFT' && sale.status !== 'PAYMENT_PENDING') {
        throw new ConflictError('Only draft or payment-pending sales can be voided', {
          current_status: sale.status,
        });
      }

      // VD-03: reverse any provisionally captured payments.
      const payments = await paymentsRepository.findCapturedBySaleId(saleId, client);
      for (const payment of payments) {
        await client.query(
          `UPDATE payments SET status = 'REVERSED', reversed_at = now() WHERE id = $1`,
          [payment.id],
        );
      }

      const voided = await salesRepository.void(saleId, actingUser.id, client);
      if (!voided) {
        throw new NotFoundError('Sale not found');
      }

      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'SALE_VOIDED',
          entityType: 'SALE',
          entityId: saleId,
          reason,
          beforeSnapshot: { status: sale.status, total_amount: sale.total_amount },
          afterSnapshot: { status: 'VOIDED' },
        },
        client,
      );

      await client.query('COMMIT');
      return salesRepository.findDetailById(saleId, client) as Promise<SaleDetail>;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

/**
 * Internal helper: completes a sale by finalizing totals, re-validating stock,
 * decrementing inventory and writing the audit event. Must run inside a
 * transaction with an open client.
 */
async function completeSaleInternal(
  saleId: number,
  sale: SaleDetail,
  actingUser: AuthenticatedUser,
  client: PoolClient,
): Promise<void> {
  if (sale.total_paid < sale.total_amount) {
    throw new ConflictError('Payment insufficient to complete sale', {
      total_amount: sale.total_amount,
      total_paid: sale.total_paid,
    });
  }

  // INV-STK-03: re-validate stock at completion time under row lock.
  for (const item of sale.items) {
    const lockResult = await client.query<{ current_stock: number; is_active: boolean }>(
      'SELECT current_stock, is_active FROM products WHERE id = $1 FOR UPDATE',
      [item.product_id],
    );
    const product = lockResult.rows[0];
    if (!product || !product.is_active) {
      throw new ConflictError('Product is no longer available', { product_id: item.product_id });
    }
    if (product.current_stock < item.quantity) {
      throw new ConflictError('Insufficient stock to complete sale', {
        product_id: item.product_id,
        current_stock: product.current_stock,
        requested_quantity: item.quantity,
      });
    }

    const newStock = product.current_stock - item.quantity;
    await client.query('UPDATE products SET current_stock = $2, updated_at = now() WHERE id = $1', [
      item.product_id,
      newStock,
    ]);

    await stockMovementsRepository.insert(
      {
        productId: item.product_id,
        movementType: 'SALE',
        quantityDelta: -item.quantity,
        resultingStock: newStock,
        referenceType: 'SALE_ITEM',
        referenceId: item.id,
        performedBy: actingUser.id,
      },
      client,
    );

    await auditService.record(
      {
        actorId: actingUser.id,
        actionType: 'STOCK_MOVEMENT_CREATED',
        entityType: 'STOCK_MOVEMENT',
        entityId: item.product_id,
        afterSnapshot: {
          movement_type: 'SALE',
          quantity_delta: -item.quantity,
          resulting_stock: newStock,
          reference_type: 'SALE_ITEM',
          reference_id: item.id,
        },
      },
      client,
    );
  }

  const completed = await salesRepository.complete(
    saleId,
    {
      subtotal: sale.subtotal_amount,
      discount: sale.discount_amount,
      tax: sale.tax_amount,
      total: sale.total_amount,
    },
    client,
  );
  if (!completed) {
    throw new NotFoundError('Sale not found');
  }

  await auditService.record(
    {
      actorId: actingUser.id,
      actionType: 'SALE_COMPLETED',
      entityType: 'SALE',
      entityId: saleId,
      afterSnapshot: {
        status: 'COMPLETED',
        subtotal_amount: sale.subtotal_amount,
        discount_amount: sale.discount_amount,
        tax_amount: sale.tax_amount,
        total_amount: sale.total_amount,
        receipt_number: completed.receipt_number,
      },
    },
    client,
  );
}
