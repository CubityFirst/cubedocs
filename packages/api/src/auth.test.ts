import { describe, it, expect, vi } from "vitest";
import { authenticate } from "./auth";
import type { Session } from "./lib";
import type { Env } from "./index";

function makeEnv(authResponse?: { ok: boolean; data?: Session }): Env {
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(authResponse ?? { ok: false }), {
      status: authResponse?.ok ? 200 : 401,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return {
    DB: {} as unknown as D1Database,
    ASSETS: {} as unknown as R2Bucket,
    AUTH: { fetch: fetchFn } as unknown as Fetcher,
    JWT_SECRET: "test-secret",
  };
}

describe("authenticate", () => {
  it("returns null if Authorization header is absent", async () => {
    const req = new Request("https://api/projects");
    expect(await authenticate(req, makeEnv())).toBeNull();
  });

  it("returns null if Authorization header does not start with 'Bearer '", async () => {
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Basic sometoken" },
    });
    expect(await authenticate(req, makeEnv())).toBeNull();
  });

  it("does not call the auth worker if the header is missing", async () => {
    const env = makeEnv();
    const req = new Request("https://api/projects");
    await authenticate(req, env);
    expect((env.AUTH as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch).not.toHaveBeenCalled();
  });

  it("returns null if the auth worker returns a non-ok response", async () => {
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Bearer invalidtoken" },
    });
    expect(await authenticate(req, makeEnv({ ok: false }))).toBeNull();
  });

  it("returns the session if the auth worker returns an ok response", async () => {
    const session: Session = { userId: "u1", email: "a@example.com", expiresAt: Date.now() + 60_000 };
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Bearer validtoken" },
    });
    const result = await authenticate(req, makeEnv({ ok: true, data: session }));
    expect(result).toEqual(session);
  });

  it("forwards the Authorization header to the auth worker", async () => {
    const env = makeEnv({ ok: false });
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Bearer mytoken" },
    });
    await authenticate(req, env);
    const fetchFn = (env.AUTH as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn).toHaveBeenCalledWith(
      "https://auth/verify",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mytoken" }) }),
    );
  });
});
