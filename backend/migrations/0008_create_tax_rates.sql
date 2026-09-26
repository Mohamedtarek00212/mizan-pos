-- Step 4 §4.2 Catalog & Pricing: tax_rates. Admin-configured, effective-dated
-- (versioned) per category or globally (category_id NULL = global/default
-- rate), mirroring the approval_thresholds versioning pattern (TX-01/TX-03).
CREATE TABLE IF NOT EXISTS tax_rates (
  id              SERIAL PRIMARY KEY,
  category_id     INTEGER NULL REFERENCES categories(id),
  rate_pct        DECIMAL(5,2) NOT NULL CHECK (rate_pct >= 0),
  effective_from  TIMESTAMPTZ NOT NULL,
  effective_to    TIMESTAMPTZ NULL, -- null = currently active
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_category_effective
  ON tax_rates (category_id, effective_from, effective_to);

-- At most one currently-open (effective_to IS NULL) rate per category
-- (and at most one open global rate, where category_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rates_open_per_category
  ON tax_rates (category_id)
  WHERE effective_to IS NULL AND category_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rates_open_global
  ON tax_rates ((category_id IS NULL))
  WHERE effective_to IS NULL AND category_id IS NULL;
