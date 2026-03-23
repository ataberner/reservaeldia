# ARCHITECTURE OVERVIEW

## 1. High-Level Overview
Reserva el Dia is a Next.js application for creating and publishing digital event invitations from reusable templates. The authenticated dashboard at `/dashboard` is the authoring workspace: users browse templates, create a draft, edit invitation content in a Konva canvas editor, preview the generated HTML, and publish a public invitation at `/i/{slug}`.

The current architecture is draft-first. `borradores` is the editable source of truth, `publicadas` is the active publication record, `publicadas_historial` is publication history, and the HTML stored at `publicadas/{slug}/index.html` is a generated artifact, not an editable source. Firebase Hosting serves the exported dashboard app from `out`, rewrites `/dashboard` to that app shell, and rewrites `/i/**` to `verInvitacionPublicada`.

## 2. Tech Stack
- Next.js + React: landing page, authenticated dashboard, app shell, and frontend composition.
- Next.js static hosting output: the dashboard is deployed from `out` through Firebase Hosting.
- Konva + `react-konva`: visual canvas editor for invitation layout and element editing.
- Firebase Auth: authentication and access control for dashboard and callable functions.
- Firestore: drafts, template catalog data, publication metadata, publication history, and user profile data.
- Cloud Functions: privileged workflows for template copy, publication checkout/payment, public delivery, public RSVP submission, admin/config flows, and lifecycle cleanup.
- Firebase Storage: published invitation HTML and draft thumbnails.
- Mercado Pago: payment provider used by the current publication flow. Publishing is payment-gated in the current codebase.

## 3. System Components
- **Dashboard**: `src/pages/dashboard.js` is the main authenticated shell. It coordinates the home view, published view, trash view, admin view, and active editor session.
- **Canvas Editor**: `src/components/CanvasEditor.jsx` orchestrates editing state and composes the main editor hooks for persistence, history, section behavior, interaction, and mobile behavior.
- **Sidebar / UI panels**: `src/components/DashboardSidebar.jsx` and related toolbar/panel components are the insertion and configuration surface for canvas elements. They should remain UI-driven entry points, not alternate sources of truth.
- **Firestore drafts**: `borradores` holds the canonical editable invitation state. Any feature that affects the invitation itself must be representable here before it can be previewed or published.
- **Template sources**: `plantillas_catalog` is the dashboard listing/read model, while `plantillas` is the full template source used when copying or opening a specific template.
- **Cloud Functions**: `functions/src/index.ts` is the backend export surface. Privileged workflows should live in domain modules under `functions/src/` and be re-exported from this entry point.
- **Storage**: `publicadas/{slug}/index.html` stores the published HTML artifact, and `thumbnails_borradores/{uid}/{slug}.webp` stores draft thumbnails. Both are derived assets, not primary business state.

## 4. Data Flow
1. The user authenticates and opens `/dashboard`.
2. The dashboard loads:
   drafts from `borradores`,
   active publications from `publicadas`,
   publication history from `publicadas_historial`,
   template listings from `plantillas_catalog`,
   dashboard home config through `getDashboardHomeConfigV1`.
3. When the user selects a template, the frontend template service calls `copiarPlantilla`. That function copies the full template from `plantillas` into a new draft document in `borradores`.
4. The canvas editor loads `objetos`, `secciones`, `rsvp`, and `gifts` from that draft and keeps them in React state. `src/components/editor/persistence/useBorradorSync.js` normalizes and autosaves changes back to Firestore.
5. Before preview or publish, the dashboard requests an immediate draft flush so the backend-facing flow does not work with stale editor state.
6. Preview generation uses the current draft state and imports the shared HTML generator from `functions/src/utils/generarHTMLDesdeSecciones.ts`.
7. Publishing opens the checkout flow, creates a session with `createPublicationCheckoutSession`, submits payment with `createPublicationPayment`, polls status with `getPublicationCheckoutStatus`, and resolves slug conflicts with `retryPaidPublicationWithNewSlug` when needed.
8. After payment approval, the backend finalizes publication: it reads the draft from `borradores`, resolves asset URLs for public use, generates final HTML, writes `publicadas/{slug}/index.html` to Storage, updates `publicadas`, and writes publication lifecycle metadata back to the draft.
9. Public visitors open `/i/{slug}`. Firebase Hosting rewrites the request to `verInvitacionPublicada`, which validates publication state and serves the stored HTML only when the invitation is active.
10. Public RSVP writes do not touch the draft. `publicRsvpSubmit` writes responses under the published invitation document.

## 5. Frontend Structure
- `src/pages/index.js`: landing page and auth handoff entry point.
- `src/pages/dashboard.js`: authenticated application shell, dashboard mode router, preview/publish entry point, and editor session coordinator.
- `src/components/dashboard/home/`: dashboard home rails for drafts, publications, and editorial template collections.
- `src/components/CanvasEditor.jsx`: top-level editor orchestrator. Prefer extracting new editor behavior into hooks or domain utilities instead of growing this file further.
- `src/components/editor/persistence/`: draft/template loading, autosave, immediate flush, and draft hydration.
- `src/domain/templates/`: template fetch, template-to-draft creation, preview generation, personalization, and template admin helpers.
- `src/domain/drafts/`: draft normalization, lifecycle helpers, preview helpers, and trash behavior.
- `src/domain/publications/`: publication state, preview helpers, and frontend publication transitions.
- `src/domain/dashboard/`: dashboard home configuration retrieval and section modeling.

