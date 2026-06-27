import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebauthnCredentialsList } from "./webauthn-credentials-list";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(rows: Array<{ id: string; name: string; created_at: string }>) {
  const all = vi.fn().mockResolvedValue({ results: rows });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { env: { DB: { prepare } } as unknown as Parameters<typeof handleWebauthnCredentialsList>[1], prepare, bind };
}

function req() {
  return new Request("http://localhost/webauthn/credentials", { headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
});

describe("handleWebauthnCredentialsList", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env } = makeEnv([]);
    const res = await handleWebauthnCredentialsList(req(), env);
    expect(res.status).toBe(401);
  });

  it("lists the caller's credentials", async () => {
    const rows = [{ id: "c1", name: "Yubikey", created_at: "2026-01-01" }];
    const { env, bind } = makeEnv(rows);
    const res = await handleWebauthnCredentialsList(req(), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { credentials: typeof rows } };
    expect(json.data.credentials).toEqual(rows);
    expect(bind).toHaveBeenCalledWith("user-1");
  });
});
