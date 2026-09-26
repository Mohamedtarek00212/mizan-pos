/**
 * Audit action/entity vocabulary (Step 4 §6, AL-01/AL-02).
 * Extend as later feature phases introduce new sensitive operations.
 */
export type AuditActionType =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'PERMISSION_CHANGE'
  | 'THRESHOLD_CHANGE'
  | 'LOGIN_FAILED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_ACTIVATED'
  | 'PRODUCT_DEACTIVATED'
  | 'TAX_RATE_CREATED'
  | 'REGISTER_OPENED'
  | 'REGISTER_CLOSED'
  | 'REGISTER_VARIANCE_EXCEEDED'
  | 'SALE_CREATED'
  | 'SALE_HELD'
  | 'SALE_RESUMED'
  | 'DISCOUNT_REQUESTED'
  | 'DISCOUNT_APPLIED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_DENIED'
  | 'PROMOTION_CREATED'
  | 'PROMOTION_UPDATED'
  | 'RETURN_REQUESTED'
  | 'RETURN_REFUNDED'
  | 'RETURN_REJECTED'
  | 'REFUND_RETRIED'
  | 'SALE_ITEM_ADDED'
  | 'SALE_ITEM_UPDATED'
  | 'SALE_PAYMENT_RECORDED'
  | 'CASH_DRAWER_OPEN_REQUESTED'
  | 'SALE_COMPLETED'
  | 'SALE_VOIDED'
  | 'STOCK_MOVEMENT_CREATED';

export type AuditEntityType =
  | 'USER'
  | 'ROLE'
  | 'APPROVAL_THRESHOLD'
  | 'CATEGORY'
  | 'PRODUCT'
  | 'TAX_RATE'
  | 'REGISTER_SESSION'
  | 'SALE'
  | 'SALE_ITEM'
  | 'PAYMENT'
  | 'APPROVAL'
  | 'PROMOTION'
  | 'RETURN'
  | 'REFUND'
  | 'STOCK_MOVEMENT';

export interface RecordAuditEventInput {
  actorId: number;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: number;
  reason?: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
}

export interface AuditLogFilters {
  entityType?: string;
  entityId?: number;
  actorId?: number;
  actionType?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AuditLogRow {
  id: number;
  actor_id: number;
  actor_username: string;
  actor_name: string;
  action_type: string;
  entity_type: string;
  entity_id: number;
  reason: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: Date;
}
