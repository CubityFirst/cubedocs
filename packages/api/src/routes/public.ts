import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

interface PublicDoc {
  id: string;
  title: string;
  slug: string;
  published_at: string | null;
}

interface PublicProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  published_at: string | null;
}

export async function handlePublic(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(Errors.NOT_FOUND);

  const parts = url.pathname.replace(/^\/public\/?/, "").split("/");
  // /public/projects/:slug
  if (parts[0] === "projects" && parts[1]) {
    const projectSlug = parts[1];
    const project = await env.DB.prepare(
      "SELECT id, name, slug, description, published_at FROM projects WHERE slug = ? AND published_at IS NOT NULL",
    ).bind(projectSlug).first<PublicProject>();
    if (!project) return errorResponse(Errors.NOT_FOUND);

    const docs = await env.DB.prepare(
      "SELECT id, title, slug FROM docs WHERE project_id = ? ORDER BY created_at ASC",
    ).bind(project.id).all<Pick<PublicDoc, "id" | "title" | "slug">>();

    return okResponse({ ...project, docs: docs.results });
  }

  // /public/docs/:projectSlug/:docSlug
  if (parts[0] === "docs" && parts[1] && parts[2]) {
    const projectSlug = parts[1];
    const docSlug = parts[2];

    const project = await env.DB.prepare(
      "SELECT id, name, slug, description, published_at FROM projects WHERE slug = ?",
    ).bind(projectSlug).first<PublicProject>();
    if (!project) return errorResponse(Errors.NOT_FOUND);

    const doc = await env.DB.prepare(
      "SELECT id, title, slug, published_at FROM docs WHERE project_id = ? AND slug = ?",
    ).bind(project.id, docSlug).first<PublicDoc>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const sitePublished = project.published_at !== null;
    const docPublished = doc.published_at !== null;
    if (!sitePublished && !docPublished) return errorResponse(Errors.NOT_FOUND);

    const r2Object = await env.ASSETS.get(`${project.id}/${doc.id}`);
    const content = r2Object ? await r2Object.text() : "";

    let docs: Pick<PublicDoc, "id" | "title" | "slug">[] | null = null;
    if (sitePublished) {
      const docsResult = await env.DB.prepare(
        "SELECT id, title, slug FROM docs WHERE project_id = ? ORDER BY created_at ASC",
      ).bind(project.id).all<Pick<PublicDoc, "id" | "title" | "slug">>();
      docs = docsResult.results;
    }

    return okResponse({
      doc: { id: doc.id, title: doc.title, slug: doc.slug, content },
      sitePublished,
      project: { name: project.name, slug: project.slug },
      docs,
    });
  }

  return errorResponse(Errors.NOT_FOUND);
}
