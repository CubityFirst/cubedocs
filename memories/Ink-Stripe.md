# Annex Ink + Stripe Integration

The Annex Ink personal supporter subscription, its Stripe billing integration, and admin controls. Read this before touching anything in `billing.ts`, `stripe-webhook.ts`, the `personal_plan_*` / `granted_plan_*` columns on `users`, the billing section of `UserSettingsPage.tsx`, or `InkBillingCard` in the admin panel.

## What it is

**Annex Ink** is a per-user $5/mo supporter tier (separate from any per-workspace plan). Cosmetic-only perks for v1:

- Animated conic-gradient "shiny" ring around the user's avatar (`packages/frontend/src/styles/ink-border.css`, applied via `UserAvatar`'s `personalPlan` prop)
- "Supporter since {Xth of Month, Year}" tenure flag in `UserSettingsPage` billing card and `UserProfileCard` tooltip
- Animated rainbow Sparkles icon next to the user's name on the profile card

Free users render with a deterministic per-user color ring in collab presence (`EditorPresence.tsx`); Ink supporters render with the animated ring **instead** (the two are mutually exclusive — see `EditorPresence.PresenceAvatar`).

## Schema

All Ink state lives on the **auth DB** `users` table. Migrations: `0014_add_stripe_columns.sql` (initial), `0015_add_personal_plan_cancel_at.sql` (pending-cancellation tracking).

Columns:
- `stripe_customer_id`, `stripe_subscription_id` — set by `checkout.session.completed` and `subscription.created` webhooks
- `personal_plan` — `'ink'` when active via Stripe, NULL otherwise
- `personal_plan_status` — `active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired`
- `personal_period_end` — Unix ms; current billing cycle's end
- `personal_plan_started_at` — Unix ms; **preserved across cancel/resub cycles** so "supporter since" reflects the original date (uses `COALESCE` in the upsert)
- `personal_plan_cancel_at` — Unix ms; non-null when `cancel_at_period_end=true` is set on the Stripe sub. UI surfaces this as "Cancels on X."
- `granted_plan`, `granted_plan_expires_at`, `granted_plan_reason` — manual override (admin grants). Takes precedence over Stripe-managed plan.

Plus `webhook_events (event_id PRIMARY KEY, type, processed_at)` for idempotency.

## Plan resolution

**Always go through `resolvePersonalPlan` in `packages/auth/src/plan.ts`.** Never read the columns directly to determine plan state. The resolver is a pure function with this precedence:

1. `granted_plan` set AND (`granted_plan_expires_at` is NULL OR in the future) → `via: 'granted'`, `status: 'granted'`
2. `personal_plan` set AND `personal_plan_status` ∈ `{active, trialing, past_due}` → `via: 'paid'`
3. otherwise → `via: 'free'`

