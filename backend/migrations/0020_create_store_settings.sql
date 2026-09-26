-- Phase 15.2: singleton business identity and first-run completion marker.
CREATE TABLE IF NOT EXISTS store_settings (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name     VARCHAR(100) NOT NULL,
  currency_code  CHAR(3) NOT NULL DEFAULT 'EGP',
  setup_completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
