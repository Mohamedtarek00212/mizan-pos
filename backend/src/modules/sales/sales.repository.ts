import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import {
  AddSaleItemInput,
  CreateSaleInput,
  SaleDetail,
  SaleItemRow,
  SaleItemSummary,
  SaleRow,
  SaleStatus,
  SaleSummary,
  UpdateSaleItemInput,
} from './sales.types';

/**
 * Data-access layer for sales and sale_items (Step 4 §4.3, Step 5 B8).
 */
export const salesRepository = {
  async findById(id: number, client?: PoolClient): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>('SELECT * FROM sales WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  },

  async findIdByReceiptNumber(receiptNumber: number): Promise<number | null> {
    const result = await pool.query<{ id: number }>(
      "SELECT id FROM sales WHERE receipt_number = $1 AND status = 'COMPLETED'",
      [receiptNumber],
    );
    return result.rows[0]?.id ?? null;
  },

  async findDetailById(id: number, client?: PoolClient): Promise<SaleDetail | null> {
    const db = client ?? pool;
    const saleResult = await db.query<SaleRow>('SELECT * FROM sales WHERE id = $1', [id]);
    const sale = saleResult.rows[0];
    if (!sale) return null;

    const itemsResult = await db.query<SaleItemRow>(
      `SELECT si.*, p.name AS product_name
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1 ORDER BY si.id`,
      [id],
    );
    const paymentsResult = await db.query<{ total: string; cash: string; card: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS cash,
              COALESCE(SUM(amount) FILTER (WHERE method = 'CARD'), 0) AS card
         FROM payments WHERE sale_id = $1 AND status = 'CAPTURED'`,
      [id],
    );
    const reconciliationResult = await db.query<{ required: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM payments
         WHERE sale_id = $1 AND status = 'FAILED' AND failure_code = 'AMBIGUOUS'
       ) AS required`,
      [id],
    );

    const totalPaid = Number(paymentsResult.rows[0].total);
    const cashPaid = Number(paymentsResult.rows[0].cash);
    const cardPaid = Number(paymentsResult.rows[0].card);
    const summary = toSaleSummary(sale);
    const cashRequired = Math.max(0, summary.total_amount - cardPaid);
    return {
      ...summary,
      items: itemsResult.rows.map(toSaleItemSummary),
      total_paid: totalPaid,
      cash_paid: cashPaid,
      card_paid: cardPaid,
      cash_change_due: round2(Math.max(0, cashPaid - cashRequired)),
      remaining_balance: round2(Math.max(0, summary.total_amount - totalPaid)),
      payment_reconciliation_required: reconciliationResult.rows[0].required,
    };
  },

  async findItemsBySaleId(saleId: number, client?: PoolClient): Promise<SaleItemRow[]> {
    const db = client ?? pool;
    const result = await db.query<SaleItemRow>(
      `SELECT si.*, p.name AS product_name
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1 ORDER BY si.id`,
      [saleId],
    );
    return result.rows;
  },

  async findItemById(itemId: number, client?: PoolClient): Promise<SaleItemRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleItemRow>('SELECT * FROM sale_items WHERE id = $1', [itemId]);
    return result.rows[0] ?? null;
  },

  async create(input: CreateSaleInput, client?: PoolClient): Promise<SaleRow> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `INSERT INTO sales (register_session_id, cashier_id, status)
       VALUES ($1, $2, 'DRAFT')
       RETURNING *`,
      [input.registerSessionId, input.cashierId],
    );
    return result.rows[0];
  },

  async findHeldBySession(
    sessionId: number,
    cashierId: number,
    client?: PoolClient,
  ): Promise<SaleDetail[]> {
    const db = client ?? pool;
    const result = await db.query<{ id: number }>(
      `SELECT id FROM sales
       WHERE register_session_id = $1 AND cashier_id = $2
         AND status = 'DRAFT' AND held_at IS NOT NULL
       ORDER BY held_at DESC`,
      [sessionId, cashierId],
    );
    return (
      await Promise.all(result.rows.map((row) => this.findDetailById(row.id, client)))
    ).filter((sale): sale is SaleDetail => sale !== null);
  },

  async hold(saleId: number, client?: PoolClient): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales SET held_at = now()
       WHERE id = $1 AND status = 'DRAFT' AND held_at IS NULL
       RETURNING *`,
      [saleId],
    );
    return result.rows[0] ?? null;
  },

  async resume(saleId: number, client?: PoolClient): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales SET held_at = NULL
       WHERE id = $1 AND status = 'DRAFT' AND held_at IS NOT NULL
       RETURNING *`,
      [saleId],
    );
    return result.rows[0] ?? null;
  },

  async addItem(
    saleId: number,
    input: AddSaleItemInput,
    lineTotal: number,
    client?: PoolClient,
  ): Promise<SaleItemRow> {
    const db = client ?? pool;
    const result = await db.query<SaleItemRow>(
      `INSERT INTO sale_items
         (sale_id, product_id, quantity, unit_price_snapshot, discount_amount, tax_rate_snapshot, tax_amount, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        saleId,
        input.productId,
        input.quantity,
        input.unitPriceSnapshot,
        input.discountAmount ?? 0,
        input.taxRateSnapshot,
        input.taxAmount,
        lineTotal,
      ],
    );
    return result.rows[0];
  },

  async updateItem(
    itemId: number,
    input: UpdateSaleItemInput,
    lineTotal: number,
    client?: PoolClient,
  ): Promise<SaleItemRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleItemRow>(
      `UPDATE sale_items
       SET quantity = $2,
           unit_price_snapshot = $3,
           discount_amount = $4,
           tax_rate_snapshot = $5,
           tax_amount = $6,
           line_total = $7
       WHERE id = $1
       RETURNING *`,
      [
        itemId,
        input.quantity,
        input.unitPriceSnapshot,
        input.discountAmount,
        input.taxRateSnapshot,
        input.taxAmount,
        lineTotal,
      ],
    );
    return result.rows[0] ?? null;
  },

  async deleteItem(itemId: number, client?: PoolClient): Promise<void> {
    const db = client ?? pool;
    await db.query('DELETE FROM sale_items WHERE id = $1', [itemId]);
  },

  async setItemDiscount(
    itemId: number,
    discountAmount: number,
    taxAmount: number,
    lineTotal: number,
    source: 'MANUAL' | 'PROMOTION' | null,
    referenceId: number | null,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE sale_items
       SET discount_amount = $2, tax_amount = $3, line_total = $4,
           discount_source = $5, discount_reference_id = $6
       WHERE id = $1`,
      [itemId, discountAmount, taxAmount, lineTotal, source, referenceId],
    );
  },

  async updateTotals(
    saleId: number,
    totals: { subtotal: number; discount: number; tax: number; total: number },
    client?: PoolClient,
  ): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales
       SET subtotal_amount = $2, discount_amount = $3, tax_amount = $4, total_amount = $5
       WHERE id = $1
       RETURNING *`,
      [saleId, totals.subtotal, totals.discount, totals.tax, totals.total],
    );
    return result.rows[0] ?? null;
  },

  async updateStatus(
    saleId: number,
    status: SaleStatus,
    client?: PoolClient,
  ): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales SET status = $2 WHERE id = $1 RETURNING *`,
      [saleId, status],
    );
    return result.rows[0] ?? null;
  },

  async complete(
    saleId: number,
    totals: { subtotal: number; discount: number; tax: number; total: number },
    client?: PoolClient,
  ): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales
       SET status = 'COMPLETED',
           subtotal_amount = $2,
           discount_amount = $3,
           tax_amount = $4,
           total_amount = $5,
           completed_at = now(),
           receipt_number = nextval('receipt_number_seq')
       WHERE id = $1
       RETURNING *`,
      [saleId, totals.subtotal, totals.discount, totals.tax, totals.total],
    );
    return result.rows[0] ?? null;
  },

  async void(saleId: number, voidedBy: number, client?: PoolClient): Promise<SaleRow | null> {
    const db = client ?? pool;
    const result = await db.query<SaleRow>(
      `UPDATE sales
       SET status = 'VOIDED', voided_at = now(), voided_by = $2
       WHERE id = $1
       RETURNING *`,
      [saleId, voidedBy],
    );
    return result.rows[0] ?? null;
  },

  async hasNonTerminalSales(sessionId: number, client?: PoolClient): Promise<boolean> {
    const db = client ?? pool;
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sales
       WHERE register_session_id = $1 AND status IN ('DRAFT', 'PAYMENT_PENDING')`,
      [sessionId],
    );
    return Number(result.rows[0].count) > 0;
  },
};

export function toSaleItemSummary(row: SaleItemRow): SaleItemSummary {
  return {
    id: row.id,
    sale_id: row.sale_id,
    product_id: row.product_id,
    quantity: row.quantity,
    unit_price_snapshot: Number(row.unit_price_snapshot),
    discount_amount: Number(row.discount_amount),
    tax_rate_snapshot: Number(row.tax_rate_snapshot),
    tax_amount: Number(row.tax_amount),
    line_total: Number(row.line_total),
    product_name: row.product_name,
    discount_source: row.discount_source,
    discount_reference_id: row.discount_reference_id,
  };
}

function toSaleSummary(row: SaleRow): SaleSummary {
  return {
    id: row.id,
    register_session_id: row.register_session_id,
    cashier_id: row.cashier_id,
    status: row.status,
    subtotal_amount: Number(row.subtotal_amount),
    discount_amount: Number(row.discount_amount),
    tax_amount: Number(row.tax_amount),
    total_amount: Number(row.total_amount),
    receipt_number: row.receipt_number,
    created_at: row.created_at,
    completed_at: row.completed_at,
    voided_at: row.voided_at,
    voided_by: row.voided_by,
    held_at: row.held_at,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
