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

export interface AdminProject {
  id: string;
  name: string;
  owner_id: string;
  features: number;
  created_at: string;
}

export async function searchUsers(q: string): Promise<AdminUser[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
  const json = (await res.json()) as { ok: boolean; data?: AdminUser[] };
  if (!json.ok || !json.data) throw new Error("Failed to search users");
  return json.data;
}

export async function forceUserPasswordChange(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}/force-password-change`, { method: "POST" });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to force password change");
}

export async function updateUserModeration(id: string, moderation: number, reason?: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moderation, reason }),
  });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to update user");
}

export async function listProjects(q: string): Promise<AdminProject[]> {
  const res = await fetch(`/api/projects?q=${encodeURIComponent(q)}`);
  const json = (await res.json()) as { ok: boolean; data?: AdminProject[] };
  if (!json.ok || !json.data) throw new Error("Failed to list projects");
  return json.data;
}

export async function updateProjectFeatures(id: string, features: number): Promise<void> {
  const res = await fetch(`/api/projects/${id}/features`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to update project features");
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error("Failed to delete project");
}

export async function exportUserData(id: string, email: string): Promise<void> {
  const res = await fetch(`/api/users/${id}/export`);
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
