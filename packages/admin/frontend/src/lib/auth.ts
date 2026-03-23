const TOKEN_STORAGE_KEY = "admin_token";

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
