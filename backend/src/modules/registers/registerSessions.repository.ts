import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { RegisterSessionRow } from './registerSessions.types';

/**
 * Data-access layer for register_sessions (Step 4 §4.3, Step 5 B7).
 * CR-01/INV-07 (at most one OPEN session per register) and the
 * one-open-session-per-cashier rule (Step 3 W-02) are both enforced at
 * the database level via partial unique indexes (see migration
 * 0010_create_register_sessions.sql) - this repository's inserts rely on
 * those constraints as the final authority, in addition to the
 * application-level pre-checks in the service layer.
 */
const SESSION_SELECT = `
  SELECT rs.*,
         r.code AS register_code,
         r.display_name AS register_name,
         u.full_name AS cashier_name,
         closed_u.full_name AS closed_by_name
  FROM register_sessions rs
  JOIN registers r ON r.id = rs.register_id
  JOIN users u ON u.id = rs.cashier_id
  LEFT JOIN users closed_u ON closed_u.id = rs.closed_by
`;

export const registerSessionsRepository = {
  async findOpenByRegisterId(registerId: number): Promise<RegisterSessionRow | null> {
    const result = await pool.query<RegisterSessionRow>(
      `${SESSION_SELECT} WHERE rs.register_id = $1 AND rs.status = 'OPEN'`,
      [registerId],
    );
    return result.rows[0] ?? null;
  },

  async findOpenByCashierId(cashierId: number): Promise<RegisterSessionRow | null> {
    const result = await pool.query<RegisterSessionRow>(
      `${SESSION_SELECT} WHERE rs.cashier_id = $1 AND rs.status = 'OPEN'`,
      [cashierId],
    );
    return result.rows[0] ?? null;
  },

  async findById(id: number, client?: PoolClient): Promise<RegisterSessionRow | null> {
    const db = client ?? pool;
    const result = await db.query<RegisterSessionRow>(
      `${SESSION_SELECT} WHERE rs.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async insertOpen(
    registerId: number,
    cashierId: number,
    startingCash: number,
  ): Promise<RegisterSessionRow> {
    const result = await pool.query<RegisterSessionRow>(
      `INSERT INTO register_sessions (register_id, cashier_id, status, starting_cash)
       VALUES ($1, $2, 'OPEN', $3)
       RETURNING id`,
      [registerId, cashierId, startingCash],
    );
    return this.findById(result.rows[0].id) as Promise<RegisterSessionRow>;
  },

  async close(
    id: number,
    fields: {
      expectedCash: number;
      countedCash: number;
      variance: number;
      varianceThresholdSnapshot: number | null;
      closedBy: number;
    },
    client?: PoolClient,
  ): Promise<RegisterSessionRow | null> {
    const db = client ?? pool;
    const result = await db.query<{ id: number }>(
      `UPDATE register_sessions
       SET status = 'CLOSED',
           expected_cash = $2,
           counted_cash = $3,
           variance = $4,
           variance_threshold_snapshot = $5,
           closed_by = $6,
           closed_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        fields.expectedCash,
        fields.countedCash,
        fields.variance,
        fields.varianceThresholdSnapshot,
        fields.closedBy,
      ],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.findById(row.id, client);
  },
};
