import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSessionsList } from "./sessions-list";

vi.mock("../auth-session", () => ({
  requireAuthenticatedSession: vi.fn(),
}));
vi.mock("../sessions", () => ({
  listActiveSessions: vi.fn(),
}));

import { requireAuthenticatedSession } from "../auth-session";
import { listActiveSessions } from "../sessions";

const mockSession = { userId: "user-1", email: "test@example.com", expiresAt: Date.now() + 3600_000, sid: "sess-current" };

const env = { DB: {} } as unknown as Parameters<typeof handleSessionsList>[1];

function req() {
  return new Request("http://localhost/sessions/list", {
    headers: { Authorization: "Bearer t" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthenticatedSession).mockResolvedValue(mockSession);
});

describe("handleSessionsList", () => {
  it("returns 401 when the session is invalid", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const res = await handleSessionsList(req(), env);
    expect(res.status).toBe(401);
    expect(listActiveSessions).not.toHaveBeenCalled();
  });

  it("lists active sessions for the caller, passing the current sid", async () => {
    const sessions = [
      { id: "sess-current", current: true },
      { id: "sess-other", current: false },
    ];
    vi.mocked(listActiveSessions).mockResolvedValue(sessions as never);
    const res = await handleSessionsList(req(), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { sessions: unknown[] } };
    expect(json.ok).toBe(true);
    expect(json.data.sessions).toEqual(sessions);
    expect(listActiveSessions).toHaveBeenCalledWith(env, "user-1", "sess-current");
  });
});
