export interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  moderation: number;
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

export async function updateUserModeration(id: string, moderation: 0 | -1): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moderation }),
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
