import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { type AdminUser, searchUsers, updateUserModeration, forceUserPasswordChange, exportUserData } from "@/lib/api";
import { cn } from "@/lib/utils";

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

interface UserRowProps {
  user: AdminUser;
  onUpdated: (id: string, updates: Partial<AdminUser>) => void;
}

function UserRow({ user, onUpdated }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcingPasswordChange, setForcingPasswordChange] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  async function handleForcePasswordChange() {
    setForcingPasswordChange(true);
    try {
      await forceUserPasswordChange(user.id);
      onUpdated(user.id, { force_password_change: 1 });
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
