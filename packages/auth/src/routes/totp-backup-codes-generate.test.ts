import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTotpBackupCodesGenerate } from "./totp-backup-codes-generate";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));
vi.mock("../mfa", () => ({
  requireMFA: vi.fn(),
  hashCode: vi.fn(async (c: string) => `hash:${c}`),
}));

import { requireAuthenticatedSession } from "../auth-session";
import { requireMFA, hashCode } from "../mfa";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(row: { totp_secret: string | null } | null) {
  const run = vi.fn().mockResolvedValue({});
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ run, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare } } as unknown as Parameters<typeof handleTotpBackupCodesGenerate>[1], prepare, bind, run };
}

function req(body: unknown) {
  return new Request("http://localhost/totp/backup-codes/generate", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
  vi.mocked(requireMFA).mockResolvedValue(null as never);
  vi.mocked(hashCode).mockImplementation(async (c: string) => `hash:${c}`);
});

describe("handleTotpBackupCodesGenerate", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env } = makeEnv({ totp_secret: "S" });
    const res = await handleTotpBackupCodesGenerate(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(401);
  });

  it("rejects when TOTP isn't enabled", async () => {
    const { env, run } = makeEnv({ totp_secret: null });
    const res = await handleTotpBackupCodesGenerate(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("totp_not_enabled");
    expect(run).not.toHaveBeenCalled();
  });

  it("propagates an MFA failure without regenerating", async () => {
    vi.mocked(requireMFA).mockResolvedValue(
      Response.json({ ok: false, error: "mfa_required" }, { status: 401 }) as never,
    );
    const { env, run } = makeEnv({ totp_secret: "S" });
    const res = await handleTotpBackupCodesGenerate(req({}), env);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 8 fresh codes and hashes each before storing", async () => {
    const { env, run } = makeEnv({ totp_secret: "S" });
    const res = await handleTotpBackupCodesGenerate(req({ totpCode: "123456" }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { codes: string[] } };
    expect(json.data.codes).toHaveLength(8);
    // each plaintext code looks like XXXXX-XXXXX
    for (const c of json.data.codes) expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    // plaintext is hashed, never stored raw
    expect(hashCode).toHaveBeenCalledTimes(8);
    // 1 DELETE + 8 INSERTs
    expect(run).toHaveBeenCalledTimes(9);
  });
});
