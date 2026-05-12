-- Move Stripe + plan state off the users table into a 1:1 satellite.
-- The users row is read on every authenticated API request via loadCurrentSession;
-- pulling 11 plan/Stripe columns inline made every users row much wider than the
-- auth-essential columns (id/email/moderation/is_admin/etc.) needed for the hot
-- path. Splitting them lets users stay narrow and isolates billing churn from
-- the auth fast path.
--
-- A user_billing row only exists once a user has interacted with Stripe or
-- received a grant; everywhere we read, LEFT JOIN handles the absent-row case.
CREATE TABLE user_billing (
  user_id                   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id        TEXT,
  stripe_subscription_id    TEXT,
  personal_period_end       INTEGER,
  personal_plan             TEXT,
  personal_plan_status      TEXT,
  personal_plan_started_at  INTEGER,
  personal_plan_cancel_at   INTEGER,
  granted_plan              TEXT,
  granted_plan_expires_at   INTEGER,
  granted_plan_started_at   INTEGER,
  granted_plan_reason       TEXT
);

INSERT INTO user_billing (
  user_id, stripe_customer_id, stripe_subscription_id, personal_period_end,
  personal_plan, personal_plan_status, personal_plan_started_at, personal_plan_cancel_at,
  granted_plan, granted_plan_expires_at, granted_plan_started_at, granted_plan_reason
)
SELECT id, stripe_customer_id, stripe_subscription_id, personal_period_end,
       personal_plan, personal_plan_status, personal_plan_started_at, personal_plan_cancel_at,
       granted_plan, granted_plan_expires_at, granted_plan_started_at, granted_plan_reason
FROM users
WHERE stripe_customer_id IS NOT NULL
   OR stripe_subscription_id IS NOT NULL
   OR personal_plan IS NOT NULL
   OR granted_plan IS NOT NULL
   OR personal_plan_started_at IS NOT NULL
   OR granted_plan_started_at IS NOT NULL;

-- Webhook event handlers for invoice.paid / payment_failed look up the user by
-- stripe_subscription_id, so that lookup needs an index.
CREATE INDEX idx_user_billing_subscription ON user_billing(stripe_subscription_id);

ALTER TABLE users DROP COLUMN stripe_customer_id;
ALTER TABLE users DROP COLUMN stripe_subscription_id;
ALTER TABLE users DROP COLUMN personal_period_end;
ALTER TABLE users DROP COLUMN personal_plan;
ALTER TABLE users DROP COLUMN personal_plan_status;
ALTER TABLE users DROP COLUMN personal_plan_started_at;
ALTER TABLE users DROP COLUMN personal_plan_cancel_at;
ALTER TABLE users DROP COLUMN granted_plan;
ALTER TABLE users DROP COLUMN granted_plan_expires_at;
ALTER TABLE users DROP COLUMN granted_plan_started_at;
ALTER TABLE users DROP COLUMN granted_plan_reason;
