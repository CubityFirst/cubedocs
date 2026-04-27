CREATE TABLE IF NOT EXISTS doc_links (
  source_doc_id TEXT NOT NULL,
  target_doc_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (source_doc_id, target_doc_id),
  FOREIGN KEY (source_doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (target_doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_links_project ON doc_links(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_links_target ON doc_links(target_doc_id);

ALTER TABLE projects ADD COLUMN graph_indexed_at TEXT;
