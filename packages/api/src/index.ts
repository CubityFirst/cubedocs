import { errorResponse, Errors, ProjectFeatures, ROLE_RANK, Session } from "./lib";
import { authenticate } from "./auth";
import { handleProjects } from "./routes/projects";
import { handleDocs } from "./routes/docs";
import { handleFolders } from "./routes/folders";
import { handleMembers } from "./routes/members";
import { handlePublic } from "./routes/public";
import { handleFiles } from "./routes/files";
import { handleAi } from "./routes/ai";
import { handleInviteLinks, handleInvitePublic } from "./routes/inviteLinks";
import { handleDocShares } from "./routes/docShares";
import { handlePendingInvites } from "./routes/pendingInvites";
import { handleGraph, handlePublicGraph, handleGraphReindex } from "./routes/graph";
import { handleProjectExport } from "./routes/export";
import { handleSearch, handlePublicSearch } from "./routes/search";
import { DocCollabRoom } from "./collab/DocCollabRoom";
import { resolvePersonalPlan } from "../../auth/src/plan";

export { DocCollabRoom };

export interface Env {
  DB: D1Database;
  AUTH_DB: D1Database; // Read-only: users + sessions, used for inline JWT verify
  ASSETS: R2Bucket;
  AUTH: Fetcher; // Service binding to cubedocs-auth (mutating routes only)
  DOC_COLLAB?: DurableObjectNamespace;
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
  RATE_LIMITER_INVITE_LOOKUP: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // WebSocket upgrade for real-time collab — must be handled before addCorsHeaders
    // because wrapping a 101 response loses the webSocket property.
    const collabMatch = url.pathname.match(/^\/docs\/([^/]+)\/collab$/);
    if (collabMatch && request.headers.get("Upgrade") === "websocket") {
      return handleCollabUpgrade(request, url, env, collabMatch[1]);
    }

    let response: Response;

    try {
      // Proxy auth routes to the auth worker
      if (
        url.pathname === "/register" ||
        url.pathname === "/login" ||
        url.pathname === "/force-change-password" ||
        url.pathname === "/verify-email" ||
        url.pathname === "/verify-email/resend" ||
        url.pathname === "/admin/handoff/start"
      ) {
        return env.AUTH.fetch(new Request(`https://auth${url.pathname}`, request));
      }

      // TOTP management routes — authenticated, proxied to auth worker with userId injected
      if (url.pathname.startsWith("/me/totp")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const totpPath = url.pathname.replace("/me/totp", "/totp");
        const body = request.method !== "GET" ? await request.json<Record<string, unknown>>() : {};
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch(`https://auth${totpPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify(body),
        });
        return addCorsHeaders(authRes);
      }

      // WebAuthn management routes — authenticated, proxied to auth worker with userId injected
      if (url.pathname.startsWith("/me/webauthn")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const webauthnPath = url.pathname.replace("/me/webauthn", "/webauthn");
        const body = await request.json<Record<string, unknown>>();
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch(`https://auth${webauthnPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ ...body, userId: session.userId }),
        });
        return addCorsHeaders(authRes);
      }

      // WebAuthn login ceremony — unauthenticated, forwarded directly
      if (url.pathname.startsWith("/webauthn/auth")) {
        return addCorsHeaders(
          await env.AUTH.fetch(new Request(`https://auth${url.pathname}`, request)),
        );
      }

