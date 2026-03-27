# SYSTEM FRAGILITY MAP

## 1. Executive Summary

This map is based on the current implementation and the current testable behavior in the repository on 2026-03-26. It describes the code that exists today; it does not introduce code or API changes.

The recent dashboard and preview hardening is real and visible in code:

- dashboard startup/preload orchestration now lives in `src/hooks/useDashboardStartupLoaders.js`
- dashboard route/session resolution now lives in `src/hooks/useDashboardEditorRoute.js` plus `src/domain/dashboard/editorSession.js`
- template preview modal selection/loading orchestration now lives in `src/hooks/useDashboardTemplateModal.js`
- publication list/read-model assembly is now centralized in `src/domain/publications/dashboardList.js`
- dashboard home section shaping is now centralized in `src/domain/dashboard/homeModel.js`
- preview state shaping is now centralized in `src/domain/dashboard/previewSession.js`
- preview generation is now centralized in `src/domain/dashboard/previewPipeline.js`
- preview publication validation/audit actions are now centralized in `src/domain/dashboard/previewPublicationActions.js`

Those changes made several seams materially safer:

- `src/pages/dashboard.js` is now mostly a composition layer instead of the main owner of startup/preload, route resolution, preview internals, and template modal orchestration
- dashboard home/publication assembly is now shared across home and publication surfaces instead of being rebuilt ad hoc in each caller
- preview generation is no longer one large controller-owned flow; its session state, payload shaping, generation pipeline, and publication-side actions now have separate domain modules and focused tests

They did not remove the system's highest-risk seams.

The most dangerous modules are still:

