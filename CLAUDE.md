## Monorepo Structure

pnpm + Turbo monorepo 

- `packages/frontend` — React 19 SPA (Vite, Tailwind CSS 4, shadcn/ui)
- `packages/api` — Core Cloudflare Worker (projects, docs, files, passwords)
- `packages/auth` — Auth Cloudflare Worker (login, register, TOTP, WebAuthn)

### API Response Shape

Authentication uses `Authorization: Bearer <JWT>` headers. JWTs are issued by the Auth Worker and verified by the API Worker via a shared `JWT_SECRET`.

### Auth Flow

The Auth Worker handles all identity concerns (register, login, TOTP, WebAuthn). The API Worker verifies JWTs for protected routes and proxies auth-related endpoints to the Auth Worker via a service binding.

### Database Schemas

- **API DB** (`cubedocs-main`): projects, docs, doc_revisions, folders, files, members, passwords — see `packages/api/migrations/`
- **Auth DB** (`cubedocs-auth`): users, sessions, totp, webauthn_credentials — see `packages/auth/migrations/`

## Frontend Notes

- UI components from shadcn/ui — always use these instead of raw HTML elements
- Markdown rendered via `react-markdown` + remark-gfm + Shiki for syntax highlighting
- Authenticated images use the `AuthenticatedImage` component (fetches with auth header)
- PWA service worker in `dev-dist/sw.js` (auto-generated — do not edit manually)

`packages/frontend/vite.config.ts` Vite + dev proxy to API
`packages/api/wrangler.toml` API Worker bindings (D1, R2, service bindings)
`packages/auth/wrangler.toml` Auth Worker bindings (D1)

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
