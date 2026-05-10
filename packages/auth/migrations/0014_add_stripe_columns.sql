-- Per-user subscription state for the Annex Ink supporter tier (and any
-- future personal plans). Stripe owns the truth for paid subs; granted_*
-- columns are a manual override (comp grants, early-supporter gifts) that
-- takes precedence over the Stripe-managed plan in resolvePersonalPlan().
--
-- All nullable so existing users default to free with no migration needed.
-- Both the auth and api workers must redeploy after this migration: the
-- api worker imports loadCurrentSession from packages/auth/src/session.ts
-- which will start reading these columns.
ALTER TABLE users ADD COLUMN stripe_customer_id       TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id   TEXT;
ALTER TABLE users ADD COLUMN personal_plan            TEXT;
ALTER TABLE users ADD COLUMN personal_plan_status     TEXT;
ALTER TABLE users ADD COLUMN personal_period_end      INTEGER;
ALTER TABLE users ADD COLUMN personal_plan_started_at INTEGER;
ALTER TABLE users ADD COLUMN granted_plan             TEXT;
ALTER TABLE users ADD COLUMN granted_plan_expires_at  INTEGER;
ALTER TABLE users ADD COLUMN granted_plan_reason      TEXT;

-- Stripe webhook idempotency. Stripe retries deliveries; we INSERT OR
-- IGNORE keyed on event_id and bail out if 0 rows changed (already handled).
CREATE TABLE webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);
