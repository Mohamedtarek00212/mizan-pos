-- Step 4 data model §6 Audit / History: audit_logs (generic, immutable,
-- append-only). Application layer must never UPDATE/DELETE these rows
-- (AL-03) - enforced by convention/repository contract in this phase.
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        INTEGER NOT NULL REFERENCES users(id),
  action_type     VARCHAR(50) NOT NULL,
  entity_type     VARCHAR(30) NOT NULL,
  entity_id       INTEGER NOT NULL,
  reason          VARCHAR(255) NULL,
  before_snapshot JSONB NULL,
  after_snapshot  JSONB NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs (actor_id, created_at);
