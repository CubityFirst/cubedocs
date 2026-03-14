export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
}

export interface Doc {
  id: string;
  slug: string;
  title: string;
  content: string;
  projectId: string;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export const Errors = {
  UNAUTHORIZED: { error: "Unauthorized", status: 401 },
  FORBIDDEN:    { error: "Forbidden", status: 403 },
  NOT_FOUND:    { error: "Not found", status: 404 },
  CONFLICT:     { error: "Already exists", status: 409 },
  BAD_REQUEST:  { error: "Bad request", status: 400 },
  INTERNAL:     { error: "Internal server error", status: 500 },
} as const;

export function errorResponse(err: typeof Errors[keyof typeof Errors]): Response {
  return Response.json({ ok: false, ...err }, { status: err.status });
}

export function okResponse<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
