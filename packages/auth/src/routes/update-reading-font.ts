import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import { isFontChoice } from "../fonts";
import type { Env } from "../index";

// Patch the user's prose-font choices for reading and editing modes. Both
// fields are optional in the body; pass `null` to reset to the default
// (NULL on the row → frontend falls back to the default sans stack).
//
// Unlike update-ink-prefs, this is NOT gated on the Ink plan — OpenDyslexic
// in particular is an accessibility feature, so every user can pick it.
export async function handleUpdateReadingFont(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const body = await request.json<{ readingFont?: string | null; editingFont?: string | null; uiFont?: string | null }>();

  if (!("readingFont" in body) && !("editingFont" in body) && !("uiFont" in body)) return errorResponse(Errors.BAD_REQUEST);

  if ("readingFont" in body && body.readingFont !== null && !isFontChoice(body.readingFont)) {
    return errorResponse(Errors.BAD_REQUEST);
  }
  if ("editingFont" in body && body.editingFont !== null && !isFontChoice(body.editingFont)) {
    return errorResponse(Errors.BAD_REQUEST);
  }
  if ("uiFont" in body && body.uiFont !== null && !isFontChoice(body.uiFont)) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if ("readingFont" in body) {
    sets.push("reading_font = ?");
    binds.push(body.readingFont ?? null);
  }
  if ("editingFont" in body) {
    sets.push("editing_font = ?");
    binds.push(body.editingFont ?? null);
  }
  if ("uiFont" in body) {
    sets.push("ui_font = ?");
    binds.push(body.uiFont ?? null);
  }
  binds.push(session.userId);

  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  return okResponse({
    readingFont: "readingFont" in body ? (body.readingFont ?? null) : undefined,
    editingFont: "editingFont" in body ? (body.editingFont ?? null) : undefined,
    uiFont: "uiFont" in body ? (body.uiFont ?? null) : undefined,
  });
}
