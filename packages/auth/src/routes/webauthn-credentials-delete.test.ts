import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebauthnCredentialsDelete } from "./webauthn-credentials-delete";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));
vi.mock("../mfa", () => ({
  requireMFA: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";
import { requireMFA } from "../mfa";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(changes = 1) {
  const run = vi.fn().mockResolvedValue({ meta: { changes } });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare } } as unknown as Parameters<typeof handleWebauthnCredentialsDelete>[1], prepare, bind, run };
}

function req(body: unknown) {
  return new Request("http://localhost/webauthn/credentials/delete", {
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

describe("handleWebauthnCredentialsDelete", () => {
  it("rejects a missing credentialId before touching auth", async () => {
    const { env } = makeEnv();
    const res = await handleWebauthnCredentialsDelete(req({}), env);
    expect(res.status).toBe(400);
    expect(requireAuthenticatedSession).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env } = makeEnv();
    const res = await handleWebauthnCredentialsDelete(req({ credentialId: "c1" }), env);
    expect(res.status).toBe(401);
  });

  it("requires MFA before deleting", async () => {
    vi.mocked(requireMFA).mockResolvedValue(
      Response.json({ ok: false, error: "mfa_required" }, { status: 401 }) as never,
    );
    const { env, run } = makeEnv();
    const res = await handleWebauthnCredentialsDelete(req({ credentialId: "c1" }), env);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes the credential scoped to the caller", async () => {
    const { env, bind } = makeEnv();
    const res = await handleWebauthnCredentialsDelete(req({ credentialId: "c1", totpCode: "123456" }), env);
    expect(res.status).toBe(200);
    expect(bind).toHaveBeenCalledWith("c1", "user-1");
  });

  it("returns 404 when the credential isn't the caller's", async () => {
    const { env } = makeEnv(0);
    const res = await handleWebauthnCredentialsDelete(req({ credentialId: "foreign", totpCode: "123456" }), env);
    expect(res.status).toBe(404);
  });
});
