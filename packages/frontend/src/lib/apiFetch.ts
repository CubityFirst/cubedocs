import { getToken, clearToken } from "./auth";

// Wraps fetch for API calls so account-level rejections from the auth worker
// (disabled / suspended) consistently log the user out and bounce them back
// to /login with a reason banner. Anything else falls through unchanged.
//
// Use this for any request that hits an authenticated endpoint. Anonymous
// endpoints can still call fetch directly.
export interface ApiFetchOptions extends RequestInit {
  // When true, do not auto-attach the Authorization header. Defaults to false.
  skipAuth?: boolean;
}

export async function apiFetch(input: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuth, headers: extraHeaders, ...rest } = options;

  const headers = new Headers(extraHeaders);
  if (!skipAuth) {
    const token = getToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(input, { ...rest, headers });

  if (response.status === 403) {
    // Peek at the body without consuming it for the caller. clone() is cheap
    // because we only read at most a few bytes of JSON before deciding.
    const reason = await peekAccountRejectReason(response);
    if (reason) {
      clearToken();
      const target = `/login?reason=${reason}`;
      // Replace so the back button doesn't bounce them back into a doomed page.
      window.location.replace(target);
      // Return a dummy response so callers that await this don't crash on the
      // navigation; the page is about to unload anyway.
      return new Response(null, { status: 403 });
    }
  }

  return response;
}

async function peekAccountRejectReason(response: Response): Promise<string | null> {
  try {
    const cloned = response.clone();
    const data = await cloned.json() as { error?: string };
    if (data.error === "account_disabled") return "disabled";
    if (data.error === "account_suspended") return "suspended";
  } catch {
    // not JSON, or unexpected shape — treat as a generic 403, not an account reject
  }
  return null;
}
