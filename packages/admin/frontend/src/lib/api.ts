import { getToken, invalidateAdminSession } from "@/lib/auth";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  moderation: number;
  force_password_change: number;
  latest_moderation_action: "disabled" | "suspended" | "re_enabled" | null;
  latest_moderation_reason: string | null;
  latest_moderation_created_at: string | null;
}

export interface AdminUserDetails {
  profile: {
    id: string;
    email: string;
    display_name: string;
    account_created_at: string;
    account_status: "active" | "disabled" | "suspended";
    account_suspended_until?: number;
    force_password_change: boolean;
  };
  moderation: {
    current_status: "active" | "disabled" | "suspended";
    current_moderation_value: number;
    current_reason: string | null;
    history: Array<{
      action: "disabled" | "suspended" | "re_enabled";
      moderation_value: number;
      reason: string | null;
      created_at: string;
      actor_user_id: string | null;
      actor_email: string | null;
    }>;
  };
  security: {
    totp_enabled: boolean;
    passkeys: Array<{
      id: string;
      name: string;
      registered_at: string;
    }>;
    backup_codes: {
      total: number;
      active: number;
      used: number;
    };
  };
  projects: {
    owned_projects: Array<{
      id: string;
      name: string;
      created_at: string;
    }>;
    project_memberships: Array<{
      project_id: string;
      project_name: string;
      role: string;
      joined_at: string;
    }>;
  };
  billing: {
    resolved_plan: "free" | "ink";
    via: "free" | "paid" | "granted";
    status: string | null;
    started_at: number | null;
    cancel_at: number | null;
    granted: {
      plan: string;
      expires_at: number | null;
      reason: string | null;
    } | null;
    stripe: {
      customer_id: string | null;
      subscription_id: string | null;
    };
  };
}

export interface AdminProject {
  id: string;
  name: string;
  owner_id: string;
  features: number;
  created_at: string;
}

export interface AdminAuthSession {
  userId: string;
  email: string;
  expiresAt: number;
  isAdmin: true;
}

interface AdminHandoffExchange {
  token: string;
}

async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (token && (response.status === 401 || response.status === 403)) {
    invalidateAdminSession();
  }

  return response;
}

export async function searchUsers(q: string): Promise<AdminUser[]> {
  const res = await authFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
  const json = (await res.json()) as { ok: boolean; data?: AdminUser[] };
  if (!json.ok || !json.data) throw new Error("Failed to search users");
  return json.data;
}

export async function getUserDetails(id: string): Promise<AdminUserDetails> {
  const res = await authFetch(`/api/users/${id}`);
  const json = (await res.json()) as { ok: boolean; data?: AdminUserDetails };
  if (!json.ok || !json.data) throw new Error("Failed to load user details");
  return json.data;
}

export async function forceUserPasswordChange(id: string): Promise<void> {
  const res = await authFetch(`/api/users/${id}/force-password-change`, { method: "POST" });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to force password change");
}

export async function updateUserModeration(id: string, moderation: number, reason?: string): Promise<void> {
  const res = await authFetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moderation, reason }),
  });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to update user");
}

export async function listProjects(q: string): Promise<AdminProject[]> {
  const res = await authFetch(`/api/projects?q=${encodeURIComponent(q)}`);
  const json = (await res.json()) as { ok: boolean; data?: AdminProject[] };
  if (!json.ok || !json.data) throw new Error("Failed to list projects");
  return json.data;
}

export async function updateProjectFeatures(id: string, features: number): Promise<void> {
  const res = await authFetch(`/api/projects/${id}/features`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to update project features");
}

export async function deleteProject(id: string): Promise<void> {
  const res = await authFetch(`/api/projects/${id}`, { method: "DELETE" });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to delete project");
}

export async function reindexProjectFts(id: string): Promise<{ indexed: number }> {
  const res = await authFetch(`/api/projects/${id}/reindex`, { method: "POST" });
  const json = (await res.json()) as { ok: boolean; data?: { indexed: number } };
  if (!json.ok || !json.data) throw new Error("Failed to reindex project");
  return json.data;
}

export async function grantInk(id: string, opts: { reason?: string; expiresAt?: number | null } = {}): Promise<void> {
  const res = await authFetch(`/api/users/${id}/grant-ink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: opts.reason, expires_at: opts.expiresAt ?? null }),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Failed to grant Ink");
}

export async function revokeGrantedInk(id: string): Promise<void> {
  const res = await authFetch(`/api/users/${id}/grant-ink`, { method: "DELETE" });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Failed to revoke Ink grant");
}

export async function deleteUserAvatar(id: string): Promise<void> {
  const res = await authFetch(`/api/users/${id}/avatar`, { method: "DELETE" });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to delete avatar");
}

export async function exportUserData(id: string, email: string): Promise<void> {
  const res = await authFetch(`/api/users/${id}/export`);
  if (!res.ok) throw new Error("Failed to export user data");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `userdata_${email.replace(/[^a-z0-9]/gi, "_")}_${date}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function verifyAdminSession(): Promise<AdminAuthSession> {
  const res = await authFetch("/api/verify");
  const json = (await res.json()) as { ok: boolean; data?: AdminAuthSession };
  if (!json.ok || !json.data) throw new Error("Failed to verify admin session");
  return json.data;
}

export class AdminHandoffError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function exchangeAdminHandoff(code: string, callbackUrl: string): Promise<AdminHandoffExchange> {
  const res = await fetch("/api/auth/handoff/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, callbackUrl }),
  });
  const json = (await res.json()) as { ok: boolean; data?: AdminHandoffExchange; error?: string };
  if (!json.ok || !json.data) throw new AdminHandoffError(json.error ?? "unknown");
  return json.data;
}
