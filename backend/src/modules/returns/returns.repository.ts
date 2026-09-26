import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { RefundRow, ReturnDetail, ReturnItemRow, ReturnRow } from './returns.types';

export const returnsRepository = {
  async create(
    fields: {
      saleId: number | null;
      registerSessionId: number | null;
      reason: string;
      requiresManager: boolean;
      requestedBy: number;
    },
    client: PoolClient,
  ): Promise<ReturnRow> {
    const result = await client.query<ReturnRow>(
      `INSERT INTO returns
         (sale_id, register_session_id, reason, requires_manager, requested_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        fields.saleId,
        fields.registerSessionId,
        fields.reason,
        fields.requiresManager,
        fields.requestedBy,
      ],
    );
    return result.rows[0];
  },

  async addItem(
    returnId: number,
    fields: {
      saleItemId: number | null;
      productId: number;
      quantity: number;
      refundAmount: number;
      resellable: boolean;
    },
    client: PoolClient,
  ): Promise<ReturnItemRow> {
    const result = await client.query<ReturnItemRow>(
      `INSERT INTO return_items
         (return_id, sale_item_id, product_id, quantity, refund_amount, resellable)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        returnId,
        fields.saleItemId,
        fields.productId,
        fields.quantity,
        fields.refundAmount,
        fields.resellable,
      ],
    );
    return result.rows[0];
  },

  async findByIdForUpdate(id: number, client: PoolClient): Promise<ReturnRow | null> {
    const result = await client.query<ReturnRow>('SELECT * FROM returns WHERE id = $1 FOR UPDATE', [
      id,
    ]);
    return result.rows[0] ?? null;
  },

  async findDetail(id: number, client?: PoolClient): Promise<ReturnDetail | null> {
    const db = client ?? pool;
    const base = await db.query<ReturnRow>('SELECT * FROM returns WHERE id = $1', [id]);
    if (!base.rows[0]) return null;
    const items = await db.query<ReturnItemRow>(
      `SELECT ri.*, p.name AS product_name
       FROM return_items ri JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id = $1 ORDER BY ri.id`,
      [id],
    );
    const refunds = await db.query<RefundRow>(
      'SELECT * FROM refunds WHERE return_id = $1 ORDER BY id',
      [id],
    );
    return {
      ...base.rows[0],
      items: items.rows.map((item) => ({ ...item, refund_amount: Number(item.refund_amount) })),
      refunds: refunds.rows.map((refund) => ({ ...refund, amount: Number(refund.amount) })),
      total_refund_amount: items.rows.reduce((sum, item) => sum + Number(item.refund_amount), 0),
    };
  },

  async list(filters: { saleId?: number; status?: string }): Promise<ReturnDetail[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (filters.saleId !== undefined) {
      values.push(filters.saleId);
      conditions.push(`sale_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query<{ id: number }>(
      `SELECT id FROM returns ${where} ORDER BY requested_at DESC LIMIT 100`,
      values,
    );
    return (await Promise.all(result.rows.map((row) => this.findDetail(row.id)))).filter(
      (item): item is ReturnDetail => item !== null,
    );
  },

  async returnedQuantityForSaleItem(saleItemId: number, client: PoolClient): Promise<number> {
    const result = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(ri.quantity), 0) AS total
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE ri.sale_item_id = $1 AND r.status <> 'REJECTED'`,
      [saleItemId],
    );
    return Number(result.rows[0].total);
  },

  async attachApproval(returnId: number, approvalId: number, client: PoolClient): Promise<void> {
    await client.query('UPDATE returns SET approval_id = $2 WHERE id = $1', [returnId, approvalId]);
  },

  async setStatus(id: number, status: ReturnRow['status'], client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE returns
       SET status = $2::varchar,
           decided_at = CASE WHEN $2::varchar <> 'REQUESTED' THEN now() ELSE decided_at END
       WHERE id = $1`,
      [id, status],
    );
  },

  async addRefund(
    returnId: number,
    paymentId: number | null,
    method: 'CASH' | 'CARD',
    amount: number,
    status: 'COMPLETED' | 'FAILED',
    failureCode: string | null,
    client: PoolClient,
  ): Promise<RefundRow> {
    const result = await client.query<RefundRow>(
      `INSERT INTO refunds (return_id, payment_id, method, amount, status, failure_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [returnId, paymentId, method, amount, status, failureCode],
    );
    return result.rows[0];
  },

  async failedRefundsForUpdate(returnId: number, client: PoolClient): Promise<RefundRow[]> {
    const result = await client.query<RefundRow>(
      `SELECT * FROM refunds WHERE return_id = $1 AND status = 'FAILED' FOR UPDATE`,
      [returnId],
    );
    return result.rows;
  },

  async completeRefund(id: number, client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE refunds SET status = 'COMPLETED', failure_code = NULL, processed_at = now() WHERE id = $1`,
      [id],
    );
  },
};
