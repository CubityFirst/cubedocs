import { useState, useRef, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

export type TwoFAVerification = {
  totpCode?: string;
  challengeId?: string;
  webauthnResponse?: unknown;
};

// Return undefined on success, an error message string on failure (keeps TOTP dialog open).
export type TwoFAAction = (v: TwoFAVerification) => Promise<string | undefined>;

type DialogMode = "totp" | "webauthn";

/**
 * Reusable 2FA gate hook.
 *
 * - Both enabled      → dialog defaults to TOTP with option to switch to security key
 * - totpEnabled only  → TOTP dialog
 * - webauthnEnabled only → triggers WebAuthn authentication ceremony (no dialog)
 * - neither           → calls action immediately with no verification
 *
 * `runWithTwoFA(action)` returns a Promise that resolves when the action
 * completes OR when the user cancels (action is NOT called on cancel).
 */
export function use2FA({
  totpEnabled,
  webauthnEnabled,
}: {
  totpEnabled: boolean;
  webauthnEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [webauthnStatus, setWebauthnStatus] = useState<"waiting" | "error">("waiting");
  const { toast } = useToast();

  const pendingRef = useRef<{
    action: TwoFAAction;
    resolve: () => void;
  } | null>(null);

  async function runWebauthnInDialog() {
    if (!pendingRef.current) return;
    setBusy(true);
    setWebauthnStatus("waiting");
    setFieldError(null);
    try {
      const token = getToken();
      const startRes = await fetch("/api/me/webauthn/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const startJson = await startRes.json() as {
        ok: boolean;
        data?: { options: Record<string, unknown>; challengeId: string };
      };
      if (!startJson.ok || !startJson.data) {
        setFieldError("Could not start security key verification.");
        setWebauthnStatus("error");
        return;
      }
      const { options, challengeId } = startJson.data;
      let assertion;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assertion = await startAuthentication(options as any);
      } catch {
        setFieldError("Security key verification was cancelled. Try again or use your authenticator app.");
        setWebauthnStatus("error");
        return;
      }
      const err = await pendingRef.current.action({ challengeId, webauthnResponse: assertion });
      if (err === undefined) {
        const { resolve } = pendingRef.current;
        pendingRef.current = null;
        setOpen(false);
        setCode("");
        resolve();
      } else {
        setFieldError(err);
        setWebauthnStatus("error");
      }
    } catch {
      setFieldError("Could not connect to the server.");
      setWebauthnStatus("error");
    } finally {
      setBusy(false);
    }
  }

  // When mode switches to webauthn inside the dialog, auto-trigger the ceremony
  useEffect(() => {
    if (open && mode === "webauthn") {
      runWebauthnInDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function runWithTwoFA(action: TwoFAAction): Promise<void> {
    if (totpEnabled || webauthnEnabled) {
      return new Promise<void>((resolve) => {
        pendingRef.current = { action, resolve };
        setCode("");
        setFieldError(null);
        setWebauthnStatus("waiting");
        // Default: TOTP if available, otherwise webauthn
        setMode(totpEnabled ? "totp" : "webauthn");
        setOpen(true);
      });
    }

    // No 2FA set up — proceed directly
    await action({});
  }

  function closeDialog() {
    setOpen(false);
    setCode("");
    setFieldError(null);
    if (pendingRef.current) {
      pendingRef.current.resolve();
      pendingRef.current = null;
    }
  }

  function switchToWebauthn() {
    setFieldError(null);
    setWebauthnStatus("waiting");
    setMode("webauthn");
  }

  function switchToTotp() {
    setFieldError(null);
    setCode("");
    setMode("totp");
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingRef.current || code.length !== 6) return;
    setBusy(true);
    const { action, resolve } = pendingRef.current;
    const err = await action({ totpCode: code });
    setBusy(false);
    if (err === undefined) {
      pendingRef.current = null;
      setOpen(false);
      setCode("");
      resolve();
    } else {
      setFieldError(err);
      setCode("");
    }
  }

  const twoFADialog = (
    <Dialog open={open} onOpenChange={o => { if (!o) closeDialog(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "totp" ? "Confirm with authenticator" : "Confirm with security key"}
          </DialogTitle>
        </DialogHeader>

        {mode === "totp" ? (
          <form id="2fa-confirm-form" onSubmit={handleTotpSubmit} className="py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="2fa-code">Enter the 6-digit code from your app</Label>
              <Input
                id="2fa-code"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setFieldError(null); }}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
              />
              {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
              {webauthnEnabled && (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-4 hover:underline text-left mt-1"
                  onClick={switchToWebauthn}
                >
                  Use a security key instead
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="py-2 flex flex-col gap-2">
            {webauthnStatus === "waiting" && !fieldError ? (
              <p className="text-sm text-muted-foreground">
                Touch your security key when it flashes…
              </p>
            ) : (
              <>
                {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={runWebauthnInDialog}
                >
                  Try again
                </Button>
              </>
            )}
            {totpEnabled && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline text-left"
                onClick={switchToTotp}
              >
                Use authenticator app instead
              </button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={closeDialog}>
            Cancel
          </Button>
          {mode === "totp" && (
            <Button type="submit" form="2fa-confirm-form" disabled={busy || code.length !== 6}>
              {busy ? "Confirming…" : "Confirm"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { runWithTwoFA, twoFADialog, busy };
}
