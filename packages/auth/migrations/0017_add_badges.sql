-- Generic badge bitmask on users. Bit 0 = Developer ("Annex Developer").
-- Add new badges by allocating the next bit; no migration needed per badge.
ALTER TABLE users ADD COLUMN badges INTEGER NOT NULL DEFAULT 0;
