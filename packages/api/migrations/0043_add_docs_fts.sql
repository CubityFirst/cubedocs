CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  title,
  body,
  doc_id     UNINDEXED,
  project_id UNINDEXED,
  tokenize = 'porter ascii'
);
