import { useState, useEffect, useRef } from "react";
import zxcvbn from "zxcvbn";
import QRCode from "react-qr-code";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { use2FA } from "@/hooks/use2FA";
import { getToken } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { LockOpen, LockKeyhole, Key, Trash2, Loader2, Copy, CheckCircle2, AlertCircle, Camera } from "lucide-react";

interface WebAuthnCredential {
  id: string;
  name: string;
  created_at: string;
}

export function UserSettingsPage() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatarKey, setAvatarKey] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPopoverOpen, setAvatarPopoverOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // TOTP state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(true);

  // TOTP setup flow state
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify">("idle");
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  // WebAuthn state
  const [webauthnCredentials, setWebauthnCredentials] = useState<WebAuthnCredential[]>([]);
  const [webauthnLoading, setWebauthnLoading] = useState(true);
  const [addingKey, setAddingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [processingKeyId, setProcessingKeyId] = useState<string | null>(null);

  // Backup codes state
  const [backupCodesOpen, setBackupCodesOpen] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesLoading, setBackupCodesLoading] = useState(false);

  // Change password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const { runWithTwoFA, twoFADialog, busy: twoFABusy } = use2FA({
    totp: totpEnabled,
    webauthn: webauthnCredentials.length > 0,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { name: string; email: string; emailVerified: boolean; emailVerificationEnabled: boolean; userId: string } }>)
      .then(json => {
        if (json.ok && json.data) {
          setCurrentName(json.data.name);
          setName(json.data.name);
          setEmail(json.data.email);
          setEmailVerified(json.data.emailVerified);
          setEmailVerificationEnabled(json.data.emailVerificationEnabled);
          setUserId(json.data.userId);
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

    fetch("/api/me/webauthn/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { credentials: WebAuthnCredential[] } }>)
      .then(json => {
        if (json.ok && json.data) setWebauthnCredentials(json.data.credentials);
      })
      .catch(() => {})
      .finally(() => setWebauthnLoading(false));
  }, []);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPopoverOpen(false);
    setCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function handleCropApply(blob: Blob) {
    const token = getToken();
    const form = new FormData();
    form.append("file", new File([blob], "avatar.jpg", { type: blob.type }));
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json() as { ok: boolean; error?: string };
    if (json.ok) {
      setAvatarKey(k => k + 1);
      setCropFile(null);
      toast({ title: "Avatar updated" });
    } else {
      toast({ title: json.error ?? "Failed to upload avatar", variant: "destructive" });
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUploading(true);
    try {
      const token = getToken();
      await fetch("/api/avatar", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setAvatarKey(k => k + 1);
      toast({ title: "Avatar removed" });
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) return;
    setResendingVerification(true);
    try {
      const token = getToken();
      await fetch("/api/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      toast({ title: "Verification email sent" });
    } catch {
      toast({ title: "Could not send verification email", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  }

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
    await runWithTwoFA(async (verification) => {
      setSetupLoading(true);
      try {
        const token = getToken();
        const res = await fetch("/api/me/totp/enable", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            secret: pendingSecret,
            code: setupCode,
            totpCode: verification.totpCode,
            challengeId: verification.challengeId,
            webauthnResponse: verification.webauthnResponse,
          }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (json.ok) {
          setTotpEnabled(true);
          setSetupStep("idle");
          setPendingSecret(null);
          setPendingUri(null);
          setSetupCode("");
          toast({ title: "Two-factor authentication enabled" });
          return undefined;
        }
        return json.error === "invalid_totp" ? "Invalid authenticator code." : "Invalid code. Please try again.";
      } catch {
        return "Could not connect to the server.";
      } finally {
        setSetupLoading(false);
      }
    });
  }

  async function handleViewBackupCodes() {
    await runWithTwoFA(async (verification) => {
      setBackupCodesLoading(true);
      try {
        const token = getToken();
        const res = await fetch("/api/me/totp/backup-codes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(verification),
        });
        const json = await res.json() as { ok: boolean; data?: { codes: string[] }; error?: string };
        if (json.ok && json.data) {
          setBackupCodes(json.data.codes);
          setBackupCodesOpen(true);
          return undefined;
        }
        return json.error === "invalid_totp" ? "Invalid authenticator code." : "Failed to generate backup codes.";
      } catch {
        return "Could not connect to the server.";
      } finally {
        setBackupCodesLoading(false);
      }
    });
  }

  async function handleDisableTOTP() {
    await runWithTwoFA(async ({ totpCode, challengeId, webauthnResponse }) => {
      const token = getToken();
      const res = await fetch("/api/me/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ totpCode, challengeId, webauthnResponse }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setTotpEnabled(false);
        toast({ title: "Two-factor authentication disabled" });
        return undefined;
      }
      return "Invalid code. Please try again.";
    });
  }

  async function handleRegisterKey(e: React.FormEvent) {
    e.preventDefault();
    await runWithTwoFA(async (verification) => {
      setRegisterLoading(true);
      try {
        const token = getToken();
        const startRes = await fetch("/api/me/webauthn/register/start", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });
        const startJson = await startRes.json() as {
          ok: boolean;
          data?: { options: Record<string, unknown>; challengeId: string };
        };
        if (!startJson.ok || !startJson.data) {
          return "Failed to start security key registration.";
        }

        const { options, challengeId: registerChallengeId } = startJson.data;
        let credential;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          credential = await startRegistration(options as any);
        } catch {
          return "Security key registration was cancelled or failed.";
        }

        const finishRes = await fetch("/api/me/webauthn/register/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            challengeId: registerChallengeId,
            response: credential,
            name: newKeyName.trim() || "Security Key",
            totpCode: verification.totpCode,
            challengeId2fa: verification.challengeId,
            webauthnResponse: verification.webauthnResponse,
          }),
        });
        const finishJson = await finishRes.json() as { ok: boolean; error?: string };
        if (finishJson.ok) {
          // Reload credentials list
          const listRes = await fetch("/api/me/webauthn/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({}),
          });
          const listJson = await listRes.json() as {
            ok: boolean;
            data?: { credentials: WebAuthnCredential[] };
          };
          if (listJson.ok && listJson.data) setWebauthnCredentials(listJson.data.credentials);
          setAddingKey(false);
          setNewKeyName("");
          toast({ title: "Security key added" });
        } else {
          return finishJson.error ?? "Failed to register security key.";
        }
      } catch {
        return "Could not connect to the server.";
      } finally {
        setRegisterLoading(false);
      }
    });
  }

  async function handleDeleteKey(credentialId: string) {
    setProcessingKeyId(credentialId);
    await runWithTwoFA(async (verification) => {
      const token = getToken();
      const res = await fetch("/api/me/webauthn/credentials/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ credentialId, ...verification }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (json.ok) {
        setWebauthnCredentials(prev => prev.filter(c => c.id !== credentialId));
        toast({ title: "Security key removed" });
        return undefined;
      }
      if (json.error === "invalid_totp") return "Invalid code. Please try again.";
      return "Failed to remove security key.";
    });
    setProcessingKeyId(null);
  }

  function resetPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || newPassword !== confirmPassword) return;
    if (zxcvbn(newPassword).score < 3) return;
    await runWithTwoFA(async (verification) => {
      setPasswordSaving(true);
      try {
        const token = getToken();
        const res = await fetch("/api/me/password", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            totpCode: verification.totpCode,
            challengeId: verification.challengeId,
            webauthnResponse: verification.webauthnResponse,
          }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (json.ok) {
          resetPasswordDialog();
          setChangePasswordOpen(false);
          toast({ title: "Password changed" });
          return undefined;
        }
        if (json.error === "invalid_totp") return "Invalid authenticator code.";
        if (json.error === "password_too_weak") {
          toast({ title: "New password is too weak", variant: "destructive" });
          return undefined;
        }
        toast({ title: "Current password is incorrect", variant: "destructive" });
        return undefined;
      } catch {
        return "Could not connect to the server.";
      } finally {
        setPasswordSaving(false);
      }
    });
  }

  function handleCancelSetup() {
    setSetupStep("idle");
    setPendingSecret(null);
    setPendingUri(null);
    setSetupCode("");
  }

  const twoFactorProtected = totpEnabled || webauthnCredentials.length > 0;

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

            {userId && (
              <div className="mt-4">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Popover open={avatarPopoverOpen} onOpenChange={setAvatarPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <UserAvatar userId={userId} name={name || "?"} className="size-24 text-2xl" cacheBust={avatarKey} />
                      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        {avatarUploading
                          ? <Loader2 className="size-6 text-white animate-spin" />
                          : <Camera className="size-6 text-white" />}
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="start">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      Upload photo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-destructive hover:text-destructive"
                      disabled={avatarUploading}
                      onClick={handleRemoveAvatar}
                    >
                      Remove photo
                    </Button>
                  </PopoverContent>
                </Popover>

                {cropFile && (
                  <AvatarCropDialog
                    file={cropFile}
                    onApply={handleCropApply}
                    onClose={() => setCropFile(null)}
                  />
                )}
              </div>
            )}

            <form onSubmit={handleSaveName} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input id="email" value={email} disabled className="flex-1" />
                  {emailVerified === true && emailVerificationEnabled && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex shrink-0 focus:outline-none">
                          <CheckCircle2 className="size-4 text-green-500" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="w-auto px-3 py-1.5 text-xs">
                        Email verified
                      </PopoverContent>
                    </Popover>
                  )}
                  {emailVerified === false && emailVerificationEnabled && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex shrink-0 focus:outline-none">
                          <AlertCircle className="size-4 text-amber-500" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="w-auto px-3 py-1.5 text-xs">
                        Email not verified
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {emailVerified === false && emailVerificationEnabled && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="w-fit px-0 h-auto text-xs"
                    onClick={handleResendVerification}
                    disabled={resendingVerification}
                  >
                    {resendingVerification ? "Sending…" : "Resend verification email"}
                  </Button>
                )}
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
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              Security
              {!totpLoading && !webauthnLoading && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="inline-flex cursor-default focus:outline-none">
                      {twoFactorProtected
                        ? <LockKeyhole className="size-3.5 text-green-500" />
                        : <LockOpen className="size-3.5 text-red-500" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" className="w-auto px-3 py-1.5 text-xs">
                    {twoFactorProtected ? "2FA is Enabled" : "2FA is Disabled"}
                  </PopoverContent>
                </Popover>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Manage your account security settings.</p>

            {/* TOTP subsection */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                Authenticator app
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
                      {totpEnabled ? "Authenticator app enabled" : "Authenticator app not set up"}
                    </PopoverContent>
                  </Popover>
                )}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Use a TOTP authenticator app (Google Authenticator, Authy, 1Password, etc.) as a second factor.
              </p>
            </div>

            {totpLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : totpEnabled ? (
              <div className="mt-3 flex gap-2 flex-wrap">
                <Button variant="outline" onClick={handleViewBackupCodes} disabled={twoFABusy || backupCodesLoading}>
                  {backupCodesLoading ? "Loading…" : "View Backup Codes"}
                </Button>
                <Button variant="outline" onClick={handleDisableTOTP} disabled={twoFABusy}>
                  Disable authenticator app
                </Button>
              </div>
            ) : setupStep === "idle" ? (
              <div className="mt-3">
                <Button onClick={handleSetupStart} disabled={setupLoading}>
                  {setupLoading ? "Loading…" : "Set up authenticator app"}
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
                    <Label>Enter the 6-digit code from your app</Label>
                    <InputOTP
                      maxLength={6}
                      value={setupCode}
                      onChange={setSetupCode}
                      autoComplete="one-time-code"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
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

            {/* WebAuthn subsection */}
            <div className="mt-6 pt-5 border-t">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                Passkeys / Security keys
                {!webauthnLoading && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="inline-flex cursor-default focus:outline-none">
                        {webauthnCredentials.length > 0
                          ? <LockKeyhole className="size-3.5 text-green-500" />
                          : <LockOpen className="size-3.5 text-red-500" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-auto px-3 py-1.5 text-xs">
                      {webauthnCredentials.length > 0 ? "Passkey / security key registered" : "No passkeys registered"}
                    </PopoverContent>
                  </Popover>
                )}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Use a hardware security key (YubiKey, etc.) or platform passkey as a second factor.
              </p>

              {webauthnLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {webauthnCredentials.length > 0 && (
                    <ul className="flex flex-col gap-2 max-w-sm">
                      {webauthnCredentials.map(cred => {
                        const isProcessing = processingKeyId === cred.id;
                        return (
                          <li key={cred.id} className="rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Key className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate font-medium">{cred.name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {new Date(cred.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                                </span>
                              </div>
                              {isProcessing ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteKey(cred.id)}
                                  disabled={processingKeyId !== null || twoFABusy}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {addingKey ? (
                    <form onSubmit={handleRegisterKey} className="flex flex-col gap-3 max-w-sm">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="key-name">Key name (optional)</Label>
                        <Input
                          id="key-name"
                          value={newKeyName}
                          onChange={e => setNewKeyName(e.target.value)}
                          placeholder="Security Key"
                          maxLength={64}
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" disabled={registerLoading}>
                          {registerLoading ? "Follow the browser prompt…" : "Register key"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { setAddingKey(false); setNewKeyName(""); }}
                          disabled={registerLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      onClick={() => setAddingKey(true)}
                    >
                      Add security key
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Change password subsection */}
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
                      zxcvbn(newPassword).score < 3
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

      <Dialog open={backupCodesOpen} onOpenChange={setBackupCodesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backup Codes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use these codes if your TOTP device is lost. Each code can only be used once. Generating new codes invalidates all previous ones.
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {backupCodes.map(code => (
              <code key={code} className="font-mono text-sm bg-muted rounded px-2 py-1 text-center select-all">
                {code}
              </code>
            ))}
          </div>
          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join("\n"));
                toast({ title: "Backup codes copied" });
              }}
            >
              <Copy className="size-3.5 mr-1.5" />
              Copy All
            </Button>
            <Button type="button" onClick={() => setBackupCodesOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {twoFADialog}
    </div>
  );
}
