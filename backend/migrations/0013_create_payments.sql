-- Step 4 §4.3 Payments: one or more payment captures per sale.
-- Supports split payments (cash + card). Card payments may remain in a
-- transient state pending external gateway confirmation (W-06).
CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method      VARCHAR(10) NOT NULL CHECK (method IN ('CASH', 'CARD')),
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  status      VARCHAR(12) NOT NULL CHECK (status IN ('CAPTURED', 'FAILED', 'REVERSED')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments (sale_id);
