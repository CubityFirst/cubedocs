import { toArrayBuffer } from "./crypto";
import type { Session } from "./lib";

const ALG = { name: "HMAC", hash: "SHA-256" };

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", toArrayBuffer(enc.encode(secret)), ALG, false, ["sign", "verify"]);
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlDecode(str: string): string {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

function encodeJSON(obj: unknown): string {
  return b64url(toArrayBuffer(new TextEncoder().encode(JSON.stringify(obj))));
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

  // Pin the algorithm explicitly. Without this, a future verifier that
  // accepts multiple algs is one bug away from `alg: none` / RS→HS confusion.
  let header: { alg?: unknown; typ?: unknown };
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
  } catch {
    return null;
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") return null;

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    ALG,
    key,
    toArrayBuffer(Uint8Array.from(b64urlDecode(parts[2]), c => c.charCodeAt(0))),
    toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!valid) return null;

  let payload: Session;
  try {
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  if (payload.expiresAt < Date.now()) return null;

  return payload;
}
