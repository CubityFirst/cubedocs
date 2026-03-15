import { errorResponse, Errors } from "./lib";
import { authenticate } from "./auth";
import { handleProjects } from "./routes/projects";
import { handleDocs } from "./routes/docs";
import { handleFolders } from "./routes/folders";
import { handleMembers } from "./routes/members";
import { handlePublic } from "./routes/public";
import { handlePasswords } from "./routes/passwords";

export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  AUTH: Fetcher; // Service binding to cubedocs-auth
  JWT_SECRET: string;
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

      // GET /me — returns authenticated user's name and email
      if (url.pathname === "/me" && request.method === "GET") {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.userId }),
        });
        if (!lookupRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const data = await lookupRes.json<{ ok: boolean; data?: { name: string; email: string } }>();
        if (!data.ok || !data.data) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        return addCorsHeaders(Response.json({ ok: true, data: { name: data.data.name, email: data.data.email, userId: user.userId } }));
      }

      // PATCH /me — update authenticated user's name
      if (url.pathname === "/me" && request.method === "PATCH") {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        const body = await request.json<{ name?: string }>();
        if (!body.name?.trim()) return addCorsHeaders(errorResponse(Errors.BAD_REQUEST));
        const updateRes = await env.AUTH.fetch("https://auth/update-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.userId, name: body.name.trim() }),
        });
        if (!updateRes.ok) return addCorsHeaders(errorResponse(Errors.INTERNAL));
        const trimmedName = body.name.trim();
        // Keep project_members names in sync
        await env.DB.prepare("UPDATE project_members SET name = ? WHERE user_id = ?")
          .bind(trimmedName, user.userId).run();
        return addCorsHeaders(Response.json({ ok: true, data: { name: trimmedName } }));
      }

      // Public (unauthenticated) routes
      if (url.pathname.startsWith("/public")) {
        response = await handlePublic(request, env, url);
      } else if (/^\/projects\/[^/]+\/members/.test(url.pathname)) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleMembers(request, env, user, url);
      } else if (url.pathname.startsWith("/projects")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleProjects(request, env, user, url);
      } else if (url.pathname.startsWith("/docs")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleDocs(request, env, user, url);
      } else if (url.pathname.startsWith("/folders")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleFolders(request, env, user, url);
      } else if (url.pathname.startsWith("/passwords")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handlePasswords(request, env, user, url);
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

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
