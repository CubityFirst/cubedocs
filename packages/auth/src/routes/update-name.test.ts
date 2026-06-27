import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpdateName } from "./update-name";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000 };

function makeEnv(changes = 1) {
  const run = vi.fn().mockResolvedValue({ meta: { changes } });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: { DB: { prepare } } as unknown as Parameters<typeof handleUpdateName>[1],
    prepare,
    bind,
    run,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/update-name", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
});

describe("handleUpdateName", () => {
  it("rejects an empty name before touching auth/DB", async () => {
    const { env, prepare } = makeEnv();
    const res = await handleUpdateName(req({ name: "   " }), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects a missing name", async () => {
    const { env, prepare } = makeEnv();
    const res = await handleUpdateName(req({}), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const { env, prepare } = makeEnv();
    const res = await handleUpdateName(req({ name: "New Name" }), env);
    expect(res.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 100 chars", async () => {
    const { env, prepare } = makeEnv();
    const res = await handleUpdateName(req({ name: "a".repeat(101) }), env);
    expect(res.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("writes a trimmed name and echoes it back", async () => {
    const { env, prepare, bind } = makeEnv();
    const res = await handleUpdateName(req({ name: "  Jane Doe  " }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { name: string } };
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe("Jane Doe");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE users SET name"));
    expect(bind).toHaveBeenCalledWith("Jane Doe", "user-1");
  });

  it("returns 404 when no row was updated (user gone)", async () => {
    const { env } = makeEnv(0);
    const res = await handleUpdateName(req({ name: "Jane" }), env);
    expect(res.status).toBe(404);
  });
});