      // /me/sessions/* — authenticated, proxied to auth worker.
      // GET   /me/sessions          → list user's active sessions
      // POST  /me/sessions/revoke   → revoke a specific session by id
      // POST  /me/sessions/revoke-others → revoke all but the current
      // POST  /me/sessions/logout   → revoke the current session (proper logout)
      if (url.pathname === "/me/sessions" && request.method === "GET") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/sessions/list", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: "{}",
        });
        return addCorsHeaders(authRes);
      }
      if (url.pathname === "/me/sessions/revoke" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const body = await request.json<Record<string, unknown>>();
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/sessions/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify(body),
        });
        return addCorsHeaders(authRes);
      }
      if (url.pathname === "/me/sessions/revoke-others" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/sessions/revoke-others", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: "{}",
        });
        return addCorsHeaders(authRes);
      }
      if (url.pathname === "/me/sessions/logout" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/sessions/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: "{}",
        });
        return addCorsHeaders(authRes);
      }

      // /billing/* — authenticated, proxied to auth worker (Stripe Checkout
      // and Customer Portal session creation). Public Stripe webhook is
      // hit directly on the auth worker, not through here.
      if (url.pathname === "/billing/checkout" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: "{}",
        });
        return addCorsHeaders(authRes);
      }
      if (url.pathname === "/billing/portal" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/billing/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: "{}",
        });
        return addCorsHeaders(authRes);
      }

      // PATCH /me/password — change password
      if (url.pathname === "/me/password" && request.method === "PATCH") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const body = await request.json<Record<string, unknown>>();
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify(body),
        });
        return addCorsHeaders(authRes);
      }

      // GET /me — returns authenticated user's name and email
      if (url.pathname === "/me" && request.method === "GET") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const authHeader = request.headers.get("Authorization");
        const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ userId: session.userId }),
        });
        if (!lookupRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const data = await lookupRes.json<{ ok: boolean; data?: { name: string; email: string; emailVerified: boolean; emailVerificationEnabled: boolean; timezone: string | null } }>();
        if (!data.ok || !data.data) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        return addCorsHeaders(Response.json({
          ok: true,
          data: {
            name: data.data.name,
            email: data.data.email,
            emailVerified: data.data.emailVerified,
            emailVerificationEnabled: data.data.emailVerificationEnabled,
            userId: session.userId,
            timezone: data.data.timezone,
            personalPlan: session.personalPlan ?? "free",
            personalPlanSince: session.personalPlanSince ?? null,
            personalPlanStatus: session.personalPlanStatus ?? null,
            personalPlanCancelAt: session.personalPlanCancelAt ?? null,
          },
        }));
      }

      // PATCH /me — update authenticated user's name and/or timezone
      if (url.pathname === "/me" && request.method === "PATCH") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const body = await request.json<{ name?: string; timezone?: string | null }>();
        const authHeader = request.headers.get("Authorization");
        const responseData: { name?: string; timezone?: string | null } = {};

        if (body.name !== undefined) {
          if (!body.name?.trim()) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
          const updateRes = await env.AUTH.fetch("https://auth/update-name", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
            body: JSON.stringify({ name: body.name.trim() }),
          });
          if (!updateRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
          const trimmedName = body.name.trim();
          await env.DB.prepare("UPDATE project_members SET name = ? WHERE user_id = ?")
            .bind(trimmedName, session.userId).run();
          responseData.name = trimmedName;
        }

        if ("timezone" in body) {
          const updateRes = await env.AUTH.fetch("https://auth/update-timezone", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
            body: JSON.stringify({ timezone: body.timezone ?? null }),
          });
          if (!updateRes.ok) return addCorsHeaders(updateRes.status === 400 ? errorResponse(Errors.BAD_REQUEST) : errorResponse(Errors.INTERNAL));
          responseData.timezone = body.timezone ?? null;
        }

        if (!responseData.name && !("timezone" in body)) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        return addCorsHeaders(Response.json({ ok: true, data: responseData }));
      }

      // GET /avatar/:userId — public, serve avatar from R2
      if (url.pathname.startsWith("/avatar/") && request.method === "GET") {
        const userId = url.pathname.slice("/avatar/".length);
        if (!userId) return addCorsHeaders(errorResponse(Errors.NOT_FOUND));
        const obj = await env.ASSETS.get(`avatars/${userId}`);
        if (!obj) return new Response(null, { status: 404 });
        const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
        return new Response(await obj.arrayBuffer(), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=300",
            ...corsHeaders(),
          },
        });
      }

      // POST /avatar — authenticated, upload avatar image
      if (url.pathname === "/avatar" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const contentType = request.headers.get("Content-Type") ?? "";
        if (!contentType.includes("multipart/form-data")) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        const form = await request.formData();
        const file = form.get("file") as File | null;
        if (!file) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.type)) {
          return addCorsHeaders(Response.json({ ok: false, error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF." }, { status: 400 }));
        }
        if (file.size > 5 * 1024 * 1024) {
          return addCorsHeaders(Response.json({ ok: false, error: "File too large. Maximum size is 5MB." }, { status: 400 }));
        }
        await env.ASSETS.put(`avatars/${session.userId}`, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type },
        });
        return addCorsHeaders(Response.json({ ok: true }));
      }

      // DELETE /avatar — authenticated, remove avatar
      if (url.pathname === "/avatar" && request.method === "DELETE") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        await env.ASSETS.delete(`avatars/${session.userId}`);
        return addCorsHeaders(Response.json({ ok: true }));
      }

      // DELETE /me — delete the authenticated user's account
      if (url.pathname === "/me" && request.method === "DELETE") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;

        const ownedCount = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM projects WHERE owner_id = ?",
        ).bind(session.userId).first<{ count: number }>();
        if (ownedCount && ownedCount.count > 0) {
          return addCorsHeaders(Response.json({ ok: false, error: "owns_projects" }, { status: 400 }));
        }

        const body = await request.json<Record<string, unknown>>();
        const authHeader = request.headers.get("Authorization");
        const authRes = await env.AUTH.fetch("https://auth/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify(body),
        });
        const authJson = await authRes.json<{ ok: boolean; error?: string }>();
        if (!authJson.ok) return addCorsHeaders(Response.json(authJson, { status: authRes.status }));

        // Delete projects the user owns (cascades to docs, members, etc.)
        const ownedProjects = await env.DB.prepare(
          "SELECT id FROM projects WHERE owner_id = ?",
        ).bind(session.userId).all<{ id: string }>();
        for (const proj of ownedProjects.results) {
          await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(proj.id).run();
        }

        // Remove user from any remaining project memberships
        await env.DB.prepare("DELETE FROM project_members WHERE user_id = ?").bind(session.userId).run();

        // Delete avatar
        await env.ASSETS.delete(`avatars/${session.userId}`);

        return addCorsHeaders(Response.json({ ok: true }));
      }

      // GET /users/:userId — authenticated, returns user profile + shared projects
      const userProfileMatch = url.pathname.match(/^\/users\/([^/]+)$/);
      if (userProfileMatch && request.method === "GET") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const targetUserId = userProfileMatch[1];

        const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: targetUserId }),
        });
        if (!lookupRes.ok) {
          return addCorsHeaders(lookupRes.status === 404 ? errorResponse(Errors.NOT_FOUND) : errorResponse(Errors.INTERNAL));
        }
        const lookupData = await lookupRes.json<{ ok: boolean; data?: { userId: string; name: string; email: string; createdAt: string; timezone: string | null; badges?: number } }>();
        if (!lookupData.ok || !lookupData.data) return addCorsHeaders(errorResponse(Errors.NOT_FOUND));

        const sharedRows = await env.DB.prepare(
          `SELECT p.id, p.name, target.role as their_role
           FROM projects p
           JOIN project_members caller ON caller.project_id = p.id AND caller.user_id = ? AND caller.accepted = 1
           JOIN project_members target ON target.project_id = p.id AND target.user_id = ? AND target.accepted = 1
           ORDER BY p.name ASC`,
        ).bind(session.userId, targetUserId).all<{ id: string; name: string; their_role: string }>();

        const planRow = await env.AUTH_DB.prepare(
          `SELECT personal_plan, personal_plan_status, personal_plan_started_at,
                  personal_plan_cancel_at,
                  granted_plan, granted_plan_expires_at, granted_plan_started_at
           FROM users WHERE id = ?`,
        ).bind(targetUserId).first<{
          personal_plan: string | null;
          personal_plan_status: string | null;
          personal_plan_started_at: number | null;
          personal_plan_cancel_at: number | null;
          granted_plan: string | null;
          granted_plan_expires_at: number | null;
          granted_plan_started_at: number | null;
        }>();
        const resolvedPlan = planRow ? resolvePersonalPlan(planRow) : { plan: "free" as const, since: null };

        const profileData: Record<string, unknown> = {
          userId: lookupData.data.userId,
          name: lookupData.data.name,
          createdAt: lookupData.data.createdAt,
          sharedProjects: sharedRows.results.map(r => ({ id: r.id, name: r.name, theirRole: r.their_role })),
          personalPlan: resolvedPlan.plan,
          personalPlanSince: resolvedPlan.since,
          badges: lookupData.data.badges ?? 0,
        };
        if (lookupData.data.timezone) profileData.timezone = lookupData.data.timezone;

        return addCorsHeaders(Response.json({ ok: true, data: profileData }));
      }

      // Pending invites
      if (url.pathname.startsWith("/pending-invites")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handlePendingInvites(request, env, session, url);
      } else if (/^\/public\/projects\/[^/]+\/graph$/.test(url.pathname)) {
        response = await handlePublicGraph(env, url);
      } else if (url.pathname === "/public/search") {
        response = await handlePublicSearch(request, env, url);
      } else if (url.pathname.startsWith("/public")) {
        response = await handlePublic(request, env, url);
      } else if (url.pathname.startsWith("/invites/")) {
        response = await handleInvitePublic(request, env, url);
      } else if (/^\/projects\/[^/]+\/members/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleMembers(request, env, session, url);
      } else if (/^\/projects\/[^/]+\/invite-links/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleInviteLinks(request, env, session, url);
      } else if (/^\/projects\/[^/]+\/folder-shares/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleDocShares(request, env, session, url);
      } else if (/^\/projects\/[^/]+\/export$/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleProjectExport(request, env, session, url);
      } else if (/^\/projects\/[^/]+\/graph\/reindex$/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleGraphReindex(request, env, session, url);
      } else if (/^\/projects\/[^/]+\/graph$/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleGraph(request, env, session, url);
      } else if (url.pathname.startsWith("/projects")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleProjects(request, env, session, url);
      } else if (/^\/docs\/[^/]+\/shares/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleDocShares(request, env, session, url);
      } else if (url.pathname.startsWith("/docs")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleDocs(request, env, session, url);
      } else if (url.pathname.startsWith("/folders")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleFolders(request, env, session, url);
      } else if (url.pathname.startsWith("/files")) {
        const result = await authenticate(request, env);
        // /files allows anonymous access for public files (`result === null`).
        // A 403 from the auth worker (disabled/suspended account) must still
        // propagate so the client gets the real reason instead of public access.
        if (result instanceof Response) {
          response = result;
        } else {
          response = await handleFiles(request, env, result, url);
        }
      } else if (url.pathname === "/search") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleSearch(request, env, session, url);
      } else if (url.pathname.startsWith("/ai")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleAi(request, env, session, url);
      } else {
        response = errorResponse(Errors.NOT_FOUND);
      }
    } catch (err) {
      console.error(err);
      response = errorResponse(Errors.INTERNAL);
    }

    return addCorsHeaders(response);
  },
};

