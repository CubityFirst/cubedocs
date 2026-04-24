-- Rename limited_viewer role to limited
CREATE TABLE project_members_new (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin', 'owner', 'limited')),
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);
INSERT INTO project_members_new
  SELECT id, project_id, user_id, email, name,
    CASE WHEN role = 'limited_viewer' THEN 'limited' ELSE role END,
    invited_by, created_at
  FROM project_members;
DROP TABLE project_members;
ALTER TABLE project_members_new RENAME TO project_members;

-- Add per-share permission level (view or edit) to doc_shares
ALTER TABLE doc_shares ADD COLUMN permission TEXT NOT NULL DEFAULT 'view' CHECK(permission IN ('view', 'edit'));
