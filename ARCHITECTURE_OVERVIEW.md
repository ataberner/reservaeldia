# ARCHITECTURE OVERVIEW

## 1. High-Level Overview
Reserva el Dia is a Next.js application for creating, personalizing, and publishing digital event invitations. The authenticated dashboard at `/dashboard` is served as a static Next export from `out` through Firebase Hosting. The public invitation route `/i/{slug}` is not rendered by Next.js; Hosting rewrites it to the Cloud Function `verInvitacionPublicada`, which serves a stored HTML artifact from Firebase Storage after validating publication state.

The current production flow is draft-first. The editable invitation source of truth is the render state stored in `borradores`, centered on `objetos`, `secciones`, `rsvp`, and `gifts`. `publicadas` stores the active public publication record, `publicadas_historial` stores finalized publication snapshots, and `publicadas/{slug}/index.html` in Storage is a generated delivery artifact. The dashboard also contains template authoring and admin flows; template workspaces currently coexist with user drafts inside the same application and, in some cases, inside the same `borradores` collection with `templateWorkspace.mode = "template_edit"`.

## 2. Tech Stack
- Next.js + React: landing page, authenticated dashboard shell, template modal flows, and editor orchestration.
- Next.js static export: in non-development builds the app uses `output: "export"` and is deployed from `out`.
- Firebase Hosting: serves the exported app shell and applies rewrites from `firebase.json`.
- Firebase Auth: dashboard authentication and callable function auth context.
- Firestore: drafts, active publications, publication history, template source documents, template catalog documents, editorial config, admin/template workspaces, and user/profile data.
- Cloud Functions v2 in `us-central1`: public delivery, public RSVP submission, template copy, template/editorial admin flows, publication checkout/payment, lifecycle transitions, schedulers, analytics, and supporting admin APIs.
- Firebase Storage: published HTML artifacts, draft thumbnails, template shared assets, user uploads, and draft/template asset files.
- Konva + `react-konva`: canvas editor runtime used by the dashboard editor.
- Mercado Pago: checkout and payment processing for publication and publication updates.
- Shared contract helpers under `shared/`: render asset normalization, legacy render-contract classification, and template preview source resolution used across frontend and backend.

