import { toArrayBuffer } from "./crypto";

// PBKDF2-HMAC-SHA256 via WebCrypto. OWASP 2023+ minimum is 600k iterations,
// but Cloudflare Workers' WebCrypto refuses PBKDF2 calls above 100,000
// iterations ("NotSupportedError: iteration counts above 100000 are not
// supported"). Hashes written above the cap throw on verify and lock the
// user out, so we stay at 100k until either CF raises the cap or we move
// derivation to Node's crypto via the nodejs_compat path.
// Stored format is versioned so we can raise the cost ceiling later without
// invalidating existing hashes:
//   pbkdf2-1$<iter>$<saltHex>$<hashHex>
// Hashes written before this format ("<saltHex>:<hashHex>") are still
// verifiable at the legacy iteration count and rewritten on next login.
const ITERATIONS = 100_000;
const LEGACY_ITERATIONS = 100_000;
const HASH = "SHA-256";
const FORMAT_PREFIX = "pbkdf2-1$";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `${FORMAT_PREFIX}${ITERATIONS}$${buf2hex(salt)}$${buf2hex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith(FORMAT_PREFIX)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const iter = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iter) || iter < 1) return false;
    const salt = hex2buf(parts[2]);
    const hash = await derive(password, salt, iter);
    return constantTimeEqualHex(buf2hex(hash), parts[3]);
  }
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = hex2buf(saltHex);
  const hash = await derive(password, salt, LEGACY_ITERATIONS);
  return constantTimeEqualHex(buf2hex(hash), hashHex);
}

// True if the stored hash should be re-derived at the current iteration cost.
// Call after a successful verifyPassword to opportunistically migrate users.
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith(FORMAT_PREFIX)) return true;
  const parts = stored.split("$");
  if (parts.length !== 4) return true;
  const iter = Number.parseInt(parts[1], 10);
  return !Number.isFinite(iter) || iter < ITERATIONS;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey(
    "raw", toArrayBuffer(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveBits", "deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: HASH },
    base,
    { name: "HMAC", hash: HASH, length: 256 },
    true,
    ["sign"],
  );
  return crypto.subtle.exportKey("raw", key);
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buf2hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function hex2buf(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}
