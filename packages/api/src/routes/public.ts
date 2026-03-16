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
  folder_id: string | null;
  published_at: string | null;
}

interface PublicFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface PublicFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
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
      "SELECT id, title, folder_id FROM docs WHERE project_id = ? ORDER BY created_at ASC",
    ).bind(project.id).all<Pick<PublicDoc, "id" | "title" | "folder_id">>();

    const folders = await env.DB.prepare(
      "SELECT id, name, parent_id FROM folders WHERE project_id = ? ORDER BY name ASC",
    ).bind(project.id).all<PublicFolder>();

    const files = await env.DB.prepare(
      "SELECT id, name, mime_type, size, folder_id FROM files WHERE project_id = ? ORDER BY name ASC",
    ).bind(project.id).all<PublicFile>();

    return okResponse({ ...project, docs: docs.results, folders: folders.results, files: files.results });
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
      "SELECT id, title, published_at, show_last_updated, updated_at FROM docs WHERE id = ? AND project_id = ?",
    ).bind(docId, projectId).first<PublicDoc & { show_last_updated: number; updated_at: string }>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const sitePublished = project.published_at !== null;
    const docPublished = doc.published_at !== null;
    if (!sitePublished && !docPublished) return errorResponse(Errors.NOT_FOUND);

    const r2Object = await env.ASSETS.get(`${projectId}/${docId}`);
    const content = r2Object ? await r2Object.text() : "";

    let docs: Pick<PublicDoc, "id" | "title" | "folder_id">[] | null = null;
    let folders: PublicFolder[] | null = null;
    let files: PublicFile[] | null = null;
    if (sitePublished) {
      const docsResult = await env.DB.prepare(
        "SELECT id, title, folder_id FROM docs WHERE project_id = ? ORDER BY created_at ASC",
      ).bind(projectId).all<Pick<PublicDoc, "id" | "title" | "folder_id">>();
      docs = docsResult.results;

      const foldersResult = await env.DB.prepare(
        "SELECT id, name, parent_id FROM folders WHERE project_id = ? ORDER BY name ASC",
      ).bind(projectId).all<PublicFolder>();
      folders = foldersResult.results;

      const filesResult = await env.DB.prepare(
        "SELECT id, name, mime_type, size, folder_id FROM files WHERE project_id = ? ORDER BY name ASC",
      ).bind(projectId).all<PublicFile>();
      files = filesResult.results;
    }

    return okResponse({
      doc: { id: doc.id, title: doc.title, content, showLastUpdated: doc.show_last_updated !== 0, updatedAt: doc.updated_at },
      sitePublished,
      project: { id: project.id, name: project.name },
      docs,
      folders,
      files,
    });
  }

  // /public/files/:id/content — serve a file from a published project (images only)
  if (parts[0] === "files" && parts[1] && parts[2] === "content") {
    const fileId = parts[1];
    const meta = await env.DB.prepare(
      "SELECT f.mime_type, f.name, p.published_at FROM files f JOIN projects p ON p.id = f.project_id WHERE f.id = ?",
    ).bind(fileId).first<{ mime_type: string; name: string; published_at: string | null }>();
    if (!meta || !meta.published_at) return errorResponse(Errors.NOT_FOUND);

    const obj = await env.ASSETS.get(`files/${fileId}`);
    if (!obj) return errorResponse(Errors.NOT_FOUND);

    return new Response(await obj.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": meta.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${meta.name}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return errorResponse(Errors.NOT_FOUND);
}
