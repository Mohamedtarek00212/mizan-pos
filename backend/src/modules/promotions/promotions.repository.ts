import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { CreatePromotionInput, PromotionRow } from './promotions.types';

export const promotionsRepository = {
  async listAll(): Promise<PromotionRow[]> {
    const result = await pool.query<PromotionRow>(
      'SELECT * FROM promotions ORDER BY created_at DESC',
    );
    return result.rows;
  },

  async listActive(client?: PoolClient): Promise<PromotionRow[]> {
    const db = client ?? pool;
    const result = await db.query<PromotionRow>(
      `SELECT * FROM promotions
       WHERE is_active = true AND starts_at <= now() AND ends_at > now()
       ORDER BY CASE scope WHEN 'PRODUCT' THEN 3 WHEN 'CATEGORY' THEN 2 ELSE 1 END DESC, id`,
    );
    return result.rows;
  },

  async create(input: CreatePromotionInput, createdBy: number): Promise<PromotionRow> {
    const result = await pool.query<PromotionRow>(
      `INSERT INTO promotions
         (name, scope, product_id, category_id, discount_type, discount_value, starts_at, ends_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        input.name,
        input.scope,
        input.productId ?? null,
        input.categoryId ?? null,
        input.discountType,
        input.discountValue,
        input.startsAt,
        input.endsAt,
        createdBy,
      ],
    );
    return result.rows[0];
  },

  async setActive(id: number, isActive: boolean): Promise<PromotionRow | null> {
    const result = await pool.query<PromotionRow>(
      'UPDATE promotions SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, isActive],
    );
    return result.rows[0] ?? null;
  },
};