## 3. System Components
- **Dashboard shell**: `src/pages/dashboard.js` coordinates auth gating, dashboard home, published/trash/admin views, editor route resolution, preview generation, publication checkout, admin read-only draft sessions, and template sessions.
- **Dashboard home**: `src/components/dashboard/home/DashboardHomeView.jsx` composes `useDashboardDrafts`, `useDashboardPublications`, `useDashboardHomeTemplates`, `useDashboardHomeConfig`, and `useDashboardHomeSections`. Home data is still assembled from multiple reads rather than from a single backend dashboard read model, but draft/publication visibility and preview fallback now go through centralized helpers in `src/domain/invitations/`.
- **Invitation read-resolution helpers**: `src/domain/invitations/readResolution.js` centralizes owned-draft resolution, publication-link lookup, and fallback ordering for dashboard/editor reads. `src/domain/invitations/previewReadModel.js` centralizes preview-image candidate ordering and linked-draft fallback for drafts and publications.
- **Canvas editor**: `src/components/CanvasEditor.jsx` is the Konva editor entry point used for draft sessions and template sessions. Persistence and immediate-flush bridging are delegated to `src/components/editor/persistence/useBorradorSync.js`.
- **Draft persistence layer**: `useBorradorSync` loads either a draft from `borradores` or a template editor document through admin callables, refreshes Storage download URLs on load, normalizes render assets, hydrates editor state, autosaves canonical render fields, and exposes immediate flush behavior through events and `window.canvasEditor.flushPersistenceNow`. Ordering is serialized through the shared draft-write coordinator even when section mutations still use direct Firestore writes.
- **Critical flush path**: `src/domain/drafts/criticalFlush.js` and `src/domain/drafts/flushGate.js` centralize preview/publish flush confirmation. Template sessions prefer the direct `window.canvasEditor.flushPersistenceNow` bridge when available, while draft sessions use the `editor:draft-flush:request` / `editor:draft-flush:result` event protocol implemented by `useBorradorSync`.
- **Editor snapshot adapter**: `src/lib/editorSnapshotAdapter.js` is the read boundary for non-editor consumers that need the current render snapshot, section info, or object lookup. The editor feeds it through its window bridges, and it still falls back to legacy `window._*` globals during the migration.
- **Template modal and personalization flow**: `src/components/TemplatePreviewModal.jsx` and `src/domain/templates/` handle catalog reads, generated preview HTML, live preview patching, personalization patch generation, gallery uploads, and draft creation from templates. Preview source resolution is delegated to `shared/templates/contract.js`, runtime preview mode selection lives in `src/domain/templates/preview.js`, and both live preview patching and post-copy personalization consume field plans from `src/domain/templates/personalizationContract.js`.
- **Template/editorial admin flow**: `functions/src/templates/editorialService.ts` and `src/domain/templates/adminService.js` provide template list, trash, tag, workspace, editor document, draft-to-template, and commit flows. Template workspaces are not written directly to `plantillas`; they go through intermediate editor/workspace documents.
- **Backend entry point**: `functions/src/index.ts` is the deployed Functions surface. It re-exports many domain handlers, but it also still contains current inline handlers and legacy exports.
- **Shared render contract layer**: `shared/renderAssetContract.*`, `shared/renderContractPolicy.*`, and `functions/src/utils/functionalCtaContract.ts` are the cross-runtime contract surface used by editor persistence, template flows, preview generation, publish validation, and final publish generation.
- **Storage artifacts**: `publicadas/{slug}/index.html` is the published invitation artifact, `thumbnails_borradores/{uid}/{slug}.webp` is the draft thumbnail artifact, and `plantillas/{plantillaId}/assets/...` is the shared asset destination used when template copy detects private storage paths.

