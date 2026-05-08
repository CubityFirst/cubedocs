-- Tracks the most-recently-issued forced-password-change token for a user.
-- Each successful login of a flagged user generates a fresh UUID stored
-- here and embedded in the JWT as the `cti` claim. /force-change-password
-- accepts the token only if the claim still matches the row, so:
--   - re-logging in invalidates any prior unused token immediately
--   - successful use clears the column, blocking same-token replay
ALTER TABLE users ADD COLUMN change_token_id TEXT;
