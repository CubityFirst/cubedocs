import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import zxcvbn from "zxcvbn";
import QRCode from "react-qr-code";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { use2FA } from "@/hooks/use2FA";
import { getToken, clearToken } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { InlineSaveControls } from "@/components/InlineSaveControls";
import { LockOpen, LockKeyhole, Key, Trash2, Loader2, Copy, CheckCircle2, AlertCircle, Camera, Smartphone, Tablet, Laptop, Monitor, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TIMEZONE_GROUPS, detectTimezoneGroup, getTimezoneGroup, formatTimezoneLabel, formatTimeInZone } from "@/lib/timezone";

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-blue-500",
  "bg-green-500",
];

interface WebAuthnCredential {
  id: string;
  name: string;
  created_at: string;
}

type DeviceKind = "phone" | "tablet" | "laptop" | "desktop";

interface ActiveSession {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  deviceKind: DeviceKind | null;
  clientLabel: string | null;
  ip: string | null;
  current: boolean;
}

function DeviceIcon({ kind }: { kind: DeviceKind | null }) {
  const Icon = kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : kind === "laptop" ? Laptop : Monitor;
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-5" aria-label={kind ?? "device"} />
    </div>
  );
}

function formatRelative(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}

export function UserSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    // Defer to next frame so the section has rendered before we scroll.
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [saving, setSaving] = useState(false);

  const [timezone, setTimezone] = useState<string | null>(null);
  const [timezonePrivate, setTimezonePrivate] = useState(false);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneSaved, setTimezoneSaved] = useState(false);

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

  // Delete account state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [ownedSitesOpen, setOwnedSitesOpen] = useState(false);
  const [ownedSites, setOwnedSites] = useState<Array<{ id: string; name: string }>>([]);

  // Change password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Active sessions state
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionRevokingId, setSessionRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const { runWithTwoFA, twoFADialog, busy: twoFABusy } = use2FA({
    totp: totpEnabled,
    webauthn: webauthnCredentials.length > 0,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { name: string; email: string; emailVerified: boolean; emailVerificationEnabled: boolean; userId: string; timezone: string | null } }>)
      .then(json => {
        if (json.ok && json.data) {
          setCurrentName(json.data.name);
          setName(json.data.name);
          setEmail(json.data.email);
          setEmailVerified(json.data.emailVerified);
          setEmailVerificationEnabled(json.data.emailVerificationEnabled);
          setUserId(json.data.userId);
          setTimezone(json.data.timezone);
          setTimezonePrivate(json.data.timezone === null);
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

    fetch("/api/me/sessions", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { sessions: ActiveSession[] } }>)
      .then(json => {
        if (json.ok && json.data) setSessions(json.data.sessions);
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
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

  async function saveTimezone(newTimezone: string | null) {
    setTimezoneSaving(true);
    setTimezoneSaved(false);
    try {
      const token = getToken();
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timezone: newTimezone }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setTimezoneSaved(true);
        setTimeout(() => setTimezoneSaved(false), 2000);
      } else {
        toast({ title: "Failed to update timezone", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server", variant: "destructive" });
    } finally {
      setTimezoneSaving(false);
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

  async function handleRevokeSession(id: string) {
    setSessionRevokingId(id);
    try {
      const token = getToken();
      const res = await fetch("/api/me/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: id }),
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        toast({ title: "Session revoked" });
      } else {
        toast({ title: "Could not revoke session", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not revoke session", variant: "destructive" });
    } finally {
      setSessionRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    try {
      const token = getToken();
      const res = await fetch("/api/me/sessions/revoke-others", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.current));
        toast({ title: "Other sessions revoked" });
      } else {
        toast({ title: "Could not revoke sessions", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not revoke sessions", variant: "destructive" });
    } finally {
      setRevokingOthers(false);
    }
  }

  async function handleDeleteButtonClick() {
    const token = getToken();
    try {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { ok: boolean; data?: Array<{ id: string; name: string; role: string }> };
      const owned = (json.data ?? []).filter(p => p.role === "owner").map(p => ({ id: p.id, name: p.name }));
      if (owned.length > 0) {
        setOwnedSites(owned);
        setOwnedSitesOpen(true);
        return;
      }
    } catch {
      // fall through to confirmation if we can't check
    }
    setDeleteAccountOpen(true);
  }

  async function handleDeleteAccount() {
    setDeleteAccountOpen(false);
    await runWithTwoFA(async (verification) => {
      setDeletingAccount(true);
      try {
        const token = getToken();
        const res = await fetch("/api/me", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(verification),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (json.ok) {
          clearToken();
          navigate("/login");
          return undefined;
        }
        if (json.error === "invalid_totp") return "Invalid authenticator code.";
        if (json.error === "invalid_backup_code") return "Invalid backup code.";
        return "Failed to delete account. Please try again.";
      } catch {
        return "Could not connect to the server.";
      } finally {
        setDeletingAccount(false);
      }
    });
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
            <a href="#danger" className="py-1 text-sm text-destructive/70 transition-colors hover:text-destructive">Danger Zone</a>
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
              <div className="flex items-center gap-5">
                {userId && (
                  <>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <Popover open={avatarPopoverOpen} onOpenChange={setAvatarPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0">
                          <UserAvatar userId={userId} name={name || "?"} className="size-32 text-3xl" cacheBust={avatarKey} />
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
                          <Upload className="size-3.5 mr-2" />
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
                          <Trash2 className="size-3.5 mr-2" />
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
                  </>
                )}

                <div className="flex flex-col gap-3 min-w-0 max-w-xs flex-1">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="flex items-center gap-2">
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
                    <div className="flex items-center">
                      <InlineSaveControls
                        changed={name !== currentName}
                        saving={saving}
                        onReset={() => setName(currentName)}
                        saveDisabled={!name.trim() || name.trim() === currentName}
                        resetLabel="Reset display name"
                        saveLabel="Save display name"
                      >
                        <Input
                          id="display-name"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="flex-1 pr-9"
                          required
                        />
                      </InlineSaveControls>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  {timezoneSaving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                  {!timezoneSaving && timezoneSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                </div>
                <div className="flex items-center gap-2 max-w-sm">
                  <Select
                    value={timezonePrivate ? "" : (timezone ?? "")}
                    onValueChange={async val => {
                      const iana = val || null;
                      setTimezone(iana);
                      setTimezonePrivate(false);
                      await saveTimezone(iana);
                    }}
                    disabled={timezonePrivate || timezoneSaving}
                  >
                    <SelectTrigger id="timezone" className="flex-1">
                      <SelectValue placeholder="Select timezone…">
                        {!timezonePrivate && timezone && (() => {
                          const g = getTimezoneGroup(timezone);
                          return g ? formatTimezoneLabel(g) : timezone;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {TIMEZONE_GROUPS.map(g => (
                        <SelectItem key={g.iana} value={g.iana}>{formatTimezoneLabel(g)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={timezonePrivate || timezoneSaving}
                    onClick={async () => {
                      const g = detectTimezoneGroup();
                      if (g) {
                        setTimezone(g.iana);
                        setTimezonePrivate(false);
                        await saveTimezone(g.iana);
                      }
                    }}
                  >
                    Auto-detect
                  </Button>
                </div>
                {!timezonePrivate && timezone && (() => {
                  const g = getTimezoneGroup(timezone);
                  return (
                    <p className="text-xs text-muted-foreground">
                      Currently {formatTimeInZone(timezone)} — {g?.offset ?? timezone}
                    </p>
                  );
                })()}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tz-private"
                    checked={timezonePrivate}
                    disabled={timezoneSaving}
                    onCheckedChange={async checked => {
                      if (checked) {
                        setTimezonePrivate(true);
                        setTimezone(null);
                        await saveTimezone(null);
                      } else {
                        const g = detectTimezoneGroup();
                        if (g) {
                          setTimezone(g.iana);
                          setTimezonePrivate(false);
                          await saveTimezone(g.iana);
                        } else {
                          setTimezonePrivate(false);
                        }
                      }
                    }}
                  />
                  <Label htmlFor="tz-private" className="font-normal text-sm cursor-pointer">
                    Do not share my timezone
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">When enabled, your timezone won't appear on your profile card.</p>
              </div>
            </div>
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
                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDisableTOTP}
                  disabled={twoFABusy}
                >
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
                                  className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
          </section>

          <Separator className="my-6" />

          {/* Active sessions */}
          <section id="sessions">
            <h2 className="text-base font-semibold">Active sessions</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Devices currently signed in to your account. Revoke any you don&apos;t recognize.
            </p>

            {sessionsLoading ? (
              <div className="mt-4 flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No active sessions.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {sessions.map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <DeviceIcon kind={s.deviceKind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{s.clientLabel ?? "Unknown device"}</p>
                          {s.current && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                              This device
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.ip ? `${s.ip} · ` : ""}signed in {formatRelative(s.createdAt)}
                        </p>
                      </div>
                    </div>
                    {!s.current && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sessionRevokingId === s.id}
                        onClick={() => handleRevokeSession(s.id)}
                      >
                        {sessionRevokingId === s.id ? "Revoking…" : "Revoke"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {sessions.some(s => !s.current) && (
              <Button
                variant="outline"
                className="mt-4"
                disabled={revokingOthers}
                onClick={handleRevokeOthers}
              >
                {revokingOthers ? "Revoking…" : "Revoke all other sessions"}
              </Button>
            )}
          </section>

          <Separator className="my-6" />

          {/* Danger zone */}
          <section id="danger">
            <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Permanently delete your account. You must transfer or delete any sites you own first.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              disabled={deletingAccount || twoFABusy}
              onClick={handleDeleteButtonClick}
            >
              {deletingAccount ? "Deleting…" : "Delete account"}
            </Button>
          </section>

          <AlertDialog open={ownedSitesOpen} onOpenChange={setOwnedSitesOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer or delete your sites first</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <p>You own the following {ownedSites.length === 1 ? "site" : "sites"} and cannot delete your account until you transfer ownership or delete {ownedSites.length === 1 ? "it" : "them"}:</p>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {ownedSites.map(site => (
                        <li key={site.id}>
                          <Link
                            to={`/projects/${site.id}`}
                            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
                            onClick={() => setOwnedSitesOpen(false)}
                          >
                            {site.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => setOwnedSitesOpen(false)}>OK</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteAccount}
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={changePasswordOpen} onOpenChange={open => { if (!open) resetPasswordDialog(); setChangePasswordOpen(open); }}>
              <DialogContent hideClose>
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
                    {newPassword && (() => {
                      const score = zxcvbn(newPassword).score;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-1">
                            {[0, 1, 2, 3, 4].map(i => (
                              <div
                                key={i}
                                className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : "bg-muted"}`}
                              />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">{STRENGTH_LABELS[score]}</p>
                        </div>
                      );
                    })()}
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
                  <Button variant="outline" type="button" onClick={() => { resetPasswordDialog(); setChangePasswordOpen(false); }} className="mr-auto">
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
