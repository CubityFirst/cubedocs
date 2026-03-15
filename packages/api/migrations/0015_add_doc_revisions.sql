CREATE TABLE IF NOT EXISTS doc_revisions (
  id          TEXT PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  editor_id   TEXT NOT NULL,
  editor_name TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_revisions_doc ON doc_revisions(doc_id);
