import { useState, useEffect } from "react";
import { Outlet, useMatch, useNavigate, NavLink } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { clearToken, getToken } from "@/lib/auth";
import {
  BookOpen,
  FolderOpen,
  Plus,
  Settings,
  LogOut,
  X,
  ChevronLeft,
  FileText,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface Doc {
  id: string;
  title: string;
  slug: string;
}

const SECTIONS = [
  { id: "documents", label: "Documents", icon: FileText, disabled: false },
  { id: "passwords", label: "Passwords", icon: KeyRound, disabled: true },
] as const;

export interface DocsLayoutContext {
  updateDocTitle: (docId: string, title: string) => void;
}

export function DocsLayout() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);

  // site creation
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // doc creation (instant, no form)
  const [creatingDoc, setCreatingDoc] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);
  const projectMatch = useMatch("/projects/:projectId/*");
  const projectId = projectMatch?.params.projectId ?? null;
  const currentProject = projectId ? projects.find(p => p.id === projectId) ?? null : null;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => ({
        status: r.status,
        json: await r.json() as { ok: boolean; data?: Project[] },
      }))
      .then(({ status, json }) => {
        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        if (json.ok && json.data) setProjects(json.data);
      })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (!projectId) { setDocs([]); return; }
    const token = getToken();
    if (!token) return;
    fetch(`/api/docs?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => ({
        status: r.status,
        json: await r.json() as { ok: boolean; data?: Doc[] },
      }))
      .then(({ status, json }) => {
        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        if (json.ok && json.data) setDocs(json.data);
      })
      .catch(() => {});
  }, [navigate, projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, slug }),
      });
      const json = await res.json() as { ok: boolean; data?: Project; error?: string };
      if (json.ok && json.data) {
        setProjects(prev => [json.data!, ...prev]);
        setCreating(false);
        setName("");
        setSlug("");
      } else {
        setError(res.status === 409 ? "A site with that slug already exists." : "Failed to create site.");
      }
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slug) setSlug(value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  }

  async function handleNewDoc() {
    if (!projectId || creatingDoc) return;
    setCreatingDoc(true);
    try {
      const token = getToken();
      const slug = `untitled-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Untitled", slug, content: "", projectId }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc & { id: string } };
      if (json.ok && json.data) {
        setDocs(prev => [...prev, json.data!]);
        navigate(`/projects/${projectId}/docs/${json.data.id}`, { state: { isNew: true } });
      }
    } catch {
      // fail silently — user can retry
    } finally {
      setCreatingDoc(false);
    }
  }

  function updateDocTitle(docId: string, title: string) {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, title } : d));
  }

  const outletContext: DocsLayoutContext = { updateDocTitle };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-border">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 px-4">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">CubeDocs</span>
        </div>

        <Separator />

        {projectId ? (
          /* ── Project sidebar ── */
          <ScrollArea className="flex-1 px-2 py-3">
            {/* Back + project name */}
            <button
              onClick={() => navigate("/dashboard")}
              className="mb-3 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              All sites
            </button>

            {currentProject && (
              <p className="mb-3 truncate px-2 text-sm font-semibold">{currentProject.name}</p>
            )}

            <Separator className="mb-3" />

            {/* Site settings link */}
            <NavLink
              to={`/projects/${projectId}/settings`}
              className={({ isActive }) =>
                `mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-foreground ${
                  isActive ? "bg-accent text-foreground font-medium" : "text-muted-foreground"
                }`
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Site Settings
            </NavLink>

            <Separator className="mb-3" />

            {/* Sections */}
            <nav className="flex flex-col gap-4">
              {SECTIONS.map(section => (
                <div key={section.id}>
                  {/* Section header */}
                  <div className={`mb-1 flex items-center gap-2 px-2 ${section.disabled ? "opacity-40" : ""}`}>
                    <section.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </span>
                    {section.disabled && (
                      <Badge variant="outline" className="ml-auto text-[10px]">soon</Badge>
                    )}
                  </div>

                  {/* Section content */}
                  {!section.disabled && section.id === "documents" && (
                    <div className="flex flex-col gap-0.5">
                      {docs.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-muted-foreground/60">No documents yet</p>
                      ) : (
                        docs.map(doc => (
                          <NavLink
                            key={doc.id}
                            to={`/projects/${projectId}/docs/${doc.id}`}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-md px-4 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                                isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"
                              }`
                            }
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{doc.title}</span>
                          </NavLink>
                        ))
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-0.5 w-full justify-start gap-2 px-4 text-muted-foreground"
                        onClick={handleNewDoc}
                        disabled={creatingDoc}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {creatingDoc ? "Creating…" : "New document"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </ScrollArea>
        ) : (
          /* ── Overview sidebar ── */
          <ScrollArea className="flex-1 px-2 py-3">
            {projects.length === 0 && !creating ? (
              <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No sites yet</p>
                <Button size="sm" className="w-full gap-2" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  Create Site
                </Button>
              </div>
            ) : (
              <nav className="flex flex-col gap-1">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {p.name}
                  </button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full justify-start gap-2 text-muted-foreground"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create Site
                </Button>
              </nav>
            )}

            {/* Inline create form */}
            {creating && (
              <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">New site</span>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setError(null); setName(""); setSlug(""); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="site-name" className="text-xs">Name</Label>
                  <Input
                    id="site-name"
                    placeholder="My Docs"
                    value={name}
                    onChange={e => handleNameChange(e.target.value)}
                    className="h-7 text-xs"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="site-slug" className="text-xs">Slug</Label>
                  <Input
                    id="site-slug"
                    placeholder="my-docs"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    className="h-7 text-xs"
                    required
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" size="sm" className="w-full" disabled={saving}>
                  {saving ? "Creating…" : "Create"}
                </Button>
              </form>
            )}
          </ScrollArea>
        )}

        <Separator />

        {/* Footer */}
        <div className="flex flex-col gap-1 p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-border px-6">
          <h1 className="text-sm font-medium text-muted-foreground">
            {currentProject ? currentProject.name : "Documentation"}
          </h1>
        </header>
        <ScrollArea className="flex-1">
          <Outlet context={outletContext} />
        </ScrollArea>
      </main>
      <Toaster />
    </div>
  );
}
