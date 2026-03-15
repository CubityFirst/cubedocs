import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { Globe, Link, Lock } from "lucide-react";

type Role = "viewer" | "editor" | "admin" | "owner";

const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
  owner: "Owner",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Can read documents",
  editor: "Can create and edit documents",
  admin: "Can invite users and manage roles",
  owner: "Full access including site deletion",
};

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

const ASSIGNABLE_ROLES: Role[] = ["viewer", "editor", "admin"];

interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  published_at: string | null;
}

interface Member {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
}

function parseToken(token: string): { userId: string; email: string } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

export function SiteSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { toast } = useToast();

  const [myRole, setMyRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [togglingPublish, setTogglingPublish] = useState(false);

  const token = getToken();
  const currentUser = token ? parseToken(token) : null;

  useEffect(() => {
    if (!token || !projectId) return;

    fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Project }) => {
        if (json.ok && json.data) {
          setProject(json.data);
          setName(json.data.name);
          setDescription(json.data.description ?? "");
          // Determine role if user is the owner (before members load)
          if (currentUser && json.data.owner_id === currentUser.userId) {
            setMyRole("owner");
          }
        }
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!token || !projectId) return;
    setLoadingMembers(true);
    fetch(`/api/projects/${projectId}/members`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Member[] }) => {
        if (json.ok && json.data) {
          setMembers(json.data);
          if (currentUser) {
            const me = json.data.find(m => m.userId === currentUser.userId);
            if (me) setMyRole(me.role);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [projectId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, description: description || null }),
      });
      const json = await res.json() as { ok: boolean; data?: Project; error?: string };
      if (json.ok && json.data) {
        setProject(json.data);
        toast({ title: "Settings saved." });
      } else {
        setSaveError("Failed to save settings.");
      }
    } catch {
      setSaveError("Could not connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !inviteEmail) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json() as { ok: boolean; data?: Member; error?: string };
      if (json.ok && json.data) {
        setMembers(prev => [...prev, json.data!]);
        setInviteEmail("");
        toast({ title: `${json.data.name} added as ${ROLE_LABELS[json.data.role]}.` });
      } else {
        setInviteError((json as { error?: string }).error ?? "Failed to add member.");
      }
    } catch {
      setInviteError("Could not connect to the server.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(member: Member, newRole: Role) {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json() as { ok: boolean; data?: Member };
      if (json.ok && json.data) {
        setMembers(prev => prev.map(m => m.userId === member.userId ? { ...m, role: newRole } : m));
        toast({ title: `${member.name}'s role updated to ${ROLE_LABELS[newRole]}.` });
      } else {
        toast({ title: "Failed to update role.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    }
  }

  async function handleRemove(member: Member) {
    if (!projectId) return;
    setRemovingId(member.userId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${member.userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setMembers(prev => prev.filter(m => m.userId !== member.userId));
        toast({ title: `${member.name} removed.` });
      } else {
        toast({ title: "Failed to remove member.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleTogglePublish() {
    if (!projectId || !project) return;
    setTogglingPublish(true);
    const publishedAt = project.published_at ? null : new Date().toISOString();
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publishedAt }),
      });
      const json = await res.json() as { ok: boolean; data?: Project };
      if (json.ok && json.data) {
        setProject(json.data);
        toast({ title: json.data.published_at ? "Site published." : "Site unpublished." });
      } else {
        toast({ title: "Failed to update publish state.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setTogglingPublish(false);
    }
  }

  async function handleDelete() {
    if (!projectId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        navigate("/dashboard");
      } else {
        setDeleteError("Failed to delete site.");
      }
    } catch {
      setDeleteError("Could not connect to the server.");
    } finally {
      setDeleting(false);
    }
  }

  const isAdminOrOwner = myRole !== null && ROLE_RANK[myRole] >= ROLE_RANK["admin"];
  const isOwner = myRole === "owner";

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h2 className="mb-1 text-xl font-semibold">Site Settings</h2>
      <p className="mb-8 text-sm text-muted-foreground">
        Manage settings for <span className="font-medium text-foreground">{project.name}</span>.
      </p>

      {/* General settings */}
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-name">Name</Label>
          <Input
            id="settings-name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            disabled={!isAdminOrOwner}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-description">Description</Label>
          <Input
            id="settings-description"
            placeholder="A short description of this site"
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={!isAdminOrOwner}
          />
        </div>

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {isAdminOrOwner && (
          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </form>

      {/* Publishing section — admins and owners only */}
      {isAdminOrOwner && (
        <>
          <Separator className="my-10" />
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold">Publishing</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Control public access to this site. When published, anyone with the link can view all documents.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                {project.published_at ? (
                  <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {project.published_at ? "Published" : "Private"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {project.published_at
                      ? "This site is publicly accessible."
                      : "Only members can view this site."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {project.published_at && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      const url = `${window.location.origin}/s/${projectId}`;
                      navigator.clipboard.writeText(url);
                      toast({ title: "Link copied to clipboard." });
                    }}
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant={project.published_at ? "outline" : "default"}
                  size="sm"
                  disabled={togglingPublish}
                  onClick={handleTogglePublish}
                >
                  {togglingPublish
                    ? "Saving…"
                    : project.published_at
                    ? "Unpublish"
                    : "Publish site"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Members section — admins and owners only */}
      {isAdminOrOwner && (
        <>
          <Separator className="my-10" />

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-base font-semibold">Members</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage who has access to this site.
              </p>
            </div>

            {/* Role legend */}
            <div className="rounded-md border border-border bg-muted/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permission levels</p>
              <div className="flex flex-col gap-1.5">
                {(["viewer", "editor", "admin", "owner"] as Role[]).map(role => (
                  <div key={role} className="flex items-center gap-2 text-sm">
                    <RoleBadge role={role} />
                    <span className="text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Member list */}
            {loadingMembers ? (
              <p className="text-sm text-muted-foreground">Loading members…</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                {members.map(member => {
                  const isMe = member.userId === currentUser?.userId;
                  const canManage = isOwner || (myRole === "admin" && ROLE_RANK[member.role] < ROLE_RANK["admin"]);
                  const canChangeRole = canManage && member.role !== "owner" && !isMe;
                  const canRemove = canManage && member.role !== "owner" && !isMe;

                  return (
                    <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {member.name}
                          {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                      </div>

                      {canChangeRole ? (
                        <Select
                          value={member.role}
                          onValueChange={val => handleRoleChange(member, val as Role)}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(isOwner ? ASSIGNABLE_ROLES : ASSIGNABLE_ROLES.filter(r => ROLE_RANK[r] < ROLE_RANK["admin"])).map(role => (
                              <SelectItem key={role} value={role} className="text-xs">
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}

                      {canRemove ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          disabled={removingId === member.userId}
                          onClick={() => handleRemove(member)}
                        >
                          {removingId === member.userId ? "Removing…" : "Remove"}
                        </Button>
                      ) : (
                        <div className="w-[70px]" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Invite form */}
            <form onSubmit={handleInvite} className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Invite a member</h4>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  required
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={val => setInviteRole(val as Role)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(role => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={inviting}>
                  {inviting ? "Adding…" : "Add"}
                </Button>
              </div>
              {inviteError && (
                <Alert variant="destructive">
                  <AlertDescription>{inviteError}</AlertDescription>
                </Alert>
              )}
            </form>
          </div>
        </>
      )}

      {/* Danger zone — owner only */}
      {isOwner && (
        <>
          <Separator className="my-10" />

          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
            <p className="text-sm text-muted-foreground">
              Deleting this site will permanently remove all of its documents and members. This action cannot be undone.
            </p>

            <AlertDialog open={deleteOpen} onOpenChange={open => { setDeleteOpen(open); if (!open) setDeleteError(null); }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="self-start">Delete site</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{project.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the site and all of its documents. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <Alert variant="destructive">
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const variants: Record<Role, string> = {
    owner: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    editor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    viewer: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`shrink-0 text-xs font-medium ${variants[role]}`}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
