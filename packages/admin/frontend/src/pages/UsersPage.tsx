import { useState } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
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
import { type AdminUser, searchUsers, updateUserModeration } from "@/lib/api";

export function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

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

  async function toggleModeration(user: AdminUser) {
    const newVal = user.moderation === -1 ? 0 : -1;
    setPending(user.id);
    try {
      await updateUserModeration(user.id, newVal as 0 | -1);
      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, moderation: newVal } : u)),
      );
      toast.success(newVal === -1 ? "Account disabled" : "Account re-enabled");
    } catch {
      toast.error("Failed to update user");
    } finally {
      setPending(null);
    }
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
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-xs">{user.email}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {user.moderation === -1 ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.moderation === -1 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending === user.id}
                            onClick={() => toggleModeration(user)}
                          >
                            Re-enable
                          </Button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={pending === user.id}
                              >
                                Disable
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
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => toggleModeration(user)}
                                >
                                  Disable
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
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