## 4. Data Flow
1. The user authenticates and opens `/dashboard`. Firebase Hosting serves the static app shell, and the page resolves the active dashboard view in `src/pages/dashboard.js`.
2. The dashboard home loads user drafts from `borradores` filtered by `userId`. The client excludes drafts in trash, excludes template workspaces where `templateWorkspace.mode === "template_edit"`, excludes drafts whose publication lifecycle resolves to already published/finalized states for the draft rail, and builds draft preview candidates through `src/domain/drafts/preview.js` / `src/domain/invitations/previewReadModel.js`.
3. The dashboard home loads active publications from `publicadas` and finalized publication snapshots from `publicadas_historial`, merges them client-side, and resolves preview images through `resolvePublicationPreviewReadModelsByItemKey`, which prefers publication metadata and can fall back to linked-draft preview candidates. If the `publicadas_historial` query fails with permission denied, the home rail degrades to active publications only.
4. The dashboard home loads template listings from `plantillas_catalog` and home editorial configuration through `getDashboardHomeConfigV1`. The client then builds the visible template rails from that config plus the catalog response.
5. When the user opens a template modal, the preview source is resolved from the shared template contract. The modal can either embed an external preview URL or generate preview HTML locally by importing `functions/src/utils/generarHTMLDesdeSecciones.ts`. Live `postMessage` patching only runs when the generated HTML path is active.
6. When the user creates a draft from a template, the frontend calls `copiarPlantilla`. The backend reads `plantillas/{id}`, normalizes the template contract, rejects archived or non-public editorial states, clones private storage-backed assets into `plantillas/{plantillaId}/assets/...` when needed, normalizes render assets, and writes a new `borradores/{slug}` document with `editor: "konva"`, `objetos`, `secciones`, `tipoInvitacion`, `portada`, and draft lifecycle metadata.
7. If the template modal applies user input, the frontend optionally uploads gallery files, resolves template input values, builds a personalization patch from the shared personalization contract, and updates the newly created draft with patched `objetos`, `secciones`, `rsvp`, `gifts`, `templateInput`, `draftContentMeta`, and `ultimaEdicion`.
8. When the dashboard opens an editor session, it first resolves the compatible owned draft slug through `resolveOwnedDraftSlugForEditorRead`. `useBorradorSync` then reads `borradores/{slug}` for draft sessions or a template editor document through `getTemplateEditorDocument` for template sessions. In both cases it normalizes the render state, refreshes Firebase Storage URLs, backfills `tipoInvitacion` from the template when missing on a draft, hydrates editor state, and stores invitation-type hints on `window`.
9. During editing, the editor keeps `objetos`, `secciones`, `rsvp`, and `gifts` in React state. `useBorradorSync` debounces writes back to Firestore for drafts or to `saveTemplateEditorDocument` for template sessions. Autosave, direct section writes, and flushes now share one FIFO coordinator, so persistence order is serialized even though different triggers still exist.
10. When the dashboard generates preview, it first forces that immediate flush. Draft sessions use the `editor:draft-flush:request` / `editor:draft-flush:result` event flow, while template sessions prefer the direct `flushPersistenceNow` bridge. The flush helper can capture a compatibility snapshot via `readEditorRenderSnapshot`.
11. The dashboard then re-reads the draft from Firestore or the template editor document from the admin API. If that flush-boundary snapshot exists, preview overlays it on top of the re-read payload before HTML generation. Preview therefore uses a persisted re-read plus a current editor boundary snapshot, not raw unsynchronized globals.
12. Draft preview generation normalizes the draft render state, builds preview-ready `rsvp` and `gifts` configs, resolves existing-publication linkage through `resolvePublicationLinkForDraftRead` (centralizing `slugPublico`, direct public-slug lookup, and legacy `slugOriginal` fallback), and then imports `functions/src/utils/generarHTMLDesdeSecciones.ts` to produce the HTML shown in `ModalVistaPrevia`.
13. Before publish checkout opens, the dashboard forces another immediate draft flush and calls `validateDraftForPublication`. The backend now treats publish preflight as a separate step: `preparePublicationRenderState` normalizes publish-ready assets and CTA contract state, and `validatePreparedPublicationRenderState` classifies blockers and warnings. If blockers are present, checkout is not opened.
14. The checkout flow in `src/components/payments/PublicationCheckoutModal.jsx` creates a session with `createPublicationCheckoutSession`, reserves or reuses the public slug depending on `new` vs `update`, submits payment with `createPublicationPayment`, polls `getPublicationCheckoutStatus`, and can recover from an approved slug conflict with `retryPaidPublicationWithNewSlug`.
15. After payment approval, the request still enters through `functions/src/payments/publicationPayments.ts`, but approved-session settlement is now delegated to `functions/src/payments/publicationApprovedSessionFlow.ts`. That flow claims the approved checkout session, reuses `publishDraftToPublic`, and the post-gating publish execution now delegates HTML generation, Storage write, publication payload assembly, linked-draft sync, and first-publication analytics to `functions/src/payments/publicationPublishExecution.ts`. Lifecycle/date shaping, write preparation, operation planning, and operation execution are handled by dedicated backend helpers in the same domain.
16. Frontend responsibility ends at authoring state, flush confirmation, preview payload shaping, and checkout initiation. Backend responsibility starts at publish preflight, asset normalization for public delivery, lifecycle gating, HTML artifact generation, and publication metadata writes.
15. Public visitors open `/i/{slug}`. Firebase Hosting rewrites the request to `verInvitacionPublicada`, which reads `publicadas/{slug}`, builds a backend lifecycle snapshot through `resolvePublicationLifecycleSnapshotFromData`, rejects requests unless the resolved raw public state is currently publicly accessible, finalizes expired publications on access when needed, and serves the stored HTML artifact from Storage only when the invitation is currently publicly accessible.
16. Public RSVP submission goes through `publicRsvpSubmit`. It only accepts `POST`, validates slug and publication accessibility through the same backend lifecycle snapshot boundary, finalizes expired publications on request when needed, writes under `publicadas/{slug}/rsvps`, and stores both the current structured RSVP payload (`answers`, `metrics`, `schemaQuestionIds`) and legacy compatibility fields such as `nombre`, `asistencia`, `confirma`, `cantidad`, and `mensaje`.

