import { PoolClient } from 'pg';
import { ReturnApprovalPayload } from '../returns/returns.types';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface DiscountApprovalPayload {
  scope: 'ITEM' | 'SALE';
  discountType: 'PERCENT' | 'FIXED';
  value: number;
  itemId?: number;
  reason?: string;
  percentEquivalent: number;
}

export interface ApprovalRow {
  id: number;
  entity_type: 'DISCOUNT' | 'RETURN_NO_RECEIPT' | 'RETURN_WITH_RECEIPT';
  entity_id: number;
  requested_by: number;
  status: ApprovalStatus;
  decided_by: number | null;
  amount_context: string | null;
  payload: DiscountApprovalPayload | ReturnApprovalPayload;
  note: string | null;
  requested_at: Date;
  decided_at: Date | null;
}

export interface ApprovalDecisionResult {
  approval: ApprovalRow;
  sale?: unknown;
  return?: unknown;
}

export type DbClient = PoolClient;
