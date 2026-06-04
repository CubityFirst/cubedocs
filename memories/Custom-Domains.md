# Custom Domains (Cloudflare for SaaS)

Lets a site owner map their **own domain** (e.g. `docs.acme.com`) to their published site. We register it as a Cloudflare **custom hostname** on our zone; Cloudflare issues + auto-renews a DV cert and routes the host to the frontend Worker, which serves the site at **clean root URLs**. Same feature as the vanity slug — both gated by `ProjectFeatures.CUSTOM_LINK` (bit 1).

## Schema (API DB)

`0055_add_custom_domains.sql` → `project_custom_domains`:
- `project_id` TEXT **PRIMARY KEY** → `projects(id) ON DELETE CASCADE` (one domain per site)
- `hostname` TEXT **UNIQUE** (a host points at exactly one site)
- `cf_hostname_id` — Cloudflare custom_hostname id
- `status` — app-facing `pending | active | error` (from `deriveStatus`)
- `hostname_status`, `ssl_status` — raw CF DCV + cert statuses (cached)
- `dns_records` — JSON array of `{ type, name, value, note }` the customer must add
- `verification_errors` — JSON array of human strings
- `created_at`, `updated_at`

The row caches CF state so the settings UI renders without hitting CF on every load; `POST /domain/refresh` re-polls and re-caches.

## Key files

- `packages/api/src/lib/customDomains.ts` — Cloudflare API client (`cfCreateCustomHostname`/`cfGetCustomHostname`/`cfDeleteCustomHostname`) + **pure helpers** `isValidHostname`, `normalizeHostname`, `deriveDnsRecords`, `deriveStatus`, `collectVerificationErrors`, `customDomainsConfigured`, and `releaseCustomDomain(env, projectId)` (best-effort CF-hostname deregistration on site delete — see below). Tests: `customDomains.test.ts`.
- `packages/api/src/routes/customDomains.ts` — `handleCustomDomain` for `/projects/:id/domain` (GET/PUT/DELETE) + `/projects/:id/domain/refresh` (POST). Gates: caller **admin+** (effective role via `resolveRole`) **and** site has `CUSTOM_LINK` flag. PUT validates the hostname, rejects our own zone apex + already-claimed hosts, retires the old CF hostname if the host changed, creates the CF custom hostname (SSL method `txt`, type `dv`), caches state.
- `packages/api/src/index.ts` — route wired before the generic `/projects` handler; `Env` gains `CF_API_TOKEN?`, `CF_ZONE_ID?`, `CUSTOM_DOMAIN_CNAME_TARGET?`.
- `packages/api/src/routes/public.ts` — `GET /public/site-by-host?host=` resolves a mapped host → `{ projectId, vanitySlug, name }` (published sites only).
- `packages/frontend/src/lib/siteUrl.ts` — `isCustomDomain()`/`isAppHost`, `SiteRouteContext` + `useSiteRoute`, `siteHref(route, slug, docId, anchor?)`, dev `?__site=` override.
- `packages/frontend/src/CustomDomainApp.tsx` — booted by `main.tsx` when `isCustomDomain()`. Resolves host→project once, then serves **site-only** routes (`/`, `/:docId`) under `SiteRouteContext{hostMode:true}`. No auth/app routes.
- `PublicDocPage.tsx` / `SearchPalette.tsx` — base-path/host aware: all in-site links go through `siteHref`/`href(...)`. Path mode → `/s/<slug>/<docId>`; host mode → `/<docId>`.
- Settings UI: `SiteSettingsPage.tsx` → Site group → "Custom Link & Domain" (the `#custom-domain` card lives inside the `features & 1` block). Admin app flag label: "Custom Link & Domain" (`ProjectsPage.tsx`).

## Deletion / cleanup

