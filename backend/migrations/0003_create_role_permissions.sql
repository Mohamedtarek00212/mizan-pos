-- Step 4 data model §4.1 Identity & Access: role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id              SERIAL PRIMARY KEY,
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  permission_key  VARCHAR(60) NOT NULL,
  UNIQUE (role_id, permission_key)
);
