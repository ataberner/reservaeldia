# SYSTEM FRAGILITY MAP

> Updated from code inspection on 2026-03-30.
>
> Reference documents reviewed for context: `docs/architecture/ARCHITECTURE_OVERVIEW.md`, `docs/architecture/EDITOR_SYSTEM.md`, `docs/architecture/DATA_MODEL.md`, `docs/architecture/ARCHITECTURE_GUIDELINES.md`, `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`.
>
> Priority rule for this document: findings below are based on the current implementation, not on intended architecture.

## 1. Current System Overview

The current product is a draft-first system with a static Next.js dashboard, a React + Konva editor, Firestore-backed draft persistence, and Cloud Functions handling preview-adjacent generation, payment-gated publication, lifecycle transitions, and public delivery.

The canonical editable render state is still the four-field draft payload in `borradores`: `objetos`, `secciones`, `rsvp`, and `gifts`. That same payload is interpreted by three different runtimes:

- the editor runtime in `src/components/CanvasEditor.jsx`
- the dashboard preview pipeline, which re-reads persisted data and can overlay a live editor snapshot before generating HTML
- the publish pipeline in Cloud Functions, which re-reads the draft, normalizes assets again, validates publish readiness, generates final HTML, writes `publicadas/{slug}` metadata, and stores `publicadas/{slug}/index.html` in Storage

The system is already partially hardened compared with older docs, but it is still fragile in the same places where contracts cross runtime boundaries: editor state authority, persistence timing, preview vs publish parity, publication lifecycle reconstruction, and compatibility surfaces that still carry legacy aliases.

## 2. Fragility Map

### 2.1 Editor Runtime

#### E1. State authority is split across React state, runtime adapters, `window` globals, and Konva node state

- Description: the editor no longer relies on only raw globals, but it still has more than one active authority for the same runtime state.
- Why it is fragile: any consumer can read a slightly different truth depending on whether it reads React state, `window.editorSnapshot`, legacy `window._*` globals, runtime selection state, or live Konva nodes. That makes bugs hard to localize and makes parity dependent on which boundary a caller uses.
- Impact level: Critical
- Affected files/modules: `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/lib/editorSnapshotAdapter.js`, `src/lib/editorSelectionRuntime.js`, `src/lib/editorRuntimeBridge.js`, `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`
- Real examples if detectable:
  - `useCanvasEditorGlobalsBridge` still writes `window._objetosActuales`, `window._elementRefs`, `window._seccionesOrdenadas`, `window._seccionActivaId`, and `window._altoCanvas`, while also syncing `window.editorSnapshot`.
  - `editorSnapshotAdapter` reads from the adapter first but still falls back to `_objetosActuales`, `_seccionesOrdenadas`, `_rsvpConfigActual`, `_giftsConfigActual`, and `_giftConfigActual`.
  - `editorSelectionRuntime` still mirrors `_elementosSeleccionados`, `_celdaGaleriaActiva`, `_pendingDragSelectionId`, and `_pendingDragSelectionPhase`.
  - `SelectionTransformer` still reads `window._isDragging`, `window._grupoLider`, `window._groupDragSession`, and `window._resizeData`.
  - During same-gesture drag startup, committed selection can still lag while the composer uses `pendingDragSelection`, `dragVisualSelection`, and the active drag-overlay session to decide which ids the visible drag box should represent.
  - The composer can collapse drag-overlay membership to `[dragId]` when the committed selection snapshot does not yet contain the dragged id, so visual selection and logical selection are temporarily not the same thing.

#### E2. Inline text editing depends on an imperative DOM/Konva handoff and a timed settle boundary

- Description: inline editing is not a pure editor-state transition. It is a DOM overlay lifecycle that must visually hand off to and from Konva text rendering.
- Why it is fragile: preview and other critical flows depend on waiting for inline editing to settle, not on reading a single stable state object. If the overlay, focus, font readiness, or visibility handoff lands late, the critical action can read a stale or half-committed state.
- Impact level: Critical
- Affected files/modules: `src/components/CanvasEditor.jsx`, `src/components/editor/textSystem/runtime/useInlineSessionRuntime.js`, `src/components/editor/textSystem/render/domOverlay/InlineTextOverlayEditor.jsx`, `src/components/editor/textSystem/runtime/useCanvasEditorTextSystem.js`
- Real examples if detectable:
  - `CanvasEditor.jsx` exposes `ensureInlineEditSettledBeforeCriticalAction({ maxWaitMs: 120 })` through the runtime bridge.
  - `useInlineSessionRuntime` tracks overlay mount sessions, overlay visual-ready state, font readiness, visibility authority, sync vs `requestAnimationFrame` phases, and explicit Konva hide/show transitions.
  - `InlineTextOverlayEditor.jsx` measures DOM selection rects, caret probes, glyph rects, computed styles, and viewport sync signatures to keep DOM and Konva visually aligned.

