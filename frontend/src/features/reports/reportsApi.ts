import { apiRequest } from '../../shared/api/apiClient';

export type ReportType = 'sales' | 'cash' | 'inventory' | 'returns';
export interface ReportResult {
  summary: Record<string, string | number>;
  rows: Array<Record<string, unknown>>;
}
export interface ReportFilters {
  from?: string;
  to?: string;
  registerId?: string;
  cashierId?: string;
  productId?: string;
  categoryId?: string;
}

const paths: Record<ReportType, string> = {
  sales: '/reports/sales-summary',
  cash: '/reports/cash-reconciliation',
  inventory: '/reports/inventory-status',
  returns: '/reports/returns-refunds',
};

export const reportsApi = {
  get(type: ReportType, filters: ReportFilters): Promise<ReportResult> {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
    if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
    if (filters.registerId) params.set('register_id', filters.registerId);
    if (filters.cashierId) params.set('cashier_id', filters.cashierId);
    if (filters.productId) params.set('product_id', filters.productId);
    if (filters.categoryId) params.set('category_id', filters.categoryId);
    const query = params.toString();
    return apiRequest(`${paths[type]}${query ? `?${query}` : ''}`);
  },
};
