import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { Outlet, useMatch, useNavigate, useLocation, NavLink } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
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
  ChevronRight,
  FileText,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  role: string;
  vault_enabled: number;
  published_at: string | null;
  changelog_mode: string;
}

interface Doc {
  id: string;
  title: string;
}

const SECTIONS = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "passwords", label: "Passwords", icon: KeyRound },
] as const;

export interface BreadcrumbItem {
  id: string | null;
  name: string;
  onClick?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
}

export interface DocsLayoutContext {
  updateDocTitle: (docId: string, title: string) => void;
  projectName: string;
  projectPublishedAt: string | null;
  changelogMode: string;
  addDoc: (doc: { id: string; title: string }) => void;
  setBreadcrumbs: Dispatch<SetStateAction<BreadcrumbItem[]>>;
}

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  // site creation
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // doc creation (instant, no form)
  const [creatingDoc, setCreatingDoc] = useState(false);

  // current user
  const [userName, setUserName] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!getToken()) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [navigate, location.pathname]);
  const projectMatch = useMatch("/projects/:projectId/*");
  const projectId = projectMatch?.params.projectId ?? null;
  const currentProject = projectId ? projects.find(p => p.id === projectId) ?? null : null;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: { name: string } }>)
      .then(json => { if (json.ok && json.data) setUserName(json.data.name); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          navigate("/login", { replace: true, state: { from: location.pathname } });
          return;
        }
        if (json.ok && json.data) setProjects(json.data);
      })
      .catch(() => {});
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

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
          navigate("/login", { replace: true, state: { from: location.pathname } });
          return;
        }
        if (json.ok && json.data) setDocs(json.data);
      })
      .catch(() => {});
  }, [navigate, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const json = await res.json() as { ok: boolean; data?: Project; error?: string };
      if (json.ok && json.data) {
        setProjects(prev => [json.data!, ...prev]);
        setCreating(false);
        setName("");
      } else {
        setError("Failed to create site.");
      }
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleNewDoc() {
    if (!projectId || creatingDoc) return;
    setCreatingDoc(true);
    try {
      const token = getToken();
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Untitled", content: "", projectId }),
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

  function addDoc(doc: { id: string; title: string }) {
    setDocs(prev => prev.some(d => d.id === doc.id) ? prev : [...prev, doc]);
  }

  const outletContext: DocsLayoutContext = {
    updateDocTitle,
    projectName: currentProject?.name ?? "",
    projectPublishedAt: currentProject?.published_at ?? null,
    changelogMode: currentProject?.changelog_mode ?? "off",
    addDoc,
    setBreadcrumbs,
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div className="relative shrink-0">
      <aside className={cn("flex h-full flex-col border-r border-border transition-[width] duration-200 overflow-hidden", sidebarOpen ? "w-64" : "w-0")}>
        {/* Logo / Site header */}
        <div className="flex h-14 items-center gap-2 px-4">
          {projectId && currentProject ? (
            <>
              <button
                onClick={() => navigate("/dashboard")}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="All sites"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex-1 truncate font-semibold tracking-tight">{currentProject.name}</span>
              <NavLink
                to={`/projects/${projectId}/settings`}
                className={({ isActive }) =>
                  `shrink-0 rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground ${
                    isActive ? "bg-accent text-foreground" : "text-muted-foreground"
                  }`
                }
                title="Site Settings"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </NavLink>
            </>
          ) : (
            <>
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold tracking-tight">CubeDocs</span>
            </>
          )}
        </div>

        <Separator />

        {projectId ? (
          /* ── Project sidebar ── */
          <ScrollArea className="flex-1 px-2 py-3">
            {/* Sections */}
            <nav className="flex flex-col gap-1">
              {SECTIONS.filter(section =>
                section.id !== "passwords" || currentProject?.vault_enabled === 1
              ).map(section => (
                <NavLink
                  key={section.id}
                  to={section.id === "documents" ? `/projects/${projectId}` : `/projects/${projectId}/${section.id}`}
                  end={section.id === "documents"}
                  className={({ isActive }) =>
                    cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-1 w-full justify-start", isActive ? "bg-accent text-foreground" : "text-muted-foreground")
                  }
                >
                  <section.icon className="h-3.5 w-3.5 shrink-0" />
                  {section.label}
                </NavLink>
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
                  <Button
                    key={p.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {p.name}
                  </Button>
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
                    onClick={() => { setCreating(false); setError(null); setName(""); }}
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
                    onChange={e => setName(e.target.value)}
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
          {/* User identity row */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex-1 truncate text-sm font-medium">
              {userName ?? "—"}
            </span>
            {currentProject && (
              <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                {currentProject.role}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/settings")}>
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => { clearToken(); navigate("/login"); }}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <button
        onClick={() => setSidebarOpen(v => !v)}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-10 flex h-10 w-3 items-center justify-center rounded-r-full border border-l-0 border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ChevronLeft className={cn("h-2.5 w-2.5 transition-transform duration-200", !sidebarOpen && "rotate-180")} />
      </button>
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Breadcrumb bar — always at the top */}
        {breadcrumbs.length > 0 && (
          <div className="shrink-0 flex items-center gap-1 px-6 py-3 border-b border-border bg-background text-sm">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                  <span
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      isLast
                        ? "text-foreground font-medium"
                        : crumb.onClick
                        ? "text-muted-foreground cursor-pointer hover:text-foreground hover:bg-accent"
                        : "text-muted-foreground"
                    } ${crumb.isDropTarget ? "bg-primary/15 text-primary ring-1 ring-primary/40" : ""}`}
                    onClick={!isLast ? crumb.onClick : undefined}
                    onDragOver={crumb.onDragOver}
                    onDragLeave={crumb.onDragLeave}
                    onDrop={crumb.onDrop}
                  >
                    {crumb.name}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          <Outlet context={outletContext} />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
