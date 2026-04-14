CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  owner_id      TEXT NOT NULL,
  published_at    TEXT,
  systems_enabled INTEGER NOT NULL DEFAULT 0,
  changelog_mode  TEXT NOT NULL DEFAULT 'off' CHECK(changelog_mode IN ('off', 'on', 'enforced')),
  home_doc_id     TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL,
  published_at       TEXT,
  show_heading       INTEGER NOT NULL DEFAULT 1,
  show_last_updated  INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS systems (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK(category IN ('app', 'service', 'server', 'vendor', 'environment', 'domain', 'database', 'internal_tool')),
  category_label TEXT,
  status        TEXT NOT NULL CHECK(status IN ('active', 'planned', 'maintenance', 'deprecated')),
  environment   TEXT CHECK(environment IN ('production', 'staging', 'development', 'test', 'other')),
  owner         TEXT,
  primary_url   TEXT,
  notes         TEXT,
  renewal_date  TEXT,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id     TEXT REFERENCES folders(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_systems_project ON systems(project_id);
CREATE INDEX IF NOT EXISTS idx_systems_folder ON systems(folder_id);

CREATE TABLE IF NOT EXISTS asset_revisions (
  id          TEXT PRIMARY KEY,
  asset_type  TEXT NOT NULL CHECK(asset_type IN ('doc')),
  asset_id    TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  editor_id   TEXT NOT NULL,
  editor_name TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  data        TEXT,
  changelog   TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_revisions_asset ON asset_revisions(asset_id);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  type        TEXT NOT NULL DEFAULT 'docs' CHECK(type IN ('docs', 'systems')),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
  system_id   TEXT REFERENCES systems(id) ON DELETE SET NULL,
  uploaded_by TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_type    ON files(type);
CREATE INDEX IF NOT EXISTS idx_files_system  ON files(system_id);

CREATE TABLE IF NOT EXISTS system_doc_links (
  system_id    TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  doc_id       TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  PRIMARY KEY (system_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_system_doc_links_doc ON system_doc_links(doc_id);

