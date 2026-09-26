-- Phase 4 completion: held-sale state and reconciliation metadata for
-- card attempts whose outcome is declined or cannot be confirmed.
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(32) NULL;

CREATE INDEX IF NOT EXISTS idx_sales_held
  ON sales (register_session_id, held_at)
  WHERE held_at IS NOT NULL AND status = 'DRAFT';