- `functions/src/payments/publicationPayments.ts`
- `src/components/CanvasEditor.jsx`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarHTMLDesdeObjetos.ts`

The main priority change in this revision is that preview generation itself should no longer be treated as the best first target. The extracted preview modules lowered that risk. The better first-pass refactor target is now `src/hooks/useDashboardPreviewController.js`: it is thinner and more controller-focused than before, but it still coordinates session tokens, flush gating, publish validation refresh, modal state, and checkout transitions in one large async hook.

The main backend follow-up target is still lifecycle/history/trash hardening, but that work should be boundary extraction and parity hardening around current behavior, not a broad rewrite of `publicationPayments.ts`.

### Priority Labels Used Here

- `Maintain`: the seam is already materially safer; prefer additive tests and small contract-preserving changes.
- `First`: best current incremental refactor target.
- `Next`: good follow-up once the first wave lands.
- `Later`: not blocked forever, but still should wait.
- `Last`: too risky for direct refactor right now.

## 2. Risks Actually Reduced

### Reduced: dashboard shell no longer owns startup/preload internals

`src/pages/dashboard.js` still coordinates view composition, but editor/home startup loaders now live in `src/hooks/useDashboardStartupLoaders.js`. That hook owns editor asset preload, runtime readiness tracking, home loader timing, and the loader exit choreography that previously made the page harder to reason about inline.

### Reduced: dashboard route/session orchestration is now fenced outside the page

Editor route normalization, template workspace entry, admin draft snapshot handling, legacy draft blocking, and compatibility draft resolution now live in `src/hooks/useDashboardEditorRoute.js` plus the pure helpers in `src/domain/dashboard/editorSession.js`. Current behavior is covered by `src/domain/dashboard/editorSession.test.mjs`.

### Reduced: template modal orchestration is no longer mixed into the dashboard page

Template selection sessions, preview HTML caching, preview status tracking, and open-editor handoff now live in `src/hooks/useDashboardTemplateModal.js`. `src/pages/dashboard.js` now treats the template modal as a dedicated controller surface instead of owning its internal state machine directly.

### Reduced: dashboard home section shaping is now centralized

`src/components/dashboard/home/DashboardHomeView.jsx` now composes draft/publication/template/config hooks and delegates section shaping to `src/domain/dashboard/homeModel.js` via `useDashboardHomeSections.js`. The page no longer builds dashboard home rails inline.

### Reduced: publication list/read-model assembly is now shared across dashboard surfaces

Publication source loading and publication item shaping now go through `loadUserPublicationSourceRecords` and `assembleDashboardPublicationItems` in `src/domain/publications/dashboardList.js`. That shared module is used by `src/hooks/useDashboardPublications.js`, `src/components/DashboardPublicadasSection.jsx`, and `src/components/PublicadasGrid.jsx`. Current behavior is covered by `src/domain/publications/dashboardList.test.mjs`.

### Reduced: alternate draft/publication lookup drift

`src/pages/dashboard.js` and preview/home flows now rely on shared resolution helpers in `src/domain/invitations/readResolution.js` instead of ad hoc lookup order. Current lookup behavior is covered by `src/domain/invitations/readResolution.test.mjs`.

### Reduced: preview image fallback drift

Publication and draft preview candidate resolution still goes through `src/domain/invitations/previewReadModel.js`, and the publication list assembly now consumes that shared read-model instead of rebuilding preview lookup locally. Current behavior is covered by `src/domain/invitations/previewReadModel.test.mjs`.

### Reduced: preview state shaping is now explicit and test-backed

The preview modal state factory, success/error patches, live snapshot overlay, preview render payload shaping, and display URL logic now live in `src/domain/dashboard/previewSession.js`. Current behavior is covered by `src/domain/dashboard/previewSession.test.mjs`.

### Reduced: preview generation is now a dedicated pipeline

Preview document read, live snapshot overlay, publication link lookup, generator input shaping, and HTML generation handoff now live in `src/domain/dashboard/previewPipeline.js`. Current behavior is covered by `src/domain/dashboard/previewPipeline.test.mjs`.

### Reduced: preview publication-side actions are now separated from the controller

Publish validation dispatch, preview publish action resolution, and delayed published audit capture now live in `src/domain/dashboard/previewPublicationActions.js`. Current behavior is covered by `src/domain/dashboard/previewPublicationActions.test.mjs`.

### Reduced: preview/publish flush timing ambiguity

Critical actions still go through `flushEditorPersistenceBeforeCriticalAction` in `src/domain/drafts/criticalFlush.js`, which makes the draft flush boundary explicit before preview and checkout. Current behavior is covered by `src/domain/drafts/criticalFlush.test.mjs`.

### Reduced: uncontrolled editor snapshot reads

Non-editor consumers still read the editor through `src/lib/editorSnapshotAdapter.js`, which gives preview and other dashboard consumers an explicit boundary instead of direct dependence on runtime globals. Current behavior is covered by `src/lib/editorSnapshotAdapter.test.mjs`.

### Reduced: asset contract drift across load/preview/publish

The repo still relies on shared asset normalization via `shared/renderAssetContract.*`, `functions/src/utils/publishAssetNormalization.ts`, and load-time/persist-time normalization in `src/components/editor/persistence/useBorradorSync.js`. This remains materially safer than the older scattered handling.

### Reduced: publish-input ambiguity

`functions/src/payments/publicationPayments.ts` still owns checkout/finalization, but publish input preparation and validation are fenced through `functions/src/payments/publicationPublishValidation.ts`. That seam remains one of the safest important parts of publish.

### Reduced: template preview/personalization contract drift

Template preview mode resolution now goes through `src/domain/templates/preview.js`, and post-copy personalization now goes through `src/domain/templates/personalization.js` plus `src/domain/templates/personalizationContract.js`. Current behavior is covered by `src/domain/templates/preview.test.mjs` and `src/domain/templates/personalization.test.mjs`.

## 3. Fragility Matrix by Area

| Area | Complexity | Fragility | Business criticality | Regression risk | Priority now |
| --- | --- | --- | --- | --- | --- |
| Dashboard shell | Medium-High | Medium | High | Medium | Maintain |
| Dashboard home data loading / publication assembly | Medium | Low-Medium | Medium | Medium | Maintain |
| Editor runtime | Very High | Very High | High | Very High | Last |
| Draft persistence | High | Medium | High | Medium-High | Next |
| Template preview and personalization | High | Medium | High | Medium-High | Next |
| Template admin/editorial flows | High | High | Medium | High | Later |
| Preview generation | Medium-High | Medium | High | Medium-High | Next |
| Preview controller tier | High | Medium-High | High | High | First |
| Publish validation | High | Low-Medium | High | Medium | Maintain |
| Publication checkout/payment | High | High | Very High | Very High | Last |
| Publish finalization | Very High | Very High | Very High | Very High | Last |
| Public delivery | Medium | Medium | Very High | High | Later |
| Public RSVP | Medium | Medium | High | Medium | Later |
| Shared render contracts | Medium | Low | High | Low-Medium | Maintain |
| Asset normalization | Medium-High | Medium | High | Medium | Maintain |
| HTML generation | Very High | High | Very High | Very High | Later |
| Lifecycle / history / trash / finalization | High | High | Very High | High | Next |

## 4. Area-by-Area Reassessment

### Dashboard shell

Main files: `src/pages/dashboard.js`, `src/hooks/useDashboardStartupLoaders.js`, `src/hooks/useDashboardEditorRoute.js`, `src/hooks/useDashboardTemplateModal.js`

`src/pages/dashboard.js` is now mostly a composition layer. It wires auth/admin access, editor route state, startup loaders, preview controller output, template modal props, and the view layout together. The page still coordinates many states and conditional views, but it no longer owns the dashboard's deepest startup/preload or preview-generation internals inline.

Remaining risk: the shell still coordinates many cross-hook state transitions, view gates, and editor/home modal combinations. The current risk is orchestration at the composition layer, not the older "one page owns everything" shape.

Assessment change: fragility drops from high to medium and moves into maintenance mode.

### Dashboard home data loading / publication assembly

Main files: `src/components/dashboard/home/DashboardHomeView.jsx`, `src/hooks/useDashboardPublications.js`, `src/domain/publications/dashboardList.js`, `src/domain/dashboard/homeModel.js`

This area is materially safer than before. Dashboard home section shaping now goes through `src/domain/dashboard/homeModel.js`, and publication item assembly now goes through `src/domain/publications/dashboardList.js`. The shared publication module is reused across home and publication surfaces, so the read-model contract is no longer reconstructed independently in each caller.

Remaining risk: load/refresh orchestration and lifecycle action UI are still duplicated across `useDashboardPublications.js`, `DashboardPublicadasSection.jsx`, `DashboardPublicationRailSection.jsx`, and `PublicadasGrid.jsx`. The main duplication now lives in surface-specific data loading and actions, not in core publication item assembly.

Assessment change: fragility drops from medium/high orchestration risk to low-medium contract risk and moves into maintenance mode.

### Editor runtime

Main files: `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/components/editor/window/useEditorWindowBridge.js`, `src/drag/dragGrupal.js`

The editor runtime remains too coupled for a direct refactor. Surrounding dashboard consumers now have better boundaries, but the runtime itself still coordinates a large number of global bridges, drag/resize side channels, and selection/runtime internals.

Assessment change: surrounding consumers are safer; editor internals themselves are not.

### Draft persistence

Main files: `src/components/editor/persistence/useBorradorSync.js`, `src/domain/drafts/criticalFlush.js`, `src/domain/drafts/flushGate.js`

This seam is materially safer than before. `useBorradorSync.js` now has explicit load-time hydration boundaries, explicit persist-time normalization boundaries, explicit flush behavior, and consistent `draftContentMeta` writes. It also normalizes render assets and pantalla positions before persistence and before editor hydration.

Remaining risk: the same hook still owns autosave timing, thumbnail generation, storage URL refresh, draft/template dual-mode behavior, countdown audit recording, and direct persistence bridging for critical actions.

Assessment change: fragility drops from high to medium, but it is still a meaningful `Next` target.

### Template preview and personalization

Main files: `src/components/TemplatePreviewModal.jsx`, `src/hooks/useDashboardTemplateModal.js`, `src/domain/templates/preview.js`, `src/domain/templates/personalization.js`, `src/domain/templates/personalizationContract.js`, `src/domain/templates/previewLivePatch.js`

This area improved significantly. Preview runtime mode selection is now explicit, form-state/modal orchestration is separated from the dashboard page, and post-copy personalization uses a shared plan/contract instead of only local modal logic.

Remaining risk: the system still supports two preview modes (`url` and generated HTML), and only the generated path supports iframe patching and text-position capture. Live patching and preview text-position capture are still specialized behaviors that make the surface more fragile than a plain read-only preview.

Assessment change: fragility drops to medium, but the dual-mode preview model keeps it as a `Next` target rather than a maintenance seam.

### Template admin/editorial flows

Main files: `functions/src/templates/editorialService.ts`, `src/domain/templates/adminService.js`, `src/domain/templates/authoring/service.js`

This area still has multiple representations of the same logical template: source template, catalog projection, editor document, workspace draft, and authoring snapshot. The current code does not show the same degree of shared contract hardening here that now exists for dashboard preview or publication assembly.

Assessment change: no major reduction visible in the current implementation.

### Preview generation

Main files: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`

