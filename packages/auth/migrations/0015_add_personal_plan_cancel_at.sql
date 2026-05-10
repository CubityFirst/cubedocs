-- Tracks when an active subscription is scheduled to cancel at the end
-- of its current period. Populated from Stripe's sub.cancel_at on every
-- customer.subscription.updated event; cleared on resume. NULL when no
-- cancellation is pending. Status stays 'active' until Stripe actually
-- transitions the sub to canceled, at which point the deletion handler
-- clears all per-plan columns.
ALTER TABLE users ADD COLUMN personal_plan_cancel_at INTEGER;