## 5. Frontend Structure
- `src/pages/index.js`: landing page and auth entry point.
- `src/pages/dashboard.js`: dashboard shell, route resolution, preview generation, checkout entry point, admin read-only draft sessions, and template session coordinator.
- `src/components/dashboard/home/`: dashboard home composition and rail rendering for drafts, publications, and editorial template rows.
- `src/hooks/useDashboardDrafts.js`: live draft rail query and client-side visibility filtering for drafts.
- `src/hooks/useDashboardPublications.js`: active publication + history query, client-side merge, and fallback preview resolution.
- `src/hooks/useDashboardHomeConfig.js`, `src/hooks/useDashboardHomeTemplates.js`, `src/hooks/useDashboardHomeSections.js`: editorial home config fetch and template section assembly.
- `src/components/CanvasEditor.jsx`: editor orchestration, runtime bridges, history, interaction, and section behavior.
- `src/components/editor/persistence/`: draft/template load, autosave, flush bridge, Storage URL refresh, and draft hydration.
- `src/components/TemplatePreviewModal.jsx`: template preview iframe, live preview patching for generated HTML, and transition into draft creation.
- `src/domain/invitations/`: centralized draft/publication read resolution and preview read models used by dashboard home, editor entry, and publication UI surfaces.
- `src/domain/templates/`: template repository reads, template form modeling, personalization, preview generation, live preview patch building, gallery uploads, and admin/template authoring helpers.
- `src/domain/drafts/`: source-of-truth helpers, critical flush coordination, event-based flush gating, preview candidate resolution, and draft trash/publication state helpers.
- `src/domain/publications/`: frontend publication status resolution, preview helpers, and frontend wrappers for publication state transitions and validation.
- `src/domain/dashboard/`: dashboard home config fetch and home section modeling.
- `src/lib/editorSnapshotAdapter.js`: normalized read boundary for live editor snapshots, section info, and object lookups, with legacy-window fallback during migration.

## 6. Backend Structure
`functions/src/index.ts` is the deployed Functions entry point. It re-exports domain handlers, hosts the Express app used by `verInvitacionPublicada`, and still contains several current inline handlers plus legacy exports.

