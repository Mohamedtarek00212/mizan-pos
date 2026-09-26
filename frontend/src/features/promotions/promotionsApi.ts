import { apiRequest } from '../../shared/api/apiClient';

export type PromotionScope = 'GENERAL' | 'CATEGORY' | 'PRODUCT';
export type DiscountType = 'PERCENT' | 'FIXED';

export interface Promotion {
  id: number;
  name: string;
  scope: PromotionScope;
  product_id: number | null;
  category_id: number | null;
  discount_type: DiscountType;
  discount_value: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export const promotionsApi = {
  list(): Promise<{ promotions: Promotion[] }> {
    return apiRequest('/promotions');
  },

  create(input: {
    name: string;
    scope: PromotionScope;
    product_id?: number;
    category_id?: number;
    discount_type: DiscountType;
    discount_value: number;
    starts_at: string;
    ends_at: string;
  }): Promise<Promotion> {
    return apiRequest('/promotions', { method: 'POST', body: input });
  },

  setActive(id: number, isActive: boolean): Promise<Promotion> {
    return apiRequest(`/promotions/${id}`, {
      method: 'PATCH',
      body: { is_active: isActive },
    });
  },
};
