CREATE TABLE project_invite_links (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin')),
  max_uses   INTEGER,
  use_count  INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_invite_links_project ON project_invite_links(project_id);
