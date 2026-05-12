-- Per-favourite freeform note. Surfaces on the profile card next to the site
-- so the user can explain why a site is on their list. Nullable: empty means
-- no note shown. Server caps length at 140 chars.
ALTER TABLE user_favourite_projects ADD COLUMN note TEXT;
