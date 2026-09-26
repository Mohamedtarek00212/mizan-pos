import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { CreateProductInput, ListProductsFilters, ProductRow } from './products.types';

const BASE_SELECT = `
  SELECT p.id, p.category_id, p.sku, p.barcode, p.name, p.current_price, p.current_stock,
         p.reorder_threshold, p.is_active, p.created_at, p.updated_at, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

/**
 * Data-access layer for products (Step 4 §4.2, Step 5 B4).
 */
export const productsRepository = {
  async findById(id: number): Promise<ProductRow | null> {
    const result = await pool.query<ProductRow>(`${BASE_SELECT} WHERE p.id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async findBySku(sku: string): Promise<ProductRow | null> {
    const result = await pool.query<ProductRow>(`${BASE_SELECT} WHERE p.sku = $1`, [sku]);
    return result.rows[0] ?? null;
  },

  /** Barcode uniqueness only applies among ACTIVE products (Step 5 amendment). */
  async findActiveByBarcode(barcode: string): Promise<ProductRow | null> {
    const result = await pool.query<ProductRow>(
      `${BASE_SELECT} WHERE p.barcode = $1 AND p.is_active = true`,
      [barcode],
    );
    return result.rows[0] ?? null;
  },

  async list(filters: ListProductsFilters): Promise<{ products: ProductRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.q) {
      values.push(`%${filters.q}%`);
      conditions.push(
        `(p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length} OR p.barcode ILIKE $${values.length})`,
      );
    }
    if (filters.categoryId !== undefined) {
      values.push(filters.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (filters.isActive !== undefined) {
      values.push(filters.isActive);
      conditions.push(`p.is_active = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM products p ${whereClause}`,
      values,
    );

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const dataValues = [...values, limit, offset];
    const result = await pool.query<ProductRow>(
      `${BASE_SELECT} ${whereClause} ORDER BY p.name LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues,
    );

    return { products: result.rows, total: Number(countResult.rows[0].count) };
  },

  async insert(input: CreateProductInput, client?: PoolClient): Promise<ProductRow> {
    const db = client ?? pool;
    const result = await db.query<{ id: number }>(
      `INSERT INTO products (category_id, sku, barcode, name, current_price, current_stock, reorder_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.categoryId,
        input.sku,
        input.barcode ?? null,
        input.name,
        input.currentPrice,
        input.initialStock ?? 0,
        input.reorderThreshold ?? 0,
      ],
    );
    const created = await db.query<ProductRow>(`${BASE_SELECT} WHERE p.id = $1`, [
      result.rows[0].id,
    ]);
    return created.rows[0];
  },

  async update(
    id: number,
    fields: {
      name?: string;
      categoryId?: number;
      currentPrice?: number;
      barcode?: string | null;
      reorderThreshold?: number;
      isActive?: boolean;
    },
  ): Promise<ProductRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (fields.name !== undefined) {
      values.push(fields.name);
      setClauses.push(`name = $${values.length}`);
    }
    if (fields.categoryId !== undefined) {
      values.push(fields.categoryId);
      setClauses.push(`category_id = $${values.length}`);
    }
    if (fields.currentPrice !== undefined) {
      values.push(fields.currentPrice);
      setClauses.push(`current_price = $${values.length}`);
    }
    if (fields.barcode !== undefined) {
      values.push(fields.barcode);
      setClauses.push(`barcode = $${values.length}`);
    }
    if (fields.reorderThreshold !== undefined) {
      values.push(fields.reorderThreshold);
      setClauses.push(`reorder_threshold = $${values.length}`);
    }
    if (fields.isActive !== undefined) {
      values.push(fields.isActive);
      setClauses.push(`is_active = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    setClauses.push('updated_at = now()');
    values.push(id);
    await pool.query(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values,
    );
    return this.findById(id);
  },
};
