## Monorepo Structure

pnpm + Turbo monorepo 

- `packages/frontend` — React 19 SPA (Vite, Tailwind CSS 4, shadcn/ui)
- `packages/api` — Core Cloudflare Worker (projects, docs, files)
- `packages/auth` — Auth Cloudflare Worker (login, register, TOTP, WebAuthn)

### API Response Shape

Authentication uses `Authorization: Bearer <JWT>` headers. JWTs are issued by the Auth Worker and verified by the API Worker via a shared `JWT_SECRET`.

### Auth Flow

The Auth Worker handles all identity concerns (register, login, TOTP, WebAuthn). The API Worker verifies JWTs for protected routes and proxies auth-related endpoints to the Auth Worker via a service binding.

### Database Schemas

- **API DB** (`cubedocs-main`): projects, docs, doc_revisions, folders, files, members — see `packages/api/migrations/`
- **Auth DB** (`cubedocs-auth`): users, sessions, totp, webauthn_credentials — see `packages/auth/migrations/`

## Frontend Notes

- UI components from shadcn/ui — always use these instead of raw HTML elements
- Markdown rendered via `react-markdown` + remark-gfm + Shiki for syntax highlighting
- Authenticated images use the `AuthenticatedImage` component (fetches with auth header)
- PWA service worker in `dev-dist/sw.js` (auto-generated — do not edit manually)

### Dice Module

`packages/frontend/src/lib/dice.ts` — parser and roller for dice notation.
`packages/frontend/src/components/DiceRoll.tsx` — clickable inline dice roll widget used in rendered markdown.

`specs/dice-spec.txt` — Roll20 feature parity tracker. Check this before implementing new dice features (to avoid duplication) and update the `Ours` column to `done` when a feature is added.

**Supported notation:** see `memories/Dice-Notation.md` — read that file when you need details on dice notation syntax (table of examples, reroll/keep/explode/success-count behavior, operator precedence).

`packages/frontend/vite.config.ts` Vite + dev proxy to API
`packages/api/wrangler.toml` API Worker bindings (D1, R2, service bindings)
`packages/auth/wrangler.toml` Auth Worker bindings (D1)

## Realtime Collaboration

Enabled per-project via `projects.features & 4` (`ProjectFeatures.REALTIME`). Toggle in the admin panel.

**Architecture:** Browser ↔ WebSocket `/api/docs/:id/collab?token=<jwt>` ↔ API Worker (auth + flag check) ↔ `DocCollabRoom` Durable Object (Yjs CRDT server, WebSocket hibernation).

**Key files:**
- `packages/api/src/collab/DocCollabRoom.ts` — Durable Object; holds `Y.Doc` in memory, persists snapshot to R2 via 10s alarm after edits and on last-client-close
- `packages/frontend/src/components/MarkdownEditor.tsx` — CodeMirror 6 editor used universally (flag-on and flag-off); Yjs/WebSocket extensions only wired when `collab` prop is set
- `packages/frontend/src/components/EditorPresence.tsx` — title-bar avatars (first 3 + "+N" overflow popover) fed from Yjs awareness state
- `packages/frontend/src/lib/userColor.ts` — deterministic HSL color from user UUID

**WebSocket auth:** Token passed as `?token=` (browsers can't set headers on WS); API worker re-wraps it as `Authorization: Bearer` and calls `authenticate()` via the AUTH service binding — no `JWT_SECRET` needed locally.

**DO room key:** `${projectId}:${docId}` — one room per document.

**Reconnect backoff:** `CollabProvider` uses a single once-fired `onDisconnect` handler (covers both `close` and `error` events) with exponential backoff starting at 1s, capped at 30s, reset to 1s on successful open. This prevents double-reconnect spam.

**Enabling for a project locally:**
```
cd packages/api && npx wrangler d1 execute cubedocs-main --local --persist-to ../../.wrangler/state \
  --command "UPDATE projects SET features = features | 4 WHERE id = '<projectId>';"
```

## CLI Notes

- All wrangler commands must be prefixed with `npx` (e.g. `npx wrangler d1 execute ...`)

## Local D1 State

The dev servers use a shared wrangler state at the **monorepo root** (`/.wrangler/state`), not inside each package. This is set via `--persist-to ../../.wrangler/state` in each package's dev script.

When running local D1 migrations or queries, always pass `--persist-to ../../.wrangler/state` from the package directory, otherwise the command hits the package-local `.wrangler/state` which the dev server never reads.

```
# Correct — targets the shared dev state
cd packages/auth && npx wrangler d1 execute cubedocs-auth --local --persist-to ../../.wrangler/state --command "..."

# Wrong — targets packages/auth/.wrangler/state, ignored by dev server
cd packages/auth && npx wrangler d1 execute cubedocs-auth --local --command "..."
```
