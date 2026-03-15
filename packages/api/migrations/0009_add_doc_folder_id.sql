ALTER TABLE docs ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_docs_folder ON docs(folder_id);
