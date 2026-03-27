# SYSTEM FRAGILITY MAP

## 1. Executive Summary

This map is based on the current implementation and the current testable behavior in the repository on 2026-03-27. It describes the code that exists today in the current worktree; it does not invent code or API changes.

The recent frontend hardening is real and visible in code:

- `src/hooks/useDashboardPreviewController.js` now exposes an explicit controller/runtime seam through `createDashboardPreviewControllerRuntime`, and its async/UI state machine is covered by `src/hooks/useDashboardPreviewController.controller.test.mjs` in addition to the helper/session tests in `src/hooks/useDashboardPreviewController.test.mjs`.
- `src/hooks/useDashboardTemplateModal.js` now has a clearer controller/runtime split through `createDashboardTemplateModalControllerRuntime`, `resolveDashboardTemplateModalViewState`, and `buildTemplatePreviewModalProps`, with focused coverage in `src/hooks/useDashboardTemplateModal.controller.test.mjs` and `src/hooks/useDashboardTemplateModal.test.mjs`.
- `src/pages/dashboard.js` is now a clearer composition shell backed by page-shaping helpers in `src/domain/dashboard/pageShell.js`, with current behavior covered by `src/domain/dashboard/pageShell.test.mjs`.
- `src/components/editor/persistence/useBorradorSync.js` is no longer the only owner of draft persistence internals. It now orchestrates dedicated helper seams in `src/components/editor/persistence/borradorSyncLoad.js`, `src/components/editor/persistence/borradorSyncPersist.js`, and `src/components/editor/persistence/borradorSyncRenderState.js`.
- Lifecycle parity is no longer a vague follow-up item. `shared/lifecycleParityFixtures.mjs` and `shared/lifecycleParity.test.mjs` now freeze both current shared behavior and the current known frontend/backend drift explicitly.

Those changes made several seams materially safer:

- the preview controller tier is still dense, but it is now testable at the controller/runtime boundary instead of only through the live hook
- the template modal controller is now separable from modal prop shaping and cache/view state shaping
- the dashboard shell is now more clearly a composition layer than an inline owner of page-shaping logic
- the draft persistence boundary is now easier to reason about as load/hydrate, persist/flush, and render-state normalization instead of one undifferentiated hook
- lifecycle hardening in this pass was parity hardening, not a behavioral rewrite, which means the remaining lifecycle risk is now narrower and better defined

The focused hardening suite that covers those surfaces is currently green (`61/61`), including:

- `shared/lifecycleParity.test.mjs`
- `src/hooks/useDashboardPreviewController.test.mjs`
- `src/hooks/useDashboardPreviewController.controller.test.mjs`
- `src/hooks/useDashboardTemplateModal.test.mjs`
- `src/hooks/useDashboardTemplateModal.controller.test.mjs`
- `src/domain/dashboard/pageShell.test.mjs`
- `src/components/editor/persistence/borradorSyncRenderState.test.mjs`

They did not remove the system's highest-risk seams.

The most dangerous modules are still:

