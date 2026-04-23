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

**Supported notation:**

| Example | Meaning |
|---|---|
| `2d6` | Roll 2d6 |
| `4d6kh3` | Roll 4d6, keep highest 3 |
| `4d6kl3` | Roll 4d6, keep lowest 3 |
| `4d6dl1` | Roll 4d6, drop lowest 1 (equivalent to kh3) |
| `4d6dh1` | Roll 4d6, drop highest 1 (equivalent to kl3) |
| `4d6d1` | Roll 4d6, drop lowest 1 (shorthand, same as dl1) |
| `2d8r<2` | Roll 2d8, reroll any result less than 2 (unlimited) |
| `2d8r>6` | Roll 2d8, reroll any result greater than 6 (unlimited) |
| `2d8r1` | Roll 2d8, reroll any 1s (unlimited) |
| `2d8r1r3r5r7` | Roll 2d8, reroll any odd result (multiple conditions) |
| `2d10ro<2` | Roll 2d10, reroll once if less than 2 |
| `1dF` / `4dF` | Fate/Fudge dice (results: -1, 0, +1) |
| `1d[fire,ice]` | Table roll (random string entry) |
| `1d[2,4,6,8]` | Pool roll (custom numeric faces) |
| `2d6+1d4+3` | Compound expressions with `+` `-` `*` `/` |
| `2d6%4` | Modulus: remainder of division |
| `2d6**2` | Exponentiation (right-associative) |
| `floor(2d6/3)` | Math functions: `floor`, `ceil`, `round`, `abs` |
| `(2d6+1d4)*2` | Parentheses for grouping |
| `2d6[Fire] +1d4[Cold]` | Inline labels per term |
| `2d6 Roll for Initiative` | Overall roll label (space-separated) |
| `2d6 \| Roll for Initiative` | Overall roll label (explicit `\` separator) |
| `1d20cs>10` | Critical success on > 10 (amber die highlight + "CRIT!" badge) |
| `1d20cf<3` | Critical failure/fumble on < 3 (purple die highlight + "FUMBLE!" badge) |
| `1d20cs20cs10` | Critical success on exactly 20 or 10 (multiple exact values) |
| `1d20cs>18cf<3` | Combined cs and cf conditions on one die |
| `{4d6+3d8}kh1` | Group roll — keep highest single die across all dice in the group |
| `{4d6,3d8}kh1` | Group roll (comma) — sum each sub-expression, keep highest group total |
| `3d6!` | Exploding dice — reroll and add on max face; chain continues while max is rolled |
| `3d6!>4` | Exploding on any result > 4 |
| `3d6!3` | Exploding only on exactly 3 |
| `5d6!!` | Compound exploding (Shadowrun) — extra rolls accumulate into one value per die |
| `5d6!p` | Penetrating exploding (HackMaster) — each extra roll has −1 applied |
| `3d6>3` | Success counting — count dice that rolled > 3 |
| `10d6<4` | Success counting — count dice that rolled < 4 |
| `3d6>3f1` | Failure count — count successes (>3) minus failures (=1) |
| `10d6<4f>5` | Failure count — count successes (<4) minus failures (>5) |
| `{5d6!!}>8` | Group success count — compound exploding, count dice with total > 8 |
| `{3d6+1}<3` | Group success count with modifier per die |
| `{3d20+5}>21f<10` | Group failure count — success >21 minus failure <10 |
| `1d20+13>21` | Expression success — roll 1d20+13, show ✓/✗ vs target 21 |

Reroll conditions can be chained and combined with keep: `4d6kh3r1` rolls 4d6, rerolls 1s, then keeps the highest 3.

Critical success (`cs`) and critical failure (`cf`) conditions only affect display — they color individual dice amber/purple and show a CRIT!/FUMBLE! badge, but do not alter roll mechanics.

Operator precedence (high to low): parentheses → `floor`/`ceil`/`round`/`abs` → `**` → `*` `/` `%` → `+` `-`. Division produces a float; use `floor()` to truncate.

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
