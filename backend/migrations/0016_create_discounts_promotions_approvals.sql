-- Phase 5: manual discounts, deterministic promotions, and Manager overrides.
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_source VARCHAR(16) NULL
    CHECK (discount_source IN ('MANUAL', 'PROMOTION')),
  ADD COLUMN IF NOT EXISTS discount_reference_id INTEGER NULL;

CREATE TABLE IF NOT EXISTS promotions (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  scope           VARCHAR(12) NOT NULL CHECK (scope IN ('GENERAL', 'CATEGORY', 'PRODUCT')),
  product_id      INTEGER NULL REFERENCES products(id),
  category_id     INTEGER NULL REFERENCES categories(id),
  discount_type   VARCHAR(10) NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value  DECIMAL(12,2) NOT NULL CHECK (discount_value > 0),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
  CHECK (
    (scope = 'GENERAL' AND product_id IS NULL AND category_id IS NULL) OR
    (scope = 'CATEGORY' AND product_id IS NULL AND category_id IS NOT NULL) OR
    (scope = 'PRODUCT' AND product_id IS NOT NULL AND category_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_promotions_active_window
  ON promotions (is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS manager_approvals (
  id              SERIAL PRIMARY KEY,
  entity_type     VARCHAR(30) NOT NULL CHECK (entity_type IN ('DISCOUNT')),
  entity_id       INTEGER NOT NULL,
  requested_by    INTEGER NOT NULL REFERENCES users(id),
  status          VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'APPROVED', 'DENIED')),
  decided_by      INTEGER NULL REFERENCES users(id),
  amount_context  DECIMAL(12,2) NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  note            VARCHAR(255) NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ NULL,
  CHECK (status = 'PENDING' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_manager_approvals_status
  ON manager_approvals (status, requested_at DESC);
