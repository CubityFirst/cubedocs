import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteAccount } from "./delete-account";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));
vi.mock("../mfa", () => ({
  requireMFA: vi.fn(),
}));
vi.mock("../stripe-client", () => ({
  getStripe: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";
import { requireMFA } from "../mfa";
import { getStripe } from "../stripe-client";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(opts?: { stripeKey?: string; billingRow?: { stripe_customer_id: string | null } | null }) {
  const run = vi.fn().mockResolvedValue({});
  const first = vi.fn().mockResolvedValue(opts?.billingRow ?? null);
  const bind = vi.fn().mockReturnValue({ run, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: { DB: { prepare }, STRIPE_SECRET_KEY: opts?.stripeKey } as unknown as Parameters<typeof handleDeleteAccount>[1],
    prepare,
    bind,
    run,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/delete-account", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
  vi.mocked(requireMFA).mockResolvedValue(null as never);
});

describe("handleDeleteAccount", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env, run } = makeEnv();
    const res = await handleDeleteAccount(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires MFA before deleting", async () => {
    vi.mocked(requireMFA).mockResolvedValue(
      Response.json({ ok: false, error: "mfa_required" }, { status: 401 }) as never,
    );
    const { env, run } = makeEnv();
    const res = await handleDeleteAccount(req({}), env);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes the user row on valid MFA (no Stripe configured)", async () => {
    const { env, run, bind } = makeEnv();
    const res = await handleDeleteAccount(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(bind).toHaveBeenLastCalledWith("user-1");
    expect(getStripe).not.toHaveBeenCalled();
  });

  it("deletes the Stripe customer first when one exists", async () => {
    const del = vi.fn().mockResolvedValue({});
    vi.mocked(getStripe).mockReturnValue({ customers: { del } } as never);
    const { env, run } = makeEnv({ stripeKey: "sk_test", billingRow: { stripe_customer_id: "cus_123" } });
    const res = await handleDeleteAccount(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith("cus_123");
    // user row still deleted afterward
    expect(run).toHaveBeenCalled();
  });

  it("still deletes the account if the Stripe call throws", async () => {
    const del = vi.fn().mockRejectedValue(new Error("stripe down"));
    vi.mocked(getStripe).mockReturnValue({ customers: { del } } as never);
    const { env, run } = makeEnv({ stripeKey: "sk_test", billingRow: { stripe_customer_id: "cus_123" } });
    const res = await handleDeleteAccount(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
  });
});
