import { apiRequest } from '../../shared/api/apiClient';

export interface Product {
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
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  q?: string;
  categoryId?: number;
  isActive?: boolean;
}

export interface CreateProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  category_id: number;
  current_price: number;
  initial_stock?: number;
  reorder_threshold?: number;
}

export interface UpdateProductInput {
  name?: string;
  category_id?: number;
  current_price?: number;
  barcode?: string | null;
  reorder_threshold?: number;
  is_active?: boolean;
}

function buildQuery(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.categoryId !== undefined) params.set('category_id', String(filters.categoryId));
  if (filters.isActive !== undefined) params.set('is_active', String(filters.isActive));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Products API client (Step 5 B4, Step 6 §5.11/§5.12). The backend is the
 * sole authority for price/stock/tax - this client never computes any of
 * those values itself, only displays what the server returns.
 */
export const productsApi = {
  list(filters: ProductFilters = {}): Promise<{ products: Product[]; total: number }> {
    return apiRequest(`/products${buildQuery(filters)}`);
  },

  getById(id: number): Promise<Product> {
    return apiRequest(`/products/${id}`);
  },

  lookupByBarcode(barcode: string): Promise<Product | null> {
    return apiRequest(`/products/barcode/${encodeURIComponent(barcode)}`);
  },

  create(input: CreateProductInput): Promise<Product> {
    return apiRequest('/products', { method: 'POST', body: input });
  },

  update(id: number, patch: UpdateProductInput): Promise<Product> {
    return apiRequest(`/products/${id}`, { method: 'PATCH', body: patch });
  },

  deactivate(id: number): Promise<Product> {
    return apiRequest(`/products/${id}/deactivate`, { method: 'PATCH' });
  },
};
