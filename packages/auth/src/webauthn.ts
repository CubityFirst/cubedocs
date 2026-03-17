import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { errorResponse, Errors } from "./lib";
import type { Env } from "./index";

export function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createRegistrationOptions(
  env: Env,
  userId: string,
  userName: string,
  userEmail: string,
) {
  const existing = await env.DB.prepare(
    "SELECT id FROM webauthn_credentials WHERE user_id = ?",
  ).bind(userId).all<{ id: string }>();

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: userId,
    userName: userEmail,
    userDisplayName: userName,
    excludeCredentials: existing.results.map((c) => ({
      id: base64urlToUint8Array(c.id),
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, user_id, challenge, type, created_at) VALUES (?, ?, ?, 'registration', ?)",
  ).bind(challengeId, userId, options.challenge, Date.now()).run();

  return { options, challengeId };
}

export async function createAuthenticationOptions(env: Env, userId: string) {
  const credentials = await env.DB.prepare(
    "SELECT id FROM webauthn_credentials WHERE user_id = ?",
  ).bind(userId).all<{ id: string }>();

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    allowCredentials: credentials.results.map((c) => ({
      id: base64urlToUint8Array(c.id),
      type: "public-key" as const,
    })),
    userVerification: "preferred",
  });

  const challengeId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, user_id, challenge, type, created_at) VALUES (?, ?, ?, 'authentication', ?)",
  ).bind(challengeId, userId, options.challenge, Date.now()).run();

  return { options, challengeId };
}

export async function consumeChallenge(
  env: Env,
  challengeId: string,
  userId: string,
  type: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT challenge, created_at FROM webauthn_challenges WHERE id = ? AND user_id = ? AND type = ?",
  ).bind(challengeId, userId, type).first<{ challenge: string; created_at: number }>();

  if (!row) return null;
  await env.DB.prepare("DELETE FROM webauthn_challenges WHERE id = ?").bind(challengeId).run();
  if (Date.now() - row.created_at > 5 * 60 * 1000) return null;

  return row.challenge;
}

/**
 * Verifies a WebAuthn authentication assertion end-to-end:
 * consumes the challenge, looks up the stored credential, verifies the
 * response, and updates the counter.
 *
 * Returns null on success, or an error Response on failure.
 */
export async function verifyWebauthnAssertion(
  env: Env,
  userId: string,
  challengeId: string,
  response: Record<string, unknown>,
  logPrefix = "webauthn",
): Promise<Response | null> {
  const challenge = await consumeChallenge(env, challengeId, userId, "authentication");
  if (!challenge) return errorResponse(Errors.BAD_REQUEST);

  const responseId = (response as { id: string }).id;
  const storedCred = await env.DB.prepare(
    "SELECT id, public_key, counter FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  ).bind(responseId, userId).first<{ id: string; public_key: string; counter: number }>();
  if (!storedCred) return errorResponse(Errors.UNAUTHORIZED);

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: response as any,
      expectedChallenge: challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      authenticator: {
        credentialID: base64urlToUint8Array(storedCred.id),
        credentialPublicKey: base64urlToUint8Array(storedCred.public_key),
        counter: storedCred.counter,
      },
    });
  } catch (err) {
    console.error(`[${logPrefix}] verifyAuthenticationResponse threw:`, err);
    return errorResponse(Errors.UNAUTHORIZED);
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  await env.DB.prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?")
    .bind(verification.authenticationInfo.newCounter, storedCred.id)
    .run();

  return null;
}

export { verifyRegistrationResponse, verifyAuthenticationResponse };