Current backend domains visible in the repo:
- `functions/src/payments/publicationPayments.ts`: request-facing publication/payment orchestration, Mercado Pago request building, discount/admin handlers, lifecycle entry points, and delegation to extracted publication helper seams.
- `functions/src/payments/publicationLifecycle.ts`: backend lifecycle interpretation, effective expiration/date resolution, lifecycle payload shaping, public accessibility inputs, and trash-purge input derivation.
- `functions/src/payments/publicationWritePreparation.ts`: history and linked-draft write shaping used by publish/finalization flows.
- `functions/src/payments/publicationOperationPlanning.ts` and `functions/src/payments/publicationOperationExecution.ts`: planned write/delete choreography for publish, finalization, approved-session outcomes, trash purge, and legacy cleanup.
- `functions/src/payments/publicationApprovedSessionFlow.ts`: approved-session settlement, receipt shaping, payment-result shaping, and Mercado Pago status mapping.
- `functions/src/payments/publicationPaymentEdge.ts`: request normalizers, amount helpers, Mercado Pago error mapping, payer/date helpers, and retry-result shaping used by request-facing payment handlers.
- `functions/src/payments/publicationPublishExecution.ts`: post-gating publish execution, including HTML generation, Storage write, active publication write assembly, linked-draft sync, icon-usage delta, and first-publication analytics.
- `functions/src/payments/publicationSlugReservationFlow.ts`: slug availability checks, reservation lifecycle writes, and active public-slug resolution for update flows.
- `functions/src/payments/publicationPublishValidation.ts`: publish preflight helpers that separate render-state preparation (`preparePublicationRenderState`) from compatibility validation (`validatePreparedPublicationRenderState`).
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: HTML, CSS, and runtime generation from stored render data.
- `functions/src/utils/publishAssetNormalization.ts`: publish-time asset resolution, section decoration normalization, and image source dimension backfill.
- `functions/src/drafts/`: draft trash lifecycle and purge scheduler behavior.
- `functions/src/dashboardHome/`: dashboard home editorial configuration.
- `functions/src/templates/`: template editorial/admin workflows, workspace handling, contract loading, and template asset cloning.
- `functions/src/rsvp/`: RSVP config modeling used by the generator/runtime.
- `functions/src/countdownPresets/`, `functions/src/iconCatalog/`, `functions/src/decorCatalog/`, `functions/src/textPresets/`, `functions/src/analytics/`, `functions/src/siteSettings/`: supporting business/admin domains currently exported by the backend.

Public delivery and write surfaces:
- `verInvitacionPublicada`: serves the stored public HTML artifact after publication-state validation.
- `publicRsvpSubmit`: receives public RSVP writes into `publicadas/{slug}/rsvps`.
- `mercadoPagoWebhook`: updates checkout sessions from Mercado Pago webhook events.

Secondary or legacy backend exports still present:
- `verInvitacion`
- `copiarPlantillaHTML`
- `publicarInvitacion`
- `functions/src/backupindex.ts`

## 7. Editor Data Model (High-Level)
- The canonical editable invitation render state is defined in `src/domain/drafts/sourceOfTruth.js` and mirrored in `functions/src/drafts/sourceOfTruth.ts`. The canonical fields are `objetos`, `secciones`, `rsvp`, and `gifts`.
- `draftContentMeta` currently records `policyVersion`, `canonicalSource`, `lastWriter`, and optional `lastReason`. `canonicalSource` is `draft_render_state`, and current writers are `modal`, `canvas`, `system`, and `publish`.
- `secciones` are ordered layout containers. Their persisted fields include identifiers, order, height, background settings, `altoModo`, and normalized background decoration payloads.
- `objetos` are positioned render elements linked by `seccionId`. Current generator and validation code recognize text, image, icon, gallery, countdown, RSVP button, gift button, generic button, line/divider, and shape families, plus legacy compatibility aliases such as `icono-svg`.
- Draft documents also carry metadata around the render state, including `plantillaId`, `tipoInvitacion`, `portada`, `thumbnailUrl`, `slugPublico`, `publicationLifecycle`, `ultimaEdicion`, trash metadata, and optional template-specific metadata such as `templateInput` and `templateWorkspace`.
- Template workspaces are represented separately from normal user drafts. In the dashboard they are identified through `templateWorkspace.mode = "template_edit"` and are hidden from the normal draft rail.
- Shared render contract code lives outside the dashboard in `shared/renderAssetContract.*` and `shared/renderContractPolicy.*`. Those modules are used by editor persistence, template authoring/personalization, preview generation, publish validation, and publish generation, so the same stored object/section data is interpreted against a shared field contract across runtimes.
- Functional CTA behavior is resolved from two layers: root `rsvp` and `gifts` config objects, plus object-level CTA buttons such as `rsvp-boton` and `regalo-boton`. The generator and publish validator both use `functions/src/utils/functionalCtaContract.ts` to reconcile those layers.
- RSVP root-config normalization is aligned between `src/domain/rsvp/config.js` and `functions/src/rsvp/config.ts` for editor, preview, generator, and publish validation flows. Public RSVP submission still uses a separate write contract handled by `publicRsvpSubmit`.
- Asset field normalization is centralized, but asset resolution is still split by stage:
  - Template copy normalizes template asset fields and clones private storage-backed paths into `plantillas/{plantillaId}/assets/...`.
  - Draft load in the editor refreshes Firebase Storage download URLs client-side through `refreshUrlsDeep`.
  - Publish preparation resolves storage-backed asset fields to signed read URLs server-side, rebuilds section decoration payloads, and backfills source image dimensions when possible.

