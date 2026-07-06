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
| `/i/{slug}` | No | `noindex, noarchive` | Omitted | No | Open Graph and Twitter Card for private sharing | None | High |
| `/i/{slug}/share.jpg` | No | `X-Robots-Tag: noindex` | N/A | No | N/A | None | High |
| `/dashboard/`, `/dashboard/**` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/admin/*` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/boda/*` | No | `noindex, noarchive` | Omitted | No | None | None | High |
| `/para-diseño/` | No | `noindex, noarchive` | Omitted | No | None | None | Medium |
| `/404/`, `404.html` | No | `noindex` | Omitted | No | None | None | Medium |
| `/robots.txt` | N/A | Allows crawling | N/A | No | None | None | High |
| `/sitemap.xml` | N/A | Accessible | N/A | No | None | None | High |
| `/_next/**`, `/assets/**`, `/icons/**`, `/favicon_io/**` | Not pages | No sitemap; public PDFs use `noindex` | N/A | No | None | None | Medium |

## Implementation Notes

- `robots.txt` is static in `public/robots.txt` because the policy does not
  depend on Firestore or runtime publication state.
- `sitemap.xml` is static in `public/sitemap.xml` while the only indexable route
  is `/`. Do not add `/i/{slug}` to any sitemap.
- Do not disallow `/i/` in `robots.txt`; crawlers must be able to see the
  `noindex` directive on private invitations.
- Public invitations use `noindex, noarchive` only. Do not add `nofollow` or
  `nosnippet` unless a concrete technical reason is documented here first.
- Future SEO pages such as `/plantillas/`, `/funcionalidades/*`,
  `/preguntas-frecuentes/`, guides, or blog posts must be added to this
  inventory before implementation.
- AEO policy is tracked in [AEO_ROUTE_INVENTORY.md](AEO_ROUTE_INVENTORY.md).
  Keep both inventories aligned when route indexability, metadata, or
  structured-data policy changes.

## Verification Anchors

- `functions/seoStaticFiles.test.mjs`
- `functions/publicDeliveryRoutes.test.mjs`
- `functions/publicationPublishExecution.test.mjs`
- `npm run build`
- `npm --prefix functions run build`
