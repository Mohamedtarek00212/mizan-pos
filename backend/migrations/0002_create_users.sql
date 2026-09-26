-- Step 4 data model §4.1 Identity & Access: users
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  username        VARCHAR(50) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(100) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at  TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
