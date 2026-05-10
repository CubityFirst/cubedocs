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
- Full revision history with per-save author attribution

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
| Admin Dashboard | http://localhost:5174 |

The frontend dev server automatically proxies `/api` requests to the local Workers — no separate configuration needed.

## Stripe / Billing (optional)

Required only if you're working on the Annex Ink subscription system — billing routes, the Stripe webhook handler, or the billing UI in user/admin settings. See `memories/Ink-Stripe.md` for the full architecture.

**1. Install the Stripe CLI**

Pick one:

```bash
winget install Stripe.StripeCLI    # Windows
brew install stripe/stripe-cli/stripe  # macOS
scoop install stripe                # Windows (Scoop)
# or download from https://github.com/stripe/stripe-cli/releases
```

Then `stripe login` once to authorise the CLI against your Stripe account.

**2. Add Stripe secrets to `.dev.vars`**

```ini
# packages/auth/.dev.vars
STRIPE_SECRET_KEY=sk_test_...           # from Stripe Dashboard → API keys (test mode)
STRIPE_WEBHOOK_SECRET=whsec_...         # filled in step 3
STRIPE_INK_PRICE_ID=price_...           # the test-mode Annex Ink price id
APP_ORIGIN=http://localhost:5173        # so Checkout redirects come back to local

# packages/admin/.dev.vars
STRIPE_SECRET_KEY=sk_test_...           # same value, for admin-driven cancels
```

**3. Forward Stripe webhooks to the local auth worker**

In a separate terminal alongside `pnpm dev`:

```bash
pnpm dev:stripe
# (equivalent to: stripe listen --forward-to http://localhost:8788/stripe/webhook)
```

The CLI prints a `whsec_...` at startup — paste it into `packages/auth/.dev.vars` as `STRIPE_WEBHOOK_SECRET`, then restart the auth worker dev so it picks up the new value. The `whsec_` printed by the CLI is only valid for events forwarded by that CLI session; it's separate from the live-mode webhook secret in the Stripe Dashboard.

Without `pnpm dev:stripe` running, the local auth worker will accept webhook POSTs from the public internet but won't see any. Local checkouts will succeed at Stripe, but local DB state won't update until events are forwarded.

## Other Commands

```bash
pnpm build        # Production builds for all packages
pnpm typecheck    # TypeScript type-check across all packages
pnpm test         # Run all test suites
pnpm deploy       # Deploy all packages to Cloudflare
pnpm dev:stripe   # Forward Stripe webhooks to localhost (see above)
```

## Deploying to Cloudflare

```bash
pnpm migrations:remote   # Apply pending migrations to production D1
pnpm deploy              # Build and deploy all Workers + frontend
```

Requires a Cloudflare account with D1, R2, and Workers enabled, and `wrangler login` completed.

## License

Copyright (c) 2026 Michael Burr. Free for non-commercial use; commercial use requires prior written permission. See [LICENSE](LICENSE) for full terms.
