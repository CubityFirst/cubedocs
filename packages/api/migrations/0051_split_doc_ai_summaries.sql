-- Move ai_summary / ai_summary_version off the docs table into a 1:1 satellite.
-- The summary is potentially long markdown that lived inline on every docs row,
-- bloating SQLite page reads even for queries that didn't SELECT it (sidebar
-- listing, graph build, export). Only the doc-detail view and /api/ai/summarize
-- ever read the summary, so a satellite is the right shape.
CREATE TABLE doc_ai_summaries (
  doc_id  TEXT PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  version TEXT NOT NULL
);

INSERT INTO doc_ai_summaries (doc_id, summary, version)
  SELECT id, ai_summary, ai_summary_version
  FROM docs
  WHERE ai_summary IS NOT NULL AND ai_summary_version IS NOT NULL;

ALTER TABLE docs DROP COLUMN ai_summary;
ALTER TABLE docs DROP COLUMN ai_summary_version;
