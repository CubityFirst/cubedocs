-- Recreate project_members with updated CHECK constraint to include limited_viewer
CREATE TABLE project_members_new (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin', 'owner', 'limited_viewer')),
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);
INSERT INTO project_members_new SELECT * FROM project_members;
DROP TABLE project_members;
ALTER TABLE project_members_new RENAME TO project_members;

-- Per-document access grants for limited_viewer members
CREATE TABLE doc_shares (
  id         TEXT PRIMARY KEY,
  doc_id     TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  project_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(doc_id, user_id)
);
