import { useState, useEffect } from "react";
import zxcvbn from "zxcvbn";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { LockOpen, LockKeyhole } from "lucide-react";

export function UserSettingsPage() {
  const [name, setName] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(true);

  // Setup flow state
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify">("idle");
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable flow state
  const [disableStep, setDisableStep] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  // Change password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTotpCode, setPasswordTotpCode] = useState("");
  const [passwordTotpRequired, setPasswordTotpRequired] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { name: string; email: string } }>)
      .then(json => {
        if (json.ok && json.data) {
          setCurrentName(json.data.name);
          setName(json.data.name);
          setEmail(json.data.email);
        }
      })
      .catch(() => {});

    fetch("/api/me/totp/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { enabled: boolean } }>)
      .then(json => {
        if (json.ok && json.data) setTotpEnabled(json.data.enabled);
      })
      .catch(() => {})
      .finally(() => setTotpLoading(false));
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === currentName) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json() as { ok: boolean; data?: { name: string } };
      if (json.ok && json.data) {
        setCurrentName(json.data.name);
        setName(json.data.name);
        toast({ title: "Name updated" });
      } else {
        toast({ title: "Failed to update name", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSetupStart() {
    setSetupLoading(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me/totp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json() as { ok: boolean; data?: { secret: string; uri: string } };
      if (json.ok && json.data) {
        setPendingSecret(json.data.secret);
        setPendingUri(json.data.uri);
        setSetupStep("qr");
      } else {
        toast({ title: "Failed to start 2FA setup", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleSetupVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingSecret || !setupCode) return;
    setSetupLoading(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me/totp/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ secret: pendingSecret, code: setupCode }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setTotpEnabled(true);
        setSetupStep("idle");
        setPendingSecret(null);
        setPendingUri(null);
        setSetupCode("");
        toast({ title: "Two-factor authentication enabled" });
      } else {
        toast({ title: "Invalid code. Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!disableCode) return;
    setDisableLoading(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: disableCode }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setTotpEnabled(false);
        setDisableStep(false);
        setDisableCode("");
        toast({ title: "Two-factor authentication disabled" });
      } else {
        toast({ title: "Invalid code. Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setDisableLoading(false);
    }
  }

  function resetPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordTotpCode("");
    setPasswordTotpRequired(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || newPassword !== confirmPassword) return;
    if (zxcvbn(newPassword).score < 3) return;
    setPasswordSaving(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(passwordTotpRequired ? { totpCode: passwordTotpCode } : {}),
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (json.ok) {
        resetPasswordDialog();
        setChangePasswordOpen(false);
        toast({ title: "Password changed" });
      } else if (json.error === "totp_required") {
        setPasswordTotpRequired(true);
      } else if (json.error === "invalid_totp") {
        toast({ title: "Invalid authenticator code", variant: "destructive" });
        setPasswordTotpCode("");
      } else if (json.error === "password_too_weak") {
        toast({ title: "New password is too weak", variant: "destructive" });
      } else {
        toast({ title: "Current password is incorrect", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setPasswordSaving(false);
    }
  }

  function handleCancelSetup() {
    setSetupStep("idle");
    setPendingSecret(null);
    setPendingUri(null);
    setSetupCode("");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex gap-12">
        {/* Sidebar nav */}
        <aside className="hidden md:block w-40 shrink-0">
          <nav className="sticky top-10 flex flex-col">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
            <a href="#account" className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">Account</a>
            <a href="#two-factor" className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">Security</a>
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your account preferences.</p>

          <Separator className="my-6" />

          {/* Account section */}
          <section id="account">
            <h2 className="text-base font-semibold">Account</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Update your personal information.</p>

            <form onSubmit={handleSaveName} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} disabled className="max-w-sm" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="max-w-sm"
                  required
                />
              </div>

              <div>
                <Button
                  type="submit"
                  disabled={saving || !name.trim() || name.trim() === currentName}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </section>

          <Separator className="my-6" />

          {/* Security section */}
          <section id="two-factor">
            <h2 className="text-base font-semibold">Security</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Manage your account security settings.</p>

            <div className="mt-5">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                Two-factor authentication
                {!totpLoading && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="inline-flex cursor-default focus:outline-none">
                        {totpEnabled
                          ? <LockKeyhole className="size-3.5 text-green-500" />
                          : <LockOpen className="size-3.5 text-red-500" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-auto px-3 py-1.5 text-xs">
                      {totpEnabled ? "2FA is Enabled" : "2FA is Disabled"}
                    </PopoverContent>
                  </Popover>
                )}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add an extra layer of security using an authenticator app.
              </p>
            </div>

            {totpLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : totpEnabled ? (
              <div className="mt-3">
                {disableStep ? (
                  <form onSubmit={handleDisable} className="flex flex-col gap-4 max-w-sm">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="disable-code">Enter your 6-digit code to confirm</Label>
                      <Input
                        id="disable-code"
                        value={disableCode}
                        onChange={e => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="destructive" disabled={disableLoading || disableCode.length !== 6}>
                        {disableLoading ? "Disabling…" : "Disable 2FA"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setDisableStep(false); setDisableCode(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button variant="outline" onClick={() => setDisableStep(true)}>
                    Disable 2FA
                  </Button>
                )}
              </div>
            ) : setupStep === "idle" ? (
              <div className="mt-3">
                <Button onClick={handleSetupStart} disabled={setupLoading}>
                  {setupLoading ? "Loading…" : "Set up 2FA"}
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-5 max-w-sm">
                <div>
                  <p className="text-sm font-medium mb-2">
                    Scan this QR code with your authenticator app
                    <span className="block text-muted-foreground font-normal mt-0.5">
                      (Google Authenticator, Authy, 1Password, etc.)
                    </span>
                  </p>
                  {pendingUri && (
                    <div className="inline-block rounded-lg border p-3 bg-white">
                      <QRCode value={pendingUri} size={160} />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Can&apos;t scan? Enter this key manually:</p>
                  <code className="text-xs bg-muted rounded px-2 py-1 select-all break-all">
                    {pendingSecret}
                  </code>
                </div>

                <form onSubmit={handleSetupVerify} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="setup-code">Enter the 6-digit code from your app</Label>
                    <Input
                      id="setup-code"
                      value={setupCode}
                      onChange={e => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={setupLoading || setupCode.length !== 6}>
                      {setupLoading ? "Verifying…" : "Enable 2FA"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCancelSetup}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <div className="mt-6 pt-5 border-t">
              <h3 className="text-sm font-semibold">Change password</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Update the password used to sign in to your account.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => { resetPasswordDialog(); setChangePasswordOpen(true); }}
              >
                Change password
              </Button>
            </div>

            <Dialog open={changePasswordOpen} onOpenChange={open => { if (!open) resetPasswordDialog(); setChangePasswordOpen(open); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change password</DialogTitle>
                </DialogHeader>
                <form id="change-password-form" onSubmit={handleChangePassword} className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    {newPassword && zxcvbn(newPassword).score < 3 && (
                      <p className="text-xs text-destructive">Password is too weak. Try adding more characters or symbols.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">Passwords do not match.</p>
                    )}
                  </div>

                  {passwordTotpRequired && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="password-totp">Authenticator code</Label>
                      <Input
                        id="password-totp"
                        value={passwordTotpCode}
                        onChange={e => setPasswordTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                        required
                      />
                      <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
                    </div>
                  )}
                </form>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => { resetPasswordDialog(); setChangePasswordOpen(false); }}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="change-password-form"
                    disabled={
                      passwordSaving ||
                      !currentPassword ||
                      !newPassword ||
                      newPassword !== confirmPassword ||
                      zxcvbn(newPassword).score < 3 ||
                      (passwordTotpRequired && passwordTotpCode.length !== 6)
                    }
                  >
                    {passwordSaving ? "Saving…" : "Change password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        </div>
      </div>
    </div>
  );
}