Returns `{ plan, via, since, status, cancelAt }`. `since` is null for granted plans (we don't track granted-at). `past_due` keeps perks active during Stripe's smart-retry grace; UI surfaces a banner.

The resolver is imported across packages — `packages/api`, `packages/admin`, plus the auth worker's session loader. Each consumer's `tsconfig.json` includes `../auth/src/plan.ts` in its `include` array.

## Cross-package consideration

The API worker reads the `users` table directly via the `AUTH_DB` binding (read-only by convention) for `loadCurrentSession`, member-list plan info, and `/users/:id` profile responses. The admin worker also reads it for the user details panel.

**A schema change to any column the resolver touches requires redeploying auth + api + admin** in that order. The migrations live in `packages/auth/migrations/` only.

## Stripe webhook flow

`packages/auth/src/routes/stripe-webhook.ts`. Public endpoint, signature-verified. Reached via `https://docs.cubityfir.st/stripe/webhook` — the frontend worker proxies `/stripe/webhook` to auth via service binding (see `packages/frontend/worker/index.ts`). Stripe doesn't see the auth worker directly because it has no public hostname.

Handler contract (load-bearing):

- **Raw body first** — must `await request.text()` before any `.json()`. Signature is over the bytes; the frontend proxy passes the request unchanged so this works through the hop.
- **Idempotency** — `INSERT OR IGNORE INTO webhook_events VALUES (event_id, ...)` first; if `meta.changes === 0`, return 200 immediately (already handled). To force a reprocess after a code fix, manually `DELETE FROM webhook_events WHERE event_id = '...'`.
- **Always 200 on handler errors** — caught exceptions are logged and we still return 200. Rationale: Stripe's retry won't fix a code bug, so 500'ing creates noise. Bad signatures still return 400 (those *should* be retried by Stripe, then dropped).
- **userId resolution** — `checkout.session.completed` uses `client_reference_id`. All `customer.subscription.*` events use `metadata.userId`, which is stamped on the subscription via `subscription_data: { metadata: { userId } }` in `billing.ts`'s Checkout creation. **A subscription created before that line was deployed has empty metadata** and the webhook handler will silently no-op — fix by manually adding `userId` metadata in the Stripe Dashboard, then resending the event (after clearing webhook_events).
- **invoice.* events** look up the user by `stripe_subscription_id` in our DB, since invoices don't carry metadata.

## Admin panel

`packages/admin/frontend/src/pages/UsersPage.tsx` (search "InkBillingCard"). For any user, admin can:

- **Grant Ink** — sets `granted_plan='ink'` with reason + duration (Forever / 30 days / 1 year). Optionally checkbox "Also cancel their paid Stripe subscription" — calls Stripe `POST /v1/subscriptions/:id` with `cancel_at_period_end=true` so they stop being billed (the grant keeps them on Ink).
- **Revoke grant** — clears the override columns. Doesn't touch Stripe-managed plan.
- **Cancel paid subscription** — direct Stripe API call. Two modes: at-period-end (recommended) or immediate. The webhook fires asynchronously and updates the row via the existing handler; admin endpoint never writes to the DB directly.

Admin worker calls Stripe REST directly with its own `STRIPE_SECRET_KEY` (set per-environment). No service-binding hop to auth — keeps the cancel-on-grant path on a single worker.

## Local dev setup

`.dev.vars` files (gitignored) hold local secrets:

- `packages/auth/.dev.vars` needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_INK_PRICE_ID`, `APP_ORIGIN=http://localhost:5173`
- `packages/admin/.dev.vars` needs `STRIPE_SECRET_KEY` only

Forward Stripe webhook events to the local auth worker:

```
stripe listen --forward-to http://localhost:8788/stripe/webhook
```

The CLI prints a `whsec_...` at startup — that's what goes in `STRIPE_WEBHOOK_SECRET` for local dev. (Live mode uses a different `whsec_` from the registered webhook in Stripe Dashboard.) Restart the auth worker after editing `.dev.vars` — wrangler only reads it on startup.

## Production setup

- `STRIPE_INK_PRICE_ID` is in `packages/auth/wrangler.toml` `[vars]` (live price id — committed). `.dev.vars` overrides locally to the test-mode price id.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set via `wrangler secret put` on the auth worker. `STRIPE_SECRET_KEY` also on admin worker.
- Webhook endpoint URL in Stripe Dashboard: `https://docs.cubityfir.st/stripe/webhook`. Subscribed events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- Customer Portal must be configured separately in **live** mode (Settings → Billing → Customer portal). Test mode and live mode have different portal configs.

## Operations cheatsheet

```sql
-- Comp a user without going through Stripe (admin panel does this with reason auto-set)
UPDATE users SET granted_plan='ink', granted_plan_reason='early supporter'
WHERE email='friend@example.com';

-- Force-process a stuck webhook after fixing a bug
DELETE FROM webhook_events WHERE event_id='evt_...';
-- then resend the event from Stripe Dashboard

-- Reset a user fully back to free (testing)
UPDATE users SET stripe_customer_id=NULL, stripe_subscription_id=NULL,
  personal_plan=NULL, personal_plan_status=NULL, personal_period_end=NULL,
  personal_plan_started_at=NULL, personal_plan_cancel_at=NULL,
  granted_plan=NULL, granted_plan_expires_at=NULL, granted_plan_reason=NULL
WHERE email='you@example.com';
```

The "force" path is rarely needed — the always-200 webhook policy means failed events stay in `webhook_events` and need manual clearing to re-attempt. By design.

## Stripe customer emails

Test mode: nothing is ever emailed.
Live mode: defaults to receipts on, invoice emails off — toggle at https://dashboard.stripe.com/settings/emails. Admin-driven cancellations don't trigger Stripe's user-facing cancellation email by default; if you want users notified, enable that toggle or send your own email.
