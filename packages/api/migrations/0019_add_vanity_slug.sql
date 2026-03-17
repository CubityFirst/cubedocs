ALTER TABLE projects ADD COLUMN vanity_slug TEXT;
CREATE UNIQUE INDEX idx_projects_vanity_slug ON projects (vanity_slug) WHERE vanity_slug IS NOT NULL;
