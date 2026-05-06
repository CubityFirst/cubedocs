import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { BookOpen, Globe, Mail, Plus, Sparkles, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getToken } from "@/lib/auth";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

interface Project {
  id: string;
  name: string;
  description: string | null;
  doc_count: number;
  member_count: number;
  published_at: string | null;
  ai_enabled: number;
  is_favourite: number;
}

export function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();
  const { openCreateSite } = useOutletContext<DocsLayoutContext>();

  function sortByFavourite(list: Project[]) {
    return [...list].sort((a, b) => b.is_favourite - a.is_favourite);
  }

  async function handleToggleFavourite(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    const token = getToken();
    setProjects(prev => sortByFavourite(prev.map(p => p.id === projectId ? { ...p, is_favourite: p.is_favourite ? 0 : 1 } : p)));
    await fetch(`/api/projects/${projectId}/favourite`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      setProjects(prev => sortByFavourite(prev.map(p => p.id === projectId ? { ...p, is_favourite: p.is_favourite ? 0 : 1 } : p)));
    });
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Project[] }) => {
        if (json.ok && json.data) setProjects(json.data);
      })
      .catch(() => {});
    fetch("/api/pending-invites", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: unknown[] }) => {
        if (json.ok && json.data) setPendingCount(json.data.length);
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

              <CardFooter className="flex items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Star
                      className={`h-[18px] w-[18px] cursor-pointer transition-colors ${project.is_favourite ? "fill-amber-400 text-amber-400 hover:fill-amber-300 hover:text-amber-300" : "text-muted-foreground/40 hover:text-amber-400"}`}
                      strokeWidth={1.5}
                      onClick={(e) => handleToggleFavourite(e, project.id)}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {project.is_favourite ? "Remove from favourites" : "Add to favourites"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Globe
                      className={`h-[18px] w-[18px] ${project.published_at ? "cursor-pointer text-green-500 hover:text-green-400" : "text-muted-foreground/40"}`}
                      strokeWidth={1.5}
                      onClick={project.published_at ? (e) => { e.stopPropagation(); navigate(`/s/${project.id}`); } : undefined}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {project.published_at ? "View public site" : "Site is private"}
                  </TooltipContent>
                </Tooltip>

                {!!project.ai_enabled && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Sparkles className="h-[18px] w-[18px] text-violet-400" strokeWidth={1.5} />
                    </TooltipTrigger>
                    <TooltipContent>AI features enabled</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ml-auto flex items-center gap-1 text-muted-foreground/60">
                      <Users className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      <span className="text-xs">{project.member_count}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {project.member_count} {project.member_count === 1 ? "member" : "members"}
                  </TooltipContent>
                </Tooltip>
              </CardFooter>

            </Card>
          ))}
          {pendingCount > 0 && (
            <Card
              onClick={() => navigate("/invites/pending")}
              className="group flex cursor-pointer flex-col transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <CardHeader className="flex-row items-start justify-between gap-3 pb-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                    <Mail className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <CardTitle>{pendingCount === 1 ? "Pending Invite" : "Pending Invites"}</CardTitle>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {pendingCount} {pendingCount === 1 ? "invite" : "invites"}
                </Badge>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  You have {pendingCount} pending {pendingCount === 1 ? "invite" : "invites"}. Click here to review.
                </p>
              </CardContent>
              <CardFooter />
            </Card>
          )}
          <Card
            onClick={openCreateSite}
            className="group flex cursor-pointer flex-col items-center justify-center border-dashed transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 transition-colors group-hover:border-primary/60">
                <Plus className="h-5 w-5 text-muted-foreground/60 transition-colors group-hover:text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">New site</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Create a new documentation site</p>
              </div>
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
