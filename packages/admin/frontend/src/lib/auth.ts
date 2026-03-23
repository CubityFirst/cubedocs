const TOKEN_STORAGE_KEY = "admin_token";
export const ADMIN_AUTH_INVALIDATED_EVENT = "admin-auth-invalidated";

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getStorage()?.getItem(TOKEN_STORAGE_KEY) ?? null;
}

export function setToken(token: string): void {
  getStorage()?.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  getStorage()?.removeItem(TOKEN_STORAGE_KEY);
}

export function invalidateAdminSession(): void {
  clearToken();
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_INVALIDATED_EVENT));
}
