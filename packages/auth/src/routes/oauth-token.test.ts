import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthToken } from "./oauth-token";

vi.mock("../oidc", () => ({
  OIDC_TOKEN_TTL_SEC: 3600,
  parsePrivateJwk: vi.fn(() => ({ kty: "RSA" })),
  signRs256: vi.fn(async (claims: { token_use?: string }) => (claims.token_use === "access" ? "access.jwt" : "id.jwt")),
  verifyClientSecret: vi.fn(async () => true),
  verifyPkceS256: vi.fn(async () => true),
  buildIdTokenClaims: vi.fn(() => ({ token_use: "id" })),
  buildAccessTokenClaims: vi.fn(() => ({ token_use: "access" })),
}));
vi.mock("./login", () => ({ checkModeration: vi.fn(() => false) }));

import { verifyClientSecret, verifyPkceS256 } from "../oidc";
import { checkModeration } from "./login";

const publicClient = { client_id: "client-1", client_secret_hash: null, disabled: 0 };
const confidentialClient = { client_id: "client-1", client_secret_hash: "hash", disabled: 0 };
const codeRow = {
  code: "code-1", client_id: "client-1", user_id: "user-1",
  redirect_uri: "https://app/cb", scope: "openid profile", code_challenge: "chal", nonce: null,
};
const userRow = {
  id: "user-1", email: "u@example.com", name: "U",
  email_verified: 1, is_admin: 0, moderation: 0, force_password_change: 0,
};

// first() returns each queued value in order: client, codeRow, user.
function makeEnv(opts: {
  client?: typeof publicClient | typeof confidentialClient | null;
  code?: typeof codeRow | null;
  user?: typeof userRow | null;
  consumeChanges?: number;
}) {
  const first = vi.fn()
    .mockResolvedValueOnce(opts.client === undefined ? publicClient : opts.client)
    .mockResolvedValueOnce(opts.code === undefined ? codeRow : opts.code)
    .mockResolvedValueOnce(opts.user === undefined ? userRow : opts.user);
  const run = vi.fn().mockResolvedValue({ meta: { changes: opts.consumeChanges ?? 1 } });
  const bind = vi.fn().mockReturnValue({ first, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: {
      DB: { prepare },
      OIDC_PRIVATE_KEY: "{}",
      OIDC_ISSUER: "https://auth.example.com",
      APP_ORIGIN: "https://app.example.com",
    } as unknown as Parameters<typeof handleOAuthToken>[1],
    prepare,
    run,
  };
}

function req(params: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(params),
  });
}

const goodParams = {
  grant_type: "authorization_code", client_id: "client-1", code: "code-1",
  code_verifier: "verifier", redirect_uri: "https://app/cb",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyClientSecret).mockResolvedValue(true);
  vi.mocked(verifyPkceS256).mockResolvedValue(true);
  vi.mocked(checkModeration).mockReturnValue(false);
});

describe("handleOAuthToken", () => {
  it("rejects an unsupported grant_type", async () => {
    const { env } = makeEnv({});
    const res = await handleOAuthToken(req({ grant_type: "password" }), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("unsupported_grant_type");
  });

  it("rejects a missing client_id", async () => {
    const { env } = makeEnv({});
    const res = await handleOAuthToken(req({ grant_type: "authorization_code" }), env);
    expect(res.status).toBe(401);
    expect((await res.json() as { error: string }).error).toBe("invalid_client");
  });

  it("rejects an unknown/disabled client", async () => {
    const { env } = makeEnv({ client: null });
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(401);
    expect((await res.json() as { error: string }).error).toBe("invalid_client");
  });

  it("rejects a known but disabled client at the token endpoint", async () => {
    // A client row that exists but has disabled=1 must be refused - this pins
    // the `|| client.disabled` term in the guard (the null-client case above
    // alone wouldn't catch dropping it).
    const { env } = makeEnv({ client: { ...publicClient, disabled: 1 } });
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(401);
    expect((await res.json() as { error: string }).error).toBe("invalid_client");
  });

  it("rejects a confidential client with a bad secret", async () => {
    vi.mocked(verifyClientSecret).mockResolvedValue(false);
    const { env } = makeEnv({ client: confidentialClient });
    const res = await handleOAuthToken(req({ ...goodParams, client_secret: "wrong" }), env);
    expect(res.status).toBe(401);
    expect((await res.json() as { error: string }).error).toBe("invalid_client");
  });

  it("rejects a request missing code/verifier/redirect_uri", async () => {
    const { env } = makeEnv({ client: publicClient });
    const res = await handleOAuthToken(req({ grant_type: "authorization_code", client_id: "client-1" }), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_request");
  });

  it("rejects when the code row is missing/expired/consumed", async () => {
    const { env } = makeEnv({ code: null });
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_grant");
  });

  it("rejects a bad PKCE verifier before consuming the code", async () => {
    vi.mocked(verifyPkceS256).mockResolvedValue(false);
    const { env, run } = makeEnv({});
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_grant");
    // PKCE is verified BEFORE the single-use code is consumed: a bad verifier
    // must never burn a still-unredeemed code (the only run() is the consume).
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects when the atomic consume changes 0 rows (replay)", async () => {
    const { env } = makeEnv({ consumeChanges: 0 });
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_grant");
  });

  it("rejects when the subject is suspended at token time", async () => {
    vi.mocked(checkModeration).mockReturnValue(true);
    const { env } = makeEnv({});
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_grant");
  });

  it("mints id_token + access_token on success (no-store)", async () => {
    const { env } = makeEnv({});
    const res = await handleOAuthToken(req(goodParams), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = (await res.json()) as { access_token: string; id_token: string; token_type: string; scope: string };
    expect(json.access_token).toBe("access.jwt");
    expect(json.id_token).toBe("id.jwt");
    expect(json.token_type).toBe("Bearer");
    expect(json.scope).toBe("openid profile");
  });
});
