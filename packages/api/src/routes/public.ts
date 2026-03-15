import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  published_at: string | null;
}

interface PublicDoc {
  id: string;
  title: string;
  published_at: string | null;
}

export async function handlePublic(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(Errors.NOT_FOUND);

  const parts = url.pathname.replace(/^\/public\/?/, "").split("/");

  // /public/projects/:id
  if (parts[0] === "projects" && parts[1]) {
    const projectId = parts[1];
    const project = await env.DB.prepare(
      "SELECT id, name, description, published_at FROM projects WHERE id = ? AND published_at IS NOT NULL",
    ).bind(projectId).first<PublicProject>();
    if (!project) return errorResponse(Errors.NOT_FOUND);

    const docs = await env.DB.prepare(
      "SELECT id, title FROM docs WHERE project_id = ? ORDER BY created_at ASC",
    ).bind(project.id).all<Pick<PublicDoc, "id" | "title">>();

    return okResponse({ ...project, docs: docs.results });
  }

  // /public/docs/:projectId/:docId
  if (parts[0] === "docs" && parts[1] && parts[2]) {
    const projectId = parts[1];
    const docId = parts[2];

    const project = await env.DB.prepare(
      "SELECT id, name, published_at FROM projects WHERE id = ?",
    ).bind(projectId).first<Pick<PublicProject, "id" | "name" | "published_at">>();
    if (!project) return errorResponse(Errors.NOT_FOUND);

    const doc = await env.DB.prepare(
      "SELECT id, title, published_at FROM docs WHERE id = ? AND project_id = ?",
    ).bind(docId, projectId).first<PublicDoc>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const sitePublished = project.published_at !== null;
    const docPublished = doc.published_at !== null;
    if (!sitePublished && !docPublished) return errorResponse(Errors.NOT_FOUND);

    const r2Object = await env.ASSETS.get(`${projectId}/${docId}`);
    const content = r2Object ? await r2Object.text() : "";

    let docs: Pick<PublicDoc, "id" | "title">[] | null = null;
    if (sitePublished) {
      const docsResult = await env.DB.prepare(
        "SELECT id, title FROM docs WHERE project_id = ? ORDER BY created_at ASC",
      ).bind(projectId).all<Pick<PublicDoc, "id" | "title">>();
      docs = docsResult.results;
    }

    return okResponse({
      doc: { id: doc.id, title: doc.title, content },
      sitePublished,
      project: { id: project.id, name: project.name },
      docs,
    });
  }

  return errorResponse(Errors.NOT_FOUND);
}