#### E3. Transform, resize, and rotation still depend on transient globals and overlay-layer choreography

- Description: selection, resize, rotation, drag overlays, and final transform commit are coordinated through transient runtime flags and visual layer swaps.
- Why it is fragile: persistence, hover behavior, selection visuals, and some post-commit behavior change depending on temporary gesture flags instead of one explicit transaction model. That increases the chance of timing-dependent bugs.
- Impact level: High
- Affected files/modules: `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`, `src/components/CanvasEditor.jsx`
- Real examples if detectable:
  - `SelectionTransformer.jsx` sets `window._resizeData = { isResizing: true }` during resize and clears it later.
  - During image rotation it lifts nodes into overlay layers and restores them afterward.
  - `CanvasEditor.jsx` suppresses some hover/tracing behavior while `window._isDragging || window._grupoLider || window._resizeData?.isResizing`.
  - The controlled drag overlay samples bounds with `requireLiveNodes: true`, while selected-phase auto indicators can fall back to object `x/y/width/height`; different selection-box paths can therefore read different geometry sources.
  - Drag end does not immediately hand visual ownership back to committed selection. Settling can keep the last controlled drag-overlay bounds visible until deferred selection repair and cleanup finish.
  - The selection-box model is now documented formally, but the runtime still carries fallback paths such as replayable controlled snapshots, idle cleanup, drag-start hover clear, and legacy mirrors. If those paths stop behaving as subordinate fallbacks, the runtime can violate the model without any code-level type boundary catching it.

#### E4. The editor still has very large orchestration files with blurred boundaries

- Description: a lot of runtime responsibility still converges in a few oversized modules.
- Why it is fragile: behavior is harder to reason about because visual rendering, runtime bridges, persistence hooks, template authoring hooks, inline editing, selection, and preview-facing control points remain tightly adjacent.
- Impact level: High
- Affected files/modules: `src/components/CanvasEditor.jsx`, `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`, `src/components/editor/textSystem/render/domOverlay/InlineTextOverlayEditor.jsx`
- Real examples if detectable:
  - `CanvasEditor.jsx` owns editor state, selection, inline commit boundaries, template authoring state, runtime bridge registration, and persistence bridge exposure.
  - `SelectionTransformer.jsx` combines selection geometry, resize, rotation, overlay lifting, performance tracing, debug instrumentation, and commit coordination in one module.

#### E5. Hidden coupling still travels through `window` events and bridge methods

