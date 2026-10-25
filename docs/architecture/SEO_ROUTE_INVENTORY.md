# SEO Route Inventory

Status: Current Implementation Inventory.

Scope: public crawlability, indexability, sitemap inclusion, and metadata rules
for the currently deployed routing model.

Authority: this inventory is the source of truth for SEO route policy. Update it
with any change that adds, removes, rewrites, indexes, or noindexes a public URL.

## Current Route Policy

| Route | Index | Robots | Canonical | Sitemap | Social metadata | Structured data | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Yes | `index, follow` | `https://reservaeldia.com.ar/` | Yes | Open Graph and Twitter Card | `Organization`, `WebSite`, `WebPage` | High |
| `/preguntas-frecuentes/` | Yes | `index, follow` | `https://reservaeldia.com.ar/preguntas-frecuentes/` | Yes | Open Graph and Twitter Card | `FAQPage` with the same visible questions and answers | High |
| `/i/{slug}` | No | `noindex, noarchive` | Omitted | No | Open Graph and Twitter Card for private sharing | None | High |
| `/i/{slug}/share.jpg` | No | `X-Robots-Tag: noindex` | N/A | No | N/A | None | High |
| `/dashboard/`, `/dashboard/**` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/admin/*` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/profesionales/`, `/profesionales/**` | No | `Disallow: /profesionales`; `noindex, nofollow, noarchive` for direct fetches | Omitted | No | None | None | High |
| `/assets/profesionales/**` | No | `Disallow: /assets/profesionales/`; `X-Robots-Tag: noindex, nofollow, noarchive` | N/A | No | None | None | High |
| `/lugares/`, `/lugares/**` | No | `Disallow: /lugares`; `noindex, nofollow, noarchive` for direct fetches | Omitted | No | None | None | High |
| `/proveedor/`, `/proveedor/**` (including `?id=...`) | No | `Disallow: /proveedor`; `noindex, nofollow, noarchive` for direct fetches | Omitted | No | None | None | High |
| `/assets/lugares/**` | No | `Disallow: /assets/lugares/`; `X-Robots-Tag: noindex, nofollow, noarchive` | N/A | No | None | None | High |
| `/boda/*` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/para-diseño/` | No | `noindex, noarchive` | Omitted | No | None | None | Medium |
| `/404/`, `404.html` | No | `noindex` | Omitted | No | None | None | Medium |
| `/robots.txt` | N/A | Allows crawling except the private directory routes and their legacy artwork | N/A | No | None | None | High |
| `/sitemap.xml` | N/A | Accessible | N/A | No | None | None | High |
| `/_next/**`, `/assets/**`, `/icons/**`, `/favicon_io/**` | Not pages | No sitemap; public PDFs use `noindex` | N/A | No | None | None | Medium |

## Implementation Notes

- Private directory, implemented locally 2026-10-25: `/lugares/` and
  `/profesionales/` now consume eligible approved provider projections through
  authenticated backend reads; `/proveedor/?id=...` renders one approved detail.
  All three routes retain the exact current-user superadmin guard and require
  the independent private-directory backend gate. The source of truth for those
  permissions, snapshots and protected media is
  [PROVIDER_DATA_MODEL.md](PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
  Exported HTML/JavaScript contain only application shells, not provider
  records, contact data or image credentials. Shells remain publicly deliverable;
  protected data/images require backend authorization even with known URLs.
- These routes remain excluded from sitemap, canonicals, social metadata and
  structured data. The new detail uses one static route with an opaque permanent
  ID query; it does not generate public provider HTML during export. Existing
  noindex/crawler exclusions extend to `/proveedor` and descendants. Robots
  controls are indexing policy, not confidentiality. No public directory or
  registration opening follows from this change. Remote behavior and deployment
  must be recorded separately from the local implementation.
- The design-preview implementation notes and verification below are historical
  baselines. Their example cards and disabled controls were replaced by the
  private approved-data flow above; their old passing checks do not verify the
  new backend, images or access gate.

- `robots.txt` is static in `public/robots.txt` because the policy does not
  depend on Firestore or runtime publication state.
- `sitemap.xml` is static in `public/sitemap.xml` and lists the approved
  indexable routes `/` and `/preguntas-frecuentes/`. Do not add `/i/{slug}` to
  any sitemap.
- Do not disallow `/i/` in `robots.txt`; crawlers must be able to see the
  `noindex` directive on private invitations.
- Public invitations use `noindex, noarchive` only. Do not add `nofollow` or
  `nosnippet` unless a concrete technical reason is documented here first.
- Historical professionals preview exception, accepted by the user's 2026-10-15 request:
  `/profesionales/` is a design-only secondary page; `/` remains unchanged.
  Search crawling is explicitly disallowed for `/profesionales` (including the
  exact path and descendants) and `/assets/profesionales/`. The page and Hosting
  headers also emit `noindex, nofollow, noarchive` for direct fetches. Compliant
  crawlers blocked by `robots.txt` cannot observe those directives; neither
  mechanism is access control or guarantees removal of a previously indexed URL.
  This narrow exception does not change invitation crawling or other route policy.
- The preview reuses `useAdminAccess` / `getAdminAccess` and mounts the design only
  after the current user is confirmed as `isSuperAdmin`; no provider data service,
  provider templates or marketplace actions are part of this phase. Production
  uses static export: its shell, JavaScript and assets are still publicly
  deliverable, so the client guard does not provide HTTP-level confidentiality.
  Examples must not contain private provider data. Status: implemented and
  verified locally on 2026-10-15; deployment remains pending. No backend
  or administrative identity-policy change is authorized by this preview.
- Historical venues preview exception, accepted by the user's 2026-10-16 request:
  `/lugares/` follows the same internal design-preview policy. Its exact route,
  descendants and `/assets/lugares/**` receive Hosting
  `noindex, nofollow, noarchive`; `robots.txt` disallows `/lugares` and
  `/assets/lugares/`. It has no sitemap entry, canonical, social metadata or
  structured data. The current-user `useAdminAccess` / `getAdminAccess` authority
  restricts the rendered preview to superadmins. Venue examples and the
  illustrative map do not call provider, mapping or search services. This adds
  no backend or identity-policy change. Static HTML, JavaScript and artwork
  remain publicly deliverable; neither the client guard nor robots directives
  provide HTTP-level confidentiality. Local verification is recorded below;
  deployment and effective remote behavior remain unverified.
- Future SEO pages such as `/plantillas/`, `/funcionalidades/*`, guides, or blog
  posts must be added to this inventory before implementation.
- AEO policy is tracked in [AEO_ROUTE_INVENTORY.md](AEO_ROUTE_INVENTORY.md).
  Keep both inventories aligned when route indexability, metadata, or
  structured-data policy changes.

## Verification Anchors

- Private-directory frontend, local 2026-10-25, Node 22.23.4:
  `node --test src/domain/providers/directoryModel.test.mjs src/components/marketplace/providerDirectory.test.mjs src/pages/lugares.test.mjs src/pages/profesionales.test.mjs`
  passed 22/22. The new detail metadata is generic and noindex; offline route
  tests deny unresolved/ordinary/admin sessions. These tests do not establish
  deployed headers, public export contents or real backend authorization;
  build/browser/API results are recorded in the delivery verification report.

- Venues preview, verified locally on 2026-10-16:
  `node --test src/pages/lugares.test.mjs src/pages/profesionales.test.mjs src/hooks/dashboardStartupReaders.test.mjs functions/seoStaticFiles.test.mjs`
  passed 28/28. An isolated Next production build/export (16 routes) and the
  local static-release verifier passed. Exported `/lugares/index.html` contains
  robots/googlebot directives but no venue design or artwork references.
  Ten browser cases passed with synthetic demo Auth identities and intercepted
  `getAdminAccess`: anonymous, ordinary user, ordinary admin, permission error,
  pending permission, and superadmin at 1440/1024/768/390/320px. Checks cover
  absent design/artwork before permission, disabled actions, the single filter
  row (internal scrolling on small screens), loaded photos, gradient title,
  no hero and no clipped page/map labels. A tablet filter-width failure found
  during the first run was corrected before the final complete rerun.
  Hash comparison against the prior professionals snapshot confirms 13 existing
  page/shared-style/auth files unchanged. External browser requests were blocked
  or served from the existing public font/CSS cache; no backend or production
  service was contacted. Evidence/reproduction (ignored local files):
  `.local-isolation/venues-build.cjs`, `.local-isolation/venues-browser.cjs`,
  `.local-isolation/venues-it92jt/venues-browser-report.json` and
  `.local-isolation/venues-it92jt/unchanged-surfaces.json`.
  No production identities, deployed headers, crawler behavior or HTTP-level
  file protection were verified. No deployment was performed. Lint was not run;
  the build retained the existing outdated Browserslist data warning. The
  disposable build disabled persistent webpack caching after an initial
  insufficient-disk-space failure; production configuration is unchanged.
- Professionals preview: `node --test src/pages/profesionales.test.mjs src/hooks/dashboardStartupReaders.test.mjs functions/seoStaticFiles.test.mjs`
  passed 23/23 on 2026-10-15. An isolated Next production build/export and the
  local static-release verifier also passed. Exported `/profesionales/index.html`
  contains robots directives and no marketplace content. Eight browser scenarios
  passed with synthetic demo Auth sessions and intercepted `getAdminAccess`
  responses: anonymous, regular user, ordinary admin, permission error, and
  superadmin at 1440/768/390/320px. Pending permissions do not mount the design or
  request its artwork; viewport checks cover clipping, image visibility and
  disabled marketplace controls. No production identity, deployed headers,
  crawler behavior or HTTP-level file protection was verified. Lint was not run;
  the build retained the existing outdated Browserslist data warning.
  Local reproduction/evidence: `.local-isolation/professionals-build.cjs`,
  `.local-isolation/professionals-browser.cjs` and
  `.local-isolation/professionals-KUvo5E/browser-report.json` (ignored local files).
- `functions/seoStaticFiles.test.mjs`
- `src/domain/seo/faqMetadata.test.mjs`
- `src/pages/preguntas-frecuentes.test.mjs`
- `functions/publicDeliveryRoutes.test.mjs`
- `functions/publicationPublishExecution.test.mjs`
- `npm run build`
- `npm --prefix functions run build`
