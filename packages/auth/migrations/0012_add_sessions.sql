-- Server-side session records. Each successful login creates one row; the
-- JWT carries the row id as the `sid` claim. Per-request validation
-- requires a matching, non-revoked, non-expired row, which gives us:
--   - per-device revocation ("log out my old laptop")
--   - "log out everywhere" via a single UPDATE
--   - immediate effect on password change (revoke all-except-current)
--   - a list of active sessions surfaced to the user
-- We deliberately do NOT store the raw User-Agent string. At session
-- creation we derive a coarse device_kind ('phone'|'tablet'|'laptop'|
-- 'desktop') and a friendly client_label ('Chrome on macOS') and store
-- only those. Less personal data retained, and the values are already
-- in the shape we render to the user.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  device_kind  TEXT,
  client_label TEXT,
  ip           TEXT,
  revoked_at   INTEGER
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
