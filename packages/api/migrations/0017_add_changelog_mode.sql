ALTER TABLE projects ADD COLUMN changelog_mode TEXT NOT NULL DEFAULT 'off' CHECK(changelog_mode IN ('off', 'on', 'enforced'));
ALTER TABLE asset_revisions ADD COLUMN changelog TEXT;
