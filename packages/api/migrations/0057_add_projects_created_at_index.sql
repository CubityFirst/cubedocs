-- Supports the admin Projects list's keyset pagination, which orders by
-- (created_at DESC, id DESC). Without this the page scan forces a full sort
-- of the projects table on every page; with it "newest first" is an index walk.
CREATE INDEX projects_created_at ON projects(created_at DESC);
