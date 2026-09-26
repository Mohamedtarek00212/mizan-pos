import { pool } from '../../db/pool';
import { ApprovalThresholdRow, SetThresholdInput } from './approvalThresholds.types';

/**
 * Data-access layer for the versioned approval_thresholds table (Step 5
 * amendment to Step 4 §4.1 - effective-dated rows per role, mirroring the
 * `tax_rates` pattern).
 */
export const approvalThresholdsRepository = {
  async getCurrentEffective(roleId: number): Promise<ApprovalThresholdRow | null> {
    const result = await pool.query<ApprovalThresholdRow>(
      `SELECT * FROM approval_thresholds
       WHERE role_id = $1 AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC
       LIMIT 1`,
      [roleId],
    );
    return result.rows[0] ?? null;
  },

  async getHistory(roleId: number): Promise<ApprovalThresholdRow[]> {
    const result = await pool.query<ApprovalThresholdRow>(
      `SELECT * FROM approval_thresholds WHERE role_id = $1 ORDER BY effective_from DESC`,
      [roleId],
    );
    return result.rows;
  },

  /**
   * Inserts a new effective-dated version and closes the previously-open
   * row for the role (if any) within a single transaction, so there is
   * never a moment with zero or two "currently effective" rows.
   */
  async insertNewVersion(
    roleId: number,
    input: SetThresholdInput,
    createdBy: number,
  ): Promise<ApprovalThresholdRow> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE approval_thresholds
         SET effective_to = $2
         WHERE role_id = $1 AND effective_to IS NULL`,
        [roleId, input.effectiveFrom],
      );
      const result = await client.query<ApprovalThresholdRow>(
        `INSERT INTO approval_thresholds
          (role_id, max_self_discount_pct, max_self_refund_amt, register_variance_alert_threshold, effective_from, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          roleId,
          input.maxSelfDiscountPct,
          input.maxSelfRefundAmt,
          input.registerVarianceAlertThreshold,
          input.effectiveFrom,
          createdBy,
        ],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
