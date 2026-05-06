import type { Session } from "./lib";

const ALG = { name: "HMAC", hash: "SHA-256" };

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  if (buffer instanceof ArrayBuffer) return buffer.slice(byteOffset, byteOffset + byteLength);
  const copy = new Uint8Array(byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

export async function verifyJwt(token: string, secret: string): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    toBuffer(new TextEncoder().encode(secret)),
    ALG,
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    ALG,
    key,
    toBuffer(b64decode(parts[2])),
    toBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!valid) return null;

  const payload: Session = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.expiresAt < Date.now()) return null;

  return payload;
}
