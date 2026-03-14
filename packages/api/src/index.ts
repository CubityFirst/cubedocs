import { errorResponse, Errors } from "./lib";
import { authenticate } from "./auth";
import { handleProjects } from "./routes/projects";
import { handleDocs } from "./routes/docs";

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
      // /projects and /projects/:id/docs
      if (url.pathname.startsWith("/projects")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleProjects(request, env, user, url);
      } else if (url.pathname.startsWith("/docs")) {
        const user = await authenticate(request, env);
        if (!user) return addCorsHeaders(errorResponse(Errors.UNAUTHORIZED));
        response = await handleDocs(request, env, user, url);
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
