import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth";

interface Project {
  id: string;
  name: string;
  description: string | null;
  doc_count: number;
}

export function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Project[] }) => {
        if (json.ok && json.data) setProjects(json.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Your Sites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a site to browse its documentation.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No sites yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a site from the sidebar to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <Card
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group flex cursor-pointer flex-col transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <CardHeader className="flex-row items-start justify-between gap-3 pb-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {project.doc_count} {project.doc_count === 1 ? "doc" : "docs"}
                </Badge>
              </CardHeader>

              <CardContent className="flex-1">
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                )}
              </CardContent>

              <CardFooter className="gap-2">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  Open site →
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-auto gap-1 px-2.5 py-1 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  New doc
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
