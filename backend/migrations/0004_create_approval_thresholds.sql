-- Step 4 §4.1 proposed a single mutable row per role. Step 5 (docs/05
-- §"Newly resolved Step 4 decisions") supersedes this: approval_thresholds
-- is versioned/history-aware (effective-dated rows per role), mirroring the
-- tax_rates pattern already used elsewhere in the approved schema. This is
-- not a new redesign - it implements the already-approved Step 5 amendment.
CREATE TABLE IF NOT EXISTS approval_thresholds (
  id                                  SERIAL PRIMARY KEY,
  role_id                             INTEGER NOT NULL REFERENCES roles(id),
  max_self_discount_pct               DECIMAL(5,2) NOT NULL DEFAULT 0
                                       CHECK (max_self_discount_pct >= 0 AND max_self_discount_pct <= 100),
  max_self_refund_amt                 DECIMAL(12,2) NOT NULL DEFAULT 0
                                       CHECK (max_self_refund_amt >= 0),
  register_variance_alert_threshold   DECIMAL(12,2) NOT NULL DEFAULT 0
                                       CHECK (register_variance_alert_threshold >= 0),
  effective_from                      TIMESTAMPTZ NOT NULL,
  effective_to                        TIMESTAMPTZ NULL, -- null = currently active
  created_by                          INTEGER NOT NULL REFERENCES users(id),
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_thresholds_role_effective
  ON approval_thresholds (role_id, effective_from, effective_to);
