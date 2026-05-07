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
import { UserAvatar } from "@/components/UserAvatar";
import { getToken } from "@/lib/auth";
import { CalendarDays, Building2, Clock } from "lucide-react";
import { formatTimeInZone, getTimezoneGroup } from "@/lib/timezone";
import { TimezoneMap } from "@/components/TimezoneMap";

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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
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

          <UserAvatar userId={userId} name={name} className="relative z-10 size-16 shrink-0 text-xl" />
          <div className="relative z-10 min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{name}</h2>
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

        {/* Shared sites */}
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
      </DialogContent>
    </Dialog>
  );
}