Preview generation is materially safer than before. The pipeline, preview payload shaping, generator input shaping, and publication-link lookup now live behind explicit domain modules with focused tests. This is no longer a single monolithic path buried inside `dashboard.js` or a large hook.

Remaining risk: the current pipeline still re-reads persisted draft/template data, overlays a live editor snapshot, and imports the backend HTML generator directly from the frontend. That means preview still depends on multiple sources of truth and on a cross-runtime generator boundary.

Assessment change: fragility drops from high/first-pass risk to medium/next-pass risk. Preview generation should no longer be `First`.

### Preview controller tier

Main files: `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewPublicationActions.js`

`useDashboardPreviewController.js` is materially thinner and more controller-focused than before. It now delegates preview state shaping, payload assembly, preview generation, publish validation dispatch, and published audit capture to extracted domain modules.

It is still the most concentrated preview refactor target. The hook continues to own preview-session tokens, stale-session rejection, flush-before-preview logic, publish validation refresh side effects, preview modal state, checkout-open gating, and published-state updates in one large async controller. Current tests in `src/hooks/useDashboardPreviewController.test.mjs` cover session-token and compatibility helpers, but not the hook's full async state machine.

Assessment change: this becomes the best current incremental refactor target and moves to `First`.

### Publish validation

Main files: `functions/src/payments/publicationPublishValidation.ts`

