import { errorResponse, Errors, Session } from "./lib";
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
import { handleSearch, handlePublicSearch } from "./routes/search";

export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  AUTH: Fetcher; // Service binding to cubedocs-auth
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
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
        const data = await lookupRes.json<{ ok: boolean; data?: { name: string; email: string; emailVerified: boolean; emailVerificationEnabled: boolean } }>();
        if (!data.ok || !data.data) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        return addCorsHeaders(Response.json({ ok: true, data: { name: data.data.name, email: data.data.email, emailVerified: data.data.emailVerified, emailVerificationEnabled: data.data.emailVerificationEnabled, userId: session.userId } }));
      }

      // PATCH /me — update authenticated user's name
      if (url.pathname === "/me" && request.method === "PATCH") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const body = await request.json<{ name?: string }>();
        if (!body.name?.trim()) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        const authHeader = request.headers.get("Authorization");
        const updateRes = await env.AUTH.fetch("https://auth/update-name", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ name: body.name.trim() }),
        });
        if (!updateRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const trimmedName = body.name.trim();
        // Keep project_members names in sync
        await env.DB.prepare("UPDATE project_members SET name = ? WHERE user_id = ?")
          .bind(trimmedName, session.userId).run();
        return addCorsHeaders(Response.json({ ok: true, data: { name: trimmedName } }));
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
        const session = await authenticate(request, env);
        response = await handleFiles(request, env, session, url);
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

async function getSession(request: Request, env: Env): Promise<Session | Response> {
  const user = await authenticate(request, env);
  if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
  return user;
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
