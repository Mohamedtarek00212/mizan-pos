import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { InventoryProduct } from './inventory.types';
import { StockMovementRow } from './stockMovements.types';

const INVENTORY_SELECT = `
  SELECT p.id, p.sku, p.barcode, p.name, p.category_id, c.name AS category_name,
         p.current_stock, p.reorder_threshold, p.is_active,
         CASE WHEN p.current_stock = 0 THEN 'OUT'
              WHEN p.current_stock <= p.reorder_threshold THEN 'LOW'
              ELSE 'OK' END AS stock_status,
         (SELECT MAX(sm.created_at) FROM stock_movements sm
          WHERE sm.product_id = p.id AND sm.movement_type = 'MANUAL_ADD') AS last_restock_at
  FROM products p JOIN categories c ON c.id = p.category_id`;

export const inventoryRepository = {
  async list(q?: string): Promise<InventoryProduct[]> {
    const values: unknown[] = [];
    const where = q
      ? (values.push(`%${q}%`), `WHERE p.name ILIKE $1 OR p.sku ILIKE $1 OR p.barcode ILIKE $1`)
      : '';
    const result = await pool.query<InventoryProduct>(
      `${INVENTORY_SELECT} ${where} ORDER BY p.name`,
      values,
    );
    return result.rows;
  },

  async listLowStock(): Promise<InventoryProduct[]> {
    const result = await pool.query<InventoryProduct>(
      `${INVENTORY_SELECT}
       WHERE p.is_active = true AND p.current_stock <= p.reorder_threshold
       ORDER BY (p.current_stock = 0) DESC, p.current_stock ASC, p.name`,
    );
    return result.rows;
  },

  async getProduct(id: number, client?: PoolClient): Promise<InventoryProduct | null> {
    const db = client ?? pool;
    const result = await db.query<InventoryProduct>(`${INVENTORY_SELECT} WHERE p.id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async lockProduct(
    id: number,
    client: PoolClient,
  ): Promise<{ id: number; current_stock: number } | null> {
    const result = await client.query<{ id: number; current_stock: number }>(
      'SELECT id, current_stock FROM products WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  },

  async setStock(id: number, stock: number, client: PoolClient): Promise<void> {
    await client.query('UPDATE products SET current_stock = $2, updated_at = now() WHERE id = $1', [
      id,
      stock,
    ]);
  },

  async movements(
    productId: number,
    filters: { from?: Date; to?: Date; movementType?: string },
  ): Promise<StockMovementRow[]> {
    const values: unknown[] = [productId];
    const conditions = ['product_id = $1'];
    if (filters.from) {
      values.push(filters.from);
      conditions.push(`created_at >= $${values.length}`);
    }
    if (filters.to) {
      values.push(filters.to);
      conditions.push(`created_at <= $${values.length}`);
    }
    if (filters.movementType) {
      values.push(filters.movementType);
      conditions.push(`movement_type = $${values.length}`);
    }
    const result = await pool.query<StockMovementRow>(
      `SELECT * FROM stock_movements WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC`,
      values,
    );
    return result.rows;
  },
};
