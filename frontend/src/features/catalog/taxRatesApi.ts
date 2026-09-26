import { apiRequest } from '../../shared/api/apiClient';

export interface TaxRate {
  id: number;
  category_id: number | null;
  rate_pct: number;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Tax rates API client (Step 5 B5). View is Manager/Admin; history and
 * creation of new effective-dated versions are Admin-only ("Tax
 * configuration remains Admin-controlled").
 */
export const taxRatesApi = {
  listCurrent(): Promise<{ tax_rates: TaxRate[] }> {
    return apiRequest('/tax-rates');
  },

  listHistory(): Promise<{ tax_rates: TaxRate[] }> {
    return apiRequest('/tax-rates/history');
  },

  create(categoryId: number | null, ratePct: number): Promise<TaxRate> {
    return apiRequest('/tax-rates', {
      method: 'POST',
      body: { category_id: categoryId, rate_pct: ratePct },
    });
  },
};
