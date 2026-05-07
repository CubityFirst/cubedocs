import { describe, it, expect } from "vitest";
import { checkModeration } from "./login";

describe("checkModeration", () => {
  it("returns null for an active account (moderation=0)", () => {
    expect(checkModeration(0)).toBeNull();
  });

  it("returns a 403 account_disabled response for moderation=-1", async () => {
    const res = checkModeration(-1);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json<{ ok: boolean; error: string }>();
    expect(body.error).toBe("account_disabled");
  });

  it("returns a 403 account_suspended response when suspended until a future time", async () => {
    const untilSeconds = Math.floor(Date.now() / 1000) + 3600;
    const res = checkModeration(untilSeconds);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json<{ ok: boolean; error: string; until: number }>();
    expect(body.error).toBe("account_suspended");
    expect(body.until).toBe(untilSeconds);
  });

  it("returns null when a suspension timestamp is in the past (expired)", () => {
    const expiredSeconds = Math.floor(Date.now() / 1000) - 1;
    expect(checkModeration(expiredSeconds)).toBeNull();
  });

  it("returns null when the suspension expires exactly now", () => {
    // nowSeconds === moderation → suspension has just expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(checkModeration(nowSeconds)).toBeNull();
  });
});
