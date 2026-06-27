import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthUserinfo } from "./oauth-userinfo";

vi.mock("../oidc", () => ({
  parsePrivateJwk: vi.fn(() => ({ kty: "RSA" })),
  verifyRs256: vi.fn(),
  scopedClaims: vi.fn(() => ({ sub: "user-1", email: "u@example.com" })),
}));
vi.mock("./login", () => ({ checkModeration: vi.fn(() => false) }));

import { verifyRs256, scopedClaims } from "../oidc";
import { checkModeration } from "./login";

const validPayload = { token_use: "access", iss: "https://auth.example.com", sub: "user-1", aud: "client-1", scope: "openid profile" };
const userRow = { id: "user-1", email: "u@example.com", name: "U", email_verified: 1, is_admin: 0, moderation: 0, force_password_change: 0 };

function makeEnv(opts: { client?: { disabled: number } | null; user?: typeof userRow | null }) {
  const first = vi.fn()
    .mockResolvedValueOnce(opts.client === undefined ? { disabled: 0 } : opts.client)
    .mockResolvedValueOnce(opts.user === undefined ? userRow : opts.user);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: {
      DB: { prepare },
      OIDC_PRIVATE_KEY: "{}",
      OIDC_ISSUER: "https://auth.example.com",
      APP_ORIGIN: "https://app.example.com",
    } as unknown as Parameters<typeof handleOAuthUserinfo>[1],
  };
}

function req(bearer?: string) {
  return new Request("http://localhost/oauth/userinfo", {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyRs256).mockResolvedValue(validPayload as never);
  vi.mocked(checkModeration).mockReturnValue(false);
});

describe("handleOAuthUserinfo", () => {
  it("401s without a bearer token", async () => {
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req(), env);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("401s on an invalid/expired token", async () => {
    vi.mocked(verifyRs256).mockResolvedValue(null as never);
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req("bad"), env);
    expect(res.status).toBe(401);
  });

  it("401s when the token isn't an access token", async () => {
    vi.mocked(verifyRs256).mockResolvedValue({ ...validPayload, token_use: "id" } as never);
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(401);
  });

  it("401s on an issuer mismatch", async () => {
    vi.mocked(verifyRs256).mockResolvedValue({ ...validPayload, iss: "https://evil" } as never);
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(401);
  });

  it("401s when the client has been disabled since issuance", async () => {
    const { env } = makeEnv({ client: { disabled: 1 } });
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(401);
  });

  it("401s when the subject is suspended", async () => {
    vi.mocked(checkModeration).mockReturnValue(true);
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(401);
  });

  it("returns scoped claims live from the DB on success", async () => {
    const { env } = makeEnv({});
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = (await res.json()) as { sub: string; email: string };
    expect(json.sub).toBe("user-1");
    expect(json.email).toBe("u@example.com");

    // scopedClaims must be fed the oidcUser derived from the live DB row (not a
    // constant) and the Set parsed from the token's scope. userRow.email_verified
    // is 1 -> emailVerified true; picture is built from APP_ORIGIN + user.id.
    expect(vi.mocked(scopedClaims)).toHaveBeenCalledWith(
      {
        id: "user-1",
        email: "u@example.com",
        emailVerified: true,
        name: "U",
        isAdmin: false,
        picture: "https://app.example.com/api/avatar/user-1",
      },
      new Set(["openid", "profile"]),
    );
  });

  it("derives the oidcUser from a distinct DB row (not a constant)", async () => {
    const otherRow = {
      id: "user-2", email: "other@example.com", name: "Other",
      email_verified: 0, is_admin: 1, moderation: 0, force_password_change: 0,
    };
    // Token sub/aud still match user-1/client-1 (verifyRs256 mock), but the DB
    // returns a different row; scopedClaims must receive THAT row's values.
    const { env } = makeEnv({ user: otherRow });
    const res = await handleOAuthUserinfo(req("t"), env);
    expect(res.status).toBe(200);
    expect(vi.mocked(scopedClaims)).toHaveBeenCalledWith(
      {
        id: "user-2",
        email: "other@example.com",
        emailVerified: false,
        name: "Other",
        isAdmin: true,
        picture: "https://app.example.com/api/avatar/user-2",
      },
      new Set(["openid", "profile"]),
    );
  });
});
