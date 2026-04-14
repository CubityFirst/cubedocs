-- Remove password vault feature

-- 1. Drop link table first (references both systems and passwords)
DROP TABLE IF EXISTS system_password_links;

-- 2. Drop the passwords table
DROP TABLE IF EXISTS passwords;

-- 3. Remove vault_enabled column from projects
ALTER TABLE projects DROP COLUMN vault_enabled;

-- 4. Remove password revisions and rebuild asset_revisions with narrowed CHECK constraint
DELETE FROM asset_revisions WHERE asset_type = 'password';

CREATE TABLE IF NOT EXISTS asset_revisions_new (
  id          TEXT PRIMARY KEY,
  asset_type  TEXT NOT NULL CHECK(asset_type IN ('doc')),
  asset_id    TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  editor_id   TEXT NOT NULL,
  editor_name TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  data        TEXT,
  changelog   TEXT
);

INSERT INTO asset_revisions_new SELECT * FROM asset_revisions;
DROP TABLE asset_revisions;
ALTER TABLE asset_revisions_new RENAME TO asset_revisions;

CREATE INDEX IF NOT EXISTS idx_asset_revisions_asset ON asset_revisions(asset_id);
