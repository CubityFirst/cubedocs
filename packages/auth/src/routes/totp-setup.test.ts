import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTotpSetup } from "./totp-setup";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));
vi.mock("../totp", () => ({
  generateSecret: vi.fn(() => "GENERATEDSECRET"),
  buildOtpauthUri: vi.fn(() => "otpauth://totp/Annex:test@example.com?secret=GENERATEDSECRET"),
}));

import { requireAuthenticatedSession } from "../auth-session";
import { generateSecret, buildOtpauthUri } from "../totp";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(row: { email: string } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare } } as unknown as Parameters<typeof handleTotpSetup>[1], prepare, bind };
}

function req() {
  return new Request("http://localhost/totp/setup", { method: "POST", headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
  vi.mocked(generateSecret).mockReturnValue("GENERATEDSECRET");
  vi.mocked(buildOtpauthUri).mockReturnValue("otpauth://totp/Annex:test@example.com?secret=GENERATEDSECRET");
});

describe("handleTotpSetup", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env } = makeEnv({ email: "test@example.com" });
    const res = await handleTotpSetup(req(), env);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is gone", async () => {
    const { env } = makeEnv(null);
    const res = await handleTotpSetup(req(), env);
    expect(res.status).toBe(404);
  });

  it("returns a fresh secret + otpauth uri bound to the user's email", async () => {
    const { env } = makeEnv({ email: "test@example.com" });
    const res = await handleTotpSetup(req(), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { secret: string; uri: string } };
    expect(json.data.secret).toBe("GENERATEDSECRET");
    expect(json.data.uri).toContain("otpauth://");
    expect(buildOtpauthUri).toHaveBeenCalledWith("GENERATEDSECRET", "test@example.com");
  });
});
