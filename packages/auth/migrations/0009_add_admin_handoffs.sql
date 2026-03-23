CREATE TABLE IF NOT EXISTS admin_handoffs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  return_to   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admin_handoffs_user_id ON admin_handoffs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_handoffs_expires_at ON admin_handoffs(expires_at);
