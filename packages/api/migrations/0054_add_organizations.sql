-- Organizations: a collection of sites (projects) with trickle-down roles.
-- An org member's role applies to EVERY site in the org (owner->owner,
-- admin->admin, editor->editor, viewer->viewer). Effective site access is
-- resolved at READ time as max(direct project_members role, accepted
-- organization_members role for the site's organization_id) -- see
-- src/lib/access.ts. Org roles never include 'limited' (a per-doc-share concept
-- with no org meaning). Lives in the API DB (cubedocs-main); user_id is a bare
-- string with no cross-DB FK, exactly like project_members.

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE organization_members (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin', 'owner')),
  invited_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  accepted        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(organization_id, user_id)
);

-- One org per site. SET NULL so deleting an org DETACHES its sites (they
-- survive) instead of destroying them. Unattached sites keep organization_id
-- = NULL.
ALTER TABLE projects ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- UNIQUE(organization_id, user_id) already indexes the resolver join.
-- user-keyed index powers "list my orgs"; projects(organization_id) powers
-- "sites in org" and the resolver's project->org hop.
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
