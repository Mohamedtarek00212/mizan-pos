-- Phase 7: indexes supporting stock overview, low-stock monitoring, and ledger filters.
CREATE INDEX IF NOT EXISTS idx_products_active_stock_threshold
  ON products (is_active, current_stock, reorder_threshold);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_type_created
  ON stock_movements (product_id, movement_type, created_at DESC);
