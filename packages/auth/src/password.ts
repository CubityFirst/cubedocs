import { toArrayBuffer } from "./crypto";

// Uses PBKDF2 via WebCrypto - available in all Workers runtimes.

const ITERATIONS = 100_000;
const HASH = "SHA-256";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey("raw", key);
  return `${buf2hex(salt)}:${buf2hex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = hex2buf(saltHex);
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey("raw", key);
  return buf2hex(hash) === hashHex;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw", toArrayBuffer(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveBits", "deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: ITERATIONS, hash: HASH },
    base,
    { name: "HMAC", hash: HASH, length: 256 },
    true,
    ["sign"],
  );
}

function buf2hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function hex2buf(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}
