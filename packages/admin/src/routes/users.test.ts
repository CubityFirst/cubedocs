import { describe, it, expect } from "vitest";
import {
  getModerationAction,
  getCurrentStatus,
  buildBillingDetails,
  type BillingRow,
} from "./users";

const EMPTY_BILLING: BillingRow = {
  stripe_customer_id: null,
  stripe_subscription_id: null,
  personal_plan: null,
  personal_plan_status: null,
  personal_plan_started_at: null,
  personal_plan_cancel_at: null,
  personal_plan_style: null,
  personal_presence_color: null,
  personal_crit_sparkles: null,
  granted_plan: null,
  granted_plan_expires_at: null,
  granted_plan_started_at: null,
  granted_plan_reason: null,
};

describe("getModerationAction", () => {
  it("maps 0 to re_enabled", () => {
    expect(getModerationAction(0)).toBe("re_enabled");
  });
  it("maps -1 to disabled", () => {
    expect(getModerationAction(-1)).toBe("disabled");
  });
  it("maps a future timestamp to suspended", () => {
    expect(getModerationAction(Math.floor(Date.now() / 1000) + 3600)).toBe("suspended");
  });
});

describe("getCurrentStatus", () => {
  it("is disabled for -1", () => {
    expect(getCurrentStatus(-1)).toBe("disabled");
  });
  it("is suspended while the suspension is in the future", () => {
    expect(getCurrentStatus(Math.floor(Date.now() / 1000) + 3600)).toBe("suspended");
  });
  it("is active once a past suspension has elapsed", () => {
    expect(getCurrentStatus(Math.floor(Date.now() / 1000) - 3600)).toBe("active");
  });
  it("is active for 0", () => {
    expect(getCurrentStatus(0)).toBe("active");
  });
});

describe("buildBillingDetails", () => {
  it("resolves a row with no billing/grant to the free plan", () => {
    const d = buildBillingDetails(EMPTY_BILLING);
    expect(d.resolved_plan).toBe("free");
    expect(d.via).toBe("free");
    expect(d.granted).toBeNull();
    expect(d.stripe).toEqual({ customer_id: null, subscription_id: null });
  });

  it("treats an active manual grant as granted ink", () => {
    const d = buildBillingDetails({
      ...EMPTY_BILLING,
      granted_plan: "ink",
      granted_plan_started_at: Date.now() - 1000,
      granted_plan_reason: "comp",
    });
    expect(d.resolved_plan).toBe("ink");
    expect(d.via).toBe("granted");
    expect(d.granted).toEqual({ plan: "ink", expires_at: null, reason: "comp" });
  });

  it("passes through stripe identifiers", () => {
    const d = buildBillingDetails({
      ...EMPTY_BILLING,
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_456",
    });
    expect(d.stripe).toEqual({ customer_id: "cus_123", subscription_id: "sub_456" });
  });
});
