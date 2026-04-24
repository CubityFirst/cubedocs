-- Allow 'limited' role in project_invite_links
CREATE TABLE project_invite_links_new (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('limited', 'viewer', 'editor', 'admin')),
  max_uses   INTEGER,
  use_count  INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1
);
INSERT INTO project_invite_links_new SELECT * FROM project_invite_links;
DROP TABLE project_invite_links;
ALTER TABLE project_invite_links_new RENAME TO project_invite_links;

CREATE INDEX idx_invite_links_project ON project_invite_links(project_id);
