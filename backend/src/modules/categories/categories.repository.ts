import { pool } from '../../db/pool';
import { CategoryRow } from './categories.types';

/**
 * Data-access layer for product categories (Step 4 §4.2).
 */
export const categoriesRepository = {
  async findAll(): Promise<CategoryRow[]> {
    const result = await pool.query<CategoryRow>('SELECT * FROM categories ORDER BY name');
    return result.rows;
  },

  async findById(id: number): Promise<CategoryRow | null> {
    const result = await pool.query<CategoryRow>('SELECT * FROM categories WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  },

  async findByName(name: string): Promise<CategoryRow | null> {
    const result = await pool.query<CategoryRow>('SELECT * FROM categories WHERE name = $1', [
      name,
    ]);
    return result.rows[0] ?? null;
  },

  async insert(name: string): Promise<CategoryRow> {
    const result = await pool.query<CategoryRow>(
      `INSERT INTO categories (name) VALUES ($1) RETURNING *`,
      [name],
    );
    return result.rows[0];
  },

  async rename(id: number, name: string): Promise<CategoryRow | null> {
    const result = await pool.query<CategoryRow>(
      `UPDATE categories SET name = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, name],
    );
    return result.rows[0] ?? null;
  },
};