- `functions/src/payments/publicationPayments.ts`
- `src/components/CanvasEditor.jsx`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarHTMLDesdeObjetos.ts`
- `functions/src/index.ts`

The main priority change in this revision is that `useDashboardPreviewController.js` should no longer be treated as the best first target. It is now materially safer than the previous map claimed. The best next incremental target is backend-only publication lifecycle helper extraction around effective expiration, public-state reuse, and trash-purge input derivation, without changing checkout or finalization behavior.

The main lifecycle clarification in this revision is also explicit: the latest lifecycle work was parity hardening, not a semantic rewrite. Draft trash parity is stronger, publication lifecycle parity is better fenced, and the remaining drift is now localized around effective expiration and backend-only expiry sources rather than vaguely spread across the whole system.

### Priority Labels Used Here

- `Maintain`: the seam is already materially safer; prefer additive tests and small contract-preserving changes.
- `First`: best current incremental refactor target.
- `Next`: good follow-up once the first wave lands.
- `Later`: not blocked forever, but still should wait.
- `Last`: too risky for direct refactor right now.

## 2. Risks Actually Reduced

### Reduced: preview controller tier is now explicitly testable at a runtime seam

`src/hooks/useDashboardPreviewController.js` still owns meaningful orchestration, but it no longer has to be reasoned about only as a live React hook. The exported controller/runtime seam (`createDashboardPreviewControllerRuntime`) and the helper/session seam now make the preview controller's async behavior testable without mounting the full dashboard shell. The current controller tests cover preview open success/failure, stale session rejection, publish validation refresh timing, checkout transitions, published-state updates, and late async invalidation.

### Reduced: template modal orchestration is no longer one opaque hook

`src/hooks/useDashboardTemplateModal.js` now separates derived modal view state, modal prop shaping, and controller/runtime behavior. Current tests cover stale selection sessions, preview cache reuse, open-editor payload normalization, draft creation failure handling, and modal-close guards while editor opening is in progress.

### Reduced: dashboard shell no longer owns all page-shaping logic inline

`src/pages/dashboard.js` still coordinates the overall dashboard flow, but its branch-shaping, layout prop shaping, canvas prop shaping, and preview gate shaping now live in `src/domain/dashboard/pageShell.js`. The page is still real orchestration, but it is no longer the owner of those low-level shape decisions inline.

### Reduced: draft persistence is no longer one undifferentiated hook boundary

`src/components/editor/persistence/useBorradorSync.js` still coordinates autosave timing, critical flushes, and persistence bridge registration, but load/hydrate preparation now lives in `borradorSyncLoad.js`, persist/flush execution now lives in `borradorSyncPersist.js`, and shared render-state normalization now lives in `borradorSyncRenderState.js`. The pure render-state layer is directly covered by `src/components/editor/persistence/borradorSyncRenderState.test.mjs`.

### Reduced: lifecycle parity is now explicit instead of inferred

`shared/lifecycleParityFixtures.mjs` and `shared/lifecycleParity.test.mjs` now freeze current shared behavior across:

- draft trash lifecycle constants and resolution
- draft-publication linkage inference
- publication public-state precedence
- finalized-through-lifecycle handling
- explicit trash-purge cases

They also freeze the current remaining drift explicitly instead of leaving it implicit.

### Still reduced from earlier work: shared dashboard and preview domain seams remain real

These earlier hardening seams still exist and remain safer than they used to be:

- `src/domain/publications/dashboardList.js`
- `src/domain/dashboard/homeModel.js`
- `src/domain/dashboard/previewSession.js`
- `src/domain/dashboard/previewPipeline.js`
- `src/domain/dashboard/previewPublicationActions.js`
- `src/domain/invitations/readResolution.js`
- `src/domain/invitations/previewReadModel.js`
- `src/domain/drafts/criticalFlush.js`
- `src/lib/editorSnapshotAdapter.js`
- `functions/src/payments/publicationPublishValidation.ts`

## 3. Fragility Matrix by Area

| Area | Complexity | Fragility | Business criticality | Regression risk | Priority now |
| --- | --- | --- | --- | --- | --- |
| Dashboard shell | Medium | Low-Medium | High | Medium | Maintain |
| Dashboard home data loading / publication assembly | Medium | Low-Medium | Medium | Medium | Maintain |
| Editor runtime | Very High | Very High | High | Very High | Last |
| Draft persistence | High | Medium | High | Medium-High | Next |
| Template preview and personalization | High | Medium | High | Medium-High | Next |
| Template admin/editorial flows | High | High | Medium | High | Later |
| Preview generation | Medium-High | Medium | High | Medium-High | Maintain |
| Preview controller tier | High | Medium | High | Medium-High | Next |
| Publish validation | High | Low-Medium | High | Medium | Maintain |
| Publication checkout/payment | High | High | Very High | Very High | Last |
| Publish finalization | Very High | Very High | Very High | Very High | Last |
| Public delivery | Medium | Medium | Very High | High | Later |
| Public RSVP | Medium | Medium | High | Medium | Later |
| Shared render contracts | Medium | Low | High | Low-Medium | Maintain |
| Asset normalization | Medium-High | Medium | High | Medium | Maintain |
| HTML generation | Very High | High | Very High | Very High | Later |
| Lifecycle / history / trash / finalization | High | High | Very High | High | First |
| Publication lifecycle parity | Medium | Low-Medium | High | Medium | Maintain |

## 4. Area-by-Area Reassessment

### Dashboard shell

Main files: `src/pages/dashboard.js`, `src/domain/dashboard/pageShell.js`, `src/hooks/useDashboardStartupLoaders.js`, `src/hooks/useDashboardEditorRoute.js`

`src/pages/dashboard.js` is now a 424-line composition shell rather than the main owner of page-shaping logic. Branch precedence, layout prop shaping, canvas-editor prop shaping, and preview gate shaping now live in `src/domain/dashboard/pageShell.js`, with current behavior covered by `src/domain/dashboard/pageShell.test.mjs`.

Remaining risk: the shell still coordinates route state, auth/admin gating, startup loaders, template modal state, preview controller output, checkout entry, and editor/home/trash/publications view selection in one page. The current fragility is orchestration and composition, not inline page-shaping logic ownership.

Assessment change: fragility drops to low-medium and moves into maintenance mode.

### Dashboard home data loading / publication assembly

Main files: `src/components/dashboard/home/DashboardHomeView.jsx`, `src/hooks/useDashboardPublications.js`, `src/domain/publications/dashboardList.js`, `src/domain/dashboard/homeModel.js`

This area remains materially safer than the earlier dashboard baseline. Publication item shaping still goes through `src/domain/publications/dashboardList.js`, and dashboard home section shaping still goes through `src/domain/dashboard/homeModel.js`. The home/publications surfaces no longer rebuild those contracts ad hoc.

Remaining risk: the UI still loads and merges multiple query surfaces client-side, and some surface-specific action/loading behavior still lives outside the shared read-model helpers.

Assessment change: stays in maintenance mode.

### Editor runtime

Main files: `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/components/editor/window/useEditorWindowBridge.js`, `src/drag/dragGrupal.js`

The editor runtime remains too coupled for a direct refactor. Surrounding dashboard consumers now have better boundaries, but the runtime itself still coordinates many globals, window bridges, drag/resize side channels, and selection/runtime internals.

Assessment change: surrounding consumers are safer; editor internals themselves are not.

### Draft persistence

Main files: `src/components/editor/persistence/useBorradorSync.js`, `src/components/editor/persistence/borradorSyncLoad.js`, `src/components/editor/persistence/borradorSyncPersist.js`, `src/components/editor/persistence/borradorSyncRenderState.js`

This seam is materially safer than the previous map described. `useBorradorSync.js` is now a 430-line orchestration hook instead of the only owner of draft load, normalize, hydrate, autosave, and flush behavior. It delegates:

- load/hydrate preparation to `borradorSyncLoad.js`
- persist/flush execution to `borradorSyncPersist.js`
- shared render-state normalization to `borradorSyncRenderState.js`

The pure normalization layer is currently covered by `src/components/editor/persistence/borradorSyncRenderState.test.mjs`, which freezes current pantalla normalization, section decoration shaping, countdown geometry flattening, line validation handoff, text compatibility shaping, and recursive `undefined` stripping.

Remaining risk: `useBorradorSync.js` still owns autosave timing, in-flight coordination, flush restoration, event/direct-bridge registration, and hydration ordering. `borradorSyncLoad.js` and `borradorSyncPersist.js` are clearer seams than before, but they are not yet directly covered by dedicated tests in the same way the pure render-state layer is.

Assessment change: fragility drops to medium and remains a `Next` follow-up, not a first-pass refactor target.

### Template preview and personalization

Main files: `src/hooks/useDashboardTemplateModal.js`, `src/components/TemplatePreviewModal.jsx`, `src/domain/templates/preview.js`, `src/domain/templates/personalization.js`, `src/domain/templates/personalizationContract.js`

This area is safer than the previous map claimed. The template modal now has a real controller/runtime split through `createDashboardTemplateModalControllerRuntime`, and derived modal view state plus prop shaping are separated from controller behavior. Current tests cover stale detail loads, preview cache reuse, payload normalization for opening the editor with and without changes, and failure handling while opening the editor.

Remaining risk: the area still supports two preview delivery modes (`url` and generated HTML), and only the generated HTML path supports live patching, text-position capture, and the richer preview workflow. That dual-path model still keeps the surface medium-fragility even after the controller split.

Assessment change: fragility remains medium, but the modal/controller seam is now materially safer and better defined.

### Template admin/editorial flows

Main files: `functions/src/templates/editorialService.ts`, `src/domain/templates/adminService.js`, `src/domain/templates/authoring/service.js`

This area still has multiple representations of the same logical template: source template, catalog projection, editor document, workspace draft, and authoring snapshot. The current code does not show the same degree of shared contract hardening here that now exists for the preview controller, template modal controller, or lifecycle parity surfaces.

Assessment change: no major reduction visible in the current implementation.

### Preview generation

Main files: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPublicationActions.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`