This remains one of the safest important seams in the publishing path. Render-state preparation and publish validation are explicit, test-backed, and already separated from checkout/finalization orchestration.

Assessment change: stays in maintenance mode.

### Publication checkout/payment

Main files: `src/components/payments/PublicationCheckoutModal.jsx`, `functions/src/payments/publicationPayments.ts`

This area is still high risk because checkout session state, Mercado Pago state, slug reservation state, session retry handling, and publish finalization still converge through the same backend module. The improved validation boundary reduces input ambiguity, but it does not simplify the payment/session orchestration itself.

Assessment change: some surrounding input risk dropped; the area itself is still not a safe direct target.

### Publish finalization

Main files: `functions/src/payments/publicationPayments.ts`

This remains the highest-risk backend seam. Finalization still spans draft rereads, publish validation, HTML generation, Storage writes, `publicadas`, `publicadas_historial`, slug reservation cleanup, and mirror writes back to `borradores`.

Assessment change: no meaningful drop in direct-refactor safety.

### Public delivery

Main files: `functions/src/index.ts`, `functions/src/payments/publicationLifecycle.ts`

Public delivery is still smaller than the publish pipeline, but it remains coupled to distributed publication state and exported handler wiring. The public access path is still not a pure read-only surface.

Assessment change: no material reduction.

### Public RSVP

Main files: `functions/src/index.ts`, `functions/src/rsvp/config.ts`, `src/domain/rsvp/config.js`

This area remains safer than it used to be because client/server RSVP normalization semantics are aligned, but it still depends on publication accessibility and backend lifecycle state.

Assessment change: remains medium fragility and not a first-pass target.

### Shared render contracts

Main files: `shared/renderAssetContract.*`, `shared/renderContractPolicy.*`

These remain the safest cross-runtime contract surfaces in the repository. They are explicit, test-backed, and much less orchestration-heavy than the dashboard, editor, or payment/finalization seams around them.

Assessment change: remains low fragility and in maintenance mode.

### Asset normalization

Main files: `shared/renderAssetContract.*`, `functions/src/utils/publishAssetNormalization.ts`, `src/components/editor/persistence/useBorradorSync.js`

This seam remains materially safer. Load-time normalization, preview-time canonicalization, and publish-time normalization still happen in different runtime contexts, but the field contract is much better defined than before.

Assessment change: remains medium fragility and in maintenance mode.

### HTML generation

