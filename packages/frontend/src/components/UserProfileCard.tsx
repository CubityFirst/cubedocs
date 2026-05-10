import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/UserAvatar";
import { getToken, clearToken } from "@/lib/auth";
import { CalendarDays, Building2, Clock, Settings, KeyRound, LogOut, ChevronRight, Sparkles } from "lucide-react";
import { formatTimeInZone, getTimezoneGroup } from "@/lib/timezone";
import { TimezoneMap } from "@/components/TimezoneMap";

let currentUserIdCache: string | null = null;
let currentUserIdPromise: Promise<string | null> | null = null;
function getCurrentUserId(): Promise<string | null> {
  if (currentUserIdCache !== null) return Promise.resolve(currentUserIdCache);
  if (currentUserIdPromise) return currentUserIdPromise;
  const token = getToken();
  currentUserIdPromise = fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json() as Promise<{ ok: boolean; data?: { userId: string } }>)
    .then(json => {
      if (json.ok && json.data) {
        currentUserIdCache = json.data.userId;
        return currentUserIdCache;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => { currentUserIdPromise = null; });
  return currentUserIdPromise;
}

type Role = "limited" | "viewer" | "editor" | "admin" | "owner";

const ROLE_COLORS: Record<Role, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  editor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  viewer: "bg-muted text-muted-foreground",
  limited: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  limited: "Limited",
};

interface SharedProject {
  id: string;
  name: string;
  theirRole: Role;
}

interface ProfileData {
  userId: string;
  name: string;
  createdAt: string;
  timezone?: string;
  sharedProjects: SharedProject[];
  personalPlan?: "free" | "ink";
  personalPlanSince?: number | null;
}

interface UserProfileCardProps {
  userId: string;
  name: string;
  children: React.ReactNode;
}

export function UserProfileCard({ userId, name, children }: UserProfileCardProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSelf, setIsSelf] = useState<boolean>(currentUserIdCache === userId);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || profile) return;
    setLoading(true);
    const token = getToken();
    fetch(`/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: ProfileData }) => {
        if (json.ok && json.data) setProfile(json.data);
      })
      .finally(() => setLoading(false));
  }, [open, userId, profile]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCurrentUserId().then(id => { if (!cancelled) setIsSelf(id === userId); });
    return () => { cancelled = true; };
  }, [open, userId]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden" onContextMenu={e => e.stopPropagation()}>
        <DialogTitle className="sr-only">{name}'s profile</DialogTitle>
        <DialogDescription className="sr-only">Profile information for {name}</DialogDescription>

        {/* Header */}
        <div className="relative overflow-hidden flex items-center gap-5 px-6 pt-6 pb-5">
          {/* Map background — only when timezone is known */}
          {profile?.timezone && (() => {
            const g = getTimezoneGroup(profile.timezone);
            if (!g) return null;
            return (
              <div className="absolute inset-0 pointer-events-none">
                <TimezoneMap lon={g.coords[0]} lat={g.coords[1]} />
                {/* Fade the map out on the left so the avatar area stays legible */}
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
              </div>
            );
          })()}

          <UserAvatar userId={userId} name={name} className="relative z-10 size-20 shrink-0 text-2xl" personalPlan={profile?.personalPlan} />
          <div className="relative z-10 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{name}</h2>
              {profile?.personalPlan === "ink" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      // Tap on mobile focuses the button, which opens the
                      // tooltip via radix's focus behavior. Desktop hover
                      // still works the same way.
                      className="shrink-0 inline-flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Annex Ink supporter"
                    >
                      <Sparkles className="size-4 ink-icon" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {profile.personalPlanSince
                      ? `Annex Ink supporter since ${new Date(profile.personalPlanSince).getFullYear()}`
                      : "Annex Ink supporter"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-4 w-40" />
            ) : profile ? (
              <>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4 shrink-0" />
                  <span>Member since {formatDate(profile.createdAt)}</span>
                </div>
                {profile.timezone && (() => {
                  const g = getTimezoneGroup(profile.timezone);
                  return (
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="size-4 shrink-0" />
                      <span>{g?.offset ?? profile.timezone} · {formatTimeInZone(profile.timezone)}</span>
                    </div>
                  );
                })()}
              </>
            ) : null}
          </div>
        </div>

        <Separator />

        {/* Shared sites — or quick self-actions when viewing your own card */}
        {isSelf ? (
          <div className="flex flex-col gap-1 px-3 py-3">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/settings"); }}
              className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <Settings className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Account settings</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/settings#sessions"); }}
              className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Security &amp; sessions</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                const t = getToken();
                if (t) {
                  try {
                    await fetch("/api/me/sessions/logout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                    });
                  } catch { /* ignore */ }
                }
                clearToken();
                navigate("/login");
              }}
              className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4 shrink-0 text-muted-foreground group-hover:text-destructive" />
              <span className="flex-1 text-sm font-medium">Sign out</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-destructive" />
            </button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="size-4" />
              <span>Shared sites</span>
            </div>

            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-11 w-full rounded-md" />
                <Skeleton className="h-11 w-full rounded-md" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            )}

            {!loading && profile && profile.sharedProjects.length > 0 && (
              <div className="flex flex-col gap-1">
                {profile.sharedProjects.map(proj => (
                  <button
                    key={proj.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    onClick={() => { setOpen(false); navigate(`/projects/${proj.id}`); }}
                  >
                    <span className="truncate text-sm font-medium">{proj.name}</span>
                    <Badge
                      className={`ml-3 shrink-0 border-0 px-2 py-0.5 text-xs ${ROLE_COLORS[proj.theirRole]}`}
                      variant="outline"
                    >
                      {ROLE_LABELS[proj.theirRole]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {!loading && profile && profile.sharedProjects.length === 0 && (
              <p className="text-sm text-muted-foreground">No shared sites.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
