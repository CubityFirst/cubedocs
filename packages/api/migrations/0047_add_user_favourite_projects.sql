-- Per-user list of favourited published projects ("favourite sites"). Surfaced
-- on the profile card and managed from User Settings. Listings always JOIN to
-- projects.published_at IS NOT NULL so unpublishing a site silently drops it.
CREATE TABLE user_favourite_projects (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_ufp_user ON user_favourite_projects (user_id, created_at DESC);
