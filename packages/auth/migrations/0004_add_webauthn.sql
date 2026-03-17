CREATE TABLE webauthn_credentials (
  id         TEXT PRIMARY KEY,   -- base64url credential ID
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT 'Security Key',
  public_key TEXT NOT NULL,      -- base64url COSE public key
  counter    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE webauthn_challenges (
  id         TEXT PRIMARY KEY,   -- random UUID, used as lookup key
  user_id    TEXT NOT NULL,
  challenge  TEXT NOT NULL,      -- base64url random bytes
  type       TEXT NOT NULL,      -- 'registration' | 'authentication'
  created_at INTEGER NOT NULL    -- Unix ms, enforce 5-min TTL at verification
);
