# SYSTEM FRAGILITY MAP

## 1. Executive Summary

This map is based on the current implementation and the current testable behavior in the repository on 2026-03-26, not on the previous version of this document.

The recent fragility-reduction work is real and visible in code:

- draft/publication read resolution is now centralized in `src/domain/invitations/readResolution.js`
- publication and draft preview image fallback logic is now centralized in `src/domain/invitations/previewReadModel.js`
- critical preview/publish flushes now go through `src/domain/drafts/criticalFlush.js` + `src/domain/drafts/flushGate.js`
- editor snapshot reads now have an explicit adapter in `src/lib/editorSnapshotAdapter.js`
- asset normalization is now centralized around `shared/renderAssetContract.*` and `functions/src/utils/publishAssetNormalization.ts`
- legacy render-branch classification is now explicit in `shared/renderContractPolicy.*`
- publish preflight is now centralized in `functions/src/payments/publicationPublishValidation.ts`
- client/server RSVP normalization is now aligned between `src/domain/rsvp/config.js` and `functions/src/rsvp/config.ts`
- template preview/personalization now has shared planning/runtime helpers and focused tests under `src/domain/templates/`

Those changes reduced drift around preview lookup, asset normalization, CTA readiness, flush timing, and client/server RSVP schema handling. They did not remove the system's highest-risk seams.

The most dangerous modules are still:

