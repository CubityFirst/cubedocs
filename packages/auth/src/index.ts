import { errorResponse, okResponse, Errors } from "./lib";
import { handleRegister } from "./routes/register";
import { handleLogin } from "./routes/login";
import { handleVerify } from "./routes/verify";
import { handleLookup } from "./routes/lookup";
import { handleLookupById } from "./routes/lookup-by-id";
import { handleUpdateName } from "./routes/update-name";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  TURNSTILE_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    let response: Response;

    try {
      if (url.pathname === "/register" && request.method === "POST") {
        response = await handleRegister(request, env);
      } else if (url.pathname === "/login" && request.method === "POST") {
        response = await handleLogin(request, env);
      } else if (url.pathname === "/verify" && request.method === "GET") {
        response = await handleVerify(request, env);
      } else if (url.pathname === "/lookup" && request.method === "POST") {
        response = await handleLookup(request, env);
      } else if (url.pathname === "/lookup-by-id" && request.method === "POST") {
        response = await handleLookupById(request, env);
      } else if (url.pathname === "/update-name" && request.method === "POST") {
        response = await handleUpdateName(request, env);
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
    "Access-Control-Allow-Origin": "https://docs.cubityfir.st",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}
