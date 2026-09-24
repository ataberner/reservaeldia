# ARCHITECTURE OVERVIEW

Status: Canonical Architecture Reference.

For documentation routing, status definitions, and subsystem reading order, use [DOCUMENTATION_INDEX.md](../DOCUMENTATION_INDEX.md).

Sections describing components/flows are implementation maps; future-change
standards belong to [ARCHITECTURE_GUIDELINES.md](ARCHITECTURE_GUIDELINES.md).
The [boundary map](#current-boundaries) and [decision register](#architectural-decisions)
were rechecked against a focused local source/test sample on 2026-09-10, without
executing application checks or inspecting deployment. This is not a full-system
revalidation. Decision acceptance and implementation evidence are separate.

## 1. High-Level Overview
Reserva el Dia is a Next.js application for creating, personalizing, and publishing digital event invitations. The authenticated dashboard at `/dashboard` is served as a static Next export from `out` through Firebase Hosting. The public invitation route `/i/{slug}` is not rendered by Next.js; Hosting rewrites it to the Cloud Function `verInvitacionPublicada`, which serves a stored HTML artifact from Firebase Storage after validating publication state.

The primary flow is draft-first. The editable invitation render source is stored in `borradores`: `objetos`, `secciones`, `rsvp`, `gifts`, and `eventDetails`, as defined by [DATA_MODEL.md](DATA_MODEL.md). Structured dynamic values in `templateInput.values` are projected into those render roots by their targets; the render source does not replace that structured-value authority. `publicadas` stores the active public publication record, `publicadas_historial` stores finalized publication snapshots, and `publicadas/{slug}/index.html` in Storage is a generated delivery artifact. The dashboard also contains template authoring and admin flows; template workspaces currently coexist with user drafts inside the same application and, in some cases, inside the same `borradores` collection with `templateWorkspace.mode = "template_edit"`.

Published social sharing support is defined by [PUBLISHED_SHARE_IMAGE_CONTRACT.md](../contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md). It defines a backend publish-pipeline artifact, `publicadas/{slug}/share.jpg`, generated from the first section of the generated published HTML and resolved into Open Graph metadata before the public publication document is persisted.

Checkout, payment approval, slug reservation, retry, automatic post-payment
recovery, public URL creation, and post-payment UI state are governed by
[CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md).
That contract owns lifecycle authority across `publication_checkout_sessions`,
`public_slug_reservations`, `publicadas`, Storage artifacts, and the `/i/{slug}`
delivery route.

## 2. Tech Stack
- Next.js + React: landing page, authenticated dashboard shell, template modal flows, and editor orchestration.
- Next.js static export: in non-development builds the app uses `output: "export"` and is deployed from `out`.
- Firebase Hosting: serves the exported app shell and applies rewrites from `firebase.json`.
- Firebase Auth: dashboard authentication and callable function auth context.
- Firestore: drafts, active publications, publication history, template source documents, template catalog documents, editorial config, admin/template workspaces, user/profile data, and the provider/category collections governed by the focused provider contract.
- Cloud Functions v2 in `us-central1`: public delivery, public RSVP submission, template copy, template/editorial admin flows, publication checkout/payment, lifecycle transitions, schedulers, analytics, and supporting admin APIs.
- Firebase Storage: published HTML artifacts, draft thumbnails, template shared assets, user uploads, and draft/template asset files.
- Konva + `react-konva`: canvas editor runtime used by the dashboard editor.
- Mercado Pago: checkout and payment processing for publication and publication updates.
- OpenAI Responses API: server-side structured interpretation for the superadmin-only `Diseñador AI` adapter; no browser SDK/key and no direct model access to persistence.
- Shared contract helpers under `shared/`: render asset normalization, legacy render-contract classification, and template preview source resolution used across frontend and backend.

## 3. System Components
- **Dashboard shell**: `src/pages/dashboard.js` coordinates auth gating, dashboard home, published/trash/admin views, editor route resolution, preview generation, publication checkout, admin read-only draft sessions, and template sessions.
- **Dashboard home**: `src/components/dashboard/home/DashboardHomeView.jsx` composes `useDashboardDrafts`, `useDashboardPublications`, `useDashboardHomeTemplates`, `useDashboardHomeConfig`, and `useDashboardHomeSections`. Home data is still assembled from multiple reads rather than from a single backend dashboard read model, but draft/publication visibility and preview fallback now go through centralized helpers in `src/domain/invitations/`.
- **Invitation read-resolution helpers**: `src/domain/invitations/readResolution.js` centralizes owned-draft resolution, publication-link lookup, and fallback ordering for dashboard/editor reads. `src/domain/invitations/previewReadModel.js` centralizes preview-image candidate ordering and linked-draft fallback for drafts and publications.
- **Canvas editor**: `src/components/CanvasEditor.jsx` is the Konva editor entry point used for draft sessions and template sessions. Persistence and immediate-flush bridging are delegated to `src/components/editor/persistence/useBorradorSync.js` and the session-aware persistence authority in `src/components/editor/persistence/editorSessionPersistence.js`.
- **Editor session persistence layer**: `editorSessionPersistence` routes normal editor-session reads and writes. Draft sessions read/write `borradores/{slug}` through Firestore; template sessions use admin callables. `useBorradorSync`, preload, fallback draft preview re-read, authoring, name saves, and section mutations consume that authority. Prepared preview reads are backend-owned: draft preview uses its callable and admin template preview uses `getPreparedTemplateEditorPreview` in the template callable adapter. Ordering is serialized through the shared draft-write coordinator for autosave, flush, and section mutation writes.
- **Critical flush path**: `src/domain/drafts/criticalFlush.js` and `src/domain/drafts/flushGate.js` centralize preview/publish flush confirmation. Template sessions prefer the direct `window.canvasEditor.flushPersistenceNow` bridge when available, while draft sessions use the `editor:draft-flush:request` / `editor:draft-flush:result` event protocol implemented by `useBorradorSync`.
- **Editor snapshot adapter**: `src/lib/editorSnapshotAdapter.js` is the read boundary for non-editor consumers that need the current render snapshot, section info, or object lookup. The editor feeds it through its window bridges, and it still falls back to legacy `window._*` globals during the migration.
- **Template modal and personalization flow**: `src/components/TemplatePreviewModal.jsx` and `src/domain/templates/` handle catalog reads, generated visual-only preview HTML, live preview patching, personalization patch generation, gallery uploads, and draft creation from templates. Preview source resolution is delegated to `shared/templates/contract.js`, runtime preview mode selection lives in `src/domain/templates/preview.js`, and both live preview patching and post-copy personalization consume field plans from `src/domain/templates/personalizationContract.js`.
- **Template/editorial admin flow**: `functions/src/templates/editorialService.ts` and `src/domain/templates/adminService.js` provide template list, trash, tag, workspace, editor document, draft-to-template, and commit flows. Template workspaces are not written directly to `plantillas`; they go through intermediate editor/workspace documents.
- **Backend entry points**: `firebase.json` registers `default` / source `functions` (102 exports from `functions/src/index.ts`) and `payments` / source `functions-payments` (exactly `createPublicationCheckoutSession`, `createPublicationPayment`, `mercadoPagoWebhook` from `functions/src/payments/entrypoint.ts`). Default no longer exports those three. Payments is built from canonical `functions/src` and `shared` code, without a second maintained implementation. The operator confirmed production migration and a real payment through automatic publication on 2026-09-24; [closure and rollback](../operations/PAYMENTS_CODEBASE_PREPARATION.md). Rotation of exposed `MP_WEBHOOK_SECRET` v1 remains pending. Default retains other domain reexports, inline handlers and legacy exports.
- **Provider directory boundary**: `functions/src/providers/` owns pure provider types, runtime validation, normalization, eligibility, Firestore mapping, category configuration, and Storage-path helpers. `scripts/providers/` owns explicit operator CLIs for local JSON/CSV analysis, guarded create-or-skip import, idempotent category seed, and single/mass description-and-image enrichment with durable recovery. The complete contract is [PROVIDER_DATA_MODEL.md](PROVIDER_DATA_MODEL.md) and commands are owned by `scripts/providers/README.md`; nothing in this domain is exported as a deployed Function or executed automatically.
- **Shared render contract layer**: `shared/renderAssetContract.*`, `shared/renderContractPolicy.*`, and `functions/src/utils/functionalCtaContract.ts` are the cross-runtime contract surface used by editor persistence, template flows, preview generation, publish validation, and final publish generation.
- **Gallery contract layer**: Gallery remains the existing `tipo: "galeria"` object family in `objetos[]`. System-wide Gallery behavior is routed through [GALLERY_SYSTEM_CONTRACT.md](../contracts/GALLERY_SYSTEM_CONTRACT.md), with focused contracts for editor/sidebar behavior, layout presets, and generated-HTML viewer behavior.
- **Designer AI adapter**: `DashboardSidebar` mounts `DesignerAiPanel` only for superadmins in writable draft sessions. The panel builds a minimal snapshot from existing editor/domain owners, calls the protected `designerAiChat` Function, validates the structured result again, and delegates allowlisted actions back to existing editor owners. It owns neither render state nor a backend tool executor. Conversation policy, capabilities, and the technical map are separated across [AI_ASSISTANT_CONVERSATION_CONTRACT.md](../contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md), [DESIGNER_AI_CAPABILITY_CONTRACT.md](../contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md), and [AI_ASSISTANT_SYSTEM.md](AI_ASSISTANT_SYSTEM.md).
- **Storage artifacts**: `publicadas/{slug}/index.html` is the published invitation artifact, `publicadas/{slug}/share.jpg` is the published social share artifact when generated, `thumbnails_borradores/{uid}/{slug}.webp` is the draft thumbnail artifact, and `plantillas/{plantillaId}/assets/...` is the shared asset destination used when template copy detects private storage paths. The share-image contract keeps the internal `storagePath` separate from the lifecycle-gated public `imageUrl` used by Open Graph metadata.

<a id="current-boundaries"></a>

### Current Responsibilities And Boundaries

This map names observed responsibilities, not layers guaranteed by directory
names. Pure logic returns values without SDK/UI effects; coordination orders
work; UI owns presentation/interaction; infrastructure performs transport and
storage. The standards describe how future changes should preserve or improve
those boundaries within their authorized scope.

| Responsibility | Current owner / boundary | Consumer and limit |
| --- | --- | --- |
| Live editing state and UI | [CanvasEditor.jsx](../../src/components/CanvasEditor.jsx) holds object/section arrays, root config state, selection/history and hook composition; editor composers/renderers draw Konva/DOM. | UI and gesture intents enter existing editor mutation owners. Persisted render state and phase-specific interaction geometry are distinct authorities; see Canvas Interaction Ownership below. The component still concentrates several responsibilities. |
| Domain transformation | [galleryMutations.js](../../src/domain/gallery/galleryMutations.js) implements Gallery transformations; `configureGalleryLayout` returns a result while preserving cells and validating selectable layouts. | [MiniToolbarTabImagen.jsx](../../src/components/MiniToolbarTabImagen.jsx), `handleSwitchGridSizeLayout`, calls that helper and `commitGalleryMutation` dispatches `EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT` to the editor. The helper neither owns React state nor writes Firestore. Its [tests](../../src/domain/gallery/galleryMutations.test.mjs) characterize accepted/rejected choices and cell preservation; this is static routing evidence, not an executed UI check. |
| Session persistence | [editorSessionPersistence.js](../../src/components/editor/persistence/editorSessionPersistence.js) binds Firestore draft reads/updates and template admin callables to [editorSessionPersistenceCore.js](../../src/components/editor/persistence/editorSessionPersistenceCore.js). `useBorradorSync` coordinates hydration/autosave/flush; [draftWriteCoordinator.js](../../src/components/editor/persistence/draftWriteCoordinator.js) serializes its queued writes. | Session consumers use this boundary; it is not the owner of all application writes. Backend publication and template administration have their own domain writers. [Core](../../src/components/editor/persistence/editorSessionPersistenceCore.test.mjs) and [FIFO](../../src/components/editor/persistence/draftWriteCoordinator.test.mjs) tests use controlled collaborators, not deployed Firebase. |
| SDK integration inside `domain` | [templates/adminService.js](../../src/domain/templates/adminService.js) imports Firebase Functions and wraps callables; [publications/service.js](../../src/domain/publications/service.js) is also a callable adapter. [src/firebase.js](../../src/firebase.js) supplies configured clients. | These are infrastructure adapters despite their directory. The naming/location differs from the pure-domain standard; no explicit acceptance of this placement as an architectural exception was found. Keep pure rules independent; a local fix does not require relocating the subsystem. |
| Preview coordination across runtimes | [useDashboardPreviewController.js](../../src/hooks/useDashboardPreviewController.js) coordinates flush/session/UI; [previewPipeline.js](../../src/domain/dashboard/previewPipeline.js) selects authority and consumes prepared results; [publicationPayments.ts](../../functions/src/payments/publicationPayments.ts), `prepareDraftPreviewRenderHandler`, reads the owned draft and delegates preparation/validation/generation. | The prepared draft branch does not re-read drafts/publications in the browser. It trusts no HTML when validation blocks. The backend may also resolve publication linkage; the frontend reflects the result. Exact paths belong to [Preview System Analysis](PREVIEW_SYSTEM_ANALYSIS.md). |
| Prepared render and public artifact writes | [prepareRenderPayload.ts](../../functions/src/render/prepareRenderPayload.ts) owns preparation, validation and the generator adapter; [publicationPublishExecution.ts](../../functions/src/payments/publicationPublishExecution.ts) coordinates post-gating HTML/share/Storage and publication writes. | Konva authoring is a different renderer. Authoritative preview and publish share prepared interpretation; public delivery reads the stored artifact under lifecycle gating. Template visual output does not prove draft publication readiness. |

### Local Environment Boundary — Phase 4A

[shared/firebaseEnvironment.cjs](../../shared/firebaseEnvironment.cjs) owns demo
identity, ports, configuration validation and generated RSVP destinations.
[src/firebase.js](../../src/firebase.js) and its initialization adapter connect
all four client services before exposing them, including server-side execution
and repeated module initialization. [firebaseAdmin.ts](../../functions/src/firebaseAdmin.ts)
validates the complete local Admin environment and preserves production initialization.

[The local launcher](../../scripts/local/runLocal.cjs) builds a sanitized copy of
the current working tree and uses an emulator-only Functions entry to delegate
reviewed handlers and block the remaining effects. It does not change the deployed
entry or provide authorization guarantees. Commands, destination matrix, evidence
and limits have one owner: [Development Workflow](../operations/DEVELOPMENT_WORKFLOW.md).
F10/F11 and Q1 remain open. F15 has scoped synchronization/watch mitigation;
prepared-tree propagation and live consumer reload remain separate limits.

<a id="shared-contract-copies"></a>

### Shared Sources, Adapters And Copies

- [shared/renderAssetContract.cjs](../../shared/renderAssetContract.cjs) is an editable rule source; [renderAssetContract.js](../../shared/renderAssetContract.js) is its ESM export adapter. Editor/Gallery consumers use the wrapper; [publishAssetNormalization.ts](../../functions/src/utils/publishAssetNormalization.ts) requires the Functions copy. Shared pure contracts must remain usable without importing Firebase or browser infrastructure.
- [syncTemplateContract.cjs](../../functions/scripts/syncTemplateContract.cjs) owns the exact artifact mapping from `shared/` to `functions/shared/` and `functions/lib/shared/`. Edit its listed canonical sources, not the destinations. It copies bytes; for `shared/templates/contract.js`, the destinations use `.mjs`. Do not infer generation for every file in a similarly named directory.
- [Functions package scripts](../../functions/package.json) separate read-only input/built checks, explicit synchronization and build. `build` synchronizes, compiles `functions/src/` into `functions/lib/`, then checks all mapped copies. `build:watch` observes canonical mapped sources plus this tree's `functions/src/**` and tsconfig, serializes those same steps and announces readiness only for stable, consistent inputs. The [5C runbook](../operations/DEVELOPMENT_WORKFLOW.md#shared-contracts-5c) defines recovery and snapshot boundaries. The executable map owns which targets are required input copies and which are build output; lint excludes only exact mapped copies and analyzes their canonical sources.
- Most compiled CJS consumers (for example `lib/utils/generarInvitationLoaderRuntime.js` and `lib/render/prepareRenderPayload.js`) resolve `../../shared/` to **`functions/shared/`**. `templates/contractLoader.ts` first resolves the `.mjs` contract in **`functions/lib/shared/templates/`** when compiled, with preexisting alternative paths. Its ESM imports also need the mapped wrappers. These consumers retain CommonJS/ESM caches; updated bytes and a completed compilation do not reload an already running Functions process. Stop/restart consumers after readiness. Neither watch nor 5C propagates original-tree edits into a previously prepared/session copy.
- [publicationPublishValidation.ts](../../functions/src/payments/publicationPublishValidation.ts) is a compatibility re-export of the prepared-render owner, not a second validator. Likewise, the frontend JS and backend TS `drafts/sourceOfTruth` files are separate implementations of the data contract, not destinations listed by the copy script; verify both when that contract changes.
- [renderAssetContract.test.mjs](../../shared/renderAssetContract.test.mjs) tests the shared source through its wrapper; [renderContractCompatibility.test.mjs](../../functions/renderContractCompatibility.test.mjs) and [publicationPublishValidation.test.mjs](../../functions/publicationPublishValidation.test.mjs) consume built Functions modules. Those are different evidence surfaces, not proof that all copies are synchronized.

### Standards, Exceptions And Remaining Debt

Normative compatibility allowances are identified in the specific contracts,
for example legacy render families in [Render Compatibility Matrix](../contracts/RENDER_COMPATIBILITY_MATRIX.md).
They have an explicit scope; they do not approve arbitrary fallback behavior.
Visual template/fallback previews are accepted limited-purpose surfaces, not
alternate draft-publication authorities.

Concentrated editor/dashboard coordination, legacy window snapshot fallbacks,
SDK adapters under `domain`, and existing `any`/casts in generator integration
are observed limitations, not evidence of accepted exemptions from the future
standards. A small fix preserves the affected owner/invariant and avoids adding
coupling; broader refactoring needs its own scope. [F10–F15 and Q1](SYSTEM_FRAGILITY_MAP.md#operational-readiness)
remain open in their existing authority; this map does not resolve permissions,
isolation, migration, CI or copy-watch gaps.

## 4. Data Flow
1. The user authenticates and opens `/dashboard`. Firebase Hosting serves the static app shell, and the page resolves the active dashboard view in `src/pages/dashboard.js`.
2. The dashboard home loads user drafts from `borradores` filtered by `userId`. The client excludes drafts in trash, excludes template workspaces where `templateWorkspace.mode === "template_edit"`, excludes drafts whose publication lifecycle resolves to already published/finalized states for the draft rail, and builds draft preview candidates through `src/domain/drafts/preview.js` / `src/domain/invitations/previewReadModel.js`.
3. The dashboard home loads active publications from `publicadas` and finalized publication snapshots from `publicadas_historial`, merges them client-side, and resolves preview images through `resolvePublicationPreviewReadModelsByItemKey`, which prefers publication metadata and can fall back to linked-draft preview candidates. If the `publicadas_historial` query fails with permission denied, the home rail degrades to active publications only.
4. The dashboard home loads template listings from `plantillas_catalog` and home editorial configuration through `getDashboardHomeConfigV1`. The client then builds the visible template rails from that config plus the catalog response.
5. When the user opens a template modal, the preview source is resolved from the shared template contract, but the current runtime uses generated HTML for the modal preview. This path is explicitly `previewAuthority: "template-visual"`: it is pre-draft, visual-only, and not publish-authoritative. Live `postMessage` patching only runs when generated HTML is active.
6. When the user creates a draft from a template, the frontend calls `copiarPlantilla`. The backend reads `plantillas/{id}`, normalizes the template contract, rejects archived or non-public editorial states, clones private storage-backed assets into `plantillas/{plantillaId}/assets/...` when needed, normalizes render assets, and writes a new `borradores/{slug}` document with `editor: "konva"`, `objetos`, `secciones`, `tipoInvitacion`, `portada`, and draft lifecycle metadata.
7. If the template modal applies user input, the frontend optionally uploads gallery files, resolves template input values, builds a personalization patch from the shared personalization contract, and updates the newly created draft with patched `objetos`, `secciones`, `rsvp`, `gifts`, `templateInput`, `draftContentMeta`, and `ultimaEdicion`.
8. When the dashboard opens an editor session, it first resolves the compatible owned draft slug through `resolveOwnedDraftSlugForEditorRead`. The editor then reads through `readEditorSessionDocument`, which routes draft sessions to `borradores/{slug}` and template sessions to `getTemplateEditorDocument`. In both cases `useBorradorSync` normalizes the render state, refreshes Firebase Storage URLs, backfills `tipoInvitacion` from the template when missing on a draft, hydrates editor state, and stores invitation-type hints on `window`.
9. During editing, the editor keeps `objetos`, `secciones`, `rsvp`, `gifts`, and `eventDetails` in React state. Autosave, flush, name saves, authoring saves, and section mutations call `persistEditorSessionPatch` or `persistEditorSessionSnapshot`; that authority writes Firestore for drafts or `saveTemplateEditorDocument` for template sessions. The shared FIFO coordinator serializes autosave, flush, and section mutation writes.
   - In an authorized Designer AI session, OpenAI only proposes a strict result from a sanitized client snapshot. Actual actions execute in the browser through the same authoring/configuration/Gallery/CTA owners and persistence boundary; the Function does not mutate or reread the draft.
10. When the dashboard generates preview, it first forces that immediate flush. Draft sessions use the `editor:draft-flush:request` / `editor:draft-flush:result` event flow, while template sessions prefer the direct `flushPersistenceNow` bridge. The flush helper can capture a compatibility snapshot via `readEditorRenderSnapshot`.
11. The pipeline chooses the preview path. Prepared draft preview delegates the owned-draft read and optional publication-link lookup to the backend, with no browser document re-read. The template admin editor requests `adminGetTemplateEditorDocumentV1({ includePreparedPreview: true })` through `getPreparedTemplateEditorPreview` in the template callable adapter; its backend re-reads, prepares, validates and generates HTML. It remains `template-visual` and does not overlay a browser snapshot. Template-card preview and rollback/local fallback retain visual generation paths; the local fallback can overlay a compatible flush-boundary snapshot.
12. Draft preview generation calls `prepareDraftPreviewRender`, which reads the owned draft on the backend, builds `prepareRenderPayload(...)`, validates it with `validatePreparedRenderPayload(...)`, and generates preview HTML from that same prepared payload. This path is `previewAuthority: "draft-authoritative"`. Blockers return validation without trusted preview HTML; warnings still allow preview. If the rollback/local path is used, it is `previewAuthority: "local-fallback"` and is not publish parity.
   - In a superadmin `adminView=1` draft session, the read-only canvas skips flush. The controller derives `administrativeOwnerUid` from the authorized snapshot and sends it to the same prepared preview callable; the prepared branch performs no client Firestore re-read. The backend requires superadmin and matches that owner against the current draft read. Publication-link lookup, publication validation, checkout, and publish actions remain disabled. The source draft stays read-only; the editor user menu may still expose `Crear plantilla`. That action shares the normal draft-template preparation for name, current render payload, authoring state, and generated cover, then calls `adminCreateTemplateFromDraftV1`; it does not flush, repair, write, or delete the viewed draft.
13. Before publish checkout opens, the dashboard forces another immediate draft flush and calls `validateDraftForPublication`. The backend uses the same prepared render payload boundary to classify blockers and warnings. If blockers are present, checkout is not opened.
14. The checkout flow in `src/components/payments/PublicationCheckoutModal.jsx` creates a session with `createPublicationCheckoutSession`, reserves or reuses the public slug depending on `new` vs `update`, submits payment with `createPublicationPayment`, polls `getPublicationCheckoutStatus`, and can recover from an approved slug conflict with `retryPaidPublicationWithNewSlug`. Once a checkout session reaches terminal `published`, the modal must preserve its success state and final backend-provided public URL even while the parent preview/dashboard state syncs `slugPublico`, `urlPublica`, and publication metadata from the publish result.
15. After payment approval, the request still enters through `functions/src/payments/publicationPayments.ts`, but approved-session settlement is now delegated to `functions/src/payments/publicationApprovedSessionFlow.ts`. That flow claims the approved checkout session with a bounded `publishing` lease, reuses `publishDraftToPublic`, and can run a small automatic recovery retry for retryable post-payment publish failures without creating a new persisted status or a second publish pipeline. The post-gating publish execution now delegates HTML generation, Storage write, publication payload assembly, linked-draft sync, and first-publication analytics to `functions/src/payments/publicationPublishExecution.ts`. Lifecycle/date shaping, write preparation, operation planning, and operation execution are handled by dedicated backend helpers in the same domain.
16. Frontend responsibility ends at authoring state, flush confirmation, preview request/link shaping, checkout initiation, and reflecting terminal checkout results. Backend responsibility starts at prepared draft preview, publish preflight, asset normalization for public delivery, lifecycle gating, HTML artifact generation, checkout-session settlement, and publication metadata writes. The frontend must not infer successful publication from draft or preview state alone; post-payment success is driven by backend checkout/publication state.
17. Public visitors open `/i/{slug}`. Firebase Hosting rewrites the request to `verInvitacionPublicada`, which reads `publicadas/{slug}`, builds a backend lifecycle snapshot through `resolvePublicationLifecycleSnapshotFromData`, rejects requests unless the resolved raw public state is currently publicly accessible, finalizes expired publications on access when needed, and serves the stored HTML artifact from Storage only when the invitation is currently publicly accessible.
18. Public RSVP submission goes through `publicRsvpSubmit`. It only accepts `POST`, validates slug and publication accessibility through the same backend lifecycle snapshot boundary, finalizes expired publications on request when needed, writes under `publicadas/{slug}/rsvps`, and stores both the current structured RSVP payload (`answers`, `metrics`, `schemaQuestionIds`) and legacy compatibility fields such as `nombre`, `asistencia`, `confirma`, `cantidad`, and `mensaje`.

## 5. Frontend Structure
- `src/pages/index.js`: landing page and auth entry point.
- `src/pages/dashboard.js`: dashboard shell, route resolution, preview generation, checkout entry point, admin read-only draft sessions, and template session coordinator.
- `src/components/dashboard/home/`: dashboard home composition and rail rendering for drafts, publications, and editorial template rows.
- `src/hooks/useDashboardDrafts.js`: live draft rail query and client-side visibility filtering for drafts.
- `src/hooks/useDashboardPublications.js`: active publication + history query, client-side merge, and fallback preview resolution.
- `src/hooks/useDashboardHomeConfig.js`, `src/hooks/useDashboardHomeTemplates.js`, `src/hooks/useDashboardHomeSections.js`: editorial home config fetch and template section assembly.
- `src/components/CanvasEditor.jsx`: editor orchestration, runtime bridges, history, interaction, and section behavior.
- `src/components/editor/persistence/`: draft/template load, autosave, flush bridge, Storage URL refresh, and draft hydration.
- `src/components/editor/designerAi/DesignerAiPanel.jsx`, `src/domain/editor/designerAiCapabilities.js`, and `src/domain/editor/designerAiActionExecutor.js`: Designer AI UI/session state, minimal context adapter, validation and delegation to existing editor owners.
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
- `functions/src/render/prepareRenderPayload.ts`: canonical backend prepared render payload used by publishable draft preview, publish rendering, and validation adapters.
- `functions/src/payments/publicationPublishValidation.ts`: compatibility re-export for publish preflight imports (`preparePublicationRenderState`, `validatePreparedPublicationRenderState`, and related types).
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: HTML, CSS, and runtime generation from stored render data.
- `functions/src/utils/publishAssetNormalization.ts`: publish-time asset resolution, section decoration normalization, and image source dimension backfill.
- `functions/src/drafts/`: draft trash lifecycle and purge scheduler behavior.
- `functions/src/dashboardHome/`: dashboard home editorial configuration.
- `functions/src/templates/`: template editorial/admin workflows, workspace handling, contract loading, and template asset cloning.
- `functions/src/designerAi/service.ts`: OpenAI instruction/input construction, strict structured-output validation and upstream error mapping. The request-facing `designerAiChat` callable remains inline in `functions/src/index.ts`.
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
- The canonical editable invitation render state is governed by [DATA_MODEL.md](DATA_MODEL.md), implemented in `src/domain/drafts/sourceOfTruth.js` and separately in `functions/src/drafts/sourceOfTruth.ts`. The render fields are `objetos`, `secciones`, `rsvp`, `gifts`, and `eventDetails`; structured dynamic values retain their own authority described in that contract.
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
4. After payment approval, `publicationApprovedSessionFlow.ts` claims the session's `publishing` slot with a lease, short-circuits duplicate settlement attempts while the lease is active, and may reclaim the session if a previous `publishing` lease has expired.
5. `publishDraftToPublic` re-reads the draft, re-runs publish preflight, and keeps ownership/new-vs-update/conflict/expired-publication gating in `publicationPayments.ts`.
6. `publicationPublishExecution.ts` generates base HTML, generates and confirms `publicadas/{slug}/share.jpg`, injects final Open Graph metadata, writes `publicadas/{slug}/index.html` to Storage, applies icon-usage delta, writes or updates `publicadas/{slug}`, and mirrors publication linkage back onto the source draft.
7. `publicationWritePreparation.ts`, `publicationOperationPlanning.ts`, and `publicationOperationExecution.ts` shape and apply the linked Firestore writes without changing current document contracts.

If a retryable failure occurs after payment approval, approved-session settlement
may keep `publication_checkout_sessions/{sessionId}` in `status: "publishing"`
with additive `publicationAutoRetry` metadata while it runs the bounded automatic
retry. Success still requires the normal terminal `published` session state with
a backend `publicUrl`. Exhausted recovery returns the paid session to
`payment_approved` with `lastError`, preserving manual retry without another
charge.

The normative source for checkout/payment/publication lifecycle behavior is [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md). This overview is an implementation map; use the contract for exact session statuses, slug reservation transitions, retry rules, and frontend post-payment authority.

The published share-image contract extends the backend publish pipeline in this strict order:
1. Prepare render payload.
2. Generate base published HTML.
3. Attempt first-section share image generation.
4. Decode, normalize, upload, and confirm generated `share.jpg`.
5. Resolve generated share metadata.
6. Inject final Open Graph metadata using the generated image.
7. Upload final `index.html`.
8. Persist `publicadas/{slug}` including generated `share`.

The final `index.html` must only be uploaded after `share.imageUrl` is resolved and confirmed as generated metadata for the current publish attempt. The final HTML must never reference a missing `og:image`. If `share.jpg` cannot be generated or confirmed, the backend must fail the publish attempt before persisting a successful active publication. Existing active publications remain accessible until republished or repaired, but new publish/republish success requires the generated share artifact.

Active publication transitions are handled by `transitionPublishedInvitationState`:
- `pause`: active -> paused
- `resume`: paused -> active
- `move_to_trash`: paused -> trash
- `restore_from_trash`: trash -> paused

Finalization behavior:
- Expired publications are finalized by scheduler, by public access, or by public RSVP requests hitting an expired invitation.
- `publicationPayments.ts` still owns the entry points and RSVP summary collection, but finalization write/delete choreography is now planned in `publicationOperationPlanning.ts` and executed in `publicationOperationExecution.ts`.
- Finalization writes a history snapshot into `publicadas_historial`, deletes the Storage artifact prefix `publicadas/{slug}/`, recursively deletes the active `publicadas/{slug}` document and subcollections, releases the slug reservation, and updates the linked draft to a finalized lifecycle state.

HTML generation today is shared, but authority depends on the preview path:
- `functions/src/utils/generarHTMLDesdeSecciones.ts` builds the full HTML document, section markup, section background layers, recursive Google Fonts link aggregation, RSVP modal HTML, gifts modal HTML, gallery modal HTML, countdown runtime, invitation loader runtime, motion effects runtime, preview-only template patch runtime, and preview mobile scroll runtime.
- `functions/src/utils/generarHTMLDesdeObjetos.ts` renders object-level HTML for text, image, icon, gallery, countdown, CTA buttons, generic buttons, lines, shape families, and preserved group children through the same object-rendering contract used for top-level objects.
- `functions/src/utils/generarModalRSVP.ts` embeds the RSVP runtime and defaults `submitEndpoint` to `https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit` unless a config override is provided.

The preserved group contract for `tipo: "grupo"` is documented in [GROUP_RENDER_MODEL.md](GROUP_RENDER_MODEL.md). Grouped children must not introduce separate render paths; document-level dependency collectors must recurse into `children[]`.

Gallery generated HTML, public viewer/lightbox behavior, layout presets, and selected-Gallery editor mutations are documented in [GALLERY_SYSTEM_CONTRACT.md](../contracts/GALLERY_SYSTEM_CONTRACT.md), [GALLERY_EDITOR_CONTRACT.md](../contracts/GALLERY_EDITOR_CONTRACT.md), [GALLERY_LAYOUT_PRESETS_CONTRACT.md](../contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md), and [GALLERY_VIEWER_RENDER_CONTRACT.md](../contracts/GALLERY_VIEWER_RENDER_CONTRACT.md). These contracts preserve `tipo: "galeria"` as the only Gallery object type and do not create a parallel Gallery render pipeline.

Draft-authoritative preview and publish both enter generation through `prepareRenderPayload(...)`, `validatePreparedRenderPayload(...)`, and `generateHtmlFromPreparedRenderPayload(...)`. The template admin editor also uses this backend boundary via `templateEditorPreview.ts`, while retaining `template-visual` authority. Template-card and local fallback paths keep their visual generators; exact variants are mapped in [PREVIEW_SYSTEM_ANALYSIS.md](PREVIEW_SYSTEM_ANALYSIS.md#3-template-and-fallback-preview).

Open Graph metadata injection belongs after base published HTML generation and after share metadata resolution. The share renderer must load the generated publish HTML, wait for document/font readiness and first-section image readiness, wait at least two animation frames, use bounded settling of finite first-section entrance motion, validate a finite `1200x630` capture region, capture only the first `.inv > .sec`, and hide other sections only inside the renderer context. It must not mutate the stored HTML source.

Mobile preview parity is guarded at the iframe shell rather than by a separate render contract. `ModalVistaPrevia` injects `data-preview-viewport` and `data-preview-layout-mode="parity"` before iframe scripts run, and `NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE=0` rolls back to the legacy mobile iframe height/overflow mutation path. The smart-layout runtime uses that metadata to apply the publish-like fixed-section height model in embedded draft preview without changing published HTML generation. In mobile preview, the iframe document root owns scroll; the outer preview shell scales and clips the iframe instead of becoming the invitation scroll container.

Section visuals now have three distinct primitives:
- base section background: full-section color/image surface, with image backgrounds using cover/crop behavior
- `decoracionesFondo`: section-owned positioned decoration boxes
- `decoracionesBorde`: section-owned top/bottom edge ornaments that render as viewport-width non-object layers, use responsive section-height ratios, and stay out of smart layout

`decoracionesBorde` is included in the prepared render payload, so draft-authoritative preview and publish share the same contract. Its responsive sizing is generated in HTML/CSS, not in the preview shell. Template preview remains visual-only and must not be treated as authoritative for this primitive.

The UX/render contract for image roles, including the normative rule that converting a normal image into any section-owned visual must remove the original image object, lives in [docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](../contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md).

<a id="architectural-decisions"></a>

## 9. Key Architectural Decisions

This register consolidates expensive-to-reverse obligations already expressed by
current normative owners. `accepted` below means recorded in the cited current
contract, not a new approval or an inference from implementation alone. It does
not replace the detailed contract. Historical deliberations, authors, acceptance
dates and approval events are **no registrado** in this focused review. No new
historical alternatives are inferred. Implementation anchors below were inspected
locally; listed checks were not executed in this documentation phase, so execution,
runtime parity and deployed compliance remain unverified here.

### D1. Canonical Editable Draft Render State

- **Decision status / authority:** accepted; [DATA_MODEL.md](DATA_MODEL.md#2-root-structure-borrador--invitacion), Canonical Render State and its source-of-truth rules.
- **Context:** authoring, persistence and HTML need a common editable render representation, distinct from publication metadata and template inputs.
- **Decision:** invitation render roots belong to the draft; template editor sessions carry the same render contract through their session boundary. Public records and generated HTML are not fallback editable render sources. Structured field values remain governed by the data contract and are projected into render targets.
- **Historical alternatives:** no registrado.
- **Consequences / restrictions:** changes must preserve compatible readers/writers and render consumers; editing HTML or publication metadata cannot update the editable source. Schema and source-of-truth changes need an explicit contractual decision.
- **Implementation / verification:** implemented in [frontend sourceOfTruth](../../src/domain/drafts/sourceOfTruth.js), [backend sourceOfTruth](../../functions/src/drafts/sourceOfTruth.ts) and session persistence. These are not all generated from one file. [Persistence core tests](../../src/components/editor/persistence/editorSessionPersistenceCore.test.mjs) are one anchor, not a full cross-runtime schema proof; verification remains subject to the data contract's affected consumers.

### D2. Public Delivery Through Stored HTML

- **Decision status / authority:** accepted; [Public Delivery Contract](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md#public-delivery-contract) and [DATA_MODEL.md](DATA_MODEL.md#html-output).
- **Context:** public access needs a publication artifact and lifecycle eligibility, independent of the dashboard editor session.
- **Decision:** `/i/{slug}` serves `publicadas/{slug}/index.html` from Storage through `verInvitacionPublicada`, gated by backend publication lifecycle. Next supplies the application shell, not invitation rendering for this route.
- **Historical alternatives:** no registrado.
- **Consequences / restrictions:** draft changes require the authorized publish/update flow to change public output; a successful metadata write alone does not guarantee a deliverable artifact. HTML, share metadata and lifecycle writes have ordering/failure obligations owned by the publication/share contracts.
- **Implementation / verification:** routing is in [firebase.json](../../firebase.json), delivery in [Functions index](../../functions/src/index.ts), writes in [publicationPublishExecution.ts](../../functions/src/payments/publicationPublishExecution.ts). [Execution tests](../../functions/publicationPublishExecution.test.mjs) and the lifecycle contract's delivery anchors are relevant; no public-route probe, artifact generation or deploy was performed here.

### D3. Shared Preparation For Authoritative Preview And Publish

- **Decision status / authority:** accepted; [Render Compatibility Matrix](../contracts/RENDER_COMPATIBILITY_MATRIX.md#anclas-reales-de-compatibilidad) and [Publication Execution Contract](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md#publication-execution-contract). [Preview System Analysis](PREVIEW_SYSTEM_ANALYSIS.md) maps the implementation.
- **Context:** a preview generated from a different source or preparation step cannot demonstrate the draft's publish contract.
- **Decision:** authoritative draft preview and publish use backend preparation, validation and the prepared generator adapter. Blockers prevent trusted preview HTML; template and local-fallback previews keep their explicitly limited visual authority.
- **Historical alternatives:** no registrado. Existing fallback paths are observed compatibility surfaces, not evidence of a historical options analysis.
- **Consequences / restrictions:** preview requires a successful flush and backend-owned read; sharing preparation does not guarantee canvas geometry, mobile framing, payment success or public artifact availability. The admin template editor now shares preparation but remains `template-visual`.
- **Implementation / verification:** [prepareRenderPayload.ts](../../functions/src/render/prepareRenderPayload.ts), [previewPipeline.js](../../src/domain/dashboard/previewPipeline.js), [templateEditorPreview.ts](../../functions/src/templates/templateEditorPreview.ts). [Pipeline tests](../../src/domain/dashboard/previewPipeline.test.mjs), [validation tests](../../functions/publicationPublishValidation.test.mjs) and the [visual baseline](../testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md) cover different boundaries; no parity run is claimed here.

### D4. Frontend Authoring And Backend Publication Authority

- **Decision status / authority:** accepted; [Source Of Truth Rules](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md#source-of-truth-rules), its Frontend/UI Contract and [DATA_MODEL.md](DATA_MODEL.md).
- **Context:** live authoring/preview, payment approval and a completed public invitation represent different states with different writers.
- **Decision:** frontend owns live authoring and reflects backend results; backend owns publication validation, settlement, lifecycle and public artifact writes. Publication success comes from terminal backend checkout/publication state and its public URL.
- **Historical alternatives:** no registrado.
- **Consequences / restrictions:** neither draft mirrors, a visual preview nor payment approval alone may become another publication-success authority. AI proposals also delegate authoring mutations to existing owners; the assistant is not a persistence authority.
- **Implementation / verification:** editor/session boundaries above, [PublicationCheckoutModal.jsx](../../src/components/payments/PublicationCheckoutModal.jsx) and backend publication execution. [publicationCheckoutState.test.mjs](../../src/domain/payments/publicationCheckoutState.test.mjs) and lifecycle contract tests are anchors. Acceptance does not settle the divergent administrative identity policy in Q1 or certify Rules.

### D5. Executable Shared Contracts Across Runtimes

- **Decision status / authority:** accepted requirement for shared compatibility under [Architecture Guidelines, Cross-Runtime Contracts](ARCHITECTURE_GUIDELINES.md#44-cross-runtime-contracts), [DATA_MODEL.md](DATA_MODEL.md) and [Render Compatibility Matrix](../contracts/RENDER_COMPATIBILITY_MATRIX.md). The current packaging mechanism is an implementation fact, not an independently accepted permanent design.
- **Context:** editor and backend interpret the same persisted assets/object families; separately evolved rules can diverge.
- **Decision:** maintain one owner for shared executable invariants and consume it through runtime-compatible adapters, preserving the compatibility branches required by specific contracts.
- **Historical alternatives:** no registrado; no package migration or replacement mechanism is accepted here.
- **Consequences / restrictions:** changes reach wrappers, generated destinations and both runtime consumers. Copying does not create independent editable authorities. Compatibility must be demonstrated against current sources and consumed artifacts, not inferred from filenames or build success.
- **Implementation / verification:** the [source/copy map](#shared-contract-copies) records editable `.cjs`, ESM wrappers and mapped copies. [5C evidence](../testing/SHARED_CONTRACTS_5C.md) distinguishes byte checks, compilation, active watch and fresh versus cached consumption. F15 retains its consumer-reload/prepared-tree limits; separate JS/TS source-of-truth implementations remain an additional parity responsibility.

### Other Existing Choices And Observations

Keep decisions that already have a focused owner there:

| Previously listed choice | Status and authority |
| --- | --- |
| Template source versus catalog projection | Governed by [DATA_MODEL.md](DATA_MODEL.md); consult its template sections before changing schema/projection. Historical alternatives and approval provenance: no registrado here. |
| Active publication, finalized history, Storage and draft mirrors | Accepted lifecycle obligations in [Checkout Publication Lifecycle](../contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md); exact state/failure rules stay there. Distributed-state risks remain open. |
| Share images derived from publish HTML | Accepted in [Published Share Image Contract](../contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md), including consequences, ordering and testing anchors; no second image-render mapping is introduced. |
| Template authoring and drafts coexist in the dashboard/collection surface | Current implementation observation. Evidence of acceptance as a long-term architecture: no registrado; do not promote coexistence to a normative requirement. |
| Designer AI proposes and delegates to existing authoring owners | Governed by [Designer AI Capability Contract](../contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md); implementation and limitations in [AI Assistant System](AI_ASSISTANT_SYSTEM.md). |

For a future material decision, maintain context, status/source, choice,
consequences and implementation/verification separately in its smallest owner.
Record only evidenced historical alternatives; label newly suggested options as
proposed. [Q1](SYSTEM_FRAGILITY_MAP.md#open-operational-decisions) remains unresolved
with its alternatives, missing information and dependent work in the risk register.

### Canvas Interaction Ownership
The canvas editor must be treated as a phase-owned interaction system with explicit visual, selection, and geometry authority.

Model summary:

- The authoritative phase model is `idle -> hover -> selected -> predrag -> drag -> settling -> selected|idle`. If a direct-start fallback path misses an explicit `predrag` transition, it must still satisfy the same predrag suppression and hover-clear obligations before the first visible drag frame.
- Visual authority is exclusive and prioritized: `drag-overlay` > selected-phase box > hover.
- Selection authority is phase-specific: committed logical selection owns stable selected state, while drag-session selection owns the visible box during `predrag`, `drag`, and `settling`.
- Geometry authority is phase-specific: active drag uses live-node bounds only, settling freezes the last controlled drag snapshot, and selected auto-indicator paths still permit object-data fallback.
- Single-text box visuals are also phase-owned, but they now share one runtime visual-box source across hover, selected, and drag states: the live text visual bounds with no extra frame padding.
- Text geometry across Konva text, snap, DOM inline overlay, and selection visuals is part of the current interaction architecture documented in `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`.
- Startup authority is singular: the first visible drag frame must come from the composer-owned `controlled-sync` path for the active session.
- Fallback paths still exist, but they are subordinate resilience or compatibility paths, not independent visible authority.

The detailed current-state interaction model lives in [docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md](INTERACTION_SYSTEM_CURRENT_STATE.md).

## 10. Known Complexity Areas
- `src/pages/dashboard.js`: large orchestration surface that mixes auth flow, dashboard home, editor route resolution, preview generation, publish gating, admin draft sessions, and template sessions.
- `src/components/CanvasEditor.jsx`: large editor runtime with selection, drag, resize, history, inline text behavior, mobile behavior, and window-based bridges.
- `src/components/editor/persistence/editorSessionPersistence.js`: single editor-session read/write transport authority for draft Firestore documents and template editor callables.
- `src/components/editor/persistence/useBorradorSync.js`: load/persist normalization orchestration, URL refresh, autosave scheduling, thumbnail generation for drafts, invitation-type backfill, and immediate flush protocol for both draft and template sessions.
- `functions/src/index.ts`: large deployed entry point with both domain re-exports and inline/legacy handlers.
- Designer AI instruction/transport boundary: conversation policy is documented separately, but current runtime instructions remain inline in `functions/src/designerAi/service.ts`; client-provided state is sanitized and validated server-side without a server-side draft reread.
- `functions/src/payments/publicationPayments.ts`: high-density orchestration shell covering request/auth normalization, Mercado Pago request wiring, discount/admin handlers, checkout/session handlers, lifecycle entry points, and delegation to extracted publication helper seams.
- `functions/src/utils/generarHTMLDesdeSecciones.ts` and `functions/src/utils/generarHTMLDesdeObjetos.ts`: shared generator code where changes affect preview HTML, published HTML, CTA runtime, and responsive behavior.
- Mobile/reflow parity: preview iframe framing, generated preview-only CSS, and `functions/src/utils/mobileSmartLayout/*` must be tested together. `shared/previewPublishMobileGeometryParity.mjs` captures section/object/group/edge-decoration geometry for draft-authoritative preview versus publish at mobile viewports.
- Prepared render validation code: `functions/src/render/prepareRenderPayload.ts` is now the canonical backend render-preparation and validation surface, but it still explicitly carries compatibility branches and drift detection for `image-crop-not-materialized`, `pantalla-ynorm-drift`, `fullbleed-editor-drift`, legacy countdown schema, and legacy icon contracts.
- Window bridges and custom events: critical flush requests are centralized in `src/domain/drafts/criticalFlush.js`, and non-editor snapshot reads go through `src/lib/editorSnapshotAdapter.js`, but preview generation and editor coordination still depend on window bridges and event names such as `editor:draft-flush:request` and `editor:draft-flush:result`.
- Legacy or secondary paths still in the repo: `verInvitacion`, `copiarPlantillaHTML`, `publicarInvitacion`, `functions/src/backupindex.ts`, and `src/components/Editor.jsx`.

### Canvas Interaction Failure Modes
The current drag-overlay/hover subsystem has shown three recurring failure modes that future changes must treat as lifecycle bugs, not as isolated visual glitches:

- `startupJump`: the first visible drag-overlay frame comes from the wrong startup authority, so the overlay begins far from the dragged element even if steady-state drag later aligns.
- Hover lingering: hover ownership ends logically, but visible hover cleanup is delayed until session-end or component unmount instead of the predrag boundary.
- Multiple startup paths: seeds, replayed snapshots, transformer restoration, and controlled-sync all compete to own startup visibility, which makes behavior non-deterministic across equivalent drag starts.

## 11. Inconsistencias actuales
- Publishable draft preview and publish share the backend prepared render payload. The template admin editor also uses backend preparation while retaining `template-visual`; template-card and local fallback paths retain visual generation. Their authority does not imply draft publish parity.
- Template preview source metadata may still expose external preview URLs, but the current modal runtime is generated HTML. It is `template-visual`, while rollback draft preview is `local-fallback`; neither should be treated as publish-faithful.
- Asset field normalization is centralized around `shared/renderAssetContract.*`, but asset resolution is still stage-specific. Template copy clones private assets into template-shared storage, editor load refreshes download URLs client-side, and publish resolves storage paths to signed server-side read URLs.
- Publication linkage still depends on multiple stored fields and fallbacks, but the dashboard no longer open-codes that lookup order: it centralizes the resolution logic in `src/domain/invitations/readResolution.js`.
- Preview-image fallback for drafts and publications is now centralized in `src/domain/invitations/previewReadModel.js`, but the UI still assembles data from multiple query surfaces and optional linked-draft fallback.
- Publication state is duplicated across `publicadas.estado`, `publicadas.publicationLifecycle`, `publicadas.pausadaAt`, `publicadas.enPapeleraAt`, draft-side `publicationLifecycle`, and draft-side `slugPublico`.
- Template state is duplicated across `plantillas` and `plantillas_catalog`, with editorial filtering and catalog projection applied separately from full template storage.
- Invitation type fields are still not perfectly aligned across layers. Drafts primarily use `tipoInvitacion`, templates still use `tipo`, and publish writes `publicadas.tipo` from `tipoInvitacion` with compatibility fallbacks to `tipo` and `plantillaTipo`.
- RSVP root-config normalization is aligned between client and server, but the public attendee submission contract is still a separate surface from the root `rsvp` config used by editor/preview/publish.
- Generated RSVP uses the shared Firebase environment contract: the production default is preserved, while local output uses the demo Functions destination and blocks Sheets. Public URL and asset fallbacks elsewhere remain separate; unverified local handlers are disabled as described in the development runbook.
- Legacy render contracts remain active in current code paths. Countdown schema v1 and legacy `icono-svg` are still recognized by validation and generation, even though the main editor works on the modern object families.
- The publications home rail tolerates permission denial on `publicadas_historial` and silently falls back to active publications only, so the dataset shown in the dashboard can depend on Firestore rules and current permissions rather than on a single guaranteed query surface.

## 12. Riesgos actuales
- `alto`: Publish correctness still depends on agreement between editor persistence, shared render contracts, backend asset normalization, validation, and HTML generation. Publishable draft preview now uses the same prepared payload as publish, but editor canvas geometry can still drift from final HTML.
- `alto`: `functions/src/payments/publicationPayments.ts` still concentrates request-facing checkout/payment handlers, Mercado Pago wiring, lifecycle entry points, and cross-flow sequencing. The deepest approved-session settlement, slug reservation, publish execution, and planned write/delete seams are now extracted, which narrows but does not remove backend orchestration risk.
- `alto`: Public lifecycle state is distributed across Firestore active docs, Firestore history docs, Storage HTML artifacts, slug reservations, and mirrored draft metadata. Finalization must keep all of those layers in sync.
- `medio`: Local fallback preview can overlay a live editor snapshot on a persistence re-read. Prepared draft and admin template-editor previews instead depend on flush and backend preparation/validation, with different authority classes.
- `medio`: Asset URLs and media readiness are still derived in different runtimes for template copy and editor load. Publishable draft preview and publish share backend asset normalization.
- `medio`: Template preview remains a pre-draft visual path with preview-source metadata and generated runtime behavior that are separate from publish preparation.
- `medio`: The codebase maintains duplicated state fields and storage projections such as `plantillas` vs `plantillas_catalog`, draft `tipoInvitacion` vs template/publication `tipo`, and active publication state vs mirrored draft lifecycle metadata.
- `medio`: Legacy compatibility branches are still part of the active render pipeline, including legacy countdown and icon contracts that are validated and generated alongside modern objects.
- `bajo`: Dashboard home can render partial publication history when `publicadas_historial` is not readable, but the application continues functioning with active publication data only.
- `bajo`: Legacy exported routes and legacy editor files are still present in the repo and deployed surface, even though they are not the primary path used by current dashboard hosting rewrites.
