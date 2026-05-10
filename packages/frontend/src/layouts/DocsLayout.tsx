import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { SearchPalette } from "@/components/SearchPalette";
import { cn } from "@/lib/utils";
import { Outlet, useMatch, useNavigate, useLocation, NavLink } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { clearToken, getToken } from "@/lib/auth";
import { apiFetch, apiFetchJson } from "@/lib/apiFetch";
import {
  BookOpen,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  SlidersHorizontal,
  Check,
  Network,
  Search,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { UserAvatar } from "@/components/UserAvatar";
import { UserProfileCard } from "@/components/UserProfileCard";

interface Project {
  id: string;
  name: string;
  role: string;
  published_at: string | null;
  changelog_mode: string;
  ai_enabled: number;
  ai_summarization_type: string;
  graph_enabled: number;
  is_favourite: number;
  features: number;
}

interface Doc {
  id: string;
  title: string;
  display_title?: string | null;
  folder_id?: string | null;
  tags?: string | null;
}

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

type Section = { id: "documents" | "graph"; label: string; icon: typeof FileText };

const DOCUMENTS_SECTION: Section = { id: "documents", label: "Documents", icon: FileText };
const GRAPH_SECTION: Section = { id: "graph", label: "Graph", icon: Network };

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
  myRole: string | null;
  aiEnabled: boolean;
  aiSummarizationType: string;
  projectFeatures: number;
  currentUser: { id: string; name: string; personalPlan: "free" | "ink" } | null;
  docs: { id: string; title: string; display_title?: string | null; folder_id?: string | null; tags?: string | null }[];
  folders: { id: string; name: string; parent_id: string | null }[];
  addDoc: (doc: { id: string; title: string; display_title?: string | null; folder_id?: string | null; tags?: string | null }) => void;
  setBreadcrumbs: Dispatch<SetStateAction<BreadcrumbItem[]>>;
  openCreateSite: () => void;
}

const PAGE_SIZE = 10;

