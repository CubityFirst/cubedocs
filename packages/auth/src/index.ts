import { errorResponse, Errors } from "./lib";
import { handleRegister } from "./routes/register";
import { handleLogin } from "./routes/login";
import { handleVerify } from "./routes/verify";
import { handleLookup } from "./routes/lookup";
import { handleLookupById } from "./routes/lookup-by-id";
import { handleUpdateName } from "./routes/update-name";
import { handleUpdateTimezone } from "./routes/update-timezone";
import { handleUpdateInkPrefs } from "./routes/update-ink-prefs";
import { handleUpdateReadingFont } from "./routes/update-reading-font";
import { handleUpdateTheme } from "./routes/update-theme";
import { handleUpdateBio } from "./routes/update-bio";
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
import { handleVerifyEmail } from "./routes/verify-email";
import { handleVerifyEmailResend } from "./routes/verify-email-resend";
import { handleDeleteAccount } from "./routes/delete-account";
import { handleSessionsList } from "./routes/sessions-list";
import { handleSessionsRevoke } from "./routes/sessions-revoke";
import { handleSessionsRevokeOthers } from "./routes/sessions-revoke-others";
import { handleSessionsLogout } from "./routes/sessions-logout";
import { handleBillingCheckout, handleBillingPortal } from "./routes/billing";
import { handleStripeWebhook } from "./routes/stripe-webhook";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  ADMIN_APP_ORIGIN: string;
  APP_ORIGIN: string;
  TURNSTILE_SECRET: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_RP_NAME: string;
  WEBAUTHN_ORIGIN: string;
  EMAIL: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text?: string;
      html?: string;
    }): Promise<{ messageId: string }>;
  };
  REQUIRE_EMAIL_VERIFICATION: string;
  RATE_LIMITER_LOOKUP: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  RATE_LIMITER_AUTH: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  RATE_LIMITER_EMAIL_VERIFY: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_INK_PRICE_ID: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        response = await handleVerify(request, env, ctx);
      } else if (url.pathname === "/lookup" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_LOOKUP.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleLookup(request, env);
      } else if (url.pathname === "/lookup-by-id" && request.method === "POST") {
        response = await handleLookupById(request, env);
      } else if (url.pathname === "/update-name" && request.method === "POST") {
        response = await handleUpdateName(request, env);
      } else if (url.pathname === "/update-timezone" && request.method === "POST") {
        response = await handleUpdateTimezone(request, env);
      } else if (url.pathname === "/update-ink-prefs" && request.method === "POST") {
        response = await handleUpdateInkPrefs(request, env);
      } else if (url.pathname === "/update-reading-font" && request.method === "POST") {
        response = await handleUpdateReadingFont(request, env);
      } else if (url.pathname === "/update-theme" && request.method === "POST") {
        response = await handleUpdateTheme(request, env);
      } else if (url.pathname === "/update-bio" && request.method === "POST") {
        response = await handleUpdateBio(request, env);
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
      } else if (url.pathname === "/verify-email" && request.method === "POST") {
        response = await handleVerifyEmail(request, env);
      } else if (url.pathname === "/verify-email/resend" && request.method === "POST") {
        const { success } = await env.RATE_LIMITER_EMAIL_VERIFY.limit({ key: ip });
        if (!success) return addCorsHeaders(errorResponse(Errors.RATE_LIMITED));
        response = await handleVerifyEmailResend(request, env);
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
      } else if (url.pathname === "/delete-account" && request.method === "POST") {
        response = await handleDeleteAccount(request, env);
      } else if (url.pathname === "/sessions/list" && request.method === "POST") {
        response = await handleSessionsList(request, env);
      } else if (url.pathname === "/sessions/revoke" && request.method === "POST") {
        response = await handleSessionsRevoke(request, env);
      } else if (url.pathname === "/sessions/revoke-others" && request.method === "POST") {
        response = await handleSessionsRevokeOthers(request, env);
      } else if (url.pathname === "/sessions/logout" && request.method === "POST") {
        response = await handleSessionsLogout(request, env);
      } else if (url.pathname === "/billing/checkout" && request.method === "POST") {
        response = await handleBillingCheckout(request, env);
      } else if (url.pathname === "/billing/portal" && request.method === "POST") {
        response = await handleBillingPortal(request, env);
      } else if (url.pathname === "/stripe/webhook" && request.method === "POST") {
        // Stripe webhook handler reads its own raw body for signature
        // verification; it must NOT be wrapped by anything that calls
        // request.json() upstream. CORS is also irrelevant — Stripe
        // calls this server-to-server, not from a browser.
        response = await handleStripeWebhook(request, env);
      } else {
        response = errorResponse(Errors.NOT_FOUND);
      }
    } catch (err) {
      console.error(err);
      response = errorResponse(Errors.INTERNAL);
    }

    return addCorsHeaders(response);
  },

  // Weekly sweep of long-dead session rows. Login does opportunistic GC for
  // the logging-in user, but inactive accounts never get cleaned up that
  // way. We keep recently-expired and recently-revoked rows for ~30 days
  // as an audit cushion before removing them.
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      "DELETE FROM sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
    ).bind(cutoff, cutoff).run();
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
