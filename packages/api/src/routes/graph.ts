import { okResponse, errorResponse, Errors, type Session, type Role } from "../lib";
import { reindexProject } from "../lib/docLinks";
import type { Env } from "../index";

interface GraphNode {
  id: string;
  title: string;
  links: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function buildGraph(
  env: Env,
  projectId: string,
  allowedDocIds: Set<string> | null,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const proj = await env.DB.prepare("SELECT graph_indexed_at FROM projects WHERE id = ?")
    .bind(projectId).first<{ graph_indexed_at: string | null }>();
  if (!proj) return { nodes: [], edges: [] };
  if (proj.graph_indexed_at === null) {
    await reindexProject(env, projectId);
  }

  const [docsResult, edgesResult] = await Promise.all([
    env.DB.prepare("SELECT id, title FROM docs WHERE project_id = ?").bind(projectId).all<{ id: string; title: string }>(),
    env.DB.prepare("SELECT source_doc_id, target_doc_id FROM doc_links WHERE project_id = ?").bind(projectId).all<{ source_doc_id: string; target_doc_id: string }>(),
  ]);

  const visibleDocs = allowedDocIds
    ? docsResult.results.filter(d => allowedDocIds.has(d.id))
    : docsResult.results;
  if (visibleDocs.length === 0) return { nodes: [], edges: [] };

  const visibleSet = new Set(visibleDocs.map(d => d.id));
  const linkCount = new Map<string, number>(visibleDocs.map(d => [d.id, 0]));
  const edges: GraphEdge[] = [];
  for (const e of edgesResult.results) {
    if (!visibleSet.has(e.source_doc_id) || !visibleSet.has(e.target_doc_id)) continue;
    edges.push({ source: e.source_doc_id, target: e.target_doc_id });
    linkCount.set(e.source_doc_id, (linkCount.get(e.source_doc_id) ?? 0) + 1);
    linkCount.set(e.target_doc_id, (linkCount.get(e.target_doc_id) ?? 0) + 1);
  }

  const nodes: GraphNode[] = visibleDocs.map(d => ({
    id: d.id,
    title: d.title,
    links: linkCount.get(d.id) ?? 0,
  }));
  return { nodes, edges };
}

export async function handleGraph(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(Errors.NOT_FOUND);

  const match = url.pathname.match(/^\/projects\/([^/]+)\/graph$/);
  if (!match) return errorResponse(Errors.NOT_FOUND);
  const projectId = match[1];

  const member = await env.DB.prepare(
    "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1",
  ).bind(projectId, user.userId).first<{ role: Role }>();
  if (!member) return errorResponse(Errors.FORBIDDEN);

  const proj = await env.DB.prepare("SELECT graph_enabled FROM projects WHERE id = ?")
    .bind(projectId).first<{ graph_enabled: number }>();
  if (!proj) return errorResponse(Errors.NOT_FOUND);
  if (!proj.graph_enabled) return errorResponse(Errors.FORBIDDEN);

  let allowed: Set<string> | null = null;
  if (member.role === "limited") {
    const shares = await env.DB.prepare(
      "SELECT ds.doc_id FROM doc_shares ds JOIN docs d ON d.id = ds.doc_id WHERE ds.user_id = ? AND d.project_id = ?",
    ).bind(user.userId, projectId).all<{ doc_id: string }>();
    allowed = new Set(shares.results.map(r => r.doc_id));
  }

  const graph = await buildGraph(env, projectId, allowed);
  return okResponse(graph);
}

export async function handlePublicGraph(
  env: Env,
  url: URL,
): Promise<Response> {
  const match = url.pathname.match(/^\/public\/projects\/([^/]+)\/graph$/);
  if (!match) return errorResponse(Errors.NOT_FOUND);
  const slug = match[1];

  const project = await env.DB.prepare(
    "SELECT id, graph_enabled FROM projects WHERE (id = ? OR vanity_slug = ?) AND published_at IS NOT NULL",
  ).bind(slug, slug).first<{ id: string; graph_enabled: number }>();
  if (!project) return errorResponse(Errors.NOT_FOUND);
  if (!project.graph_enabled) return errorResponse(Errors.FORBIDDEN);

  const graph = await buildGraph(env, project.id, null);
  return okResponse(graph);
}
