export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REFUNDED' | 'REJECTED';
export type RefundStatus = 'COMPLETED' | 'FAILED';

export interface ReturnRow {
  id: number;
  sale_id: number | null;
  register_session_id: number | null;
  status: ReturnStatus;
  reason: string;
  requires_manager: boolean;
  requested_by: number;
  approval_id: number | null;
  requested_at: Date;
  decided_at: Date | null;
}

export interface ReturnItemRow {
  id: number;
  return_id: number;
  sale_item_id: number | null;
  product_id: number;
  quantity: number;
  refund_amount: string;
  resellable: boolean;
  product_name?: string;
}

export interface RefundRow {
  id: number;
  return_id: number;
  payment_id: number | null;
  method: 'CASH' | 'CARD';
  amount: string;
  status: RefundStatus;
  failure_code: string | null;
  processed_at: Date;
}

export interface ReturnDetail extends ReturnRow {
  items: Array<Omit<ReturnItemRow, 'refund_amount'> & { refund_amount: number }>;
  refunds: Array<Omit<RefundRow, 'amount'> & { amount: number }>;
  total_refund_amount: number;
}

export interface ReturnRequestItem {
  saleItemId?: number;
  productId?: number;
  quantity: number;
  resellable: boolean;
}

export interface ReturnApprovalPayload {
  returnId: number;
  refundAmount: number;
}