Main files: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`

The generators are still high-risk shared render surfaces. Current code is better fenced around contracts than it used to be, but the runtime is still large, broadly shared, and undercovered relative to its blast radius.

Assessment change: still not ready for a broad refactor.

### Lifecycle / history / trash / finalization

Main files: `src/domain/drafts/state.js`, `functions/src/drafts/draftTrashLifecycle.ts`, `src/domain/publications/state.js`, `functions/src/payments/publicationLifecycle.ts`, `functions/src/payments/publicationPayments.ts`

This area remains distributed. Frontend and backend state helpers are closer in shape than before, but they are not a single shared contract surface and are not backed by parity-style fixtures. `functions/src/payments/publicationPayments.ts` still owns publication state transitions, history writes, finalization, trash purge behavior, and checkout/finalization coupling in the same module.

Assessment change: still high fragility. This is the main backend hardening follow-up, but it should start with helper extraction and parity hardening, not with a direct rewrite of `publicationPayments.ts`.

## 5. Modules Now Safer to Refactor

These modules now have enough boundary definition or test coverage to support focused refactors:

- `src/hooks/useDashboardStartupLoaders.js`
- `src/hooks/useDashboardEditorRoute.js`
- `src/domain/dashboard/editorSession.js`
- `src/domain/publications/dashboardList.js`
- `src/domain/dashboard/homeModel.js`
- `src/domain/dashboard/previewSession.js`
- `src/domain/dashboard/previewPipeline.js`
- `src/domain/dashboard/previewPublicationActions.js`
- `src/domain/invitations/readResolution.js`
- `src/domain/invitations/previewReadModel.js`
- `src/domain/drafts/criticalFlush.js`
- `src/domain/drafts/flushGate.js`
- `src/lib/editorSnapshotAdapter.js`
- `shared/renderAssetContract.*`
- `shared/renderContractPolicy.*`
- `functions/src/utils/publishAssetNormalization.ts`
- `functions/src/payments/publicationPublishValidation.ts`
- `src/domain/rsvp/config.js`
- `functions/src/rsvp/config.ts`
- `src/domain/templates/preview.js`
- `src/domain/templates/personalization.js`
- `src/domain/templates/personalizationContract.js`

Modules that are not small but are now safer than they were before:

- `src/pages/dashboard.js`
- `src/hooks/useDashboardPublications.js`
- `src/hooks/useDashboardTemplateModal.js`
- `src/hooks/useDashboardPreviewController.js` for incremental extraction only
- `src/components/editor/persistence/useBorradorSync.js`

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

- Further decompose `src/hooks/useDashboardPreviewController.js` around:
  - preview session token/state transition handling
  - preview-open flow and failure paths
  - publish validation refresh and checkout gating
- Add controller-level tests that cover:
  - preview open success/failure
  - stale session rejection across async completions
  - publish validation refresh behavior
  - checkout-ready and checkout-closed transitions
- Keep `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPipeline.js`, and `src/domain/dashboard/previewPublicationActions.js` as the lower-level boundaries; do not move that logic back into the hook.

### Next

- Add lifecycle parity fixtures for:
  - `src/domain/publications/state.js` vs `functions/src/payments/publicationLifecycle.ts`
  - `src/domain/drafts/state.js` vs `functions/src/drafts/draftTrashLifecycle.ts`
- Extract lifecycle/history helpers out of `functions/src/payments/publicationPayments.ts` without changing checkout or finalization behavior.
- Continue simplifying `src/components/editor/persistence/useBorradorSync.js` now that load/persist/flush boundaries are explicit.
- Continue template preview cleanup around dual preview modes and iframe patching.

### Maintain

- `src/pages/dashboard.js` as a composition shell
- `src/domain/publications/dashboardList.js` and `src/domain/dashboard/homeModel.js` as shared dashboard read-model boundaries
- `functions/src/payments/publicationPublishValidation.ts`
- `shared/renderAssetContract.*` and `shared/renderContractPolicy.*`

### Later

- Expand fixture coverage around the HTML generators before broader render-surface refactors.
- Clean up template editorial/admin conversions after current template preview and personalization seams are more fully fenced.
- Revisit public delivery/RSVP only after lifecycle semantics are better parity-tested.

### Last

- Direct refactors inside `CanvasEditor.jsx`
- Direct broad rewrites inside `publicationPayments.ts`

## 8. Explicit Call: `useDashboardPreviewController.js`, `dashboard.js`, `publicationPayments.ts`, HTML Generators, `CanvasEditor.jsx`

### Recommended order

1. `src/hooks/useDashboardPreviewController.js`
2. lifecycle/history/trash hardening around `src/domain/publications/state.js`, `src/domain/drafts/state.js`, `functions/src/payments/publicationLifecycle.ts`, `functions/src/drafts/draftTrashLifecycle.ts`, and helper extractions from `functions/src/payments/publicationPayments.ts`
3. `src/components/editor/persistence/useBorradorSync.js`
4. template preview/personalization cleanup
5. `functions/src/utils/generarHTMLDesdeSecciones.ts` + `functions/src/utils/generarHTMLDesdeObjetos.ts` only in fixture-backed slices
6. `src/components/CanvasEditor.jsx`
7. `functions/src/payments/publicationPayments.ts`

### Should they be tackled now?

- `src/hooks/useDashboardPreviewController.js`: Yes, incrementally. The lower-level preview pieces are now extracted and tested, which makes the controller itself the best current first-pass target.
- `src/pages/dashboard.js`: No longer the main blocker. Small composition cleanups are safe, but the page should not still be framed as the first hardening target.
- preview generation itself: No longer `First`. The extracted preview pipeline lowered that risk; the controller tier now deserves the first slot.
- HTML generators: Not as a broad rewrite. Only tackle them in bounded, fixture-backed slices after adding more representative coverage.
- `src/components/CanvasEditor.jsx`: No direct refactor yet. Keep reducing dependence on editor-internal runtime globals first.
- `functions/src/payments/publicationPayments.ts`: No direct broad rewrite yet. Continue extracting boundaries around it before attempting deeper changes.

The important change from the previous revision of this map is that both `dashboard.js` and preview generation moved out of the "best first target" bucket. `useDashboardPreviewController.js` now occupies that position.
