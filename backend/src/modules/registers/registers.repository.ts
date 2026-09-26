import { pool } from '../../db/pool';
import { RegisterRow, RegisterWithStatus } from './registers.types';

/**
 * Data-access layer for registers (Step 4 §4.3, Step 5 B7).
 * Registers are fixed infrastructure in this phase (seeded, not
 * created/managed via the API - see db/seed.ts and Step 5 B7's endpoint
 * table, which exposes no create/deactivate route for this resource).
 */
export const registersRepository = {
  async findAll(): Promise<RegisterWithStatus[]> {
    const result = await pool.query<RegisterWithStatus>(
      `SELECT r.id, r.code, r.display_name, r.is_active,
              COALESCE(rs.status, 'CLOSED') AS current_session_status
       FROM registers r
       LEFT JOIN register_sessions rs ON rs.register_id = r.id AND rs.status = 'OPEN'
       ORDER BY r.code`,
    );
    return result.rows;
  },

  async findById(id: number): Promise<RegisterRow | null> {
    const result = await pool.query<RegisterRow>('SELECT * FROM registers WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  },
};
