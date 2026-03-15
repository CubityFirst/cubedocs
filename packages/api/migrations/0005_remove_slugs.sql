-- Remove slug from docs (no unique constraint, simple drop)
ALTER TABLE docs DROP COLUMN slug;

-- Remove slug from projects (has UNIQUE constraint, requires table recreation)
CREATE TABLE projects_new (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     TEXT NOT NULL,
  published_at TEXT,
  created_at   TEXT NOT NULL
);
INSERT INTO projects_new SELECT id, name, description, owner_id, published_at, created_at FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
