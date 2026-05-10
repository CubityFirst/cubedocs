import type Stripe from "stripe";
import { Errors, errorResponse } from "../lib";
import { getStripe, getStripeWebhookCryptoProvider } from "../stripe-client";
import type { Env } from "../index";

// POST /stripe/webhook
//
// Public endpoint, signature-verified. Stripe retries on non-2xx so we
// always return 200 once the signature is valid; logical failures (event
// references an unknown user, etc.) get logged and 200'd to break the
// retry loop. Bad-signature requests get 400 — that's a real problem
// worth surfacing.
//
// Idempotency: we INSERT OR IGNORE into webhook_events keyed on event.id
// and bail out early when the row already exists. Stripe replays events
// during outages; this stops a duplicate from double-applying state.
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return errorResponse(Errors.INTERNAL);
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return errorResponse(Errors.BAD_REQUEST);

  // MUST read raw body before any .json() — signature is over the bytes.
  const rawBody = await request.text();

  const stripe = getStripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      getStripeWebhookCryptoProvider(),
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return errorResponse(Errors.BAD_REQUEST);
  }

  // Idempotency: skip if we've already handled this event id.
  const insert = await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_events (event_id, type, processed_at) VALUES (?, ?, ?)",
  ).bind(event.id, event.type, Date.now()).run();
  if (insert.meta.changes === 0) {
    return new Response("ok", { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(env, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(env, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(env, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(env, event.data.object as Stripe.Invoice);
        break;
      case "invoice.paid":
        await handleInvoicePaid(env, event.data.object as Stripe.Invoice);
        break;
      default:
        // Unsubscribed event types are fine — Stripe sends what it's
        // configured to send. Just acknowledge and move on.
        break;
    }
  } catch (err) {
    // Always 200 on handler errors. A buggy handler won't be fixed by
    // a Stripe retry, so 500'ing just creates noise. The idempotency
    // row stays in place; to force a reprocess after a code fix,
    // delete the row from webhook_events manually. Bad signatures
    // still 400 above (caught earlier).
    console.error(`Stripe webhook handler for ${event.type} failed:`, err);
  }

  return new Response("ok", { status: 200 });
}

// checkout.session.completed: links the Stripe customer + subscription
// IDs to our user row. The actual plan flip happens on the subsequent
// customer.subscription.created event.
async function handleCheckoutCompleted(env: Env, sessionObj: Stripe.Checkout.Session): Promise<void> {
  const userId = sessionObj.client_reference_id;
  if (!userId) {
    console.warn("checkout.session.completed missing client_reference_id", sessionObj.id);
    return;
  }
  const customerId = typeof sessionObj.customer === "string" ? sessionObj.customer : sessionObj.customer?.id ?? null;
  const subscriptionId = typeof sessionObj.subscription === "string" ? sessionObj.subscription : sessionObj.subscription?.id ?? null;

  if (!customerId) return;

  await env.DB.prepare(
    `UPDATE users
     SET stripe_customer_id = COALESCE(stripe_customer_id, ?),
         stripe_subscription_id = COALESCE(?, stripe_subscription_id)
     WHERE id = ?`,
  ).bind(customerId, subscriptionId, userId).run();
}

// customer.subscription.created/updated: source of truth for plan,
// status, and period end. We resolve the user by metadata.userId
// (stamped during Checkout) so this works even if it arrives before
// checkout.session.completed.
async function handleSubscriptionUpsert(env: Env, sub: Stripe.Subscription): Promise<void> {
  console.log("[WEBHOOK_DIAG_v2] subscription upsert entered", { subId: sub.id, hasMetadata: !!sub.metadata, metadataKeys: sub.metadata ? Object.keys(sub.metadata) : [], userId: sub.metadata?.userId });
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("subscription event missing metadata.userId", sub.id);
    return;
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // Stripe moved current_period_end from the subscription to per-item in
  // newer api versions. Try both — older SDK type defs still expose it
  // on Subscription, newer payloads only have it on items.
  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end
    ?? (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end
    ?? null;
  const status = sub.status;
  const plan = "ink";
  const now = Date.now();

  // sub.cancel_at is populated when the user has scheduled a
  // cancel-at-period-end via Customer Portal; null when not pending or
  // when they've resumed. Status remains 'active' until Stripe actually
  // transitions to canceled (which fires subscription.deleted).
  const cancelAt = sub.cancel_at ? sub.cancel_at * 1000 : null;

  // Only set personal_plan_started_at if it's not already populated —
  // preserves the original supporter date across cancel/resub cycles.
  await env.DB.prepare(
    `UPDATE users
     SET stripe_customer_id = ?,
         stripe_subscription_id = ?,
         personal_plan = ?,
         personal_plan_status = ?,
         personal_period_end = ?,
         personal_plan_cancel_at = ?,
         personal_plan_started_at = COALESCE(personal_plan_started_at, ?)
     WHERE id = ?`,
  ).bind(
    customerId,
    sub.id,
    plan,
    status,
    periodEnd ? periodEnd * 1000 : null,
    cancelAt,
    now,
    userId,
  ).run();
}

// customer.subscription.deleted: clear plan + status. Keep
// stripe_customer_id and personal_plan_started_at so a resubscribe
// preserves the supporter-since date.
async function handleSubscriptionDeleted(env: Env, sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) return;

  await env.DB.prepare(
    `UPDATE users
     SET personal_plan = NULL,
         personal_plan_status = 'canceled',
         personal_period_end = NULL,
         personal_plan_cancel_at = NULL,
         stripe_subscription_id = NULL
     WHERE id = ?`,
  ).bind(userId).run();
}

// invoice.payment_failed: flip status to past_due. The plan resolver
// keeps perks active during past_due so users get a grace period; the
// frontend banners them to update their payment method.
async function handleInvoicePaymentFailed(env: Env, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  await env.DB.prepare(
    `UPDATE users
     SET personal_plan_status = 'past_due'
     WHERE stripe_subscription_id = ?`,
  ).bind(subscriptionId).run();
}

// invoice.paid: confirm active status and refresh period_end. This is
// also the renewal heartbeat — fired every billing cycle on success.
async function handleInvoicePaid(env: Env, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  // invoice.lines exposes the period the invoice covers; the latest
  // line's period.end is the new period_end.
  const lastPeriodEnd = invoice.lines.data
    .map(l => l.period?.end ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  await env.DB.prepare(
    `UPDATE users
     SET personal_plan_status = 'active',
         personal_period_end = ?
     WHERE stripe_subscription_id = ?`,
  ).bind(lastPeriodEnd ? lastPeriodEnd * 1000 : null, subscriptionId).run();
}

// Stripe types put `subscription` in different places across Invoice
// shapes / api versions; this normalizes it to a string id or null.
function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object" && "id" in direct) return direct.id;

  // Newer api versions may put it on the parent.subscription_details:
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) return fromParent.id;

  return null;
}
