CREATE TABLE IF NOT EXISTS passwords (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
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
