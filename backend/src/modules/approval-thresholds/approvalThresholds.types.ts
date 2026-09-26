export interface ApprovalThresholdRow {
  id: number;
  role_id: number;
  max_self_discount_pct: string;
  max_self_refund_amt: string;
  register_variance_alert_threshold: string;
  effective_from: Date;
  effective_to: Date | null;
  created_by: number;
  created_at: Date;
}

export interface SetThresholdInput {
  maxSelfDiscountPct: number;
  maxSelfRefundAmt: number;
  registerVarianceAlertThreshold: number;
  effectiveFrom: Date;
}