Preview generation remains materially safer than the older baseline. The pipeline, preview payload shaping, and publication-side preview actions are already separated into explicit domain modules with focused tests. Preview generation itself should no longer be described as a first-pass fragility hotspot.

Remaining risk: preview still re-reads persisted draft/template data, overlays a live editor snapshot, and imports the backend HTML generator directly from the frontend. That keeps it medium-fragility, but it is no longer the most urgent frontend seam.

Assessment change: stays medium and moves into maintenance mode for small contract-preserving changes.

### Preview controller tier

Main files: `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewPublicationActions.js`

`useDashboardPreviewController.js` is materially safer than the previous map claimed. It now exposes:

- an explicit runtime seam through `createDashboardPreviewControllerRuntime`
- helper/session seams through `buildDashboardPreviewControllerContext`, `createDashboardPreviewControllerSession`, `canApplyDashboardPreviewControllerSession`, and `buildDashboardPreviewCompatibilityState`
- focused helper/session tests in `src/hooks/useDashboardPreviewController.test.mjs`
- focused controller-state-machine coverage in `src/hooks/useDashboardPreviewController.controller.test.mjs`

The current controller tests cover preview open success/failure, stale async completions, publish validation refresh timing, checkout-open gating, published-state updates, close/reset behavior, and late async invalidation.