- Description: important editor actions are still coordinated through global events and imperative bridge registration.
- Why it is fragile: callers are coupled to event names and bridge availability instead of to typed local dependencies. That makes changes high-blast-radius even when the UI still appears to work.
- Impact level: High
- Affected files/modules: `src/components/editor/persistence/useBorradorSync.js`, `src/components/editor/sections/useSectionsManager.js`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/lib/editorRuntimeBridge.js`
- Real examples if detectable:
  - Draft flush uses `editor:draft-flush:request` and `editor:draft-flush:result`.
  - Section creation uses the global `"crear-seccion"` event.
  - Selection/transform attachment listens for `"element-ref-registrado"`.
  - Invitation type changes are broadcast through `EDITOR_BRIDGE_EVENTS.INVITATION_TYPE_CHANGE`.

### 2.2 Data Model & Persistence

#### D1. The canonical render state is intentionally shallow and permissive

- Description: `normalizeDraftRenderState` keeps only `objetos`, `secciones`, `rsvp`, and `gifts`, but it does not validate the internal structure deeply.
- Why it is fragile: downstream systems assume more structure than the canonical normalizer enforces. Invalid object types, missing `seccionId`, inconsistent asset payloads, or incompatible section/object combinations are allowed to survive until later stages.
- Impact level: High
- Affected files/modules: `src/domain/drafts/sourceOfTruth.js`, `functions/src/drafts/sourceOfTruth.ts`, all consumers of `normalizeDraftRenderState`
- Real examples if detectable:
  - `normalizeDraftRenderState` accepts any array for `objetos` and `secciones`.
  - Publish validation still needs blockers such as `missing-section-reference` because the canonical model itself does not enforce those constraints.

#### D2. Reading a draft can mutate it as a side effect

- Description: the editor load path is not read-only for normal drafts.
- Why it is fragile: a read operation changing Firestore means the same draft can be observed differently depending on which code path opened it first. That makes reproducing behavior harder and adds write side effects to a load boundary.
- Impact level: High
- Affected files/modules: `src/components/editor/persistence/borradorSyncLoad.js`
- Real examples if detectable:
  - If a draft has no `tipoInvitacion` but does have `plantillaId`, the loader reads `plantillas/{plantillaId}` and then `updateDoc`s the draft to backfill `tipoInvitacion`.

#### D3. Persistence correctness still depends on transient interaction state and multiple write entry points

- Description: autosave, direct section writes, flushes, and template saves now share a FIFO coordinator, but they still enter from different paths with different timing rules.
- Why it is fragile: ordering is better than before, but correctness still depends on runtime state such as "resize in progress", ignored update windows, or delayed section-height commits. A queue reduces overlap; it does not remove timing sensitivity.
- Impact level: Critical
- Affected files/modules: `src/components/editor/persistence/useBorradorSync.js`, `src/components/editor/persistence/borradorSyncPersist.js`, `src/components/editor/persistence/draftWriteCoordinator.js`, `src/components/editor/sections/useSectionsManager.js`
- Real examples if detectable:
  - `useBorradorSync` and `borradorSyncPersist` both refuse to save while `window._resizeData?.isResizing`.
  - `useSectionsManager` still writes sections with direct `updateDoc`, only now wrapped through `enqueueDraftWrite`.
  - Section height persistence is delayed by `220ms` and explicitly guarded by `shouldPersistSectionMutationSnapshot` to avoid replaying stale snapshots.

#### D4. Asset values are normalized differently depending on the stage

- Description: the same draft asset can be transformed differently on load, preview, and publish.
- Why it is fragile: preview parity depends on several normalization stages staying logically equivalent even though they run in different runtimes for different reasons.
- Impact level: High
- Affected files/modules: `src/components/editor/persistence/borradorSyncLoad.js`, `src/domain/dashboard/previewSession.js`, `shared/renderAssetContract.js`, `functions/src/utils/publishAssetNormalization.ts`
- Real examples if detectable:
  - Editor load refreshes Firebase Storage URLs recursively with `refreshUrlsDeep`.
  - Dashboard preview only applies browser-safe alias normalization through `normalizeRenderAssetState`.
  - Publish resolves storage-backed assets to signed URLs server-side and can backfill source image dimensions.

#### D5. Draft/publication linkage and preview metadata still rely on compatibility field families

- Description: several important relationships are still resolved by scanning multiple legacy and modern keys.
- Why it is fragile: the real shape is "whatever one of these keys happens to contain", which makes behavior dependent on fallback order instead of on one stable field contract.
- Impact level: High
- Affected files/modules: `src/domain/invitations/readResolution.js`, `src/domain/invitations/previewReadModel.js`, `src/hooks/useDashboardDrafts.js`, `functions/src/payments/publicationLifecycle.ts`, `functions/src/payments/publicationPublishExecution.ts`
- Real examples if detectable:
  - Draft preview images still scan `thumbnailUrl`, `thumbnailurl`, `thumbnail_url`, `thumbnailURL`, `portada`, `previewUrl`, `previewurl`, `preview_url`, and `previewURL`.
  - Draft-publication linkage still looks at `slugPublico`, `publicationLifecycle.activePublicSlug`, `publicationLifecycle.publicSlug`, and `publicationLifecycle.slug`.
  - Publication-to-draft fallback still uses legacy `slugOriginal`.

### 2.3 Rendering & HTML Generation

#### R1. Preview and publish do not use the same prepared input

- Description: preview and publish both end up in the generator family, but they do not enter with identical source data.
- Why it is fragile: if preview and publish do not consume the same prepared contract, parity problems are structural, not accidental. The same draft can look valid in preview and still fail or move during publish.
- Impact level: Critical
- Affected files/modules: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `src/hooks/useDashboardPreviewController.js`, `functions/src/payments/publicationPublishValidation.ts`, `functions/src/utils/publishAssetNormalization.ts`
- Real examples if detectable:
  - Preview re-reads the draft or template, then overlays a live editor snapshot with `overlayLiveEditorSnapshot`.
  - Preview explicitly keeps "publish-only preparation on the backend path".
  - Publish uses `preparePublicationRenderState`, which normalizes assets again and resolves the functional CTA contract before validation and final HTML generation.

#### R2. HTML generation is concentrated in two very large, heavily branched modules

- Description: `generarHTMLDesdeSecciones.ts` and `generarHTMLDesdeObjetos.ts` are still broad multi-feature generators.
- Why it is fragile: each new rule lands inside a module that already branches by preview/public mode, mobile/desktop behavior, section mode, object family, legacy compatibility, CTA runtime, and invitation runtime scripts.
- Impact level: High
- Affected files/modules: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`
- Real examples if detectable:
  - `generarHTMLDesdeSecciones.ts` branches on `isPreview`, injects preview-specific runtime, builds RSVP/gifts/gallery modal HTML, and computes mobile `pantalla` layout variables.
  - `generarHTMLDesdeObjetos.ts` still handles `icono-svg`, `pantalla`, `fullbleed`, and `yNorm` logic inside the same object renderer.