function ProjectSwitcher({
  currentProject,
  projects,
  onSelect,
}: {
  currentProject: Project;
  projects: Project[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = query.trim()
    ? projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : projects;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) { setQuery(""); setPage(0); }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex flex-1 min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent group">
          <span className="flex-1 truncate font-semibold tracking-tight text-sm">{currentProject.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
        <div className="px-1 pb-1">
          <Input
            placeholder="Search sites…"
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-0.5">
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No sites found</p>
          ) : visible.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); handleOpenChange(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors hover:bg-accent",
                p.id === currentProject.id ? "font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === currentProject.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-1 flex items-center justify-between border-t border-border px-1 pt-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  useSwipeGesture({
    onSwipeLeft: () => setSidebarOpen(false),
    onSwipeRight: () => setSidebarOpen(true),
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  // site creation
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // doc creation (instant, no form)
  const [creatingDoc, setCreatingDoc] = useState(false);

  // current user
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [personalPlan, setPersonalPlan] = useState<"free" | "ink">("free");

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

  // full-text search palette
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => { if (projectId) setSearchOpen(true); }, [projectId]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  useEffect(() => {
    if (!getToken()) return;
    apiFetchJson<{ name: string; userId: string; personalPlan: "free" | "ink" }>("/api/me")
      .then(result => {
        if (result.ok && result.data) {
          setUserName(result.data.name);
          setUserId(result.data.userId);
          setPersonalPlan(result.data.personalPlan ?? "free");
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!getToken()) return;
    apiFetchJson<Project[]>("/api/projects")
      .then(result => {
        // 401/403 redirects to /login are handled inside apiFetch; the page is
        // unloading by the time we get here, so just ignore those statuses.
        if (result.ok && result.data) setProjects([...result.data].sort((a, b) => b.is_favourite - a.is_favourite));
      })
      .catch(() => {});
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId) { setDocs([]); setFolders([]); return; }
    if (!getToken()) return;
    apiFetchJson<Doc[]>(`/api/docs?projectId=${projectId}`)
      .then(result => {
        // apiFetch already triggered window.location.replace — don't fight it
        // by also calling React Router navigate.
        if (result.redirected) return;
        if (result.status === 403 || result.status === 404) {
          navigate("/dashboard", { replace: true });
          return;
        }
        if (result.ok && result.data) setDocs(result.data);
      })
      .catch(() => {});
    apiFetchJson<Folder[]>(`/api/folders?projectId=${projectId}&all=1`)
      .then(result => { if (result.ok && result.data) setFolders(result.data); })
      .catch(() => {});
  }, [navigate, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetchJson<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (result.ok && result.data) {
        setProjects(prev => [result.data!, ...prev]);
        setCreating(false);
        setName("");
        setDescription("");
        navigate(`/projects/${result.data.id}`);
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
      const result = await apiFetchJson<Doc & { id: string }>("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", content: "", projectId }),
      });
      if (result.ok && result.data) {
        setDocs(prev => [...prev, result.data!]);
        navigate(`/projects/${projectId}/docs/${result.data.id}`, { state: { isNew: true } });
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

  function addDoc(doc: { id: string; title: string; folder_id?: string | null }) {
    setDocs(prev => prev.some(d => d.id === doc.id) ? prev : [...prev, doc]);
  }

  const outletContext: DocsLayoutContext = {
    updateDocTitle,
    projectName: currentProject?.name ?? "",
    projectPublishedAt: currentProject?.published_at ?? null,
    changelogMode: currentProject?.changelog_mode ?? "off",
    myRole: currentProject?.role ?? null,
    aiEnabled: !!(currentProject?.ai_enabled),
    aiSummarizationType: currentProject?.ai_summarization_type ?? "manual",
    projectFeatures: currentProject?.features ?? 0,
    currentUser: userId && userName ? { id: userId, name: userName, personalPlan } : null,
    docs,
    folders,
    addDoc,
    setBreadcrumbs,
    openCreateSite: () => setCreating(true),
  };

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      {/* Sliding wrapper — sidebar + content translate as one unit on mobile; plain flex row on desktop */}
      <div className={cn("flex h-full transition-transform duration-200", sidebarOpen ? "translate-x-0" : "-translate-x-64", "md:translate-x-0")}>
      {/* Backdrop — mobile only: closes sidebar when tapping the content area */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={cn(
        "relative z-20 flex flex-col shrink-0 border-r border-border bg-background w-64",
        "md:transition-[width] md:duration-200",
        sidebarOpen ? "md:w-64" : "md:w-0 md:border-r-0",
      )}>
        {/* Inner wrapper — clips content on desktop when collapsed; toggle button lives outside so it stays visible */}
        <div className={cn("flex flex-col flex-1 min-h-0 w-64 overflow-hidden transition-[width] duration-200", !sidebarOpen && "md:w-0")}>
        {/* Logo / Site header */}
        <div className="flex h-14 items-center gap-2 px-4 border-b border-border">
          {projectId && currentProject ? (
            <>
              <button
                onClick={() => navigate("/dashboard")}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="All sites"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <ProjectSwitcher
                currentProject={currentProject}
                projects={projects}
                onSelect={id => navigate(`/projects/${id}`)}
              />
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
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center cursor-pointer"
              aria-label="Go to dashboard"
            >
              <img src="/annexwordmark.svg" alt="Annex" className="h-5 w-auto invert" />
            </button>
          )}
        </div>

        {projectId ? (
          /* ── Project sidebar ── */
          <ScrollArea className="flex-1 px-2 py-3">
            {/* Sections */}
            <nav className="flex flex-col gap-1">
              <button
                onClick={openSearch}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-between text-muted-foreground")}
              >
                <span className="flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  Search
                </span>
                <Kbd className="hidden sm:inline-flex">
                  {/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K"}
                </Kbd>
              </button>
              <div className="flex items-center mb-1">
                <NavLink
                  to={`/projects/${projectId}`}
                  end
                  className={({ isActive }) =>
                    cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 justify-start", isActive ? "bg-accent text-foreground" : "text-muted-foreground")
                  }
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  Documents
                </NavLink>
                {currentProject?.graph_enabled ? (
                  <NavLink
                    to={`/projects/${projectId}/graph`}
                    className={({ isActive }) =>
                      cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 px-2", isActive ? "bg-accent text-foreground" : "text-muted-foreground")
                    }
                    title="Graph"
                  >
                    <Network className="h-3.5 w-3.5" />
                  </NavLink>
                ) : null}
              </div>
            </nav>
          </ScrollArea>
        ) : (
          /* ── Overview sidebar ── */
          <ScrollArea className="flex-1 px-2 py-3">
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
            </nav>
          </ScrollArea>
        )}

        <Separator />

        {/* Footer */}
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {userId && userName ? (
              <UserProfileCard userId={userId} name={userName}>
                <button
                  type="button"
                  aria-label="Open profile"
                  title={userName}
                  className="flex flex-1 min-w-0 items-center gap-2 rounded-md -mx-1 px-1 py-1 ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <UserAvatar userId={userId} name={userName} className="size-7 shrink-0 text-xs" personalPlan={personalPlan} />
                  <span className="flex-1 truncate text-left text-sm font-medium">
                    {userName}
                  </span>
                </button>
              </UserProfileCard>
            ) : (
              <>
                <div className="size-7 shrink-0 rounded-full bg-muted" />
                <span className="flex-1 truncate text-sm font-medium">—</span>
              </>
            )}
            <Badge variant="secondary" className={cn("shrink-0 text-[10px] capitalize", !currentProject && "hidden")}>
              {currentProject?.role ?? "owner"}
            </Badge>
            <button
              onClick={() => navigate("/settings")}
              title="Settings"
              aria-label="Settings"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={async () => {
                // Best-effort: revoke the server-side session so the JWT is dead
                // even if it gets exfiltrated from localStorage post-logout. We
                // proceed with the local clear regardless of the network result.
                if (getToken()) {
                  try {
                    await apiFetch("/api/me/sessions/logout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    });
                  } catch { /* ignore */ }
                }
                clearToken();
                navigate("/login");
              }}
              title="Sign out"
              aria-label="Sign out"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute top-1/2 -translate-y-1/2 -right-3 z-10 flex h-10 w-3 items-center justify-center rounded-r-full border border-l-0 border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronLeft className={cn("h-2.5 w-2.5 transition-transform duration-200", !sidebarOpen && "rotate-180")} />
        </button>
      </aside>

      {/* Main content */}
      <main className="flex flex-col overflow-hidden min-w-full md:min-w-0 md:flex-1">
        {/* Breadcrumb bar — always at the top */}
        {breadcrumbs.length > 0 && (
          <div className="shrink-0 flex h-14 items-center gap-1 px-6 border-b border-border bg-background text-sm">
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
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          <Outlet context={outletContext} />
        </div>
      </main>
      </div>
      {projectId && (
        <SearchPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          projectId={projectId}
        />
      )}
      <Dialog open={creating} onOpenChange={open => { if (!open) { setCreating(false); setError(null); setName(""); setDescription(""); } }}>
        <DialogContent className="sm:max-w-md" hideClose>
          <DialogHeader className="pb-2">
            <DialogTitle>New site</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-name">Name</Label>
              <Input
                id="site-name"
                placeholder="My Docs"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="site-description"
                placeholder="A short description of this site…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create site"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Toaster />
      <SonnerToaster />
    </div>
  );
}