Actionable rule: if a change affects invitation rendering, update the shared generator path rather than creating separate frontend-only preview markup. Actionable rule: if a change affects editable invitation state, update the draft domain and persistence path before updating UI affordances.

## 6. Backend Structure
`functions/src/index.ts` is the only backend entry point exposed to Firebase. It should stay as a wiring layer that re-exports domain modules rather than absorbing more business logic directly.

Current backend domains:
- `functions/src/payments/`: publication checkout, Mercado Pago integration, slug reservation, publish finalization, lifecycle transitions, expiration handling, and cleanup.
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: HTML/CSS/runtime generation from stored editor data.
- `functions/src/drafts/`: draft trash lifecycle.
- `functions/src/dashboardHome/`: dashboard home editorial configuration.
- `functions/src/templates/`: template editorial/admin workflows.
- `functions/src/rsvp/`: RSVP configuration and support types.
- `functions/src/textPresets/`, `functions/src/iconCatalog/`, `functions/src/decorCatalog/`, `functions/src/analytics/`, `functions/src/siteSettings/`: supporting admin and business domains already present in the repo.

Public delivery is handled by `verInvitacionPublicada`. Public RSVP submission is handled by `publicRsvpSubmit`.

Actionable rule: new privileged workflows should be implemented in a dedicated module under `functions/src/` and exported from `functions/src/index.ts`, not added inline as another large block in the index file.

## 7. Editor Data Model (High-Level)
- `secciones` are ordered layout containers. They store section structure such as `id`, `orden`, height, background settings, `altoModo`, and background decoration data.
- `objetos` are positioned render elements linked to a `seccionId`. This is the element-level render model used by the editor, preview generation, and publish generation.
- Current object families visible in the code are text, images, icons, shapes, lines, galleries, countdowns, RSVP buttons, and gift buttons.
- Draft documents store `objetos`, `secciones`, optional `rsvp`, optional `gifts`, and metadata such as `draftContentMeta`, `ultimaEdicion`, `thumbnailUrl`, `slugPublico`, and `publicationLifecycle`.
- Derived fields such as `thumbnailUrl` and `slugPublico` are metadata around the draft. They are not replacements for the render arrays.

Actionable rule: any new renderable feature must be serializable inside the draft document, loadable by the editor, and consumable by the shared HTML generator. If one of those three paths is missing, the feature is incomplete.

## 8. Publishing Flow
Publishing is payment-gated.

The publish sequence is:
1. Validate the draft owner and the requested operation.
2. Reserve or confirm the public slug through the checkout session.
3. Confirm payment approval.
4. Read the canonical invitation state from `borradores`.
5. Resolve asset URLs for public delivery.
6. Generate final HTML from the draft render state.
7. Save HTML to `publicadas/{slug}/index.html` in Storage.
8. Create or update the `publicadas` document with publication metadata and lifecycle state.
9. Update the source draft with `slugPublico` and `publicationLifecycle`.

Actionable rule: do not treat stored public HTML as editable state. Republish from the draft instead. Actionable rule: any new public interaction must validate publication state before accepting writes, following the same pattern used by `verInvitacionPublicada` and `publicRsvpSubmit`.

## 9. Key Architectural Decisions
- **Drafts are canonical**: editable invitation state lives in Firestore `borradores`. `publicadas` and Storage hold publication snapshots and delivery artifacts.
- **Preview and publish share the generator**: both flows use the same HTML generation utilities, so generator changes affect both preview output and published output.
- **Template listing and template source are separated**: use `plantillas_catalog` for dashboard listing queries and `plantillas` for full template copy/open flows.
- **Public delivery is artifact-based**: public invitations are served from generated HTML in Storage through a function-backed route, not rendered live from dashboard React state.
- **Publishing is lifecycle-driven**: publication ownership, slug validity, payment approval, expiration, pause/trash state, and public access are all part of the publication model.

Actionable rule: when adding a new invitation capability, decide first whether it belongs to editable draft state, publication lifecycle state, or derived artifact generation. Do not mix those responsibilities.

## 10. Known Complexity Areas
- `src/pages/dashboard.js`: large orchestration surface for dashboard modes, preview, publish, and editor routing. Prefer extracting logic into hooks/services instead of adding more direct branching here.
- `src/components/CanvasEditor.jsx`: large editor orchestrator with many coupled interaction paths.
- `functions/src/index.ts`: still large even though many domains are extracted. Keep new work out of the index when possible.
- `functions/src/payments/publicationPayments.ts`: high-risk module because payment, slug reservation, publication state, and finalization are tightly coupled.
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: high-risk generator code because any render-model change must still produce correct public HTML and responsive behavior.
- Editor interaction logic: selection, drag, resize, history, inline text editing, and mobile behavior interact in the same runtime.
- Section mode and mobile layout behavior: `altoModo`, scaling, section height, and responsive output must stay aligned between editor, preview, and published HTML.
- Window bridges and custom events: the editor and sidebar coordinate through `window` state and custom events. Event names and payload assumptions are a sensitive contract.

Legacy/secondary note: `verInvitacion` and `src/components/Editor.jsx` still exist in the repo, but they are not the primary production path used by `src/pages/dashboard.js`.
