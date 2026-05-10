// Per-user plan resolution. Three sources of truth, in priority order:
//
//   1. granted_plan (set via wrangler one-liner for comps) — wins if it
//      either has no expiry or hasn't expired yet
//   2. personal_plan (Stripe-managed) — active when status is one of
//      active|trialing|past_due (past_due gets a grace period; the UI
//      shows a banner but the perks stay on)
//   3. free
//
// Keep this a pure function so the api worker can import it via the
// same cross-package path it already uses for loadCurrentSession.

export type PersonalPlan = "free" | "ink";

export type PlanRow = {
  granted_plan: string | null;
  granted_plan_expires_at: number | null;
  granted_plan_started_at: number | null;
  personal_plan: string | null;
  personal_plan_status: string | null;
  personal_plan_started_at: number | null;
  personal_plan_cancel_at: number | null;
};

export type ResolvedPlan = {
  plan: PersonalPlan;
  via: "granted" | "paid" | "free";
  since: number | null;
  status: string | null;
  // When non-null, the active sub has been set to cancel and access
  // ends at this Unix-ms timestamp. Stays in 'active' status until
  // then; UI uses this to show "expires on X".
  cancelAt: number | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function asPlan(value: string | null): PersonalPlan {
  return value === "ink" ? "ink" : "free";
}

export function resolvePersonalPlan(row: PlanRow, now: number = Date.now()): ResolvedPlan {
  if (row.granted_plan && (row.granted_plan_expires_at === null || row.granted_plan_expires_at > now)) {
    return {
      plan: asPlan(row.granted_plan),
      via: "granted",
      since: row.granted_plan_started_at,
      status: "granted",
      cancelAt: null,
    };
  }

  if (row.personal_plan && row.personal_plan_status && ACTIVE_STATUSES.has(row.personal_plan_status)) {
    return {
      plan: asPlan(row.personal_plan),
      via: "paid",
      since: row.personal_plan_started_at,
      status: row.personal_plan_status,
      cancelAt: row.personal_plan_cancel_at,
    };
  }

  return { plan: "free", via: "free", since: null, status: null, cancelAt: null };
}
