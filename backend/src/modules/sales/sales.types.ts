export type SaleStatus = 'DRAFT' | 'PAYMENT_PENDING' | 'COMPLETED' | 'VOIDED';

export interface SaleRow {
  id: number;
  register_session_id: number;
  cashier_id: number;
  status: SaleStatus;
  subtotal_amount: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  receipt_number: number | null;
  created_at: Date;
  completed_at: Date | null;
  voided_at: Date | null;
  voided_by: number | null;
  held_at: Date | null;
}

export interface SaleItemRow {
  id: number;
  sale_id: number;
  product_id: number;
  quantity: number;
  unit_price_snapshot: string;
  discount_amount: string;
  tax_rate_snapshot: string;
  tax_amount: string;
  line_total: string;
  product_name?: string;
  discount_source?: 'MANUAL' | 'PROMOTION' | null;
  discount_reference_id?: number | null;
}

export interface SaleSummary {
  id: number;
  register_session_id: number;
  cashier_id: number;
  status: SaleStatus;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  receipt_number: number | null;
  created_at: Date;
  completed_at: Date | null;
  voided_at: Date | null;
  voided_by: number | null;
  held_at: Date | null;
}

export interface SaleItemSummary {
  id: number;
  sale_id: number;
  product_id: number;
  quantity: number;
  unit_price_snapshot: number;
  discount_amount: number;
  tax_rate_snapshot: number;
  tax_amount: number;
  line_total: number;
  product_name?: string;
  discount_source?: 'MANUAL' | 'PROMOTION' | null;
  discount_reference_id?: number | null;
}

export interface SaleDetail extends SaleSummary {
  items: SaleItemSummary[];
  total_paid: number;
  cash_paid: number;
  card_paid: number;
  cash_change_due: number;
  remaining_balance: number;
  payment_reconciliation_required: boolean;
}

export interface CreateSaleInput {
  registerSessionId: number;
  cashierId: number;
}

export interface AddSaleItemInput {
  productId: number;
  quantity: number;
  unitPriceSnapshot: number;
  discountAmount: number;
  taxRateSnapshot: number;
  taxAmount: number;
}

export interface UpdateSaleItemInput {
  quantity: number;
  unitPriceSnapshot: number;
  discountAmount: number;
  taxRateSnapshot: number;
  taxAmount: number;
}
