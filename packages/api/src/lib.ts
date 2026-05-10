export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
  personalPlan?: "free" | "ink";
  personalPlanSince?: number | null;
  personalPlanStatus?: string | null;
  personalPlanCancelAt?: number | null;
  personalPlanStyle?: string | null;
  personalPresenceColor?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  created_at: string;
}

export interface Doc {
  id: string;
  title: string;
  content: string;
  projectId: string;
  authorId: string;
  publishedAt: string | null;
  show_heading: number;
  show_last_updated: number;
  sidebar_position: number | null;
  createdAt: string;
  updatedAt: string;
}

export const ProjectFeatures = {
  CUSTOM_LINK: 1,
  AI_FEATURES: 2,
  REALTIME:    4,
} as const;

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  vanity_slug: string | null;
  features: number;
  ai_enabled: number;
  graph_enabled: number;
  published_graph_enabled: number;
  graph_tag_colors: string | null;
  graph_reindex_available_at: string | null;
  home_doc_id: string | null;
  logo_square_updated_at: string | null;
  logo_wide_updated_at: string | null;
}

export type Role = "limited" | "viewer" | "editor" | "admin" | "owner";

export interface Member {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
}

export const ROLE_RANK: Record<Role, number> = {
  limited: -1,
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export const Errors = {
  UNAUTHORIZED: { error: "Unauthorized", status: 401 },
  FORBIDDEN:    { error: "Forbidden", status: 403 },
  NOT_FOUND:    { error: "Not found", status: 404 },
  CONFLICT:     { error: "Already exists", status: 409 },
  BAD_REQUEST:  { error: "Bad request", status: 400 },
  INTERNAL:     { error: "Internal server error", status: 500 },
  RATE_LIMITED: { error: "rate_limited", status: 429 },
} as const;

export function errorResponse(err: typeof Errors[keyof typeof Errors]): Response {
  return Response.json({ ok: false, ...err }, { status: err.status });
}

export function okResponse<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