## 8. Publishing Flow
Publishing is payment-gated and supports both `new` and `update` operations.

Checkout preflight and final publish now reuse the same preparation/validation helper pair rather than open-coding separate publish-readiness checks.

Publication state and lifecycle currently span three layers:
- Draft-side lifecycle metadata in `borradores.publicationLifecycle`
- Active public publication documents in `publicadas`
- Finalized publication snapshots in `publicadas_historial`

Current lifecycle behavior:
- Draft lifecycle states: `draft`, `published`, `finalized`
- Public publication states: `publicada_activa`, `publicada_pausada`, `papelera`
- Backend lifecycle interpretation for publications is centralized in `functions/src/payments/publicationLifecycle.ts`
- Effective expiration is resolved from stored expiration inputs first (`venceAt ?? vigenteHasta`), then backend lifecycle fallback fields such as `publicationLifecycle.expiresAt`, and then a derived publication-date-based expiration when the caller uses that derived path
- Public accessibility is determined from the resolved raw public state, while expired publications are rejected/finalized as a separate step
- Trash retention for publicadas is 30 days after the backend purge input date; that purge input currently comes from `venceAt ?? vigenteHasta`, and when those fields are missing the backend purge path derives it from publication-date inputs rather than from `publicationLifecycle.expiresAt`

The publish sequence implemented today is:
1. Validate draft ownership and requested operation in `publicationPayments.ts`.
2. For `new`, validate and reserve the requested public slug through `publicationSlugReservationFlow.ts`. For `update`, resolve the active linked public slug through the same slug-resolution seam.
3. Create a checkout session in `publication_checkout_sessions` and, when needed, initialize Mercado Pago preference/payment data.
4. After payment approval, `publicationApprovedSessionFlow.ts` claims the session's `publishing` slot and short-circuits duplicate settlement attempts.
5. `publishDraftToPublic` re-reads the draft, re-runs publish preflight, and keeps ownership/new-vs-update/conflict/expired-publication gating in `publicationPayments.ts`.
6. `publicationPublishExecution.ts` generates final HTML, writes `publicadas/{slug}/index.html` to Storage, applies icon-usage delta, writes or updates `publicadas/{slug}`, and mirrors publication linkage back onto the source draft.
7. `publicationWritePreparation.ts`, `publicationOperationPlanning.ts`, and `publicationOperationExecution.ts` shape and apply the linked Firestore writes without changing current document contracts.

Active publication transitions are handled by `transitionPublishedInvitationState`:
- `pause`: active -> paused
- `resume`: paused -> active
- `move_to_trash`: paused -> trash
- `restore_from_trash`: trash -> paused

Finalization behavior:
- Expired publications are finalized by scheduler, by public access, or by public RSVP requests hitting an expired invitation.
- `publicationPayments.ts` still owns the entry points and RSVP summary collection, but finalization write/delete choreography is now planned in `publicationOperationPlanning.ts` and executed in `publicationOperationExecution.ts`.
- Finalization writes a history snapshot into `publicadas_historial`, deletes the Storage artifact prefix `publicadas/{slug}/`, recursively deletes the active `publicadas/{slug}` document and subcollections, releases the slug reservation, and updates the linked draft to a finalized lifecycle state.

