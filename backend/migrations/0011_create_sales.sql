-- Step 4 §4.3 Sales: transaction header for the POS checkout workflow.
-- Status machine: DRAFT -> PAYMENT_PENDING -> COMPLETED, or DRAFT/PAYMENT_PENDING -> VOIDED.
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1000;

CREATE TABLE IF NOT EXISTS sales (
  id                  SERIAL PRIMARY KEY,
  register_session_id INTEGER NOT NULL REFERENCES register_sessions(id),
  cashier_id          INTEGER NOT NULL REFERENCES users(id),
  status              VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'PAYMENT_PENDING', 'COMPLETED', 'VOIDED')),
  subtotal_amount     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount          DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  receipt_number      INTEGER NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ NULL,
  voided_at           TIMESTAMPTZ NULL,
  voided_by           INTEGER NULL REFERENCES users(id),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
  CHECK (status <> 'VOIDED' OR voided_at IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR receipt_number IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sales_session ON sales (register_session_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_created ON sales (cashier_id, created_at);