async function handleCollabUpgrade(request: Request, url: URL, env: Env, docId: string): Promise<Response> {
  if (!env.DOC_COLLAB) return new Response("Not available", { status: 503 });

  // Token arrives as a query param (browsers can't set headers on WS).
  // Re-wrap it as a Bearer header so authenticate() / the AUTH service binding handles it
  // the same way every other route does — works in local dev without JWT_SECRET.
  const token = url.searchParams.get("token");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const authReq = new Request("https://placeholder/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const session = await authenticate(authReq, env);
  if (session === null) return new Response("Unauthorized", { status: 401 });
  if (session instanceof Response) return new Response("Forbidden", { status: 403 });

  const docRow = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?")
    .bind(docId).first<{ project_id: string }>();
  if (!docRow) return new Response("Not found", { status: 404 });

  const projectRow = await env.DB.prepare("SELECT features FROM projects WHERE id = ?")
    .bind(docRow.project_id).first<{ features: number }>();
  if (!projectRow || !(projectRow.features & ProjectFeatures.REALTIME)) {
    return new Response("Forbidden", { status: 403 });
  }

  const caller = await env.DB.prepare("SELECT role, name FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(docRow.project_id, session.userId).first<{ role: string; name: string }>();
  if (!caller || ROLE_RANK[caller.role as keyof typeof ROLE_RANK] < ROLE_RANK["editor"]) {
    return new Response("Forbidden", { status: 403 });
  }

  const id = env.DOC_COLLAB.idFromName(`${docRow.project_id}:${docId}`);
  const stub = env.DOC_COLLAB.get(id);

  const upstream = new Request(request.url, {
    method: request.method,
    headers: new Headers({
      ...Object.fromEntries(request.headers),
      "X-User-Id": session.userId,
      "X-User-Name": caller.name,
      "X-Project-Id": docRow.project_id,
      "X-Doc-Id": docId,
    }),
  });
  return stub.fetch(upstream);
}

async function getSession(request: Request, env: Env): Promise<Session | Response> {
  const result = await authenticate(request, env);
  if (result === null) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
  if (result instanceof Response) return addCorsHeaders(result);
  return result;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "https://docs.cubityfir.st",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
