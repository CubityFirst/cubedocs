import { errorResponse, Errors, Session } from "./lib";
import { authenticate } from "./auth";
import { handleProjects } from "./routes/projects";
import { handleDocs } from "./routes/docs";
import { handleFolders } from "./routes/folders";
import { handleMembers } from "./routes/members";
import { handlePublic } from "./routes/public";
import { handlePasswords } from "./routes/passwords";
import { handleFiles } from "./routes/files";
import { handleAi } from "./routes/ai";

export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  AUTH: Fetcher; // Service binding to cubedocs-auth
  JWT_SECRET: string;
  VAULT_SECRET: string;
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
      if (url.pathname === "/register" || url.pathname === "/login") {
        return env.AUTH.fetch(new Request(`https://auth${url.pathname}`, request));
      }

      // TOTP management routes — authenticated, proxied to auth worker with userId injected
      if (url.pathname.startsWith("/me/totp")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const totpPath = url.pathname.replace("/me/totp", "/totp");
        const body = request.method !== "GET" ? await request.json<Record<string, unknown>>() : {};
        const authRes = await env.AUTH.fetch(`https://auth${totpPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, userId: session.userId }),
        });
        return addCorsHeaders(authRes);
      }

      // WebAuthn management routes — authenticated, proxied to auth worker with userId injected
      if (url.pathname.startsWith("/me/webauthn")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const webauthnPath = url.pathname.replace("/me/webauthn", "/webauthn");
        const body = await request.json<Record<string, unknown>>();
        const authRes = await env.AUTH.fetch(`https://auth${webauthnPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        const authRes = await env.AUTH.fetch("https://auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, userId: session.userId }),
        });
        return addCorsHeaders(authRes);
      }

      // GET /me — returns authenticated user's name and email
      if (url.pathname === "/me" && request.method === "GET") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.userId }),
        });
        if (!lookupRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const data = await lookupRes.json<{ ok: boolean; data?: { name: string; email: string } }>();
        if (!data.ok || !data.data) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        return addCorsHeaders(Response.json({ ok: true, data: { name: data.data.name, email: data.data.email, userId: session.userId } }));
      }

      // PATCH /me — update authenticated user's name
      if (url.pathname === "/me" && request.method === "PATCH") {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        const body = await request.json<{ name?: string }>();
        if (!body.name?.trim()) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        const updateRes = await env.AUTH.fetch("https://auth/update-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.userId, name: body.name.trim() }),
        });
        if (!updateRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const trimmedName = body.name.trim();
        // Keep project_members names in sync
        await env.DB.prepare("UPDATE project_members SET name = ? WHERE user_id = ?")
          .bind(trimmedName, session.userId).run();
        return addCorsHeaders(Response.json({ ok: true, data: { name: trimmedName } }));
      }

      // Public (unauthenticated) routes
      if (url.pathname.startsWith("/public")) {
        response = await handlePublic(request, env, url);
      } else if (/^\/projects\/[^/]+\/members/.test(url.pathname)) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleMembers(request, env, session, url);
      } else if (url.pathname.startsWith("/projects")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleProjects(request, env, session, url);
      } else if (url.pathname.startsWith("/docs")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleDocs(request, env, session, url);
      } else if (url.pathname.startsWith("/folders")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handleFolders(request, env, session, url);
      } else if (url.pathname.startsWith("/passwords")) {
        const session = await getSession(request, env);
        if (session instanceof Response) return session;
        response = await handlePasswords(request, env, session, url);
      } else if (url.pathname.startsWith("/files")) {
        const session = await authenticate(request, env);
        response = await handleFiles(request, env, session, url);
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
