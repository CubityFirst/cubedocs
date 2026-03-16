CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
  uploaded_by TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder_id);
