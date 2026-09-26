import { apiRequest } from '../../shared/api/apiClient';

export type StockStatus = 'OK' | 'LOW' | 'OUT';
export type MovementType = 'SALE' | 'RETURN_RESTOCK' | 'MANUAL_ADD' | 'MANUAL_ADJUST';

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
  stock_status: StockStatus;
  last_restock_at: string | null;
}

export interface StockMovement {
  id: number;
  product_id: number;
  movement_type: MovementType;
  quantity_delta: number;
  resulting_stock: number;
  reference_type: 'SALE_ITEM' | 'RETURN_ITEM' | 'MANUAL';
  reference_id: number | null;
  reason: string | null;
  performed_by: number;
  created_at: string;
}

export interface InventoryMutationResult {
  product: InventoryProduct;
  movement: StockMovement;
}

export const inventoryApi = {
  list(q?: string): Promise<{ products: InventoryProduct[] }> {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiRequest(`/inventory${query}`);
  },
  lowStock(): Promise<{ products: InventoryProduct[] }> {
    return apiRequest('/inventory/low-stock');
  },
  getProduct(id: number): Promise<InventoryProduct> {
    return apiRequest(`/products/${id}`);
  },
  add(productId: number, quantity: number, reason: string): Promise<InventoryMutationResult> {
    return apiRequest(`/products/${productId}/stock/add`, {
      method: 'POST',
      body: { quantity, reason },
    });
  },
  adjust(
    productId: number,
    quantityDelta: number,
    reason: string,
  ): Promise<InventoryMutationResult> {
    return apiRequest(`/products/${productId}/stock/adjust`, {
      method: 'POST',
      body: { quantity_delta: quantityDelta, reason },
    });
  },
  movements(
    productId: number,
    filters?: { movementType?: string; from?: string; to?: string },
  ): Promise<{ movements: StockMovement[] }> {
    const params = new URLSearchParams();
    if (filters?.movementType) params.set('movement_type', filters.movementType);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const query = params.toString();
    return apiRequest(`/products/${productId}/stock/movements${query ? `?${query}` : ''}`);
  },
};
