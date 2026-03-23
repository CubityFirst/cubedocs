import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
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
import { type AdminUser, searchUsers, updateUserModeration, forceUserPasswordChange, exportUserData } from "@/lib/api";

interface UserRowProps {
  user: AdminUser;
  onUpdated: (id: string, updates: Partial<AdminUser>) => void;
}

function UserRow({ user, onUpdated }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcingPasswordChange, setForcingPasswordChange] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  async function toggleModeration() {
    const newVal = user.moderation === -1 ? 0 : -1;
    setPending(true);
    try {
      await updateUserModeration(user.id, newVal as 0 | -1);
      onUpdated(user.id, { moderation: newVal });
      toast.success(newVal === -1 ? "Account disabled" : "Account re-enabled");
    } catch {
      toast.error("Failed to update user");
    } finally {
      setPending(false);
    }
  }

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
          {user.moderation === -1
            ? <Badge variant="destructive">Disabled</Badge>
            : <Badge variant="default">Active</Badge>}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent bg-muted/20">
          <TableCell colSpan={5} className="py-3 pl-10 pr-6">
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
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

              {user.moderation === -1 ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={toggleModeration}>
                  Re-enable account
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={pending}>
                      Disable account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disable account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will prevent <strong>{user.email}</strong> from logging in.
                        You can re-enable the account at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={toggleModeration}>
                        Disable
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
        <p className="text-sm text-muted-foreground mt-1">Search and moderate user accounts.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
          <CardContent className="pt-5 space-y-2">
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
              <p className="text-sm text-muted-foreground text-center py-6">No users found.</p>
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
