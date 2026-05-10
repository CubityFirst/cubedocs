import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleStripeWebhook } from "./stripe-webhook";

vi.mock("../stripe-client", () => ({
  getStripe: vi.fn(),
  getStripeWebhookCryptoProvider: vi.fn().mockReturnValue({}),
}));

import { getStripe } from "../stripe-client";

interface MockDB {
  prepare: ReturnType<typeof vi.fn>;
  _runResults: Array<{ meta: { changes: number } }>;
  _bindCalls: unknown[][];
  _statements: string[];
}

// Returns a sequence-aware D1 mock. Each call to .run() returns the
// next object from `runResults` (default: { meta: { changes: 1 } }).
function makeDB(runResults: Array<{ meta: { changes: number } }> = []): MockDB {
  const _runResults = runResults;
  const _bindCalls: unknown[][] = [];
  const _statements: string[] = [];
  let runIndex = 0;

  const prepare = vi.fn((sql: string) => {
    _statements.push(sql);
    return {
      bind: (...args: unknown[]) => {
        _bindCalls.push(args);
        return {
          run: vi.fn().mockImplementation(() => {
            const result = _runResults[runIndex] ?? { meta: { changes: 1 } };
            runIndex += 1;
            return Promise.resolve(result);
          }),
        };
      },
    };
  });

  return { prepare, _runResults, _bindCalls, _statements };
}

function makeEnv(db: MockDB) {
  return {
    DB: db,
    STRIPE_SECRET_KEY: "sk_test_xxx",
    STRIPE_WEBHOOK_SECRET: "whsec_xxx",
  } as unknown as Parameters<typeof handleStripeWebhook>[1];
}

function makeRequest(body: string, sig = "valid-sig") {
  return new Request("http://localhost/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": sig, "content-type": "application/json" },
    body,
  });
}

function mockConstructEvent(event: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEventAsync: vi.fn().mockResolvedValue(event),
    },
  } as unknown as ReturnType<typeof getStripe>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleStripeWebhook — signature + idempotency", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const db = makeDB();
    const req = new Request("http://localhost/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleStripeWebhook(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it("returns 400 on bad signature", async () => {
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEventAsync: vi.fn().mockRejectedValue(new Error("bad sig")),
      },
    } as unknown as ReturnType<typeof getStripe>);

    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(400);
  });

  it("acknowledges duplicate events without processing", async () => {
    mockConstructEvent({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1", metadata: {} } } });
    // INSERT OR IGNORE returns changes: 0 → already processed
    const db = makeDB([{ meta: { changes: 0 } }]);
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);
    // Only the idempotency insert should have run
    expect(db._statements.length).toBe(1);
    expect(db._statements[0]).toContain("INSERT OR IGNORE INTO webhook_events");
  });
});

describe("handleStripeWebhook — checkout.session.completed", () => {
  it("links customer + subscription IDs to the user", async () => {
    mockConstructEvent({
      id: "evt_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          client_reference_id: "user-1",
          customer: "cus_abc",
          subscription: "sub_xyz",
        },
      },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);

    expect(db._statements[0]).toContain("INSERT OR IGNORE INTO webhook_events");
    expect(db._statements[1]).toContain("UPDATE users");
    expect(db._statements[1]).toContain("stripe_customer_id");
    expect(db._statements[1]).toContain("stripe_subscription_id");
    // bind args for the user UPDATE: customerId, subId, userId
    expect(db._bindCalls[1]).toEqual(["cus_abc", "sub_xyz", "user-1"]);
  });

  it("ignores events missing client_reference_id", async () => {
    mockConstructEvent({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { id: "cs_2", customer: "cus_abc", subscription: "sub_xyz" } },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);
    // Only idempotency insert; no user update
    expect(db._statements.length).toBe(1);
  });
});

describe("handleStripeWebhook — customer.subscription.created/updated", () => {
  const event = {
    id: "evt_4",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { userId: "user-1" },
        items: {
          data: [{ current_period_end: 1_700_000_000 }],
        },
      },
    },
  };

  it("upserts plan, status, period_end, started_at via COALESCE", async () => {
    mockConstructEvent(event);
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);

    expect(db._statements[1]).toContain("UPDATE users");
    expect(db._statements[1]).toContain("personal_plan");
    expect(db._statements[1]).toContain("COALESCE(personal_plan_started_at");

    const args = db._bindCalls[1];
    expect(args[0]).toBe("cus_1"); // customerId
    expect(args[1]).toBe("sub_1"); // subscriptionId
    expect(args[2]).toBe("ink"); // plan
    expect(args[3]).toBe("active"); // status
    expect(args[4]).toBe(1_700_000_000_000); // period end (ms)
    expect(args[5]).toBeNull(); // cancel_at (null when no cancellation pending)
    // args[6] is now (Date.now()) — just check it's a number
    expect(typeof args[6]).toBe("number");
    expect(args[7]).toBe("user-1"); // user id
  });

  it("captures cancel_at when subscription is set to cancel at period end", () => {
    mockConstructEvent({
      ...event,
      data: {
        object: {
          ...event.data.object,
          cancel_at: 1_750_000_000,
          cancel_at_period_end: true,
        },
      },
    });
    const db = makeDB();
    return handleStripeWebhook(makeRequest("{}"), makeEnv(db)).then(() => {
      const args = db._bindCalls[1];
      expect(args[5]).toBe(1_750_000_000_000); // cancel_at in ms
    });
  });

  it("ignores subscription events missing metadata.userId", async () => {
    mockConstructEvent({
      ...event,
      data: { object: { ...event.data.object, metadata: {} } },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);
    // Only idempotency insert
    expect(db._statements.length).toBe(1);
  });
});

describe("handleStripeWebhook — customer.subscription.deleted", () => {
  it("clears plan + sub id, sets status canceled", async () => {
    mockConstructEvent({
      id: "evt_5",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", metadata: { userId: "user-1" } } },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);

    expect(db._statements[1]).toContain("personal_plan = NULL");
    expect(db._statements[1]).toContain("'canceled'");
    expect(db._bindCalls[1]).toEqual(["user-1"]);
  });
});

describe("handleStripeWebhook — invoice events", () => {
  it("invoice.payment_failed flips status to past_due", async () => {
    mockConstructEvent({
      id: "evt_6",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", subscription: "sub_1", lines: { data: [] } } },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);

    expect(db._statements[1]).toContain("'past_due'");
    expect(db._bindCalls[1]).toEqual(["sub_1"]);
  });

  it("invoice.paid sets status active and refreshes period_end", async () => {
    mockConstructEvent({
      id: "evt_7",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_2",
          subscription: "sub_1",
          lines: { data: [{ period: { end: 1_800_000_000 } }] },
        },
      },
    });
    const db = makeDB();
    const res = await handleStripeWebhook(makeRequest("{}"), makeEnv(db));
    expect(res.status).toBe(200);

    expect(db._statements[1]).toContain("'active'");
    expect(db._bindCalls[1]).toEqual([1_800_000_000_000, "sub_1"]);
  });
});