#### R3. Legacy render contracts are still active in the live generator path

- Description: compatibility support is not just historical documentation; it is still part of the runtime.
- Why it is fragile: a generator that must keep supporting frozen legacy contracts is less deterministic and harder to simplify. Compatibility branches become permanent drift sources.
- Impact level: High
- Affected files/modules: `shared/renderContractPolicy.cjs`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/payments/publicationPublishValidation.ts`
- Real examples if detectable:
  - `renderContractPolicy` still classifies `countdown_schema_v1` and `icono_svg_legacy` as active compatibility contracts.
  - `generarHTMLDesdeObjetos.ts` still has a dedicated legacy `icono-svg` branch.
  - Publish validation still distinguishes countdown contract variants and warns when compatibility aliases are used.

#### R4. `pantalla`, `yNorm`, and `fullbleed` are already acknowledged drift zones by the code itself

- Description: the most layout-sensitive contracts already have explicit drift warnings in publish validation.
- Why it is fragile: when the backend already warns that publish may reposition or render differently than the canvas, that is a confirmed cross-runtime instability, not a hypothetical risk.
- Impact level: High
- Affected files/modules: `src/components/editor/persistence/borradorSyncRenderState.js`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/payments/publicationPublishValidation.ts`
- Real examples if detectable:
  - Validation emits `pantalla-ynorm-missing`.
  - Validation emits `pantalla-ynorm-drift`.
  - Validation emits `fullbleed-editor-drift`.

#### R5. Functional CTA behavior is resolved from root config plus object presence, not from the object alone

- Description: an RSVP or gift button on the canvas is not enough to define final CTA behavior.
- Why it is fragile: the render result depends on cross-object/root reconciliation. That means the object the user sees is only part of the actual publish contract.
- Impact level: Medium
- Affected files/modules: `functions/src/utils/functionalCtaContract.ts`, `functions/src/payments/publicationPublishValidation.ts`, `functions/src/utils/generarHTMLDesdeSecciones.ts`
- Real examples if detectable:
  - `resolveFunctionalCtaContract` combines `objetos` with root `rsvp` and `gifts` config.
  - Publish validation emits `functional-cta-link-ignored` when a functional CTA object defines a link that publish will ignore.

### 2.4 Publishing & Lifecycle

#### P1. Publication lifecycle is reconstructed from distributed fields instead of one authoritative persisted state

- Description: lifecycle interpretation is a derived computation across several fields and fallback families.
- Why it is fragile: behavior changes depending on which fields are present. That makes lifecycle bugs hard to reason about and makes old data shapes continue to influence current outcomes.
- Impact level: Critical
- Affected files/modules: `functions/src/payments/publicationLifecycle.ts`, `src/domain/invitations/readResolution.js`, `src/hooks/useDashboardDrafts.js`, `src/domain/publications/dashboardList.js`
- Real examples if detectable:
  - Public state is resolved from `estado`, then `publicationLifecycle.state`, then `enPapeleraAt`, then `pausadaAt`, then defaults to active.
  - Effective expiration is resolved from `venceAt ?? vigenteHasta`, then optionally `publicationLifecycle.expiresAt`, then publication-date-derived fallback logic.
  - Draft linkage still depends on `slugPublico` and lifecycle slug fields.

