import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthDiscovery, handleOAuthJwks } from "./oauth-discovery";

vi.mock("../oidc", () => ({
  buildDiscoveryDocument: vi.fn(() => ({ issuer: "https://auth.example.com", authorization_endpoint: "https://app.example.com/oauth/authorize" })),
  derivePublicJwk: vi.fn(() => ({ kty: "RSA", n: "abc", e: "AQAB", kid: "k1" })),
  parsePrivateJwk: vi.fn(() => ({ kty: "RSA", d: "secret" })),
}));

import { buildDiscoveryDocument, parsePrivateJwk, derivePublicJwk } from "../oidc";

const env = {
  OIDC_ISSUER: "https://auth.example.com",
  OIDC_AUTHORIZE_URL: "https://app.example.com/oauth/authorize",
  OIDC_PRIVATE_KEY: "{}",
} as unknown as Parameters<typeof handleOAuthDiscovery>[1];

beforeEach(() => vi.clearAllMocks());

describe("handleOAuthDiscovery", () => {
  it("serves the discovery doc with a cache header", async () => {
    const res = handleOAuthDiscovery(new Request("http://localhost/.well-known/openid-configuration"), env);
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const json = (await res.json()) as { issuer: string };
    expect(json.issuer).toBe("https://auth.example.com");
    expect(buildDiscoveryDocument).toHaveBeenCalledWith(env.OIDC_ISSUER, env.OIDC_AUTHORIZE_URL);
  });
});

describe("handleOAuthJwks", () => {
  it("publishes only the public JWK (private fields stripped)", async () => {
    const res = handleOAuthJwks(new Request("http://localhost/oauth/jwks"), env);
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const json = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(json.keys).toHaveLength(1);
    expect(json.keys[0]).not.toHaveProperty("d");
    expect(parsePrivateJwk).toHaveBeenCalledWith(env.OIDC_PRIVATE_KEY);
    expect(derivePublicJwk).toHaveBeenCalled();
  });
});