Remaining risk: the file is still large (1066 lines), and the live hook plus the extracted runtime still mirror substantial orchestration logic. The controller still owns session tokens, stale-session rejection, flush-before-preview logic, publish validation refresh side effects, preview modal state, checkout transitions, and published-state updates in one dense surface.

Assessment change: fragility drops from the previous `First` framing to `Next`. It remains a valid incremental cleanup target, but it is no longer the best first hardening target in the repo.

### Publish validation

Main files: `functions/src/payments/publicationPublishValidation.ts`

This remains one of the safest important seams in the publishing path. Render-state preparation and compatibility validation are explicit and test-backed, and they remain separated from checkout/finalization orchestration.

Assessment change: stays in maintenance mode.

### Publication checkout/payment

Main files: `src/components/payments/PublicationCheckoutModal.jsx`, `functions/src/payments/publicationPayments.ts`

This area is still high risk because checkout session state, Mercado Pago state, slug reservation state, retry handling, and publish finalization still converge through the same backend module. The stronger lifecycle parity boundary reduces ambiguity around some state semantics, but it does not simplify the checkout/payment orchestration itself.

Assessment change: some surrounding ambiguity dropped; the area itself is still not a safe direct target.

### Publish finalization

Main files: `functions/src/payments/publicationPayments.ts`

