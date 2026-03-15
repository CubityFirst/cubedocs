CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     TEXT NOT NULL,
  published_at TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL,
  published_at TEXT,
  show_heading INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin', 'owner')),
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'docs',
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_project ON docs(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_folder ON docs(folder_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);

CREATE TABLE IF NOT EXISTS passwords (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  username         TEXT,
  password_enc     TEXT NOT NULL,
  totp_enc         TEXT,
  url              TEXT,
  notes_enc        TEXT,
  last_change_date TEXT NOT NULL,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id        TEXT REFERENCES folders(id) ON DELETE SET NULL,
  author_id        TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passwords_project ON passwords(project_id);
CREATE INDEX IF NOT EXISTS idx_passwords_folder ON passwords(folder_id);
