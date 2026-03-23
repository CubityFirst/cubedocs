import { errorResponse, okResponse, Errors } from "./lib";
import { handleRegister } from "./routes/register";
import { handleLogin } from "./routes/login";
import { handleVerify } from "./routes/verify";
import { handleLookup } from "./routes/lookup";
import { handleLookupById } from "./routes/lookup-by-id";
import { handleUpdateName } from "./routes/update-name";
import { handleTotpSetup } from "./routes/totp-setup";
import { handleTotpEnable } from "./routes/totp-enable";
import { handleTotpDisable } from "./routes/totp-disable";
import { handleTotpStatus } from "./routes/totp-status";
import { handleChangePassword } from "./routes/change-password";
import { handleForceChangePassword } from "./routes/force-change-password";
import { handleWebauthnRegisterStart } from "./routes/webauthn-register-start";
import { handleWebauthnRegisterFinish } from "./routes/webauthn-register-finish";
import { handleWebauthnAuthStart } from "./routes/webauthn-auth-start";
import { handleWebauthnAuthFinish } from "./routes/webauthn-auth-finish";
import { handleWebauthnCredentialsList } from "./routes/webauthn-credentials-list";
import { handleWebauthnCredentialsDelete } from "./routes/webauthn-credentials-delete";
import { handleTotpBackupCodesGenerate } from "./routes/totp-backup-codes-generate";
import { handleAdminHandoffStart } from "./routes/admin-handoff-start";
import { handleAdminHandoffExchange } from "./routes/admin-handoff-exchange";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  ADMIN_APP_ORIGIN: string;
  TURNSTILE_SECRET: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_RP_NAME: string;
  WEBAUTHN_ORIGIN: string;
  RATE_LIMITER_LOOKUP: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  RATE_LIMITER_AUTH: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    let response: Response;

    try {
      if (url.pathname === "/register" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_AUTH.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleRegister(request, env);
      } else if (url.pathname === "/login" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_AUTH.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleLogin(request, env);
      } else if (url.pathname === "/verify" && request.method === "GET") {
        response = await handleVerify(request, env);
      } else if (url.pathname === "/lookup" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_LOOKUP.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleLookup(request, env);
      } else if (url.pathname === "/lookup-by-id" && request.method === "POST") {
        response = await handleLookupById(request, env);
      } else if (url.pathname === "/update-name" && request.method === "POST") {
        response = await handleUpdateName(request, env);
      } else if (url.pathname === "/totp/setup" && request.method === "POST") {
        response = await handleTotpSetup(request, env);
      } else if (url.pathname === "/totp/enable" && request.method === "POST") {
        response = await handleTotpEnable(request, env);
      } else if (url.pathname === "/totp/disable" && request.method === "POST") {
        response = await handleTotpDisable(request, env);
      } else if (url.pathname === "/totp/status" && request.method === "POST") {
        response = await handleTotpStatus(request, env);
      } else if (url.pathname === "/change-password" && request.method === "POST") {
        response = await handleChangePassword(request, env);
      } else if (url.pathname === "/force-change-password" && request.method === "POST") {
        response = await handleForceChangePassword(request, env);
      } else if (url.pathname === "/admin/handoff/start" && request.method === "POST") {
        response = await handleAdminHandoffStart(request, env);
      } else if (url.pathname === "/admin/handoff/exchange" && request.method === "POST") {
        response = await handleAdminHandoffExchange(request, env);
      } else if (url.pathname === "/webauthn/register/start" && request.method === "POST") {
        response = await handleWebauthnRegisterStart(request, env);
      } else if (url.pathname === "/webauthn/register/finish" && request.method === "POST") {
        response = await handleWebauthnRegisterFinish(request, env);
      } else if (url.pathname === "/webauthn/auth/start" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_AUTH.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleWebauthnAuthStart(request, env);
      } else if (url.pathname === "/webauthn/auth/finish" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_AUTH.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleWebauthnAuthFinish(request, env);
      } else if (url.pathname === "/webauthn/credentials" && request.method === "POST") {
        response = await handleWebauthnCredentialsList(request, env);
      } else if (url.pathname === "/webauthn/credentials/delete" && request.method === "POST") {
        response = await handleWebauthnCredentialsDelete(request, env);
      } else if (url.pathname === "/totp/backup-codes/generate" && request.method === "POST") {
        response = await handleTotpBackupCodesGenerate(request, env);
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
