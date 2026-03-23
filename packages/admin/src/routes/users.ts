import { Hono } from "hono";
import { zipSync, strToU8 } from "fflate";
import type { Env } from "../index";

const usersRouter = new Hono<{ Bindings: Env }>();

// GET /api/users/search?q=
usersRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const rows = await c.env.AUTH_DB.prepare(
    "SELECT id, email, name, created_at, moderation, force_password_change FROM users WHERE email LIKE ? OR id = ? LIMIT 25",
  )
    .bind(`%${q}%`, q)
    .all<{ id: string; email: string; name: string; created_at: string; moderation: number; force_password_change: number }>();
  return c.json({ ok: true, data: rows.results });
});

// PATCH /api/users/:id — { moderation: 0 | -1 }
usersRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ moderation: number }>();
  if (body.moderation !== 0 && body.moderation !== -1) {
    return c.json({ ok: false, error: "Invalid moderation value" }, 400);
  }
  await c.env.AUTH_DB.prepare("UPDATE users SET moderation = ? WHERE id = ?")
    .bind(body.moderation, id)
    .run();
  return c.json({ ok: true });
});

// POST /api/users/:id/force-password-change
usersRouter.post("/:id/force-password-change", async (c) => {
  const id = c.req.param("id");
  await c.env.AUTH_DB.prepare("UPDATE users SET force_password_change = 1 WHERE id = ?")
    .bind(id)
    .run();
  return c.json({ ok: true });
});

// GET /api/users/:id/export — GDPR-style data export as .zip
usersRouter.get("/:id/export", async (c) => {
  const id = c.req.param("id");

  // Auth DB: profile
  const profile = await c.env.AUTH_DB.prepare(
    "SELECT id, email, name, created_at, moderation, force_password_change FROM users WHERE id = ?",
  ).bind(id).first<{ id: string; email: string; name: string; created_at: string; moderation: number; force_password_change: number }>();

  if (!profile) return c.json({ ok: false, error: "User not found" }, 404);

  // Auth DB: has TOTP enabled
  const totpRow = await c.env.AUTH_DB.prepare(
    "SELECT totp_secret IS NOT NULL AS has_totp FROM users WHERE id = ?",
  ).bind(id).first<{ has_totp: number }>();

  // Auth DB: WebAuthn credentials (name + registered date only, no keys)
  const webauthn = await c.env.AUTH_DB.prepare(
    "SELECT id, name, created_at FROM webauthn_credentials WHERE user_id = ?",
  ).bind(id).all<{ id: string; name: string; created_at: string }>();

  // Main DB: owned projects
  const ownedProjects = await c.env.DB.prepare(
    "SELECT id, name, created_at FROM projects WHERE owner_id = ?",
  ).bind(id).all<{ id: string; name: string; created_at: string }>();

  // Main DB: project memberships (where they were invited as a member)
  const memberships = await c.env.DB.prepare(
    "SELECT p.id, p.name, pm.role, pm.created_at FROM project_members pm JOIN projects p ON pm.project_id = p.id WHERE pm.user_id = ?",
  ).bind(id).all<{ id: string; name: string; role: string; created_at: string }>();

  const profileData = {
    id: profile.id,
    email: profile.email,
    display_name: profile.name,
    account_created_at: profile.created_at,
    account_status: profile.moderation === -1 ? "disabled" : "active",
  };

  const securityData = {
    totp_enabled: Boolean(totpRow?.has_totp),
    passkeys: webauthn.results.map(k => ({ id: k.id, name: k.name, registered_at: k.created_at })),
  };

  const projectsData = {
    owned_projects: ownedProjects.results.map(p => ({ id: p.id, name: p.name, created_at: p.created_at })),
    project_memberships: memberships.results.map(m => ({ project_id: m.id, project_name: m.name, role: m.role, joined_at: m.created_at })),
  };

  const zip = zipSync({
    "profile.json": strToU8(JSON.stringify(profileData, null, 2)),
    "security.json": strToU8(JSON.stringify(securityData, null, 2)),
    "projects.json": strToU8(JSON.stringify(projectsData, null, 2)),
  });

  const safeEmail = profile.email.replace(/[^a-z0-9]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="userdata_${safeEmail}_${date}.zip"`,
    },
  });
});

export { usersRouter };
