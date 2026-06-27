import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleVerifyEmail } from "./verify-email";

vi.mock("../verification", () => ({
  consumeVerificationToken: vi.fn(),
}));
vi.mock("../sessions", () => ({
  createSession: vi.fn(),
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));
vi.mock("../jwt", () => ({
  signJwt: vi.fn(),
}));

import { consumeVerificationToken } from "../verification";
import { createSession } from "../sessions";
import { signJwt } from "../jwt";

const userRow = { id: "user-1", email: "test@example.com", name: "Test", created_at: "2026-01-01T00:00:00Z" };

// .run() for the UPDATE, then .first() for the SELECT, both off the same chain.
function makeEnv(row: typeof userRow | null) {
  const run = vi.fn().mockResolvedValue({});
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ run, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare }, JWT_SECRET: "secret" } as unknown as Parameters<typeof handleVerifyEmail>[1], prepare, bind, run, first };
}

function req(body: unknown) {
  return new Request("http://localhost/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeVerificationToken).mockResolvedValue("user-1");
  vi.mocked(createSession).mockResolvedValue("sess-new");
  vi.mocked(signJwt).mockResolvedValue("signed.jwt.token");
});

describe("handleVerifyEmail", () => {
  it("rejects a missing token", async () => {
    const { env, prepare } = makeEnv(userRow);
    const res = await handleVerifyEmail(req({}), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid/expired token", async () => {
    vi.mocked(consumeVerificationToken).mockResolvedValue(null);
    const { env } = makeEnv(userRow);
    const res = await handleVerifyEmail(req({ token: "bad" }), env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.error).toBe("invalid_or_expired_token");
  });

  it("returns 404 when the user vanished after token consumption", async () => {
    const { env } = makeEnv(null);
    const res = await handleVerifyEmail(req({ token: "good" }), env);
    expect(res.status).toBe(404);
  });

  it("marks the email verified, mints a session, and returns the token + user", async () => {
    const { env, run } = makeEnv(userRow);
    const res = await handleVerifyEmail(req({ token: "good" }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { verified: boolean; token: string; user: { id: string } } };
    expect(json.data.verified).toBe(true);
    expect(json.data.token).toBe("signed.jwt.token");
    expect(json.data.user.id).toBe("user-1");
    // UPDATE users SET email_verified = 1 ... was issued
    expect(run).toHaveBeenCalled();
    expect(createSession).toHaveBeenCalled();
    expect(signJwt).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", sid: "sess-new", isAdmin: false }),
      "secret",
    );
  });
});