#### P2. Publish readiness is not guaranteed by the stored draft; it is only guaranteed after backend preparation and validation

- Description: the persisted draft model is not publish-safe by itself.
- Why it is fragile: users can successfully edit a draft that still requires server-side blocking or warning checks before publication. That means correctness is deferred late into the lifecycle.
- Impact level: Critical
- Affected files/modules: `functions/src/payments/publicationPublishValidation.ts`, `functions/src/payments/publicationPayments.ts`
- Real examples if detectable:
  - Blocking issues include `missing-section-reference`, `shape-figure-unsupported-for-publish`, `image-asset-unresolved`, `icon-asset-unresolved`, `gallery-media-unresolved`, and `countdown-frame-unresolved`.
  - Warning issues include `pantalla-ynorm-missing`, `pantalla-ynorm-drift`, `functional-cta-link-ignored`, and `fullbleed-editor-drift`.

#### P3. Finalization and cleanup allow partial success states

- Description: the finalization flow is ordered, but some destructive operations are warning-only and do not abort the rest of the transition.
- Why it is fragile: history, Storage, active publication documents, slug reservations, and linked draft state can temporarily diverge if a middle step fails.
- Impact level: High
- Affected files/modules: `functions/src/payments/publicationOperationExecution.ts`, `functions/src/payments/publicationFinalizationFlow.ts`
- Real examples if detectable:
  - Finalization writes history first, then deletes the Storage prefix with warning-only handling, then recursively deletes the active publication with warning-only handling, then releases the reservation, then updates the linked draft.
  - Trash purge also warns if published files cannot be removed before continuing.

#### P4. Payment, checkout, slug reservation, retry, publish, and finalization still converge in one orchestration-heavy domain

- Description: the backend is more modular than before, but the publication/payment lifecycle still depends on one dense orchestration family.
- Why it is fragile: the number of valid and invalid transitions is high, and a lot of business behavior still lives close to request handling and side effects.
- Impact level: High
- Affected files/modules: `functions/src/payments/publicationPayments.ts`, `functions/src/payments/publicationApprovedSessionFlow.ts`, `functions/src/payments/publicationOperationPlanning.ts`, `functions/src/payments/publicationOperationExecution.ts`
- Real examples if detectable:
  - Approved sessions can move through `publishing`, published success, retryable payment-approved rollback, or `approved_slug_conflict`.
  - `retryPaidPublicationWithNewSlug` mutates reservation ownership and session linkage after a paid session already exists.

#### P5. Public reads and public RSVP submission can trigger lifecycle side effects

- Description: lifecycle enforcement is not confined to admin or scheduler flows.
- Why it is fragile: public access paths are not pure reads. They can finalize expired publications while serving or submitting against them.
- Impact level: Medium
- Affected files/modules: `functions/src/index.ts`
- Real examples if detectable:
  - `verInvitacionPublicada` finalizes expired publications on access before serving the artifact.
  - `publicRsvpSubmit` also finalizes expired publications on request if needed.

### 2.5 Dashboard / Preview

#### V1. The preview controller is a timing-sensitive multi-step pipeline

- Description: preview is not "render current state". It is "wait for inline settle, flush persistence, re-read, optionally overlay a live snapshot, then generate HTML".
- Why it is fragile: every step is a potential mismatch boundary. Even when each step is individually correct, the pipeline can still drift if one boundary returns older or differently-normalized data.
- Impact level: Critical
- Affected files/modules: `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`
- Real examples if detectable:
  - Preview uses `ensureInlineEditSettledBeforeCriticalAction`.
  - Preview flushes through `flushEditorPersistenceBeforeCriticalAction`.
  - Preview reads `readEditorRenderSnapshot()` and overlays it through `overlayLiveEditorSnapshot`.
  - The inline critical boundary currently uses `maxWaitMs = 120`.

#### V2. The dashboard imports the server-side HTML generator directly into the frontend preview path

