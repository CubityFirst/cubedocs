import { AwsClient } from "aws4fetch";

// R2 S3-API credentials for presigning. All optional: when any is missing
// (local dev, demo, or not yet set up) presigning is disabled and callers fall
// back to the in-Worker token streaming path. Mirrors the custom-domains
// "report not-configured instead of calling out" pattern.
export interface R2PresignEnv {
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
}

export function r2PresignConfigured(env: R2PresignEnv): boolean {
  return !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID && env.R2_BUCKET_NAME);
}

// Presign an S3-style GET URL for an R2 object so a browser media element can
// stream it (with Range/seek) directly from R2 — keeping the Worker out of the
// byte path entirely. The URL is a time-limited bearer capability (same model
// as the in-Worker content token). Returns null when unconfigured so callers
// fall back to the Worker streaming route.
export async function presignR2GetUrl(
  env: R2PresignEnv,
  key: string,
  expiresSeconds: number,
): Promise<string | null> {
  if (!r2PresignConfigured(env)) return null;
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  // Key segments (e.g. "files/<id>") stay as path separators; AwsClient handles
  // canonical-URI encoding. SigV4 caps presigned expiry at 7 days.
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`;
  const url = new URL(endpoint);
  url.searchParams.set("X-Amz-Expires", String(Math.min(expiresSeconds, 7 * 24 * 60 * 60)));
  const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