- `functions/src/payments/publicationPayments.ts`
- `src/components/CanvasEditor.jsx`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarHTMLDesdeObjetos.ts`

The largest priority change in this revision is `src/pages/dashboard.js`: it is still risky, but it is no longer blocked behind missing surrounding boundaries. It is now the first large orchestration module that can be decomposed incrementally.

One documentation note remains stale outside this file: the current HTML generator in `functions/src/utils/generarHTMLDesdeObjetos.ts` supports `rect`, `circle`, `line`, `triangle`, `diamond`, `star`, `arrow`, `pentagon`, `hexagon`, and `heart`.

### Priority Labels Used Here

- `Maintain`: the seam is already materially safer; prefer additive tests and small contract-preserving changes.
- `First`: best current refactor target.
- `Next`: good follow-up once the first wave lands.
- `Later`: not blocked forever, but still should wait.
- `Last`: too risky for direct refactor right now.

## 2. Risks Actually Reduced

### Reduced: alternate draft/publication lookup drift

`src/pages/dashboard.js` now delegates editor entry and preview publication lookup to `resolveOwnedDraftSlugForEditorRead` and `resolvePublicationLinkForDraftRead` in `src/domain/invitations/readResolution.js`. The current lookup order and fallback behavior are covered by `src/domain/invitations/readResolution.test.mjs`.

### Reduced: preview image fallback drift

Preview image candidate selection is no longer spread only through ad hoc component code. `src/domain/invitations/previewReadModel.js` now centralizes draft/publication preview candidate ordering and linked-draft fallback, and it is used by `useDashboardDrafts`, `useDashboardPublications`, `PublicadasGrid.jsx`, and `DashboardPublicadasSection.jsx`. Current behavior is covered by `src/domain/invitations/previewReadModel.test.mjs`.

### Reduced: preview/publish flush timing ambiguity

Critical actions now go through `flushEditorPersistenceBeforeCriticalAction` in `src/domain/drafts/criticalFlush.js`. That helper explicitly distinguishes template direct flush (`window.canvasEditor.flushPersistenceNow`) from draft event-based flush (`editor:draft-flush:request` / `editor:draft-flush:result`) and can capture a boundary snapshot. Current behavior is covered by `src/domain/drafts/criticalFlush.test.mjs`.

### Reduced: uncontrolled editor snapshot reads

Non-editor consumers now have an explicit read adapter in `src/lib/editorSnapshotAdapter.js`. The adapter is already used by `src/pages/dashboard.js`, `src/utils/guardarThumbnail.js`, `src/components/DashboardHeader.jsx`, `src/domain/countdownAudit/runtime.js`, and the editor window bridge. The migration is not complete because legacy globals still exist, but the read boundary is better defined and tested in `src/lib/editorSnapshotAdapter.test.mjs`.

### Reduced: asset contract drift across load/preview/publish

The repo now has one shared asset-contract layer in `shared/renderAssetContract.*`, publish-time normalization in `functions/src/utils/publishAssetNormalization.ts`, and representative fixtures/tests in:

- `shared/renderAssetContract.test.mjs`
- `functions/publishAssetNormalization.test.mjs`

This materially reduces the earlier risk that load, preview, and publish normalized `src`/`url`/`mediaUrl`/section assets differently.

### Reduced: legacy contract ambiguity

Legacy render branches are now explicitly classified instead of being only implicit compatibility behavior. `shared/renderContractPolicy.*` marks countdown schema v1 and `icono-svg` as frozen compatibility branches, and the HTML generator emits explicit countdown contract markers. Current behavior is covered by:

- `shared/renderContractPolicy.test.mjs`
- `functions/renderContractCompatibility.test.mjs`

### Reduced: publish-input ambiguity

`functions/src/payments/publicationPayments.ts` no longer owns publish input preparation alone. It now delegates to:

- `preparePublicationRenderState`
- `validatePreparedPublicationRenderState`
- `resolveFunctionalCtaContract`

That separation is backed by representative tests in `functions/publicationPublishValidation.test.mjs`. This does not make finalization safe, but it does reduce input-contract fragility.

### Reduced: client/server RSVP normalization drift

`sheetUrl` and other RSVP normalization semantics are now aligned between frontend and backend. Current parity is covered by `src/domain/rsvp/config.test.mjs`.

### Reduced: template preview/personalization contract drift

Template preview source resolution now goes through the shared template contract, preview runtime mode selection is explicit, and post-copy personalization now runs through `src/domain/templates/personalizationContract.js`. Current behavior is covered by:

- `src/domain/templates/preview.test.mjs`
- `src/domain/templates/personalization.test.mjs`

This is a meaningful improvement, but the area still has two preview modes and iframe patching.

## 3. Fragility Matrix by Area

| Area | Complexity | Fragility | Business criticality | Regression risk | Priority now |
| --- | --- | --- | --- | --- | --- |
| Dashboard shell | High | High | High | High | First |
| Dashboard home data loading | Medium | Medium | Medium | Medium | Next |
| Editor runtime | Very High | Very High | High | Very High | Last |
| Draft persistence | High | Medium | High | Medium-High | Next |
| Template preview and personalization | High | Medium-High | High | Medium-High | Next |
| Template admin/editorial flows | High | High | Medium | High | Later |
| Preview generation | High | Medium-High | High | High | First |
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

Main files: `src/pages/dashboard.js`

This file is still a large coordinator for auth, home, editor entry, preview generation, template flows, publish validation, and checkout launch. The current code is safer than before because editor entry resolution, publication lookup, flush confirmation, and snapshot capture now live behind explicit helpers. It is still fragile because preview generation still re-reads persistence and then overwrites that payload with a live editor snapshot before importing `functions/src/utils/generarHTMLDesdeSecciones.ts`, so preview orchestration remains cross-layer and multi-source.

Assessment change: still high fragility, but now a viable decomposition target.

### Dashboard home data loading

Main files: `src/hooks/useDashboardDrafts.js`, `src/hooks/useDashboardPublications.js`, `src/components/dashboard/home/DashboardHomeView.jsx`

This area is safer than before. Draft visibility now uses `resolveDraftPublicationLifecycleState`, and publication preview fallback now uses `resolvePublicationPreviewReadModelsByItemKey`. The remaining risk is duplication: publication read-model assembly still exists in more than one UI surface (`useDashboardPublications.js`, `DashboardPublicadasSection.jsx`, `PublicadasGrid.jsx`), and history reads still degrade differently when `publicadas_historial` is not readable.

Assessment change: fragility drops from high to medium.

### Editor runtime

Main files: `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/components/editor/window/useEditorWindowBridge.js`, `src/drag/dragGrupal.js`

The editor runtime remains too coupled for a direct refactor. The snapshot adapter is real progress, but the runtime still exports and consumes many legacy globals: `_objetosActuales`, `_seccionesOrdenadas`, `_elementosSeleccionados`, `_isDragging`, `_grupoLider`, `_resizeData`, `_rsvpConfigActual`, `_giftsConfigActual`, `_giftConfigActual`, and `window.canvasEditor`. Many non-editor modules still read those globals directly.

Assessment change: surrounding consumers are slightly safer; editor internals themselves are not.

### Draft persistence

Main files: `src/components/editor/persistence/useBorradorSync.js`, `src/domain/drafts/criticalFlush.js`, `src/domain/drafts/flushGate.js`

This seam is materially safer than before. `useBorradorSync` now has explicit load-time and persist-time normalization boundaries, normalizes render assets, normalizes pantalla positions, centralizes immediate flush behavior, and writes `draftContentMeta` consistently. It is still non-trivial because the same hook supports normal draft sessions and template sessions and still owns URL refresh, autosave timing, thumbnail generation, and flush behavior.

Assessment change: fragility drops from high to medium.

### Template preview and personalization

Main files: `src/components/TemplatePreviewModal.jsx`, `src/domain/templates/preview.js`, `src/domain/templates/personalization.js`, `src/domain/templates/personalizationContract.js`, `src/domain/templates/previewLivePatch.js`

This area improved significantly. Preview mode selection is now explicit, live patching runs from a shared personalization field plan, and post-copy personalization uses a shared contract plus focused tests. It remains fragile because the system still supports both URL-based preview and generated preview, and only the generated path supports iframe patching and text-position capture.

Assessment change: still somewhat fragile, but no longer one of the least-fenced seams in the repo.

### Template admin/editorial flows

Main files: `functions/src/templates/editorialService.ts`, `src/domain/templates/adminService.js`, `src/domain/templates/authoring/service.js`

This area still has multiple representations of the same logical template: source template, catalog projection, editor document, workspace draft, and authoring snapshot. The current code does not show the same kind of contract hardening here that now exists for preview or publish validation.

Assessment change: no meaningful reduction visible in the current implementation.

### Preview generation

Main files: `src/pages/dashboard.js`, `src/domain/templates/preview.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`

Preview generation is safer than before because the code now has an explicit flush boundary and an explicit snapshot adapter. It is still not a single authoritative pipeline: dashboard preview still re-reads persisted state and then overlays a live editor snapshot, and frontend preview still imports backend generator code directly.

Assessment change: fragility drops from high to medium-high, but this remains tightly coupled to `dashboard.js`.

### Publish validation

Main files: `functions/src/payments/publicationPublishValidation.ts`

This is now one of the safest important seams in the publishing path. The code cleanly separates render-state preparation from validation, explicitly classifies blockers versus warnings, and carries representative fixture coverage for image assets, gallery assets, countdown contracts, CTA readiness, pantalla drift, and legacy branches.

Assessment change: priority moves from active hardening to maintenance.

### Publication checkout/payment

Main files: `src/components/payments/PublicationCheckoutModal.jsx`, `functions/src/payments/publicationPayments.ts`

The current code is still high risk because checkout state, Mercado Pago state, slug reservation state, session state, and publish finalization are still coordinated through the same backend module. The new validation/preparation helpers reduce input ambiguity, but they do not simplify payment/session orchestration.

Assessment change: some surrounding risk dropped, but this area itself is still not a safe direct target.

### Publish finalization

Main files: `functions/src/payments/publicationPayments.ts`

This remains the highest-risk backend seam. `publishDraftToPublic` still re-reads the draft, normalizes assets, validates, generates HTML, writes Storage, writes `publicadas`, mirrors state back to `borradores`, and coordinates active/update semantics. Finalization still spans `publicadas`, `publicadas_historial`, Storage, slug reservations, and draft metadata.

Assessment change: input preparation is cleaner, but finalization remains very high fragility.

### Public delivery

Main files: `functions/src/index.ts`, `functions/src/payments/publicationLifecycle.ts`

Public delivery is still smaller than the publish pipeline, but it remains coupled to distributed publication state and Storage artifacts. The access path still finalizes expired publications on read, so public delivery is not a pure read path.

Assessment change: no material reduction.

### Public RSVP

Main files: `functions/src/index.ts`, `functions/src/rsvp/config.ts`, `src/domain/rsvp/config.js`

This area is safer than before because client/server normalization semantics now match, including `sheetUrl` handling in the config layer. It still depends on current publication accessibility and still finalizes expired publications on request before returning `410`.

Assessment change: fragility drops from high to medium.

### Shared render contracts

Main files: `shared/renderAssetContract.*`, `shared/renderContractPolicy.*`

These are now clearly fenced by focused tests and are the safest cross-runtime contract surfaces in the repository. They still matter a lot, but the logic is explicit and much less orchestration-heavy than surrounding modules.

Assessment change: remains low fragility and shifts to maintenance mode.

### Asset normalization

Main files: `shared/renderAssetContract.*`, `functions/src/utils/publishAssetNormalization.ts`, `src/components/editor/persistence/useBorradorSync.js`

This seam is now materially safer. Load-time normalization, preview-time canonicalization, and publish-time normalization are still separate stages, but they now share a much clearer contract and representative fixture coverage. The remaining risk is that the system still resolves assets in different runtime contexts, not that the field contract is undefined.

Assessment change: fragility drops from high to medium.

### HTML generation

Main files: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`

