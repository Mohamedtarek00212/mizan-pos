-- Step 4 §4.3 Registers & Sales: register_sessions - a Cashier's
-- open/closed shift on a register. CR-01/INV-07 (at most one OPEN
-- session per register) is enforced at the database level via a partial
-- unique index, per Step 4 §5 Constraints. The additional business rule
-- from Step 3 W-02 ("a Cashier cannot have more than one open session at
-- a time, across any register") is enforced the same way, for the same
-- defense-in-depth reason.
CREATE TABLE IF NOT EXISTS register_sessions (
  id                          SERIAL PRIMARY KEY,
  register_id                 INTEGER NOT NULL REFERENCES registers(id),
  cashier_id                  INTEGER NOT NULL REFERENCES users(id),
  status                      VARCHAR(10) NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  starting_cash               DECIMAL(12,2) NOT NULL CHECK (starting_cash >= 0),
  expected_cash               DECIMAL(12,2) NULL,
  counted_cash                DECIMAL(12,2) NULL,
  variance                    DECIMAL(12,2) NULL,
  variance_threshold_snapshot DECIMAL(12,2) NULL,
  opened_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                   TIMESTAMPTZ NULL,
  closed_by                   INTEGER NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_register_sessions_register ON register_sessions (register_id);
CREATE INDEX IF NOT EXISTS idx_register_sessions_cashier ON register_sessions (cashier_id);

-- CR-01 / INV-07: at most one OPEN session per register.
CREATE UNIQUE INDEX IF NOT EXISTS uq_register_sessions_open_per_register
  ON register_sessions (register_id)
  WHERE status = 'OPEN';

-- W-02 failure path: a Cashier cannot have more than one open session
-- (across any register) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_register_sessions_open_per_cashier
  ON register_sessions (cashier_id)
  WHERE status = 'OPEN';
