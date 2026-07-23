# AEO Route Inventory

Status: Current Implementation Inventory.

Scope: public route semantics, extractable answer surfaces, structured data,
rendering constraints, and AI crawler readiness for the current routing model.

Authority: this inventory is the source of truth for Answer Engine Optimization
policy. It complements [SEO_ROUTE_INVENTORY.md](SEO_ROUTE_INVENTORY.md), which
remains the source of truth for crawlability, indexability, robots, canonicals,
and sitemap inclusion.

## Current Route Policy

| Route | Primary objective / entity | Intent and questions | Current AEO state | Missing / decision | Priority |
| --- | --- | --- | --- | --- | --- |
| `/` | Explain and sell `Reserva el Día`. Entity: the Reserva el Día web product. | What it is, what it does, RSVP, WhatsApp sharing, price, wedding invitation management. | Indexable static export with title, description, canonical, Open Graph, Twitter Card, `Organization`, `WebSite`, and `WebPage` JSON-LD. | `FAQPage`, `SoftwareApplication`, `Service`, and `Product` require approved visible copy and schema fields first. | High |
| `/preguntas-frecuentes/` | Answer practical questions about digital invitations. Entity: Reserva el Día FAQ. | What a digital invitation is, creation, personalization, RSVP, WhatsApp sharing, compatibility, price, duration, weddings, and other events. | Indexable static export with semantic visible Q&A grouped by category, canonical/social metadata, and `FAQPage` JSON-LD generated from the same question authority. | Keep visible copy and structured data aligned; do not add schema-only answers. | High |
| `/i/{slug}` | Private shareable invitation. Entity: one event invitation. | Direct guest access by exact URL only. | Public delivery must remain `noindex, noarchive`; social preview metadata is allowed for sharing. | Do not add sitemap, canonical, indexable schema, `nofollow`, or `nosnippet` without a documented technical reason. | High |
| `/i/{slug}/share.jpg` | Social preview image for one invitation. | Image fetch for WhatsApp and social previews. | `X-Robots-Tag: noindex`; not an answer surface. | None. | High |
| `/dashboard/`, `/dashboard/**` | Authenticated customer application. | App usage, not public answer content. | `noindex, noarchive`; static shell plus client-side auth. | None for AEO. | High |
| `/admin/*` | Administration. | Internal management, not public answer content. | `noindex, noarchive`. | None for AEO. | High |
| `/boda/*` | Legacy public/demo surface. | Not a current answer target. | `noindex, noarchive`. | Could become approved template/content pages only after a new inventory entry. | Medium |
| `/para-diseño/` | Legacy design surface. | Not a current answer target. | `noindex, noarchive`. | Keep out of answer surfaces unless product approves a future public page. | Medium |
| `/404/`, `404.html` | Error surface. | Page not found. | `noindex`. | None for AEO. | Medium |
| `/robots.txt` | Crawler policy. | Lets search and answer crawlers discover indexable content and see `noindex` where needed. | Static file allows crawling and points to the sitemap. | Do not block `/i/`; crawlers need to see the invitation `noindex`. | High |
| `/sitemap.xml` | Search discovery. | Lists approved indexable URLs. | Static sitemap lists `/` and `/preguntas-frecuentes/`. | Add future content pages only after this inventory and the SEO inventory are updated. | High |
| `/_next/**`, `/assets/**`, `/icons/**`, `/favicon_io/**` | Static resources. | Support rendering, not answer content. | No sitemap; PDFs use `noindex` where configured. | None for AEO. | Medium |

## Current Findings

- The landing and FAQ are the approved indexable public pages and current
  answer-engine targets.
- The public invitation route is intentionally private for search and answer
  engines. It must remain crawlable enough for crawlers to observe `noindex`.
- The template showcase is loaded client-side from Firestore, so template cards
  are not reliable extractable content in the initial static HTML.
- Footer FAQ links point to the approved `/preguntas-frecuentes/` route. Privacy
  and terms remain anchors and still require product/legal approval before they
  become public content routes.
- `SearchAction` is not appropriate until a public search endpoint and search UI
  exist.
- `FAQPage` must not be emitted as hidden-only JSON-LD. Add it only with
  matching visible FAQ content that has been approved.

## Future High-Potential Answer Surfaces

| Future route | Intent | Expected AEO role | Impact |
| --- | --- | --- | --- |
| `/plantillas/`, `/plantillas/boda/` | Browse wedding invitation templates. | Template category entity hub with static, crawlable examples. | High |
| `/funcionalidades/confirmacion-asistencia/` | RSVP online questions. | Feature page for "confirmacion de asistencia online" intents. | High |
| `/funcionalidades/invitaciones-whatsapp/` | WhatsApp invitation sharing. | Feature page for sharing and delivery intents. | High |
| `/funcionalidades/lista-de-invitados/` | Guest-list management. | Feature page for planning and management intents. | High |
| `/precios/` | Pricing and purchase confidence. | Commercial answer surface with clear offer information. | High |
| `/guias/que-es-una-invitacion-digital/` | Definition and educational query. | Top-of-funnel answer page. | High |
| `/guias/como-hacer-rsvp-online/` | RSVP setup and event planning. | Educational answer page. | Medium |

## Verification Anchors

- `src/domain/seo/landingMetadata.test.mjs`
- `src/domain/seo/faqMetadata.test.mjs`
- `src/pages/preguntas-frecuentes.test.mjs`
- `functions/seoStaticFiles.test.mjs`
- `functions/publicDeliveryRoutes.test.mjs`
- `functions/publicationPublishExecution.test.mjs`
- `npm run build`