- **Explicit unmap** (`DELETE /projects/:id/domain`) calls `cfDeleteCustomHostname` then drops the row.
- **Site deletion** must release the CF hostname too, because `cf_hostname_id` lives only in the `project_custom_domains` row and that row cascades away with the project (`ON DELETE CASCADE`). All three delete paths call `releaseCustomDomain(env, projectId)` **before** `DELETE FROM projects`: owner self-delete (`api/routes/projects.ts`), account deletion (`api/index.ts`), and admin delete (`admin/routes/projects.ts`, which imports the helper cross-package and needs its own `CF_ZONE_ID`/`CUSTOM_DOMAIN_CNAME_TARGET` vars + `CF_API_TOKEN` secret — else the release is a no-op and an admin delete leaks the hostname).
- Without this, a deleted site would orphan the CF custom hostname: it keeps billing and, since the hostname is globally unique in the zone, blocks any later site from re-adding it.

## Serving model / invariants

- A custom domain serves a **published, read-only** site only — never the authenticated app (sessions/JWT are per-origin). Unpublished/unmapped host → `/public/site-by-host` 404 → CustomDomainApp shows a "not live yet" 404.
- Host detection: app hosts = `localhost`, `127.0.0.1`, `*.local`, `cubityfir.st`/`*.cubityfir.st`, `*.workers.dev`, `*.pages.dev`. Anything else = custom domain.
- The frontend's `/api/*` proxy works on any host (forwards to the API worker), so public endpoints keep working on the custom domain.
- When `CF_API_TOKEN`/`CF_ZONE_ID`/`CUSTOM_DOMAIN_CNAME_TARGET` are unset, `customDomainsConfigured()` is false → endpoints report "not configured" and never call Cloudflare (safe local dev default).

## One-time Cloudflare zone setup (prod — NOT done by code)

**Lives on a DEDICATED zone — `yourannex.com` (zone id `397deb54a68d306201a295d1793fe84c`), NOT `cubityfir.st`.** The SaaS catch-all is a zone-wide `*/*` Worker route, which on a shared zone hijacks every other host (it once made `i.cubityfir.st` serve the SPA shell instead of R2 objects). A dedicated zone with nothing else on it makes `*/*` safe by construction — `cubityfir.st` keeps zero SaaS routes, so its `i.`/apex/subdomains are untouched with no carve-outs to maintain. (The app itself still serves on `docs.cubityfir.st` via the frontend's exact `custom_domain` route — only customer custom hostnames go through `yourannex.com`.)

1. **Enable Cloudflare for SaaS** on the `yourannex.com` zone (paid add-on).
2. **Fallback origin**: create an originless record `service.yourannex.com AAAA 100::` (proxied) and set it as the zone's SaaS fallback origin.
3. **CNAME target**: create a proxied record `cname.yourannex.com AAAA 100::` (orange cloud) — the hostname customers point their CNAME at.
4. **Worker route**: add `*/*` → `annex-frontend` on the `yourannex.com` zone (the "Workers as your fallback origin" pattern). This is declared in `packages/frontend/wrangler.toml` (`pattern="*/*" zone_name="yourannex.com"`), so deploying the frontend creates it.
5. **Config** (`packages/api/wrangler.toml`): `CF_ZONE_ID = "397deb54a68d306201a295d1793fe84c"`, `CUSTOM_DOMAIN_CNAME_TARGET = "cname.yourannex.com"`, and `wrangler secret put CF_API_TOKEN` (token scoped to the **yourannex.com** zone with **SSL and Certificates: Edit**).
6. Customers then add: a **CNAME** `their.domain → cname.yourannex.com`, plus the **TXT** ownership + SSL-DCV records shown in Site Settings.

**Cleanup of the old shared-zone setup:** delete the stale `*/*` Worker route on the `cubityfir.st` zone (wrangler won't remove it — it only manages routes in the frontend toml, which now targets `yourannex.com`). No carve-out routes (`*.cubityfir.st/*` → None) are needed once `cubityfir.st` has no `*/*`.

## Local testing

- The real edge routing (custom hostname → cert → Worker) can't be exercised locally. Exercise the **SPA host-mode branch** with `http://localhost:5173/?__site=<projectIdOrSlug>` (dev-only `?__site=` override forces host mode without a host lookup).
- The backend endpoints are unit-testable; the CF calls are gated by `customDomainsConfigured` so they no-op without secrets.
