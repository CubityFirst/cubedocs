## Monorepo Structure

pnpm + Turbo monorepo 

- `packages/frontend` — React 19 SPA (Vite, Tailwind CSS 4, shadcn/ui)
- `packages/api` — Core Cloudflare Worker (projects, docs, files)
- `packages/auth` — Auth Cloudflare Worker (login, register, TOTP, WebAuthn)

### Auth

Authentication uses `Authorization: Bearer <JWT>` headers. JWTs are issued by the Auth Worker and verified by the API Worker via a shared `JWT_SECRET`. The Auth Worker handles all identity concerns (register, login, TOTP, WebAuthn).

**Verification boundary — read this before touching auth flow:**

- **API Worker verifies sessions inline.** It binds the auth D1 as `AUTH_DB` (read-only by convention — no migrations) and calls `loadCurrentSession` from `packages/auth/src/session.ts` directly. One D1 batch read of `users` + `sessions`, no service-binding hop. This is what every authenticated API request goes through (`packages/api/src/auth.ts`).
- **Auth Worker still owns writes.** Login, register, change-password, session revoke, TOTP/WebAuthn enroll, lookup, etc. are still proxied through the `AUTH` service binding from the API worker. Anything that mutates the auth DB or needs rate limiting / email sending stays in the auth worker.
- **Cross-package import.** API worker imports `loadCurrentSession`, `sessionResultToResponse`, and `verifyJwt` directly from `packages/auth/src/`. The API tsconfig lists those files in `include`. **A schema change to `users` or `sessions` columns referenced in `loadCurrentSession` requires redeploying both workers**, because the API worker now reads those tables directly. Migrations themselves still only live in `packages/auth/migrations/`.
- The auth worker's `/verify` endpoint still exists but the API worker no longer calls it — leave it in place for now in case external tooling depends on it.

### Database Schemas

- **API DB** (`cubedocs-main`): projects, docs, doc_revisions, folders, files, members — see `packages/api/migrations/`. Bound as `DB` on the API worker.
- **Auth DB** (`cubedocs-auth`): users, sessions, totp, webauthn_credentials — see `packages/auth/migrations/`. Bound as `DB` on the auth worker (read+write) and as `AUTH_DB` on the API worker (read-only by convention; only `users` and `sessions` are read).

## Frontend Notes

- UI components from shadcn/ui — always use these instead of raw HTML elements
- Document rendering and editing both go through `packages/frontend/src/components/wysiwyg/WysiwygEditor.tsx` (CodeMirror 6, Lezer markdown grammar, decoration-based inline-rendered widgets). The `mode` prop selects `"reading"` | `"editing"` | `"raw"`.
- `react-markdown` + remark plugins is still used for the AI-summary block in `DocPage.tsx` and the file-summary block in `FileManager.tsx`, but not for the main document body.
- Authenticated images use the `AuthenticatedImage` component (fetches with auth header)
- PWA service worker in `dev-dist/sw.js` (auto-generated — do not edit manually)

### Dice Module

`packages/frontend/src/lib/dice.ts` — parser and roller for dice notation.
`packages/frontend/src/components/DiceRoll.tsx` — clickable inline dice roll widget used in rendered markdown.

**Supported notation:** see `memories/Dice-Notation.md` — read that file when you need details on dice notation syntax (table of examples, reroll/keep/explode/success-count behavior, operator precedence).

## Annex Ink + Stripe

Personal supporter subscription ($5/mo) with Stripe billing, comp-grant override, animated avatar ring, admin grant/revoke/cancel controls, and a webhook proxy through the frontend worker. **Anything touching `personal_plan_*` / `granted_plan_*` columns, `billing.ts`, `stripe-webhook.ts`, the billing UI in user settings or the admin user-details sheet, or the `InkBillingCard` belongs to this system** — see `memories/Ink-Stripe.md` for schema, plan resolution rules, webhook flow, deploy/dev setup, and ops cheatsheet.

## Realtime Collaboration

Yjs-based realtime co-editing gated per-project by `projects.features & 4` (`ProjectFeatures.REALTIME`), served from the `DocCollabRoom` Durable Object behind the API worker. **Anything touching `DocCollabRoom`, the `/api/docs/:id/collab` WebSocket route, `CollabProvider`, `EditorPresence`, or the `collab` prop on `WysiwygEditor` belongs to this system** — see `memories/Collab.md` for architecture, key files, WebSocket auth flow, reconnect behavior, and the local-enable command.

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
