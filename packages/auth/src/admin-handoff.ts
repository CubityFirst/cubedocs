import type { Env } from "./index";

const LOCAL_ADMIN_ORIGINS = new Set([
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://localhost:5174",
  "https://127.0.0.1:5174",
]);

function normalizeNextPath(nextPath: string | null): string | null {
  if (nextPath === null) return null;
  return nextPath.startsWith("/") ? nextPath : null;
}

function isAllowedLocalAdminOrigin(origin: string): boolean {
  return LOCAL_ADMIN_ORIGINS.has(origin);
}

function buildApprovedCallbackUrl(origin: string, nextPath: string | null): string {
  const url = new URL("/auth/callback", origin);
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

export function normalizeAdminCallbackUrl(
  callbackUrl: string,
  env: Env,
): string | null {
  try {
    const url = new URL(callbackUrl);
    const nextPath = normalizeNextPath(url.searchParams.get("next"));
    if (url.searchParams.has("next") && nextPath === null) return null;
    if (url.pathname !== "/auth/callback") return null;

    const productionOrigin = env.ADMIN_APP_ORIGIN;
    if (url.origin === productionOrigin) {
      return buildApprovedCallbackUrl(productionOrigin, nextPath);
    }

    if (isAllowedLocalAdminOrigin(url.origin)) {
      return buildApprovedCallbackUrl(url.origin, nextPath);
    }

    return null;
  } catch {
    return null;
  }
}
