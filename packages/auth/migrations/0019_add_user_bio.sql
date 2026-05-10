-- Optional supporter bio shown on the user profile card. Writes are gated to
-- Annex Ink members in the auth worker; the column itself stores text from
-- anyone who's ever held Ink (so a downgrade preserves the value for if/when
-- they re-subscribe). Display gating happens in /users/:id on the API worker.
ALTER TABLE users ADD COLUMN bio TEXT;
