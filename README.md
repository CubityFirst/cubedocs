# CubeDocs

A documentation hosting and management platform. Create projects, write markdown docs, and share them with the world.

> **Work in progress.** This is a prototype. Expect rough edges, missing features, and breaking changes. Not production-ready.

---

## What is this?

CubeDocs is a lightweight platform for hosting and organizing markdown-based documentation. Think a simpler, self-hosted alternative to Notion or Confluence — focused on technical docs, clean URLs, and a no-fuss editing experience.

It's built as a monorepo with a React frontend and Cloudflare Workers backend, all backed by Cloudflare's D1 (SQLite) and R2 storage.

---

## Features

- **Auth** — Register, log in, JWT-based sessions
- **Projects** — Create named documentation sites with slugs and metadata
- **Markdown editor** — Split-view editor with live preview
- **GitHub-Flavored Markdown** — Tables, strikethrough, task lists, etc.
- **Callouts** — Custom callout blocks (note, warning, tip, error, success, and more) via a remark plugin
- **Clean URLs** — Document and project slugs for human-readable links
- **Cloudflare-native backend** — Workers, D1, R2

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui |
| Backend | Cloudflare Workers, TypeScript |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Monorepo | Turbo + pnpm |

---

## Packages

```
packages/
  frontend/   # React app
  api/        # Core API worker (projects, docs)
  auth/       # Auth worker (register, login, JWT)
  shared/     # Shared types and utilities
```

---

## Vibecoded with AI

This project is entirely vibecoded. No careful upfront architecture, no design docs — just vibes and iteration. Built with the help of various AI models, primarily **Claude** (by Anthropic).

---

## Disclaimer

This is a prototype. It is not secure enough, not tested enough, and not complete enough for real use. Use it to learn, fork it, break it, whatever.
