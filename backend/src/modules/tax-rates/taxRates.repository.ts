import { pool } from '../../db/pool';
import { TaxRateRow } from './taxRates.types';

/**
 * Data-access layer for versioned tax rates (Step 4 §4.2, TX-01/TX-03).
 * `category_id IS NULL` denotes the global/default rate; null-safe
 * equality (`IS NOT DISTINCT FROM`) is used throughout so the global rate
 * is treated as its own distinct "slot" for versioning purposes.
 */
export const taxRatesRepository = {
  async getCurrentEffective(categoryId: number | null): Promise<TaxRateRow | null> {
    const result = await pool.query<TaxRateRow>(
      `SELECT * FROM tax_rates
       WHERE category_id IS NOT DISTINCT FROM $1
         AND effective_from <= now()
         AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC
       LIMIT 1`,
      [categoryId],
    );
    return result.rows[0] ?? null;
  },

  async listAllCurrentEffective(): Promise<TaxRateRow[]> {
    const result = await pool.query<TaxRateRow>(
      `SELECT * FROM tax_rates
       WHERE effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY category_id NULLS FIRST`,
    );
    return result.rows;
  },

  async listAllHistory(): Promise<TaxRateRow[]> {
    const result = await pool.query<TaxRateRow>(
      `SELECT * FROM tax_rates ORDER BY category_id NULLS FIRST, effective_from DESC`,
    );
    return result.rows;
  },

  /**
   * Inserts a new effective-dated version, closing the previously-open
   * row for the same category slot (or the global slot) within a single
   * transaction - mirrors approvalThresholdsRepository.insertNewVersion.
   */
  async insertNewVersion(
    categoryId: number | null,
    ratePct: number,
    effectiveFrom: Date,
    createdBy: number,
  ): Promise<TaxRateRow> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE tax_rates
         SET effective_to = $2
         WHERE category_id IS NOT DISTINCT FROM $1 AND effective_to IS NULL`,
        [categoryId, effectiveFrom],
      );
      const result = await client.query<TaxRateRow>(
        `INSERT INTO tax_rates (category_id, rate_pct, effective_from, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [categoryId, ratePct, effectiveFrom, createdBy],
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
