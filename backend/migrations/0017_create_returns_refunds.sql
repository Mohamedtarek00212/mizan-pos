-- Phase 6: returns, refunds, proportional payment reversals, and return approvals.
ALTER TABLE manager_approvals
  DROP CONSTRAINT IF EXISTS manager_approvals_entity_type_check;

ALTER TABLE manager_approvals
  ADD CONSTRAINT manager_approvals_entity_type_check
  CHECK (entity_type IN ('DISCOUNT', 'RETURN_NO_RECEIPT', 'RETURN_WITH_RECEIPT'));

CREATE TABLE IF NOT EXISTS returns (
  id                  SERIAL PRIMARY KEY,
  sale_id             INTEGER NULL REFERENCES sales(id),
  register_session_id INTEGER NULL REFERENCES register_sessions(id),
  status              VARCHAR(10) NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED')),
  reason              VARCHAR(255) NOT NULL,
  requires_manager    BOOLEAN NOT NULL,
  requested_by        INTEGER NOT NULL REFERENCES users(id),
  approval_id         INTEGER NULL REFERENCES manager_approvals(id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ NULL,
  CHECK (sale_id IS NOT NULL OR requires_manager = true)
);

CREATE TABLE IF NOT EXISTS return_items (
  id             SERIAL PRIMARY KEY,
  return_id      INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id   INTEGER NULL REFERENCES sale_items(id),
  product_id     INTEGER NOT NULL REFERENCES products(id),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  refund_amount  DECIMAL(12,2) NOT NULL CHECK (refund_amount >= 0),
  resellable     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS refunds (
  id             SERIAL PRIMARY KEY,
  return_id      INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  payment_id     INTEGER NULL REFERENCES payments(id),
  method         VARCHAR(10) NOT NULL CHECK (method IN ('CASH', 'CARD')),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  status         VARCHAR(12) NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  failure_code   VARCHAR(40) NULL,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns (sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON return_items (sale_item_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds (return_id);
