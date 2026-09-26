-- Step 4 §4.2 Catalog & Pricing: categories (product grouping). Per
-- Step 6 §5.13, categories have no delete/deactivate path in the approved
-- design - only create + rename.
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