- Description: the dashboard preview depends on code located under `functions/src`.
- Why it is fragile: frontend preview is coupled to backend generator internals and module shape. That increases cross-runtime change risk even before publication starts.
- Impact level: High
- Affected files/modules: `src/hooks/useDashboardPreviewController.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`
- Real examples if detectable:
  - `useDashboardPreviewController` dynamically imports `../../functions/src/utils/generarHTMLDesdeSecciones`.

#### V3. Dashboard home and editor entry still assemble truth from multiple queries, fallbacks, and compatibility rules

- Description: the dashboard does not read from one backend view model for drafts/publications/editor resolution.
- Why it is fragile: visible state depends on query success, fallback order, and permission differences rather than on one authoritative server response.
- Impact level: High
- Affected files/modules: `src/pages/dashboard.js`, `src/hooks/useDashboardDrafts.js`, `src/hooks/useDashboardPublications.js`, `src/domain/publications/dashboardList.js`, `src/hooks/useDashboardEditorRoute.js`, `src/domain/invitations/readResolution.js`
- Real examples if detectable:
  - Publications are assembled from `publicadas` plus `publicadas_historial`, and permission-denied on history is tolerated.
  - Editor entry retries draft/publication resolution with backoff before deciding whether a slug is compatible.
  - Draft/publication linking still falls back to direct public slug reads and legacy `slugOriginal` queries.

#### V4. Dashboard URL generation is hardcoded to production patterns

- Description: the dashboard still constructs public invitation URLs directly in client code.
- Why it is fragile: preview/display behavior is coupled to one deployment assumption instead of to a single environment-aware source.
- Impact level: Medium
- Affected files/modules: `src/domain/dashboard/previewSession.js`, `src/domain/invitations/readResolution.js`
- Real examples if detectable:
  - `buildPreviewDisplayUrl` returns `https://reservaeldia.com.ar/i/${slug}`.
  - `buildPublicInvitationUrl` does the same.

#### V5. Some preview and dashboard compatibility failures are intentionally swallowed

- Description: certain read failures are ignored so the UI can keep moving.
- Why it is fragile: graceful degradation is useful for UX, but it also means the UI can silently fall back to a different source path without making the data gap obvious.
- Impact level: Medium
- Affected files/modules: `src/domain/invitations/readResolution.js`, `src/domain/publications/dashboardList.js`, `src/domain/invitations/previewReadModel.js`
- Real examples if detectable:
  - Direct publication read failures are swallowed before trying fallback paths.
  - Legacy `slugOriginal` query failures are swallowed.
  - `publicadas_historial` permission-denied is treated as non-fatal.

### 2.6 Infra / Functions

#### I1. Shared render contracts are central, but they are physically duplicated across runtimes

- Description: `renderAssetContract` and `renderContractPolicy` are the contract boundary for editor, preview, publish validation, and generator logic, but they do not live in one runtime location only.
- Why it is fragile: central contracts that exist in multiple physical copies are a drift risk by definition, especially when one runtime imports source files and another imports copied or built variants.
- Impact level: High
- Affected files/modules: `shared/renderAssetContract.cjs`, `shared/renderContractPolicy.cjs`, `functions/shared/renderAssetContract.cjs`, `functions/shared/renderContractPolicy.cjs`, `functions/lib/shared/renderAssetContract.cjs`, `functions/lib/shared/renderContractPolicy.cjs`, `functions/scripts/syncTemplateContract.cjs`
- Real examples if detectable:
  - `renderContractPolicy.cjs` exists under `shared/`, `functions/shared/`, and `functions/lib/shared/`, and a sync script copies it.
  - `renderAssetContract.cjs` also exists under both `shared/` and `functions/shared/`, while `functions/lib/shared/renderAssetContract.cjs` re-exports the functions copy.
  - Assumption: `functions/lib/shared/*` is generated build output, but the runtime still depends on these copies staying aligned.

#### I2. `functions/src/index.ts` still mixes modern production handlers with legacy exports

- Description: the deployed Functions entry point still hosts both the modern publication path and older invitation flows.
- Why it is fragile: legacy and modern paths coexist in the same public surface, which increases maintenance cost and raises the chance that compatibility behavior leaks into current code paths.
- Impact level: High
- Affected files/modules: `functions/src/index.ts`
- Real examples if detectable:
  - Modern exports include `verInvitacionPublicada`, `publicRsvpSubmit`, `mercadoPagoWebhook`, and schedulers such as `finalizeExpiredPublications`.
  - Legacy exports still present include `verInvitacion` and `copiarPlantillaHTML`.

