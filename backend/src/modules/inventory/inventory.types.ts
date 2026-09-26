import { StockMovementRow } from './stockMovements.types';

export interface InventoryProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number;
  category_name: string;
  current_stock: number;
  reorder_threshold: number;
  is_active: boolean;
  stock_status: 'OK' | 'LOW' | 'OUT';
  last_restock_at: Date | null;
}

export interface InventoryMutationResult {
  movement: StockMovementRow;
  product: InventoryProduct;
}
