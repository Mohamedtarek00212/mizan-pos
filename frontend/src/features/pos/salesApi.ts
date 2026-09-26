import { apiRequest } from '../../shared/api/apiClient';

export type SaleStatus = 'DRAFT' | 'PAYMENT_PENDING' | 'COMPLETED' | 'VOIDED';
export type PaymentMethod = 'CASH' | 'CARD';

export interface SaleItem {
  id: number;
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

export interface DiscountInput {
  scope: 'ITEM' | 'SALE';
  discount_type: 'PERCENT' | 'FIXED';
  value: number;
  item_id?: number;
  reason?: string;
}

export type DiscountResult =
  | { approval_pending: false; sale: Sale }
  | { approval_pending: true; approval_id: number; amount_context: string };

export interface ApprovalDecisionResult {
  approval: { id: number; status: 'APPROVED' | 'DENIED' };
  sale?: Sale;
}

export interface Sale {
  id: number;
  register_session_id: number;
  cashier_id: number;
  status: SaleStatus;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  receipt_number: number | null;
  items: SaleItem[];
  total_paid: number;
  cash_paid: number;
  card_paid: number;
  cash_change_due: number;
  remaining_balance: number;
  payment_reconciliation_required?: boolean;
  created_at: string;
  completed_at: string | null;
  held_at?: string | null;
}

export interface ProductLookup {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  current_price: number;
  current_stock: number;
  category_name: string;
  is_active: boolean;
}

export const salesApi = {
  create(registerSessionId: number): Promise<Sale> {
    return apiRequest('/sales', {
      method: 'POST',
      body: { register_session_id: registerSessionId },
    });
  },

  getById(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}`);
  },

  listHeld(registerSessionId: number): Promise<{ sales: Sale[] }> {
    return apiRequest(`/sales/held?register_session_id=${registerSessionId}`);
  },

  hold(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/hold`, { method: 'POST' });
  },

  resume(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/resume`, { method: 'POST' });
  },

  addItem(saleId: number, productId: number, quantity: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/items`, {
      method: 'POST',
      body: { product_id: productId, quantity },
    });
  },

  updateItem(saleId: number, itemId: number, quantity: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/items/${itemId}`, {
      method: 'PATCH',
      body: { quantity },
    });
  },

  applyDiscount(saleId: number, input: DiscountInput): Promise<DiscountResult> {
    return apiRequest(`/sales/${saleId}/discounts`, { method: 'POST', body: input });
  },

  applyBestPromotion(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/promotions/apply`, { method: 'POST' });
  },

  decideApproval(
    approvalId: number,
    input: {
      manager_username: string;
      manager_password: string;
      decision: 'APPROVE' | 'DENY';
      note?: string;
    },
  ): Promise<ApprovalDecisionResult> {
    return apiRequest(`/approvals/${approvalId}/inline-decision`, {
      method: 'POST',
      body: input,
    });
  },

  recordCashPayment(saleId: number, amount: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/payments/cash`, {
      method: 'POST',
      body: { amount },
    });
  },

  recordCardPayment(saleId: number, amount: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/payments/card`, {
      method: 'POST',
      body: { amount },
    });
  },

  complete(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/complete`, {
      method: 'POST',
    });
  },

  void(saleId: number): Promise<Sale> {
    return apiRequest(`/sales/${saleId}/void`, {
      method: 'POST',
    });
  },
};
