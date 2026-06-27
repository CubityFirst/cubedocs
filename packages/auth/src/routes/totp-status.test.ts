import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTotpStatus } from "./totp-status";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(row: { totp_secret: string | null } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare } } as unknown as Parameters<typeof handleTotpStatus>[1], prepare, bind };
}

function req() {
  return new Request("http://localhost/totp/status", { headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
});

describe("handleTotpStatus", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env } = makeEnv({ totp_secret: null });
    const res = await handleTotpStatus(req(), env);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is gone", async () => {
    const { env } = makeEnv(null);
    const res = await handleTotpStatus(req(), env);
    expect(res.status).toBe(404);
  });

  it("reports enabled:false when no secret is stored", async () => {
    const { env } = makeEnv({ totp_secret: null });
    const res = await handleTotpStatus(req(), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { enabled: boolean } };
    expect(json.data.enabled).toBe(false);
  });

  it("reports enabled:true when a secret is stored", async () => {
    const { env } = makeEnv({ totp_secret: "SECRET" });
    const res = await handleTotpStatus(req(), env);
    const json = (await res.json()) as { data: { enabled: boolean } };
    expect(json.data.enabled).toBe(true);
  });
});
