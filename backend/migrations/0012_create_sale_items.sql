-- Step 4 §4.3 Sale Items: immutable line-item snapshot for each sale.
-- Prices, discounts and tax rates are captured at completion time so
-- later catalog changes never rewrite historical sales (PR-04, TX-03, INV-04).
CREATE TABLE IF NOT EXISTS sale_items (
  id                  SERIAL PRIMARY KEY,
  sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_snapshot DECIMAL(12,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  discount_amount     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate_snapshot   DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate_snapshot >= 0),
  tax_amount          DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total          DECIMAL(12,2) NOT NULL CHECK (line_total >= 0),
  CHECK (discount_amount <= unit_price_snapshot * quantity)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items (product_id);