#### I3. Production URLs and endpoints are still hardcoded in multiple layers

- Description: environment-specific addresses are embedded directly in runtime code.
- Why it is fragile: the same public route assumptions are duplicated between frontend preview logic, backend planning logic, and serialized HTML runtime scripts.
- Impact level: Medium
- Affected files/modules: `src/domain/dashboard/previewSession.js`, `src/domain/invitations/readResolution.js`, `functions/src/payments/publicationOperationPlanning.ts`, `functions/src/utils/generarModalRSVP.ts`, `functions/src/index.ts`
- Real examples if detectable:
  - The public invitation base URL is hardcoded to `https://reservaeldia.com.ar/i/...` in multiple client and backend modules.
  - RSVP runtime defaults to `https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit`.
  - Legacy template copy still returns a hardcoded `verInvitacion` Cloud Function URL.

#### I4. Public RSVP still writes both modern structured payloads and legacy compatibility fields

- Description: the public write contract has not fully converged.
- Why it is fragile: long-term data consumers must either understand both shapes or trust a mixed payload contract to remain stable.
- Impact level: Medium
- Affected files/modules: `functions/src/index.ts`
- Real examples if detectable:
  - `publicRsvpSubmit` writes `answers`, `metrics`, and `schemaQuestionIds`, but also writes legacy fields `nombre`, `asistencia`, `confirma`, `cantidad`, and `mensaje`.

## 3. Top 5 Highest Risk Areas Right Now

| Rank | Area | Why it is top risk |
| --- | --- | --- |
| 1 | Preview vs publish parity boundary | The same draft goes through different preparation logic before preview and publish. This is the most direct source of "looked fine in preview, broke on publish" behavior. |
| 2 | Editor runtime authority split | React state, DOM overlay state, global bridge state, and Konva node state are all still active participants in the editor runtime. |
| 3 | Persistence during interaction | Autosave, direct section writes, flushes, and resize suppression still create timing-sensitive persistence boundaries. |
| 4 | Distributed publication lifecycle | Lifecycle is derived from multiple field families and can also mutate on public access paths, which makes state debugging expensive and error-prone. |
| 5 | HTML generator complexity | `generarHTMLDesdeSecciones.ts` and `generarHTMLDesdeObjetos.ts` still carry a large amount of business behavior, compatibility logic, and preview/mobile branching. |

## 4. Recommended Order of Stabilization

This is sequencing only. It is not a refactor proposal list.

1. **Preview vs publish parity boundary**
   Fix first because it is the highest user-facing trust risk. When preview and publish do not consume the same prepared state, every other improvement still leaves room for last-mile surprises.

2. **Editor runtime authority and inline/transform critical boundaries**
   Fix second because preview, flush, and persistence all depend on the editor being able to produce one stable state at the moment a critical action happens.

3. **Persistence boundary across autosave, direct section writes, and resize suppression**
   Fix third because state correctness depends on this path. A stable editor still loses value if writes can be skipped, delayed, or replayed under interaction pressure.

4. **Publication lifecycle and orchestration state machine**
   Fix fourth because the publish/finalize/retry/slug/payment flow is operationally expensive when it drifts, but it is safer to stabilize after the authoring state entering that flow is more predictable.

5. **HTML generator branching and compatibility surfaces**
   Fix fifth because the generator is still a central blast-radius multiplier, especially around `pantalla`, legacy contracts, and CTA runtime behavior.

6. **Shared contracts and environment hardcoding**
   Fix sixth because duplicated contracts and repeated production URLs increase drift risk across runtimes, but they become easier to normalize after the higher-risk behavior boundaries above are stable.

7. **Legacy function surface**
   Fix last among the listed items because it is still important, but the immediate business risk is lower than the current parity, editor-state, and lifecycle drift issues.

## 5. Bottom Line

The system is no longer fragile because it is undocumented. It is fragile because important behavior still crosses runtime boundaries with multiple active truths, compatibility fallbacks, and timing-dependent handoffs.

The most important current fact is this: the editor, preview, and publish flows are conceptually working on the same invitation, but they still do not operate on one fully identical prepared contract at the moment that matters.
