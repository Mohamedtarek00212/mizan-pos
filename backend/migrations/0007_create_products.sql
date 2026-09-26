-- Step 4 §4.2 Catalog & Pricing: products.
-- Step 5 ("Newly resolved Step 4 decisions") amends category_id to be
-- NOT NULL (every product requires a category) and clarifies that
-- `barcode` uniqueness applies only among ACTIVE products (reusable once
-- a product is deactivated) - implemented below via a partial unique index
-- rather than a plain UNIQUE constraint, since that constraint would not
-- allow barcode reuse after deactivation.
CREATE TABLE IF NOT EXISTS products (
  id                  SERIAL PRIMARY KEY,
  category_id         INTEGER NOT NULL REFERENCES categories(id),
  sku                 VARCHAR(50) NOT NULL UNIQUE,
  barcode             VARCHAR(50) NULL,
  name                VARCHAR(150) NOT NULL,
  current_price       DECIMAL(12,2) NOT NULL CHECK (current_price >= 0),
  current_stock       INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  reorder_threshold   INTEGER NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);

-- Enforces barcode uniqueness among active products only (Step 5 amendment).
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode_active
  ON products (barcode)
  WHERE is_active = true AND barcode IS NOT NULL;
