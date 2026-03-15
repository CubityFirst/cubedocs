DROP TABLE IF EXISTS doc_revisions;

CREATE TABLE IF NOT EXISTS asset_revisions (
  id          TEXT PRIMARY KEY,
  asset_type  TEXT NOT NULL CHECK(asset_type IN ('doc', 'password')),
  asset_id    TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  editor_id   TEXT NOT NULL,
  editor_name TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  data        TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_revisions_asset ON asset_revisions(asset_id);
