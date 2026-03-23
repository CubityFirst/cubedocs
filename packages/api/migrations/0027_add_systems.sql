ALTER TABLE projects ADD COLUMN systems_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS systems (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK(category IN ('app', 'service', 'server', 'vendor', 'environment', 'domain', 'database', 'internal_tool')),
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

ALTER TABLE files ADD COLUMN type TEXT NOT NULL DEFAULT 'docs';
ALTER TABLE files ADD COLUMN system_id TEXT REFERENCES systems(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
CREATE INDEX IF NOT EXISTS idx_files_system ON files(system_id);

CREATE TABLE IF NOT EXISTS system_doc_links (
  system_id    TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  doc_id       TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  PRIMARY KEY (system_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_system_doc_links_doc ON system_doc_links(doc_id);

CREATE TABLE IF NOT EXISTS system_password_links (
  system_id     TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  password_id   TEXT NOT NULL REFERENCES passwords(id) ON DELETE CASCADE,
  PRIMARY KEY (system_id, password_id)
);

CREATE INDEX IF NOT EXISTS idx_system_password_links_password ON system_password_links(password_id);
