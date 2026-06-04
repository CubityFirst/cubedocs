-- Cloudflare-for-SaaS custom domains. One custom hostname per site (PRIMARY KEY
-- on project_id), globally unique hostname (a host can only point at one site).
-- Provisioning state mirrors the Cloudflare custom_hostname object so the owner
-- UI can show the DNS records to add and the live validation status without
-- re-hitting Cloudflare on every page load.
CREATE TABLE project_custom_domains (
  project_id     TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  hostname       TEXT NOT NULL UNIQUE,
  -- Cloudflare custom_hostname id (NULL only transiently if CF create failed).
  cf_hostname_id TEXT,
  -- Simplified, app-facing status: 'pending' | 'active' | 'error'.
  status         TEXT NOT NULL DEFAULT 'pending',
  -- Raw Cloudflare hostname-ownership (DCV) status, e.g. 'pending' | 'active'.
  hostname_status TEXT,
  -- Raw Cloudflare ssl.status, e.g. 'pending_validation' | 'active'.
  ssl_status     TEXT,
  -- JSON array of { type, name, value, note } DNS records the customer must add.
  dns_records    TEXT,
  -- JSON array of human-readable verification error strings from Cloudflare.
  verification_errors TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
