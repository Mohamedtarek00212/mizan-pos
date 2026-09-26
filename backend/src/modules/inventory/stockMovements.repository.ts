import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { CreateStockMovementInput, StockMovementRow } from './stockMovements.types';

/**
 * Data-access layer for the append-only stock_movements ledger (Step 4 §4.4).
 * Every stock-affecting operation writes one row here with a signed delta and
 * the resulting stock snapshot after the change.
 */
export const stockMovementsRepository = {
  async insert(input: CreateStockMovementInput, client?: PoolClient): Promise<StockMovementRow> {
    const db = client ?? pool;
    const result = await db.query<StockMovementRow>(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_delta, resulting_stock, reference_type, reference_id, reason, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.productId,
        input.movementType,
        input.quantityDelta,
        input.resultingStock,
        input.referenceType,
        input.referenceId ?? null,
        input.reason ?? null,
        input.performedBy,
      ],
    );
    return result.rows[0];
  },

  async findByReference(
    referenceType: string,
    referenceId: number,
    client?: PoolClient,
  ): Promise<StockMovementRow[]> {
    const db = client ?? pool;
    const result = await db.query<StockMovementRow>(
      `SELECT * FROM stock_movements WHERE reference_type = $1 AND reference_id = $2 ORDER BY created_at`,
      [referenceType, referenceId],
    );
    return result.rows;
  },
};
