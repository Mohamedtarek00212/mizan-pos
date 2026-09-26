-- Phase 8: indexes for date-range reporting and audit exploration.
CREATE INDEX IF NOT EXISTS idx_sales_completed_at
  ON sales (completed_at DESC) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_register_sessions_closed_at
  ON register_sessions (closed_at DESC) WHERE status = 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_returns_requested_at ON returns (requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs (action_type, created_at DESC);
