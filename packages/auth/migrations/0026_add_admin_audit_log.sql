-- Actor-attributed log of privileged admin-worker actions (force
-- password change, avatar delete, ink grant/revoke, gift-month, Stripe
-- cancel, GDPR export, project feature change / reindex / delete).
-- Moderation actions keep their own dedicated history in
-- user_moderation_events; everything else lands here.
--
-- No FK on actor_user_id / target_id on purpose: audit rows must
-- outlive deletion of the actor or the target, and targets span both
-- the auth DB (users) and the main DB (projects).
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX admin_audit_log_actor ON admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX admin_audit_log_target ON admin_audit_log(target_type, target_id, created_at DESC);
