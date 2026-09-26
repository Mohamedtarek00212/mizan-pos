-- Step 4 §4.3 Registers & Sales: registers (physical/logical checkout
-- terminals). Step 5 B7 exposes no create/deactivate endpoint for this
-- resource - registers are fixed infrastructure, seeded once (see
-- db/seed.ts), not managed via the API in this phase.
CREATE TABLE IF NOT EXISTS registers (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true
);