The generators are still high-risk shared render surfaces. Current code is better fenced than before because it now consumes explicit render-contract helpers, uses the functional CTA contract, and has compatibility tests for countdown contract markers. It is still a very large, broadly shared runtime with limited representative fixture coverage compared with its blast radius.

Assessment change: slightly safer around contract handling, but still not ready for a broad refactor.

### Lifecycle / history / trash / finalization

Main files: `src/domain/drafts/state.js`, `functions/src/drafts/draftTrashLifecycle.ts`, `src/domain/publications/state.js`, `functions/src/payments/publicationLifecycle.ts`, `functions/src/payments/publicationPayments.ts`

This area remains distributed. Frontend and backend helpers now look more aligned than before, but they are still separate implementations and are not yet backed by the same kind of parity-fixture coverage that now exists for assets, preview read models, RSVP config, or publish validation. Finalization and purge behavior also still live partly in `publicationPayments.ts`.

Assessment change: still high fragility and a good follow-up helper-consolidation target.

## 5. Modules Now Safer to Refactor

These modules now have enough contract definition or test coverage to support focused refactors:

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

- `src/hooks/useDashboardDrafts.js`
- `src/hooks/useDashboardPublications.js`
- `src/components/editor/persistence/useBorradorSync.js`
- `src/pages/dashboard.js` for incremental decomposition only