This remains the highest-risk backend seam. Finalization still spans draft rereads, publish validation, HTML generation, Storage writes, `publicadas`, `publicadas_historial`, slug reservation cleanup, linked-draft updates, expiration handling, and lifecycle transitions in one large backend module.

Assessment change: no meaningful drop in direct-refactor safety.

### Public delivery

Main files: `functions/src/index.ts`, `functions/src/payments/publicationLifecycle.ts`

Public delivery is still smaller than the publish pipeline, but it remains coupled to distributed publication state and exported handler wiring. The lifecycle parity work narrowed uncertainty around state interpretation, but the public access path is still not a pure read-only surface.

Assessment change: no major reduction in direct-refactor safety.

### Public RSVP

Main files: `functions/src/index.ts`, `functions/src/rsvp/config.ts`, `src/domain/rsvp/config.js`

This area remains safer than it used to be because client/server RSVP normalization semantics are aligned, but it still depends on publication accessibility and backend lifecycle interpretation.

Assessment change: remains medium fragility and not a first-pass target.

### Shared render contracts

Main files: `shared/renderAssetContract.*`, `shared/renderContractPolicy.*`

These remain the safest cross-runtime contract surfaces in the repository. They are explicit, test-backed, and much less orchestration-heavy than the dashboard, editor, or payment/finalization seams around them.

Assessment change: remains low fragility and in maintenance mode.

### Asset normalization

Main files: `shared/renderAssetContract.*`, `functions/src/utils/publishAssetNormalization.ts`, `src/components/editor/persistence/borradorSyncRenderState.js`

This seam remains materially safer. Load-time normalization, preview-time canonicalization, and publish-time normalization still happen in different runtime contexts, but the field contract is much better defined than before, and the latest draft-persistence hardening moved the frontend-side normalization into a dedicated render-state boundary instead of leaving it fully embedded in `useBorradorSync.js`.

Assessment change: remains medium fragility and in maintenance mode.

### HTML generation

