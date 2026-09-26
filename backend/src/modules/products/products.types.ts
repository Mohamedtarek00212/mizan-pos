export interface ProductRow {
  id: number;
  category_id: number;
  sku: string;
  barcode: string | null;
  name: string;
  current_price: string;
  current_stock: number;
  reorder_threshold: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  category_name: string;
}

export interface ProductSummary {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number;
  category_name: string;
  current_price: number;
  current_stock: number;
  reorder_threshold: number;
  is_active: boolean;
  effective_tax_rate_pct: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  categoryId: number;
  currentPrice: number;
  initialStock?: number;
  reorderThreshold?: number;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: number;
  currentPrice?: number;
  barcode?: string | null;
  reorderThreshold?: number;
  isActive?: boolean;
}

export interface ListProductsFilters {
  q?: string;
  categoryId?: number;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}
