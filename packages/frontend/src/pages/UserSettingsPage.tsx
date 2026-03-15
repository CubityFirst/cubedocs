import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

export function UserSettingsPage() {
  const [name, setName] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your account preferences.</p>

      <Separator className="my-6" />

      {/* Account section */}
      <section>
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
    </div>
  );
}
