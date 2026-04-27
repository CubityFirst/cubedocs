import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, ChevronRight, Download, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  type AdminUser,
  type AdminUserDetails,
  deleteUserAvatar,
  exportUserData,
  forceUserPasswordChange,
  getUserDetails,
  searchUsers,
  updateUserModeration,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

type ModerationState =
  | { kind: "active" }
  | { kind: "disabled" }
  | { kind: "suspended"; until: number };

type DisableMode = "indefinitely" | "until";

function getModerationState(moderation: number): ModerationState {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (moderation === -1) return { kind: "disabled" };
  if (moderation > 0 && nowSeconds < moderation) return { kind: "suspended", until: moderation };
  return { kind: "active" };
}

function formatModerationUntil(until: number): string {
  return new Date(until * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatModerationAction(action: AdminUser["latest_moderation_action"]): string {
  if (action === "disabled") return "Disabled";
  if (action === "suspended") return "Suspended";
  if (action === "re_enabled") return "Re-enabled";
  return "Unknown";
}

function createDefaultDisableDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function formatTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function mergeDateAndTime(date: Date, timeValue: string): Date {
  const [hours, minutes] = timeValue.split(":").map(part => Number.parseInt(part, 10));
  const merged = new Date(date);
  merged.setHours(hours || 0, minutes || 0, 0, 0);
  return merged;
}

function latestModerationSummary(user: AdminUser): string | null {
  if (!user.latest_moderation_action || !user.latest_moderation_created_at) return null;
  const when = new Date(user.latest_moderation_created_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatModerationAction(user.latest_moderation_action)} on ${when}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: "active" | "disabled" | "suspended" }) {
  if (status === "disabled") return <Badge variant="destructive">Disabled</Badge>;
  if (status === "suspended") return <Badge variant="secondary">Suspended</Badge>;
  return <Badge variant="default">Active</Badge>;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function DetailsLoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle><Skeleton className="h-4 w-28" /></CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-4 w-36" /></CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function UserDetailsPanel({ details }: { details: AdminUserDetails }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DetailField label="Status" value={<StatusBadge status={details.profile.account_status} />} />
            <DetailField label="User ID" value={<span className="font-mono text-xs">{details.profile.id}</span>} />
            <DetailField label="Email" value={<span className="font-mono text-xs">{details.profile.email}</span>} />
            <DetailField label="Created" value={formatDateTime(details.profile.account_created_at)} />
            {details.profile.account_status === "suspended" && details.profile.account_suspended_until && (
              <DetailField
                label="Suspended Until"
                value={formatModerationUntil(details.profile.account_suspended_until)}
              />
            )}
            <DetailField
              label="Password Reset"
              value={details.profile.force_password_change ? "Required on next sign in" : "Not required"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DetailField
              label="TOTP"
              value={details.security.totp_enabled ? <Badge variant="default">Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}
            />
            <DetailField
              label="Passkeys"
              value={`${details.security.passkeys.length} registered`}
            />
            <DetailField
              label="Backup Codes"
              value={`${details.security.backup_codes.active} active of ${details.security.backup_codes.total}`}
            />
            <DetailField
              label="Used Backup Codes"
              value={String(details.security.backup_codes.used)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {details.security.passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passkeys registered.</p>
          ) : (
            details.security.passkeys.map(passkey => (
              <div key={passkey.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{passkey.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(passkey.registered_at)}</p>
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">{passkey.id}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation History</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DetailField
            label="Current Reason"
            value={details.moderation.current_reason ?? "No active moderation reason"}
          />
          {details.moderation.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation events recorded.</p>
          ) : (
            details.moderation.history.map((event, index) => (
              <div key={`${event.created_at}-${index}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.action === "disabled" ? "destructive" : event.action === "suspended" ? "secondary" : "outline"}>
                      {formatModerationAction(event.action)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {event.actor_email ?? event.actor_user_id ?? "System"}
                  </span>
                </div>
                {event.reason && <p className="mt-2 text-sm">{event.reason}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Stored moderation value: {event.moderation_value}
                  {event.moderation_value > 0 ? ` (${formatModerationUntil(event.moderation_value)})` : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Owned Projects</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {details.projects.owned_projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">This user does not own any projects.</p>
            ) : (
              details.projects.owned_projects.map(project => (
                <div key={project.id} className="rounded-lg border p-3">
                  <p className="font-medium">{project.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{project.id}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Created {formatDateTime(project.created_at)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Memberships</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {details.projects.project_memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">This user has no project memberships.</p>
            ) : (
              details.projects.project_memberships.map(membership => (
                <div key={`${membership.project_id}-${membership.role}`} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{membership.project_name}</p>
                    <Badge variant="outline">{membership.role}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{membership.project_id}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Joined {formatDateTime(membership.joined_at)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface UserRowProps {
  user: AdminUser;
  onUpdated: (id: string, updates: Partial<AdminUser>) => void;
}

function UserRow({ user, onUpdated }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcingPasswordChange, setForcingPasswordChange] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [disableMode, setDisableMode] = useState<DisableMode>("indefinitely");
  const [disableDate, setDisableDate] = useState<Date | undefined>(() => createDefaultDisableDate());
  const [disableTime, setDisableTime] = useState(() => formatTimeInput(createDefaultDisableDate()));
  const [disableReason, setDisableReason] = useState("");
  const moderationState = getModerationState(user.moderation);
  const isReasonRequired = disableMode === "indefinitely" || disableMode === "until";
  const canSubmitDisable = !pending && disableReason.trim().length > 0;

  function resetDisableForm() {
    const nextDate = createDefaultDisableDate();
    setDatePickerOpen(false);
    setDisableMode("indefinitely");
    setDisableDate(nextDate);
    setDisableTime(formatTimeInput(nextDate));
    setDisableReason("");
  }

  function handleDisableDialogChange(open: boolean) {
    setDisableDialogOpen(open);
    if (!open) resetDisableForm();
  }

  function handleDisableDateSelect(date: Date | undefined) {
    setDisableDate(date);
    if (date) setDatePickerOpen(false);
  }

  async function loadDetails(force = false, showError = true) {
    if (detailsLoading) return;
    if (!force && details) return;

    setDetailsLoading(true);
    try {
      setDetails(await getUserDetails(user.id));
    } catch {
      if (showError) toast.error("Failed to load user details");
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleDetailsOpenChange(open: boolean) {
    setDetailsOpen(open);
    if (open) void loadDetails();
  }

  async function handleForcePasswordChange() {
    setForcingPasswordChange(true);
    try {
      await forceUserPasswordChange(user.id);
      onUpdated(user.id, { force_password_change: 1 });
      if (detailsOpen || details) void loadDetails(true, false);
      toast.success(`${user.name} will be required to change their password on next sign in`);
    } catch {
      toast.error("Failed to force password change");
    } finally {
      setForcingPasswordChange(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportUserData(user.id, user.email);
      toast.success("Data export downloaded");
    } catch {
      toast.error("Failed to export user data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAvatar() {
    setDeletingAvatar(true);
    try {
      await deleteUserAvatar(user.id);
      setAvatarCacheBust(v => v + 1);
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to delete avatar");
    } finally {
      setDeletingAvatar(false);
    }
  }

  async function handleEnableAccount() {
    setPending(true);
    try {
      await updateUserModeration(user.id, 0);
      onUpdated(user.id, {
        moderation: 0,
        latest_moderation_action: "re_enabled",
        latest_moderation_reason: null,
        latest_moderation_created_at: new Date().toISOString(),
      });
      if (detailsOpen || details) void loadDetails(true, false);
      toast.success("Account re-enabled");
    } catch {
      toast.error("Failed to update user");
    } finally {
      setPending(false);
    }
  }

  async function handleDisableAccount() {
    const trimmedReason = disableReason.trim();
    if (!trimmedReason) {
      toast.error("Enter a moderation reason");
      return;
    }

    let moderation = -1;

    if (disableMode === "until") {
      if (!disableDate) {
        toast.error("Choose a date before disabling the account");
        return;
      }

      const disableUntil = mergeDateAndTime(disableDate, disableTime);
      if (Number.isNaN(disableUntil.getTime()) || disableUntil.getTime() <= Date.now()) {
        toast.error("Choose a future date and time");
        return;
      }

      moderation = Math.floor(disableUntil.getTime() / 1000);
    }

    setPending(true);
    try {
      await updateUserModeration(user.id, moderation, trimmedReason);
      onUpdated(user.id, {
        moderation,
        latest_moderation_action: moderation === -1 ? "disabled" : "suspended",
        latest_moderation_reason: trimmedReason,
        latest_moderation_created_at: new Date().toISOString(),
      });
      if (detailsOpen || details) void loadDetails(true, false);
      toast.success(
        moderation === -1
          ? "Account disabled indefinitely"
          : `Account disabled until ${formatModerationUntil(moderation)}`,
      );
      handleDisableDialogChange(false);
    } catch {
      toast.error("Failed to update user");
    } finally {
      setPending(false);
    }
  }

  const latestSummary = latestModerationSummary(user);
  const currentReason = moderationState.kind === "active" ? null : user.latest_moderation_reason;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <TableCell className="w-8 pr-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-xs">{user.email}</TableCell>
        <TableCell>{user.name}</TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {new Date(user.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell>
          {moderationState.kind === "disabled"
            ? <Badge variant="destructive">Disabled</Badge>
            : moderationState.kind === "suspended"
              ? <Badge variant="secondary">Suspended</Badge>
              : <Badge variant="default">Active</Badge>}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-transparent">
          <TableCell colSpan={5} className="py-3 pl-10 pr-6">
            <div className="flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              {moderationState.kind === "suspended" && (
                <p className="text-xs text-muted-foreground">
                  This account will be re-enabled automatically on {formatModerationUntil(moderationState.until)}.
                </p>
              )}

              {currentReason && (
                <p className="text-sm">
                  <span className="font-medium">Current moderation reason:</span> {currentReason}
                </p>
              )}

              {!currentReason && latestSummary && (
                <p className="text-xs text-muted-foreground">
                  Last moderation event: {latestSummary}
                  {user.latest_moderation_reason ? ` - ${user.latest_moderation_reason}` : ""}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="secondary">
                      User details
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="max-w-3xl">
                    <SheetHeader>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-12">
                          <AvatarImage
                            src={`/api/avatar/${user.id}?v=${avatarCacheBust}`}
                            alt={user.name}
                          />
                          <AvatarFallback>{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <SheetTitle>{user.name}</SheetTitle>
                          <SheetDescription>{user.email}</SheetDescription>
                        </div>
                      </div>
                    </SheetHeader>
                    <SheetBody>
                      {detailsLoading && !details
                        ? <DetailsLoadingState />
                        : details
                          ? <UserDetailsPanel details={details} />
                          : <p className="text-sm text-muted-foreground">User details could not be loaded.</p>}
                    </SheetBody>
                    <SheetFooter className="flex flex-row justify-end gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="outline" disabled={deletingAvatar} className="mr-auto">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete avatar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete avatar?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the avatar for <strong>{user.name}</strong>.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAvatar}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button type="button" variant="outline" disabled={detailsLoading} onClick={() => { setAvatarCacheBust(v => v + 1); void loadDetails(true); }}>
                        Refresh details
                      </Button>
                      <Button type="button" variant="outline" disabled={exporting} onClick={handleExport}>
                        <Download className="h-3.5 w-3.5" />
                        Export data
                      </Button>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>

                <Button size="sm" variant="outline" disabled={exporting} onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  Export data
                </Button>

                {user.force_password_change ? (
                  <Badge variant="outline" className="text-xs">Password change pending</Badge>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" disabled={forcingPasswordChange}>
                        Force password change
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Force password change?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <strong>{user.email}</strong> will be required to set a new password the next time they sign in.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleForcePasswordChange}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {moderationState.kind === "active" ? (
                  <Dialog open={disableDialogOpen} onOpenChange={handleDisableDialogChange}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={pending}>
                        Disable account
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Disable account?</DialogTitle>
                        <DialogDescription>
                          This will prevent <strong>{user.email}</strong> from logging in until the selected time,
                          or until an administrator manually re-enables the account.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex flex-col gap-4">
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            checked={disableMode === "indefinitely"}
                            onCheckedChange={() => setDisableMode("indefinitely")}
                          />
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Indefinitely</span>
                            <span className="text-sm text-muted-foreground">
                              Keep the account disabled until an administrator re-enables it.
                            </span>
                          </div>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            checked={disableMode === "until"}
                            onCheckedChange={() => setDisableMode("until")}
                          />
                          <div className="flex w-full flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">Until X time</span>
                              <span className="text-sm text-muted-foreground">
                                Re-enable the account automatically at a specific date and time.
                              </span>
                            </div>

                            {disableMode === "until" && (
                              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
                                <div className="flex flex-col gap-2">
                                  <Label>Date</Label>
                                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                          "w-full justify-start text-left font-normal",
                                          !disableDate && "text-muted-foreground",
                                        )}
                                      >
                                        <CalendarDays className="h-4 w-4" />
                                        {disableDate ? format(disableDate, "PPP") : "Pick a date"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={disableDate}
                                        onSelect={handleDisableDateSelect}
                                        disabled={(date) => {
                                          const today = new Date();
                                          today.setHours(0, 0, 0, 0);
                                          return date < today;
                                        }}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>

                                <div className="flex flex-col gap-2">
                                  <Label htmlFor={`disable-time-${user.id}`}>Time</Label>
                                  <Input
                                    id={`disable-time-${user.id}`}
                                    type="time"
                                    value={disableTime}
                                    onChange={e => setDisableTime(e.target.value)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </label>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`disable-reason-${user.id}`}>
                            Moderation reason
                          </Label>
                          <Textarea
                            id={`disable-reason-${user.id}`}
                            value={disableReason}
                            onChange={e => setDisableReason(e.target.value)}
                            placeholder="Explain why this account is being disabled or suspended."
                            required={isReasonRequired}
                          />
                          <p className="text-xs text-muted-foreground">
                            This reason is stored in admin moderation history and included in user export data.
                          </p>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleDisableDialogChange(false)} disabled={pending}>
                          Cancel
                        </Button>
                        <Button type="button" variant="destructive" onClick={handleDisableAccount} disabled={!canSubmitDisable}>
                          Disable
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={handleEnableAccount}>
                    Re-enable account
                  </Button>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    try {
      const results = await searchUsers(query);
      setUsers(results);
    } catch {
      toast.error("Failed to search users");
    } finally {
      setLoading(false);
    }
  }

  function handleUpdated(id: string, updates: Partial<AdminUser>) {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...updates } : u)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search and moderate user accounts.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative max-w-sm w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Email or user ID..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && searched && (
        <Card>
          <CardContent className="pt-5">
            {users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <UserRow key={user.id} user={user} onUpdated={handleUpdated} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
