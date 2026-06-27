import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpdateTimezone } from "./update-timezone";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv() {
  const run = vi.fn().mockResolvedValue({});
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: { DB: { prepare } } as unknown as Parameters<typeof handleUpdateTimezone>[1],
    prepare,
    bind,
    run,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/update-timezone", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
});

describe("handleUpdateTimezone", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env, prepare } = makeEnv();
    const res = await handleUpdateTimezone(req({ timezone: "Europe/London" }), env);
    expect(res.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects a non-string timezone", async () => {
    const { env, prepare } = makeEnv();
    const res = await handleUpdateTimezone(req({ timezone: 42 }), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects an unknown IANA zone", async () => {
    const { env, prepare } = makeEnv();
    const res = await handleUpdateTimezone(req({ timezone: "Mars/Olympus_Mons" }), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("writes a valid IANA zone", async () => {
    const { env, prepare, bind } = makeEnv();
    const res = await handleUpdateTimezone(req({ timezone: "Europe/London" }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { timezone: string } };
    expect(json.data.timezone).toBe("Europe/London");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("timezone"));
    expect(bind).toHaveBeenCalledWith("user-1", "Europe/London");
  });

  it("treats null as a reset", async () => {
    const { env, bind } = makeEnv();
    const res = await handleUpdateTimezone(req({ timezone: null }), env);
    expect(res.status).toBe(200);
    expect(bind).toHaveBeenCalledWith("user-1", null);
  });
});
