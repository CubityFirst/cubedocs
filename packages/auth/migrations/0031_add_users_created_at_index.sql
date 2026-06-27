-- Supports the admin Users list's keyset pagination, which orders by
-- (created_at DESC, id DESC). Without this the page scan forces a full sort
-- of the users table on every page; with it "newest first" is an index walk.
CREATE INDEX users_created_at ON users(created_at DESC);
