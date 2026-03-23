const DOCS_LOGIN_URL = import.meta.env.DEV
  ? "http://localhost:5173/login"
  : "https://docs.cubityfir.st/login";

export function normalizeAdminNextPath(nextPath: string | null | undefined): string {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/";
  }

  return nextPath;
}

export function buildAdminCallbackUrl(nextPath: string, origin = window.location.origin): string {
  const url = new URL("/auth/callback", origin);
  const normalizedNextPath = normalizeAdminNextPath(nextPath);

  if (normalizedNextPath !== "/") {
    url.searchParams.set("next", normalizedNextPath);
  }

  return url.toString();
}

export function buildDocsAdminLoginUrl(
  nextPath: string,
  options?: { logout?: boolean; origin?: string },
): string {
  const url = new URL(DOCS_LOGIN_URL);
  url.searchParams.set("returnTo", buildAdminCallbackUrl(nextPath, options?.origin));

  if (options?.logout) {
    url.searchParams.set("logout", "1");
  }

  return url.toString();
}
