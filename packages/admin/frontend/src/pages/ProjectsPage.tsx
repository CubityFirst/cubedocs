import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import { type AdminProject, listProjects, updateProjectFeatures, deleteProject, reindexProjectFts } from "@/lib/api";

const ProjectFeatures = {
  CUSTOM_LINK: 1,
  AI_FEATURES: 2,
} as const;

const FEATURE_FLAGS = [
  {
    bit: ProjectFeatures.CUSTOM_LINK,
    label: "Custom Link",
    description: "Enables a custom slug, making this site accessible at /s/SLUG",
  },
  {
    bit: ProjectFeatures.AI_FEATURES,
    label: "AI Features",
    description: "Enables AI-generated summaries for documents in this project.",
  },
] as const;

function hasFlag(features: number, bit: number): boolean {
  return (features & bit) !== 0;
}

function setFlag(features: number, bit: number, enabled: boolean): number {
  return enabled ? features | bit : features & ~bit;
}

interface ProjectRowProps {
  project: AdminProject;
  onSaved: (id: string, features: number) => void;
  onDeleted: (id: string) => void;
}

function ProjectRow({ project, onSaved, onDeleted }: ProjectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savedFeatures, setSavedFeatures] = useState(project.features);
  const [pendingFeatures, setPendingFeatures] = useState(project.features);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    setSavedFeatures(project.features);
    setPendingFeatures(project.features);
  }, [project.features]);

  function handleSheetOpen(open: boolean) {
    setSheetOpen(open);
    if (open) setPendingFeatures(savedFeatures);
  }

  async function handleApply() {
    setSaving(true);
    try {
      await updateProjectFeatures(project.id, pendingFeatures);
      setSavedFeatures(pendingFeatures);
      onSaved(project.id, pendingFeatures);
      setSheetOpen(false);
      toast.success("Feature flags saved");
    } catch {
      toast.error("Failed to save features");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      onDeleted(project.id);
      toast.success("Project deleted");
    } catch {
      toast.error("Failed to delete project");
      setDeleting(false);
    }
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      const result = await reindexProjectFts(project.id);
      toast.success(`Search index rebuilt (${result.indexed} docs)`);
    } catch {
      toast.error("Failed to reindex search");
    } finally {
      setReindexing(false);
    }
  }

  const dirty = pendingFeatures !== savedFeatures;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <TableCell className="w-8 pr-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{project.name}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{project.id}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(project.created_at).toLocaleDateString()}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent bg-muted/20">
          <TableCell colSpan={4} className="py-3 pl-10 pr-6">
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <Sheet open={sheetOpen} onOpenChange={handleSheetOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline">
                    Feature flags
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Feature Flags</SheetTitle>
                    <SheetDescription>{project.name}</SheetDescription>
                    <p className="text-sm text-muted-foreground pt-1">These flags grant access to features, they don't force-enable anything. Users can toggle each feature themselves within their project settings.</p>
                  </SheetHeader>
                  <SheetBody className="space-y-5">
                    {FEATURE_FLAGS.map(({ bit, label, description }) => (
                      <div key={bit} className="flex items-start gap-3">
                        <Checkbox
                          id={`sheet-${project.id}-${bit}`}
                          checked={hasFlag(pendingFeatures, bit)}
                          onCheckedChange={checked =>
                            setPendingFeatures(f => setFlag(f, bit, !!checked))
                          }
                          className="mt-0.5"
                        />
                        <div>
                          <Label htmlFor={`sheet-${project.id}-${bit}`} className="cursor-pointer font-medium">
                            {label}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        </div>
                      </div>
                    ))}
                  </SheetBody>
                  <SheetFooter>
                    <Button className="w-full" onClick={handleApply} disabled={saving || !dirty}>
                      {saving ? "Applying..." : "Apply"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <Button size="sm" variant="outline" disabled={reindexing} onClick={handleReindex}>
                <RefreshCw className={`h-3.5 w-3.5 ${reindexing ? "animate-spin" : ""}`} />
                {reindexing ? "Reindexing..." : "Reindex search"}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={deleting}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? "Deleting..." : "Delete project"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete project?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{project.name}</strong> and all associated docs, files, and assets. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={handleDelete}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function ProjectsPage() {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load("");
  }, []);

  async function load(q: string) {
    setLoading(true);
    try {
      const results = await listProjects(q);
      setProjects(results);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(query);
  }

  function handleSaved(id: string, features: number) {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, features } : p)));
  }

  function handleDeleted(id: string) {
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage project feature flags.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter by name..."
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

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No projects found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map(project => (
                  <ProjectRow key={project.id} project={project} onSaved={handleSaved} onDeleted={handleDeleted} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
