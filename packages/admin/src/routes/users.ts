import { Hono } from "hono";
import { zipSync, strToU8 } from "fflate";
import type { Env } from "../index";

const usersRouter = new Hono<{ Bindings: Env }>();

type ModerationAction = "disabled" | "suspended" | "re_enabled";

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
  moderation: number;
  force_password_change: number;
  latest_moderation_action: ModerationAction | null;
  latest_moderation_reason: string | null;
  latest_moderation_created_at: string | null;
}

interface ModerationEventRow {
  id: string;
  user_id: string;
  action: ModerationAction;
  moderation_value: number;
  reason: string | null;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
}

function getModerationAction(moderation: number): ModerationAction {
  if (moderation === 0) return "re_enabled";
  if (moderation === -1) return "disabled";
  return "suspended";
}

function getCurrentStatus(moderation: number): "active" | "disabled" | "suspended" {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (moderation === -1) return "disabled";
  if (moderation > 0 && nowSeconds < moderation) return "suspended";
  return "active";
}

function latestModerationFields(tableAlias = "u"): string {
  return `
    (SELECT action FROM user_moderation_events e WHERE e.user_id = ${tableAlias}.id ORDER BY e.created_at DESC, rowid DESC LIMIT 1) AS latest_moderation_action,
    (SELECT reason FROM user_moderation_events e WHERE e.user_id = ${tableAlias}.id ORDER BY e.created_at DESC, rowid DESC LIMIT 1) AS latest_moderation_reason,
    (SELECT created_at FROM user_moderation_events e WHERE e.user_id = ${tableAlias}.id ORDER BY e.created_at DESC, rowid DESC LIMIT 1) AS latest_moderation_created_at
  `;
}

// GET /api/users/search?q=
usersRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const rows = await c.env.AUTH_DB.prepare(
    `
      SELECT
        u.id,
        u.email,
        u.name,
        u.created_at,
        u.moderation,
        u.force_password_change,
        ${latestModerationFields("u")}
      FROM users u
      WHERE u.email LIKE ? OR u.id = ?
      LIMIT 25
    `,
  )
    .bind(`%${q}%`, q)
    .all<UserRow>();
  return c.json({ ok: true, data: rows.results });
});

// PATCH /api/users/:id - { moderation: 0 | -1 | unix timestamp, reason?: string }
usersRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ moderation: number; reason?: string }>();
  const moderation = body.moderation;
  const reason = body.reason?.trim() ?? "";
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(moderation) || (moderation !== 0 && moderation !== -1 && moderation <= 0)) {
    return c.json({ ok: false, error: "Invalid moderation value" }, 400);
  }

  if (moderation > 0 && moderation <= nowSeconds) {
    return c.json({ ok: false, error: "Suspension time must be in the future" }, 400);
  }

  if (moderation !== 0 && !reason) {
    return c.json({ ok: false, error: "Moderation reason is required" }, 400);
  }

  const action = getModerationAction(moderation);
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("UPDATE users SET moderation = ? WHERE id = ?").bind(moderation, id),
    c.env.AUTH_DB.prepare(
      `
        INSERT INTO user_moderation_events (
          id,
          user_id,
          action,
          moderation_value,
          reason,
          actor_user_id,
          actor_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(crypto.randomUUID(), id, action, moderation, reason || null, null, null),
  ]);

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

// GET /api/users/:id/export - GDPR-style data export as .zip
usersRouter.get("/:id/export", async (c) => {
  const id = c.req.param("id");

  const profile = await c.env.AUTH_DB.prepare(
    `
      SELECT
        u.id,
        u.email,
        u.name,
        u.created_at,
        u.moderation,
        u.force_password_change,
        ${latestModerationFields("u")}
      FROM users u
      WHERE u.id = ?
    `,
  ).bind(id).first<UserRow>();

  if (!profile) return c.json({ ok: false, error: "User not found" }, 404);

  const totpRow = await c.env.AUTH_DB.prepare(
    "SELECT totp_secret IS NOT NULL AS has_totp FROM users WHERE id = ?",
  ).bind(id).first<{ has_totp: number }>();

  const webauthn = await c.env.AUTH_DB.prepare(
    "SELECT id, name, created_at FROM webauthn_credentials WHERE user_id = ?",
  ).bind(id).all<{ id: string; name: string; created_at: string }>();

  const moderationHistory = await c.env.AUTH_DB.prepare(
    `
      SELECT id, user_id, action, moderation_value, reason, created_at, actor_user_id, actor_email
      FROM user_moderation_events
      WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
    `,
  ).bind(id).all<ModerationEventRow>();

  const ownedProjects = await c.env.DB.prepare(
    "SELECT id, name, created_at FROM projects WHERE owner_id = ?",
  ).bind(id).all<{ id: string; name: string; created_at: string }>();

  const memberships = await c.env.DB.prepare(
    "SELECT p.id, p.name, pm.role, pm.created_at FROM project_members pm JOIN projects p ON pm.project_id = p.id WHERE pm.user_id = ?",
  ).bind(id).all<{ id: string; name: string; role: string; created_at: string }>();

  const currentStatus = getCurrentStatus(profile.moderation);
  const currentReason = currentStatus === "active" ? null : profile.latest_moderation_reason;

  const profileData = {
    id: profile.id,
    email: profile.email,
    display_name: profile.name,
    account_created_at: profile.created_at,
    account_status: currentStatus,
    ...(currentStatus === "suspended" ? { account_suspended_until: profile.moderation } : {}),
  };

  const moderationData = {
    current_status: currentStatus,
    current_moderation_value: profile.moderation,
    current_reason: currentReason,
    history: moderationHistory.results.map(event => ({
      action: event.action,
      moderation_value: event.moderation_value,
      reason: event.reason,
      created_at: event.created_at,
      actor_user_id: event.actor_user_id,
      actor_email: event.actor_email,
    })),
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
    "moderation.json": strToU8(JSON.stringify(moderationData, null, 2)),
    "security.json": strToU8(JSON.stringify(securityData, null, 2)),
    "projects.json": strToU8(JSON.stringify(projectsData, null, 2)),
  });
  const zipBuffer = Uint8Array.from(zip).buffer;

  const safeEmail = profile.email.replace(/[^a-z0-9]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="userdata_${safeEmail}_${date}.zip"`,
    },
  });
});

export { usersRouter };