Main files: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`

The generators are still high-risk shared render surfaces. Current code is better fenced around contracts than it used to be, but the runtime is still large, broadly shared, and undercovered relative to its blast radius.

Assessment change: still not ready for a broad refactor.

### Lifecycle / history / trash / finalization

Main files: `src/domain/drafts/state.js`, `functions/src/drafts/draftTrashLifecycle.ts`, `src/domain/publications/state.js`, `functions/src/payments/publicationLifecycle.ts`, `functions/src/payments/publicationPayments.ts`, `functions/src/index.ts`, `shared/lifecycleParityFixtures.mjs`, `shared/lifecycleParity.test.mjs`

This area remains distributed, but it is no longer as vaguely risky as the previous map said. The current codebase now has explicit lifecycle parity fixtures and tests. Draft trash lifecycle parity is stronger, publication lifecycle parity is fenced, and the remaining lifecycle risk is now better localized around backend orchestration and helper reuse than around unknown helper drift.

What still makes the area high-risk:

- `functions/src/payments/publicationPayments.ts` still owns state transitions, history writes, finalization, and trash-purge behavior
- `functions/src/index.ts` still contains public delivery/public RSVP handler logic that depends on overlapping lifecycle interpretation
- finalization still has to keep Firestore active docs, Firestore history docs, Storage artifacts, slug reservations, and mirrored draft metadata aligned

Assessment change: still high fragility overall, but now more localized and better defined. The right next move is backend-only helper extraction around lifecycle interpretation, not a broad rewrite.

### Publication lifecycle parity

Main files: `src/domain/publications/state.js`, `functions/src/payments/publicationLifecycle.ts`, `src/domain/drafts/state.js`, `functions/src/drafts/draftTrashLifecycle.ts`, `shared/lifecycleParityFixtures.mjs`, `shared/lifecycleParity.test.mjs`

This is materially safer than the previous map described.

Current shared parity is now frozen for:

- draft trash constants, aliases, state resolution, and purge-date derivation
- draft-publication linkage inference on the draft side
- publication public-state precedence
- finalized-through-lifecycle handling when the state is explicit
- explicit trash-purge cases when public expiry inputs are already present

Current remaining drift is also explicit instead of inferred. The parity fixtures document the current differences around:

- `publicationLifecycle.state: draft`
- backend-only `publicationLifecycle.expiresAt`
- derived backend expiration from `publicadaAt` / `publicadaEn`
- trash-purge dates derived from those backend-only expiry inputs

This is parity hardening, not a lifecycle semantic rewrite. The tests freeze current behavior and current drift; they do not claim that frontend and backend now compute effective expiration identically in every branch.

Assessment change: this area moves into maintenance mode for parity-preserving helper work, while the broader lifecycle/history/finalization orchestration remains the actual `First` backend target.

## 5. Modules Now Safer to Refactor

These modules now have enough boundary definition or test coverage to support focused refactors:

- `src/domain/dashboard/pageShell.js`
- `src/hooks/useDashboardStartupLoaders.js`
- `src/hooks/useDashboardEditorRoute.js`
- `src/domain/dashboard/editorSession.js`
- `src/domain/publications/dashboardList.js`
- `src/domain/dashboard/homeModel.js`
- `src/domain/dashboard/previewSession.js`
- `src/domain/dashboard/previewPipeline.js`
- `src/domain/dashboard/previewPublicationActions.js`
- `src/hooks/useDashboardPreviewController.js` for incremental seam-preserving cleanup only
- `src/hooks/useDashboardTemplateModal.js` for incremental controller/runtime cleanup
- `src/domain/invitations/readResolution.js`
- `src/domain/invitations/previewReadModel.js`
- `src/domain/drafts/criticalFlush.js`
- `src/domain/drafts/flushGate.js`
- `src/lib/editorSnapshotAdapter.js`
- `src/components/editor/persistence/borradorSyncLoad.js`
- `src/components/editor/persistence/borradorSyncPersist.js`
- `src/components/editor/persistence/borradorSyncRenderState.js`
- `src/components/editor/persistence/useBorradorSync.js` for incremental orchestration cleanup only
- `shared/lifecycleParityFixtures.mjs`
- `shared/lifecycleParity.test.mjs`
- `shared/renderAssetContract.*`
- `shared/renderContractPolicy.*`
- `functions/src/utils/publishAssetNormalization.ts`
- `functions/src/payments/publicationPublishValidation.ts`
- `src/domain/rsvp/config.js`
- `functions/src/rsvp/config.ts`
- `src/domain/templates/preview.js`
- `src/domain/templates/personalization.js`
- `src/domain/templates/personalizationContract.js`

Lifecycle helper modules that are now safer for bounded parity-preserving work than they were before:

- `src/domain/publications/state.js`
- `functions/src/payments/publicationLifecycle.ts`
- `src/domain/drafts/state.js`
- `functions/src/drafts/draftTrashLifecycle.ts`

## 6. Areas Still Too Risky To Touch Directly

These areas still should not be used as first-pass direct refactor targets:

- `src/components/CanvasEditor.jsx`
  - Reason: heavy runtime dependence on globals, drag/resize side channels, and editor-internal coordination across many consumers.
- `functions/src/payments/publicationPayments.ts`
  - Reason: checkout, payment, slug reservation, state transitions, history, finalization, and purge behavior still converge here.
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
  - Reason: shared preview/public render runtime with broad behavioral surface and limited representative fixture coverage.
- `functions/src/utils/generarHTMLDesdeObjetos.ts`
  - Reason: object-level render contract for many element families, including legacy branches and shape-specific rendering paths.
- `functions/src/index.ts`
  - Reason: very broad export surface with mixed responsibilities, including public access/lifecycle wiring and many unrelated handlers.

## 7. Updated Improvement Priorities

### First

- Extract a backend-only publication lifecycle helper around:
  - effective expiration inputs
  - public accessibility inputs
  - trash-purge input derivation
- Reuse that helper from `functions/src/payments/publicationPayments.ts` and `functions/src/index.ts`.
- Keep `shared/lifecycleParity.test.mjs` green while doing it.
- Do not broaden the change into checkout redesign or finalization-orchestration rewrites.

### Next

- Narrow lifecycle/history/trash helper reuse further after that extraction, still without changing current semantics.
- Continue draft persistence cleanup only after the lifecycle helper boundary is clearer, or when adjacent work requires it.
- Continue template preview cleanup around dual preview modes and generated-HTML-only live patching.
- Continue preview controller cleanup only as incremental simplification, not as a repo-wide first-pass hardening target.

### Maintain

- `src/pages/dashboard.js` plus `src/domain/dashboard/pageShell.js` as the current dashboard shell boundary
- `src/hooks/useDashboardPreviewController.js` runtime seam and test surface
- `src/hooks/useDashboardTemplateModal.js` runtime seam and test surface
- `shared/lifecycleParityFixtures.mjs` and `shared/lifecycleParity.test.mjs`
- `shared/renderAssetContract.*` and `shared/renderContractPolicy.*`
- `functions/src/payments/publicationPublishValidation.ts`

### Later

- Expand representative fixture coverage around the HTML generators before broader render-surface refactors.
- Clean up template editorial/admin conversions after template preview and personalization seams are more fully fenced.
- Revisit public delivery and public RSVP only after lifecycle helper reuse is clearer on the backend.

### Last

- Direct broad rewrite inside `functions/src/payments/publicationPayments.ts`
- Direct refactor inside `src/components/CanvasEditor.jsx`

## 8. Explicit Call: `dashboard.js`, preview controller, draft persistence, lifecycle helpers, HTML generators, `CanvasEditor.jsx`, `publicationPayments.ts`

### Recommended order

1. backend-only publication lifecycle helper extraction
2. broader lifecycle/history/trash helper narrowing
3. draft persistence follow-up if needed
4. template preview / personalization dual-mode cleanup
5. preview controller cleanup only as incremental simplification
6. HTML generators in fixture-backed slices only
7. `src/components/CanvasEditor.jsx`
8. broad `publicationPayments.ts` rewrite never as a first pass

### Should they be tackled now?

- backend-only publication lifecycle helper extraction: Yes. This is now the best current incremental target because lifecycle risk is better localized and parity-tested than before.
- broader lifecycle/history/trash helper narrowing: Yes, but only after the first helper extraction clarifies the backend interpretation boundary.
- draft persistence follow-up: Yes, incrementally. The boundary is safer than before, but it is no longer the best first target.
- `src/hooks/useDashboardPreviewController.js`: Not as the top priority anymore. It is now materially safer, and further cleanup should be incremental rather than treated as the main hardening entry point.
- `src/pages/dashboard.js`: No longer the main blocker. Small composition cleanups are safe, but the shell should not still be framed as the best first target.
- preview generation itself: No longer a first-pass fragility hotspot. The pipeline and state shaping layers are already extracted and tested.
- HTML generators: Not as a broad rewrite. Only tackle them in bounded, fixture-backed slices after adding more representative coverage.
- `src/components/CanvasEditor.jsx`: No direct refactor yet. Keep reducing dependence on editor-internal runtime globals first.
- `functions/src/payments/publicationPayments.ts`: No direct broad rewrite yet. Keep extracting helper boundaries around it before attempting deeper changes.

The important change from the previous revision of this map is that `dashboard.js` and preview generation are no longer first-pass fragility hotspots. The preview controller is safer but still dense. The best next target is now backend-only publication lifecycle helper extraction because lifecycle risk is more localized and parity-tested than before.
