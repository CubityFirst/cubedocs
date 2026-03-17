import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { startAuthentication } from "@simplewebauthn/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthForm } from "@/components/AuthForm";
import { Turnstile } from "@/components/Turnstile";
import { getToken, setToken } from "@/lib/auth";

type LoginStep = "credentials" | "totp" | "webauthn" | "method_picker";

function moderationMessage(error?: string, until?: number): string {
  const contact = "Please email docs@cubityfir.st for further details.";
  if (error === "account_suspended" && until) {
    const date = new Date(until * 1000).toLocaleDateString(undefined, { dateStyle: "long" });
    return `Your account has been temporarily suspended until ${date}. ${contact}`;
  }
  return `Your account has been disabled. ${contact}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [step, setStep] = useState<LoginStep>("credentials");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [pendingWebauthn, setPendingWebauthn] = useState(false);

  // Ref so the webauthn flow can read the latest turnstileToken without a stale closure
  const turnstileTokenRef = useRef<string | null>(null);
  turnstileTokenRef.current = turnstileToken;

  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);

  useEffect(() => {
    if (getToken()) {
      navigate(from, { replace: true });
    }
  }, [navigate, from]);

  const runWebauthnFlow = useCallback(async function runWebauthnFlow(userId: string) {
    setLoading(true);
    setError(null);
    try {
      const startRes = await fetch("/api/webauthn/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const startJson = await startRes.json() as {
        ok: boolean;
        data?: { options: Record<string, unknown>; challengeId: string };
      };
      if (!startJson.ok || !startJson.data) {
        setError("Failed to start security key authentication.");
        return;
      }

      const { options, challengeId } = startJson.data;
      let assertion;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assertion = await startAuthentication(options as any);
      } catch {
        setError("Security key authentication was cancelled or failed. Please try again.");
        return;
      }

      const currentTurnstile = turnstileTokenRef.current;
      if (!currentTurnstile) {
        setError("Please complete the security challenge.");
        return;
      }

      const finishRes = await fetch("/api/webauthn/auth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          challengeId,
          response: assertion,
          email,
          turnstileToken: currentTurnstile,
        }),
      });
      const finishJson = await finishRes.json() as {
        ok: boolean;
        data?: { token: string };
        error?: string;
        until?: number;
      };

      if (finishJson.ok && finishJson.data) {
        setToken(finishJson.data.token);
        navigate(from, { replace: true });
      } else if (finishRes.status === 403) {
        setError(moderationMessage(finishJson.error, finishJson.until));
      } else {
        setError("Security key verification failed. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, from, navigate]);

  // Auto-start webauthn flow once a fresh Turnstile token is available.
  // This is needed because the token used for the initial credential check is
  // already consumed by the time we reach the webauthn step.
  useEffect(() => {
    if (pendingWebauthn && turnstileToken && pendingUserId && !loading) {
      setPendingWebauthn(false);
      runWebauthnFlow(pendingUserId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWebauthn, turnstileToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!turnstileToken) {
      setError("Please complete the security challenge.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          turnstileToken,
          ...(step === "totp" ? { totpCode } : {}),
        }),
      });
      const json = await res.json() as {
        ok: boolean;
        data?: { token: string };
        error?: string;
        until?: number;
        userId?: string;
        methods?: string[];
      };

      if (json.ok && json.data) {
        setToken(json.data.token);
        navigate(from, { replace: true });
      } else if (json.error === "totp_required") {
        setStep("totp");
      } else if (json.error === "webauthn_required" && json.userId) {
        setPendingUserId(json.userId);
        setStep("webauthn");
        setLoading(false);
        setTurnstileToken(null); // clear consumed token; fresh one will arrive from the webauthn step's Turnstile
        setPendingWebauthn(true);
        return;
      } else if (json.error === "two_factor_required" && json.userId) {
        setPendingUserId(json.userId);
        setStep("method_picker");
      } else if (json.error === "invalid_totp") {
        setError("Invalid authenticator code. Please try again.");
        setTotpCode("");
      } else if (res.status === 403) {
        setError(moderationMessage(json.error, json.until));
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("credentials");
    setTotpCode("");
    setPendingUserId(null);
    setError(null);
  }

  if (step === "totp") {
    return (
      <AuthForm
        title="CubeDocs"
        subtitle="Two-factor authentication"
        submitLabel="Verify"
        loading={loading}
        error={error}
        onSubmit={handleSubmit}
        footer={
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline text-sm"
            onClick={handleBack}
          >
            Back to sign in
          </button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="totp-code">Authenticator code</Label>
          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            required
          />
          <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <Turnstile onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
      </AuthForm>
    );
  }

  if (step === "method_picker") {
    return (
      <AuthForm
        title="CubeDocs"
        subtitle="Choose verification method"
        submitLabel=""
        loading={false}
        error={error}
        onSubmit={e => e.preventDefault()}
        hideSubmit
        footer={
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline text-sm"
            onClick={handleBack}
          >
            Back to sign in
          </button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Your account has two-factor authentication enabled. Choose how to verify:
        </p>
        <div className="flex flex-col gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("totp")}
          >
            Authenticator app
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={async () => {
              if (!pendingUserId) return;
              setStep("webauthn");
              await runWebauthnFlow(pendingUserId);
            }}
          >
            {loading ? "Waiting for key…" : "Security key"}
          </Button>
        </div>
        <Turnstile onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
      </AuthForm>
    );
  }

  if (step === "webauthn") {
    return (
      <AuthForm
        title="CubeDocs"
        subtitle="Security key"
        submitLabel=""
        loading={false}
        error={error}
        onSubmit={e => e.preventDefault()}
        hideSubmit
        footer={
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline text-sm"
            onClick={handleBack}
          >
            Back to sign in
          </button>
        }
      >
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Touch your security key when it flashes…"
            : "Security key verification failed or was cancelled."}
        </p>
        {!loading && (
          <Button
            type="button"
            onClick={() => pendingUserId && runWebauthnFlow(pendingUserId)}
          >
            Try again
          </Button>
        )}
        <Turnstile onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
      </AuthForm>
    );
  }

  return (
    <AuthForm
      title="CubeDocs"
      subtitle="Sign in to your account"
      submitLabel="Sign in"
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-primary underline-offset-4 hover:underline">
            Sign up
          </a>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>
      <Turnstile onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
    </AuthForm>
  );
}
