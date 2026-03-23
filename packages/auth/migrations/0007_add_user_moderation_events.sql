CREATE TABLE user_moderation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  moderation_value INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor_user_id TEXT,
  actor_email TEXT
);

CREATE INDEX user_moderation_events_user_id_created_at
  ON user_moderation_events(user_id, created_at DESC);
