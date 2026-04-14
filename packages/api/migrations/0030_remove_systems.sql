-- Remove systems module

-- 1. Drop dependent tables first
DROP TABLE IF EXISTS system_doc_links;

-- 2. Drop indexes on systems before dropping the table
DROP INDEX IF EXISTS idx_systems_project;
DROP INDEX IF EXISTS idx_systems_folder;

-- 3. Drop the systems table
DROP TABLE IF EXISTS systems;

-- 4. Remove systems_enabled column from projects
ALTER TABLE projects DROP COLUMN systems_enabled;

-- 5. Rebuild files table without type and system_id columns
--    (SQLite does not support DROP COLUMN for columns with CHECK constraints
--    or foreign key references in older versions, so we recreate the table)
DROP INDEX IF EXISTS idx_files_type;
DROP INDEX IF EXISTS idx_files_system;

CREATE TABLE IF NOT EXISTS files_new (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
  uploaded_by TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

INSERT INTO files_new (id, name, mime_type, size, project_id, folder_id, uploaded_by, created_at)
  SELECT id, name, mime_type, size, project_id, folder_id, uploaded_by, created_at
  FROM files;

DROP TABLE files;
ALTER TABLE files_new RENAME TO files;

CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder_id);
