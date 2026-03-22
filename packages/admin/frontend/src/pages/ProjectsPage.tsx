import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { type AdminProject, listProjects, updateProjectFeatures } from "@/lib/api";

const ProjectFeatures = {
  CUSTOM_LINK: 1,
  AI_FEATURES: 2,
} as const;

const FEATURE_FLAGS = [
  { bit: ProjectFeatures.CUSTOM_LINK, label: "Custom Link" },
  { bit: ProjectFeatures.AI_FEATURES, label: "AI Features" },
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
}

function ProjectRow({ project, onSaved }: ProjectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [features, setFeatures] = useState(project.features);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFeatures(project.features);
  }, [project.features]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProjectFeatures(project.id, features);
      onSaved(project.id, features);
      toast.success("Features saved");
    } catch {
      toast.error("Failed to save features");
    } finally {
      setSaving(false);
    }
  }

  const dirty = features !== project.features;

  return (
    <>
      <TableRow>
        <TableCell>
          <button
            onClick={() => setExpanded(e => !e)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </TableCell>
        <TableCell className="font-medium">{project.name}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{project.id}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(project.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground font-mono">{project.features}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="pb-4 pt-2">
            <div className="ml-6 rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Feature Flags
              </p>
              <div className="space-y-3">
                {FEATURE_FLAGS.map(({ bit, label }) => (
                  <div key={bit} className="flex items-center gap-2">
                    <Checkbox
                      id={`${project.id}-${bit}`}
                      checked={hasFlag(features, bit)}
                      onCheckedChange={checked =>
                        setFeatures(f => setFlag(f, bit, !!checked))
                      }
                    />
                    <Label htmlFor={`${project.id}-${bit}`} className="cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? "Saving..." : "Save"}
              </Button>
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
            <Input
              placeholder="Filter by name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" disabled={loading}>
              <Search className="h-4 w-4" />
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
                  <TableHead>Features</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map(project => (
                  <ProjectRow key={project.id} project={project} onSaved={handleSaved} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
