// ─── Users & Auth ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
}

// ─── Docs ─────────────────────────────────────────────────────────────────────

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
  description: string | null;
  ownerId: string;
  createdAt: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  status: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