HTML generation today is shared between preview and publish:
- `functions/src/utils/generarHTMLDesdeSecciones.ts` builds the full HTML document, section markup, section background layers, Google Fonts link aggregation, RSVP modal HTML, gifts modal HTML, gallery modal HTML, countdown runtime, invitation loader runtime, motion effects runtime, preview-only template patch runtime, and preview mobile scroll runtime.
- `functions/src/utils/generarHTMLDesdeObjetos.ts` renders object-level HTML for text, image, icon, gallery, countdown, CTA buttons, generic buttons, lines, and shape families.
- `functions/src/utils/generarModalRSVP.ts` embeds the RSVP runtime and defaults `submitEndpoint` to `https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit` unless a config override is provided.

## 9. Key Architectural Decisions
- Draft render state in `borradores` is the editable source of truth for invitations.
- Preview and publish both use the backend HTML generator, even when preview is initiated from the frontend.
- Template catalog and full template source are stored separately in `plantillas_catalog` and `plantillas`.
- Public invitation delivery is artifact-based: the public route serves stored HTML from Storage through a Function-backed route.
- Publication lifecycle is split across active publication docs, finalized history docs, Storage artifacts, and mirrored draft metadata.
- Shared render contract code is used across frontend and backend, including compatibility branches for legacy countdown/icon contracts.
- Template authoring and user draft editing currently coexist inside the same dashboard shell and partially inside the same Firestore collection surface.
- Frontend owns live authoring state and preview boundary capture; backend owns publish preflight, public asset normalization, lifecycle enforcement, and final public artifact writes.

## 10. Known Complexity Areas
- `src/pages/dashboard.js`: large orchestration surface that mixes auth flow, dashboard home, editor route resolution, preview generation, publish gating, admin draft sessions, and template sessions.
- `src/components/CanvasEditor.jsx`: large editor runtime with selection, drag, resize, history, inline text behavior, mobile behavior, and window-based bridges.
- `src/components/editor/persistence/useBorradorSync.js`: combined load/persist normalization boundaries, URL refresh, autosave, thumbnail generation, invitation-type backfill, and immediate flush protocol for both draft and template sessions.
- `functions/src/index.ts`: large deployed entry point with both domain re-exports and inline/legacy handlers.
- `functions/src/payments/publicationPayments.ts`: high-density orchestration shell covering request/auth normalization, Mercado Pago request wiring, discount/admin handlers, checkout/session handlers, lifecycle entry points, and delegation to extracted publication helper seams.
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: shared generator code where changes affect preview HTML, published HTML, CTA runtime, and responsive behavior.
- Publish validation code: `functions/src/payments/publicationPublishValidation.ts` is now the dedicated publish preflight surface, but it still explicitly carries compatibility branches and drift detection for `image-crop-not-materialized`, `pantalla-ynorm-drift`, `fullbleed-editor-drift`, legacy countdown schema, and legacy icon contracts.
- Window bridges and custom events: critical flush requests are centralized in `src/domain/drafts/criticalFlush.js`, and non-editor snapshot reads go through `src/lib/editorSnapshotAdapter.js`, but preview generation and editor coordination still depend on window bridges and event names such as `editor:draft-flush:request` and `editor:draft-flush:result`.
- Legacy or secondary paths still in the repo: `verInvitacion`, `copiarPlantillaHTML`, `publicarInvitacion`, `functions/src/backupindex.ts`, and `src/components/Editor.jsx`.

