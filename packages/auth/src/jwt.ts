import type { Session } from "@cubedocs/shared";

const ALG = { name: "HMAC", hash: "SHA-256" };

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), ALG, false, ["sign", "verify"]);
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function encodeJSON(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

export async function signJwt(payload: Session, secret: string): Promise<string> {
  const header = encodeJSON({ alg: "HS256", typ: "JWT" });
  const body = encodeJSON(payload);
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    ALG,
    key,
    Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;

  const payload: Session = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.expiresAt < Date.now()) return null;

  return payload;
}
