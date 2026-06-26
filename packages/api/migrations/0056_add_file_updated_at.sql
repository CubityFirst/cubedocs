-- Files were historically immutable (one uploaded blob per id, strong ETag "<id>").
-- Excalidraw drawings are edited in place via PUT /files/:id/content, which overwrites
-- the R2 blob. updated_at versions the content ETag ("<id>-<updatedAtMs>") so caches
-- don't serve stale bytes after a save. SQLite ADD COLUMN can't default to another
-- column, so backfill: for never-overwritten files updated_at == created_at forever,
-- keeping their ETag stable and 304 revalidation working exactly as before.
ALTER TABLE files ADD COLUMN updated_at TEXT;
UPDATE files SET updated_at = created_at WHERE updated_at IS NULL;
