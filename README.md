<img src="logo.png" alt="annex" width="260" />

# annex

A collaborative documentation platform built on Cloudflare's edge infrastructure. Real-time co-editing, rich markdown, full-text search, file attachments, revision history, and passkey/TOTP authentication — all running at the edge with zero servers to manage.

## Features

**Documents & Editing**
- Markdown editor with live split-view preview
- GitHub-Flavored Markdown — tables, task lists, strikethrough
- Syntax highlighting via Shiki
- Custom callout blocks (note, warning, tip, error, success)
- Real-time collaborative editing (Yjs CRDT over WebSocket)
- Full revision history with line-by-line blame

**Projects & Organisation**
- Project-level publishing with clean vanity slugs
- Folder-based document hierarchy
- Role-based access: Viewer, Editor, Admin, Owner
- Member invitations per project
- Changelog / commit messages on save

**Files**
- File uploads up to 50 MB per project, organised into folders
- Image preview, file-type icons, rename and move support

**Authentication**
- Email + password with TOTP (authenticator app) and WebAuthn / passkeys
- Cloudflare Turnstile CAPTCHA, JWT sessions, password strength indicator

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui |
| API | Cloudflare Workers (Hono), D1, R2, Durable Objects |
| Auth | Cloudflare Workers, D1 |
| Realtime | Yjs CRDT · WebSocket · Durable Objects |
| Monorepo | pnpm workspaces + Turborepo |

## Packages

```
packages/
├── frontend/   React SPA
├── api/        Core Worker — projects, docs, files, collab
├── auth/       Auth Worker — login, register, TOTP, WebAuthn
└── admin/      Admin dashboard
```

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 10 or later

```bash
npm install -g pnpm
```

Wrangler (the Cloudflare CLI) is installed automatically as a dev dependency — no global install needed.

## Setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd annex
pnpm install
```

**2. Configure environment variables**

Create local secrets files for each Worker:

```bash
cp packages/api/.dev.vars.example packages/api/.dev.vars
cp packages/auth/.dev.vars.example packages/auth/.dev.vars
```

Both Workers need a shared `JWT_SECRET`:

```ini
# packages/api/.dev.vars
JWT_SECRET=your-secret-here

# packages/auth/.dev.vars
JWT_SECRET=your-secret-here   # must match api
```

**3. Apply local database migrations**

```bash
pnpm migrations:local
```

This seeds the local Cloudflare D1 databases under `.wrangler/state/` at the monorepo root.

## Running the Dev Server

```bash
pnpm dev
```

Starts all packages concurrently. Once running:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API Worker | http://localhost:8787 |
| Auth Worker | http://localhost:8788 |

The frontend dev server automatically proxies `/api` requests to the local Workers — no separate configuration needed.

## Other Commands

```bash
pnpm build        # Production builds for all packages
pnpm typecheck    # TypeScript type-check across all packages
pnpm test         # Run all test suites
pnpm deploy       # Deploy all packages to Cloudflare
```

## Deploying to Cloudflare

```bash
pnpm migrations:remote   # Apply pending migrations to production D1
pnpm deploy              # Build and deploy all Workers + frontend
```

Requires a Cloudflare account with D1, R2, and Workers enabled, and `wrangler login` completed.

## License

Private — all rights reserved.
