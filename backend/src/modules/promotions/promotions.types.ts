export type PromotionScope = 'GENERAL' | 'CATEGORY' | 'PRODUCT';
export type DiscountType = 'PERCENT' | 'FIXED';

export interface PromotionRow {
  id: number;
  name: string;
  scope: PromotionScope;
  product_id: number | null;
  category_id: number | null;
  discount_type: DiscountType;
  discount_value: string;
  starts_at: Date;
  ends_at: Date;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePromotionInput {
  name: string;
  scope: PromotionScope;
  productId?: number | null;
  categoryId?: number | null;
  discountType: DiscountType;
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
}