## 6. Areas Still Too Risky To Touch Directly

These areas still should not be used as first-pass refactor targets:

- `src/components/CanvasEditor.jsx`
  - Reason: heavy runtime dependence on window globals and drag/resize side channels across many consumers.
- `functions/src/payments/publicationPayments.ts`
  - Reason: payment/session state, slug reservation, active publication writes, finalization, history, and purge/finalization helpers still converge here.
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
  - Reason: shared preview/public render runtime with large behavioral surface and limited fixture coverage.
- `functions/src/utils/generarHTMLDesdeObjetos.ts`
  - Reason: object-level render contract for many element families, including legacy branches.
- `functions/src/index.ts`
  - Reason: public delivery and RSVP still retain lifecycle side effects and mixed export responsibilities.

## 7. Updated Improvement Priorities

### First

- Decompose `src/pages/dashboard.js` into smaller coordinators around:
  - editor session resolution
  - preview generation
  - publish validation / checkout launch
  - template modal orchestration
- Consolidate duplicated publication list/read-model assembly now that shared preview/read-resolution helpers exist.
- Add lifecycle parity fixtures for:
  - `src/domain/publications/state.js` vs `functions/src/payments/publicationLifecycle.ts`
  - `src/domain/drafts/state.js` vs `functions/src/drafts/draftTrashLifecycle.ts`

### Next

- Continue reducing preview drift so dashboard preview stops owning both the persistence re-read path and the live snapshot overlay path.
- Refine `useBorradorSync` now that the normalization and flush boundaries are explicit.
- Continue template preview/personalization cleanup around the now-shared personalization plan instead of editing modal logic ad hoc.

### Later

- Expand fixture coverage around the HTML generators before attempting broader render-surface refactors.
- Clean up template editorial/admin conversions after current template contract surfaces are better documented and fenced.
- Revisit public delivery/RSVP only after lifecycle semantics are better parity-tested.

### Last

- Direct refactors inside `CanvasEditor.jsx`
- Direct refactors inside `publicationPayments.ts`

## 8. Explicit Call: `dashboard.js`, `publicationPayments.ts`, HTML Generators, `CanvasEditor.jsx`

### Recommended order

1. `src/pages/dashboard.js`
2. `functions/src/utils/generarHTMLDesdeSecciones.ts` + `functions/src/utils/generarHTMLDesdeObjetos.ts`
3. `src/components/CanvasEditor.jsx`
4. `functions/src/payments/publicationPayments.ts`

### Should they be tackled now?

- `src/pages/dashboard.js`: Yes, incrementally. It is still risky, but the surrounding hardening work now gives it enough stable seams to start decomposing safely.
- HTML generators: Not as a broad rewrite. Only tackle them in bounded, fixture-backed slices after adding more representative coverage.
- `src/components/CanvasEditor.jsx`: No direct refactor yet. Keep migrating consumers away from legacy globals first.
- `functions/src/payments/publicationPayments.ts`: No direct refactor yet. It should stay last until payment/finalization behavior has much stronger execution-path coverage.

The important change from the previous version of this map is that `dashboard.js` moved out of the "do not touch early" bucket. The other three named areas did not.
