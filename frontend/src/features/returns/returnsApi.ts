import { apiRequest } from '../../shared/api/apiClient';
import { Sale } from '../pos/salesApi';

export interface ReturnItem {
  id: number;
  sale_item_id: number | null;
  product_id: number;
  product_name?: string;
  quantity: number;
  refund_amount: number;
  resellable: boolean;
}

export interface Refund {
  id: number;
  payment_id: number | null;
  method: 'CASH' | 'CARD';
  amount: number;
  status: 'COMPLETED' | 'FAILED';
  failure_code: string | null;
}

export interface ReturnDetail {
  id: number;
  sale_id: number | null;
  status: 'REQUESTED' | 'APPROVED' | 'REFUNDED' | 'REJECTED';
  reason: string;
  requires_manager: boolean;
  requested_by: number;
  approval_id: number | null;
  requested_at: string;
  items: ReturnItem[];
  refunds: Refund[];
  total_refund_amount: number;
}

export interface CreateReturnResult {
  approval_pending: boolean;
  approval_id?: number;
  return: ReturnDetail;
}

export const returnsApi = {
  lookupReceipt(receiptNumber: number): Promise<Sale> {
    return apiRequest(`/sales/receipt/${receiptNumber}`);
  },
  create(input: {
    sale_id?: number;
    reason: string;
    items: Array<{
      sale_item_id?: number;
      product_id?: number;
      quantity: number;
      resellable: boolean;
    }>;
  }): Promise<CreateReturnResult> {
    return apiRequest('/returns', { method: 'POST', body: input });
  },
  get(id: number): Promise<ReturnDetail> {
    return apiRequest(`/returns/${id}`);
  },
  list(): Promise<{ returns: ReturnDetail[] }> {
    return apiRequest('/returns');
  },
  retry(id: number): Promise<ReturnDetail> {
    return apiRequest(`/returns/${id}/refunds/retry`, { method: 'POST' });
  },
  decideInline(
    approvalId: number,
    input: {
      manager_username: string;
      manager_password: string;
      decision: 'APPROVE' | 'DENY';
      note?: string;
    },
  ): Promise<{ approval: { id: number; status: string }; return?: ReturnDetail }> {
    return apiRequest(`/approvals/${approvalId}/inline-decision`, { method: 'POST', body: input });
  },
};