## 11. Inconsistencias actuales
- Preview and publish do not read exactly the same input payload. Preview still uses a critical-flush boundary plus a `readEditorRenderSnapshot` overlay on top of a persistence re-read, while publish re-reads the draft on the backend and uses publish-only asset normalization.
- Template preview still has two different delivery paths: external preview URL and generated HTML. Preview source resolution and personalization field planning are now centralized, but only the generated HTML path supports live `postMessage` patching, scroll targeting, and text-position capture before opening the editor.
- Asset field normalization is centralized around `shared/renderAssetContract.*`, but asset resolution is still stage-specific. Template copy clones private assets into template-shared storage, editor load refreshes download URLs client-side, and publish resolves storage paths to signed server-side read URLs.
- Publication linkage still depends on multiple stored fields and fallbacks, but the dashboard no longer open-codes that lookup order: it centralizes the resolution logic in `src/domain/invitations/readResolution.js`.
- Preview-image fallback for drafts and publications is now centralized in `src/domain/invitations/previewReadModel.js`, but the UI still assembles data from multiple query surfaces and optional linked-draft fallback.
- Publication state is duplicated across `publicadas.estado`, `publicadas.publicationLifecycle`, `publicadas.pausadaAt`, `publicadas.enPapeleraAt`, draft-side `publicationLifecycle`, and draft-side `slugPublico`.
- Template state is duplicated across `plantillas` and `plantillas_catalog`, with editorial filtering and catalog projection applied separately from full template storage.
- Invitation type fields are still not perfectly aligned across layers. Drafts primarily use `tipoInvitacion`, templates still use `tipo`, and publish writes `publicadas.tipo` from `tipoInvitacion` with compatibility fallbacks to `tipo` and `plantillaTipo`.
- RSVP root-config normalization is aligned between client and server, but the public attendee submission contract is still a separate surface from the root `rsvp` config used by editor/preview/publish.
- The generated RSVP runtime carries a default hardcoded Cloud Functions endpoint. Public HTML does not derive RSVP submission from the current site origin unless config overrides it.
- Legacy render contracts remain active in current code paths. Countdown schema v1 and legacy `icono-svg` are still recognized by validation and generation, even though the main editor works on the modern object families.
- The publications home rail tolerates permission denial on `publicadas_historial` and silently falls back to active publications only, so the dataset shown in the dashboard can depend on Firestore rules and current permissions rather than on a single guaranteed query surface.

## 12. Riesgos actuales
- `alto`: Publish correctness still depends on agreement between editor persistence, shared render contracts, publish asset normalization, publish validation, and HTML generation. The shared contract and preflight helpers reduce drift, but they do not make preview/publish inputs identical.
- `alto`: `functions/src/payments/publicationPayments.ts` still concentrates request-facing checkout/payment handlers, Mercado Pago wiring, lifecycle entry points, and cross-flow sequencing. The deepest approved-session settlement, slug reservation, publish execution, and planned write/delete seams are now extracted, which narrows but does not remove backend orchestration risk.
- `alto`: Public lifecycle state is distributed across Firestore active docs, Firestore history docs, Storage HTML artifacts, slug reservations, and mirrored draft metadata. Finalization must keep all of those layers in sync.
- `medio`: Preview behavior is runtime-dependent because it still overlays a live editor snapshot on top of a persistence re-read. `readEditorRenderSnapshot` narrows that read boundary, but it currently falls back to legacy window globals during migration.
- `medio`: Asset URLs and media readiness are still derived in different runtimes for template copy, editor load, preview, and publish, even though the field contract is now more centralized.
- `medio`: Template preview uses two incompatible rendering paths with different capabilities, so preview behavior depends on template metadata and not only on template content.
- `medio`: The codebase maintains duplicated state fields and storage projections such as `plantillas` vs `plantillas_catalog`, draft `tipoInvitacion` vs template/publication `tipo`, and active publication state vs mirrored draft lifecycle metadata.
- `medio`: Legacy compatibility branches are still part of the active render pipeline, including legacy countdown and icon contracts that are validated and generated alongside modern objects.
- `bajo`: Dashboard home can render partial publication history when `publicadas_historial` is not readable, but the application continues functioning with active publication data only.
- `bajo`: Legacy exported routes and legacy editor files are still present in the repo and deployed surface, even though they are not the primary path used by current dashboard hosting rewrites.
