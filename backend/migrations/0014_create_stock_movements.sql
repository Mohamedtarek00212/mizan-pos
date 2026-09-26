-- Step 4 §4.4 Inventory: unified, append-only stock ledger.
-- Every quantity change (sale, return restock, manual add/adjust) is
-- recorded with a signed delta and a resulting-stock snapshot (NS-01).
CREATE TABLE IF NOT EXISTS stock_movements (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  movement_type   VARCHAR(20) NOT NULL CHECK (movement_type IN ('SALE', 'RETURN_RESTOCK', 'MANUAL_ADD', 'MANUAL_ADJUST')),
  quantity_delta  INTEGER NOT NULL CHECK (quantity_delta <> 0),
  resulting_stock INTEGER NOT NULL CHECK (resulting_stock >= 0),
  reference_type  VARCHAR(20) NOT NULL CHECK (reference_type IN ('SALE_ITEM', 'RETURN_ITEM', 'MANUAL')),
  reference_id    INTEGER NULL,
  reason          VARCHAR(255) NULL,
  performed_by    INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (movement_type <> 'MANUAL_ADJUST' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_type, reference_id);
