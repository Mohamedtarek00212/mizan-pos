import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { CreatePaymentInput, PaymentRow } from './payments.types';

/**
 * Data-access layer for sale payments (Step 4 §4.3, W-05/W-06).
 * Supports split payments (cash + card) and tracks payment status for
 * reconciliation-safe card handling.
 */
export const paymentsRepository = {
  async findBySaleId(saleId: number, client?: PoolClient): Promise<PaymentRow[]> {
    const db = client ?? pool;
    const result = await db.query<PaymentRow>(
      `SELECT * FROM payments WHERE sale_id = $1 ORDER BY id`,
      [saleId],
    );
    return result.rows;
  },

  async findCapturedBySaleId(saleId: number, client?: PoolClient): Promise<PaymentRow[]> {
    const db = client ?? pool;
    const result = await db.query<PaymentRow>(
      `SELECT * FROM payments WHERE sale_id = $1 AND status = 'CAPTURED' ORDER BY id`,
      [saleId],
    );
    return result.rows;
  },

  async hasUnresolvedAmbiguousAttempt(saleId: number, client?: PoolClient): Promise<boolean> {
    const db = client ?? pool;
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM payments
         WHERE sale_id = $1 AND status = 'FAILED' AND failure_code = 'AMBIGUOUS'
       ) AS exists`,
      [saleId],
    );
    return result.rows[0].exists;
  },

  async insert(
    saleId: number,
    input: CreatePaymentInput,
    client?: PoolClient,
  ): Promise<PaymentRow> {
    const db = client ?? pool;
    const result = await db.query<PaymentRow>(
      `INSERT INTO payments (sale_id, method, amount, status, failure_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [saleId, input.method, input.amount, input.status ?? 'CAPTURED', input.failureCode ?? null],
    );
    return result.rows[0];
  },

  async getCashTotalForSession(sessionId: number, client?: PoolClient): Promise<number> {
    const db = client ?? pool;
    const result = await db.query<{ total: string }>(
      `SELECT
         COALESCE((
           SELECT SUM(LEAST(payment_totals.cash_paid,
                            GREATEST(s.total_amount - payment_totals.card_paid, 0)))
             FROM sales s
             JOIN LATERAL (
               SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'CASH'), 0) AS cash_paid,
                      COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'CARD'), 0) AS card_paid
                 FROM payments p
                WHERE p.sale_id = s.id AND p.status = 'CAPTURED'
             ) payment_totals ON true
            WHERE s.register_session_id = $1 AND s.status = 'COMPLETED'
         ), 0)
         - COALESCE((SELECT SUM(rf.amount) FROM refunds rf JOIN returns r ON r.id = rf.return_id
                     WHERE r.register_session_id = $1 AND rf.method = 'CASH' AND rf.status = 'COMPLETED'), 0)
         AS total`,
      [sessionId],
    );
    return Number(result.rows[0].total);
  },
};
