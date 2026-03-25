# SYSTEM FRAGILITY MAP

## 1. Executive Summary

This map is based on the current implementation, not the intended architecture. Complexity, fragility, business criticality, and regression risk are treated separately: some areas are large but relatively fenced, while some smaller seams are fragile because they depend on multiple truth paths, browser globals, or compatibility branches.

The most fragile frontend seam today is the dashboard preview/publish coordinator in `src/pages/dashboard.js`. It combines routing, draft/template lookup, flush orchestration, preview generation, publish validation entry, and checkout entry. Its main fragility is not file size by itself; it is that preview and publish can resolve state through different paths, and preview can still replace freshly re-read Firestore data with live `window._objetosActuales`, `window._seccionesOrdenadas`, `window._rsvpConfigActual`, and `window._giftsConfigActual`.

The highest business-risk backend seam is publication lifecycle and finalization in `functions/src/payments/publicationPayments.ts`. Publication state is spread across the active `publicadas` document, `publicadas_historial`, Storage HTML under `publicadas/{slug}/index.html`, draft linkage fields, and slug reservation/payment records. Some read paths also finalize expired publications as a side effect, which increases coupling between delivery, state resolution, and lifecycle cleanup.

Asset and preview contracts are another real fragility hotspot. Preview resolution scans many aliases across drafts and publications, publish still writes compatibility-oriented publication metadata such as `tipo` and `thumbnailUrl`-derived `portada`, and assets are normalized at different stages during editor load, template copy, draft persistence, preview generation, and publish finalization. The risk here is not catastrophic single-point failure; it is gradual drift between editor, preview, and public output.

Template preview and personalization is also fragile because it is not one coherent pipeline. The current flow mixes URL-based and generated preview modes, iframe patching through `template-preview:apply`, DOM-based text position capture inside the iframe, draft creation from template, and a post-copy personalization patch written back to Firestore. Small behavior changes can break only one preview mode or only one family of templates, which makes regressions easy to miss.

The highest real production risk is concentrated in:

- publication lifecycle/finalization and public delivery paths
- dashboard preview/publish coordination
- editor/runtime state exposure through browser globals
- contract drift between draft, preview, publish, and public delivery

Focused contract tests currently fence some of the safer seams: `shared/renderAssetContract.test.mjs`, `shared/renderContractPolicy.test.mjs`, `functions/renderContractCompatibility.test.mjs`, and `functions/publicationPublishValidation.test.mjs` pass on the current codebase. That does not make those areas simple, but it does make them better early improvement targets than the large orchestration modules around them.

One documentation note is already stale relative to the implementation: the HTML generator supports more shape types than the older note in `DATA_MODEL.md`. Current support in `functions/src/utils/generarHTMLDesdeObjetos.ts` includes `rect`, `circle`, `line`, `triangle`, `diamond`, `star`, `arrow`, `pentagon`, `hexagon`, and `heart`, so decisions in this map are based on code behavior rather than older documentation.

## 2. Fragility Matrix by Area

| Area | Complexity | Fragility | Business criticality | Regression risk | Priority |
| --- | --- | --- | --- | --- | --- |
| Dashboard shell | High | High | High | High | Later |
| Dashboard home data loading | Medium | High | Medium | Medium | First |
| Editor runtime | Very High | High | High | Very High | Later |
| Draft persistence | High | High | High | High | Next |
| Template preview and personalization | High | High | High | High | Next |
| Template admin/editorial flows | High | High | Medium | High | Later |
| Preview generation | High | High | High | High | Next |
| Publish validation | High | Medium | High | Medium | Next |
| Publication checkout/payment | High | High | Very High | Very High | Later |
| Publish finalization | Very High | Very High | Very High | Very High | Later |
| Public delivery | Medium | Medium | Very High | High | Later |
| Public RSVP | Medium | High | High | High | Next |
| Shared render contracts | Medium | Low | High | Medium | First |
| Asset normalization | High | High | High | High | First |
| Lifecycle / history / trash / finalization | High | High | Very High | High | First |

### Dashboard shell

- Current responsibility: authenticated dashboard entry point, view/editor switching, draft/template loading, preview generation, publish validation entry, and checkout launch.
- Main files/modules involved: `src/pages/dashboard.js`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: it mixes concerns that should be independent, and it resolves the same logical invitation through multiple paths. `generarVistaPrevia` can use draft data, template data, public slug fallbacks, and live browser memory. `ensureDraftFlushBeforeCriticalAction` uses one flush path for template sessions and another for draft sessions.
- Fragility type: coupling, alternate truth resolution paths, browser/global dependency, implicit contracts.
- Impact if it fails: preview can diverge from saved content, publish can validate or render the wrong state, and the dashboard can route users into the wrong publication flow.
- Risk of modifying it: high, because seemingly local changes can affect preview, publish, editor entry, and dashboard navigation at once.
- Suggested improvement priority: `Later`. Reduce surrounding fragility first so this file can be decomposed safely.

### Dashboard home data loading

- Current responsibility: compose draft rail, publication rail, template rail, and home configuration for the dashboard landing view.
- Main files/modules involved: `src/components/dashboard/home/DashboardHomeView.jsx`, `src/hooks/useDashboardDrafts.js`, `src/hooks/useDashboardPublications.js`, `src/hooks/useDashboardHomeConfig.js`, `src/hooks/useDashboardHomeTemplates.js`, `src/domain/dashboard/homeModel.js`.
- Ratings: Complexity `Medium`, Fragility `High`, Business criticality `Medium`, Regression risk `Medium`.
- Why it is fragile: the area is not algorithmically complex, but it merges separate reads client-side and degrades behavior differently per source. Draft filtering depends on lifecycle heuristics and `slugPublico`; publication loading merges active and historical sources and tolerates permission-denied failures on `publicadas_historial`; preview cards rely on broad alias scanning and sometimes re-read linked drafts for fallback images.
- Fragility type: duplication, multiple sources of truth, implicit read-model contracts.
- Impact if it fails: users can see missing, duplicated, stale, or misclassified drafts/publications in the dashboard home, which changes what they can enter or resume.
- Risk of modifying it: medium, because the surface is user-visible but the code is more separable than the editor or publish pipelines.
- Suggested improvement priority: `First`. This is a good place to reduce duplicated read-model logic without changing write semantics.

### Editor runtime

- Current responsibility: canvas rendering, selection, dragging, overlays, editing interactions, history, and exposing editor state to the rest of the app.
- Main files/modules involved: `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/components/editor/window/useEditorWindowBridge.js`, editor event helpers and drag helpers under `src/components/editor`.
- Ratings: Complexity `Very High`, Fragility `High`, Business criticality `High`, Regression risk `Very High`.
- Why it is fragile: many non-editor consumers depend on raw global state and imperative window APIs rather than stable read-only contracts. The runtime writes `window.canvasEditor`, `window._objetosActuales`, `window._seccionesOrdenadas`, `window._elementosSeleccionados`, `window._rsvpConfigActual`, `window._giftsConfigActual`, and related event traffic. That makes hidden consumers part of the runtime contract even when they are not imported from it.
- Fragility type: window/global dependency, event dependency, implicit contracts, hidden coupling.
- Impact if it fails: editing behavior, autosave, preview, toolbar features, thumbnail generation, and publish preparation can all break in different ways.
- Risk of modifying it: very high, because downstream dependencies are not fully explicit and many failures would be interaction-specific.
- Suggested improvement priority: `Later`. Start with an adapter layer rather than touching internals early.

### Draft persistence

- Current responsibility: load draft/template session data into the editor, normalize persisted payloads, autosave, explicit flush, and template-session persistence.
- Main files/modules involved: `src/components/editor/persistence/useBorradorSync.js`, `src/domain/drafts/flushGate.js`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: one hook handles both draft persistence and template editorial sessions. It mutates loaded content through deep URL refresh and backfills missing `tipoInvitacion` from the template, then writes normalized state back. Flush coordination exists both as a direct bridge and as browser event protocol (`editor:draft-flush:request` / `editor:draft-flush:result`), which means the persistence contract depends on timing as well as data shape.
- Fragility type: coupling, multiple persistence modes, load-time mutation, browser/event dependency.
- Impact if it fails: edits can be lost, stale URLs can persist, preview/publish can run before durable state exists, or template workspaces can diverge from normal draft behavior.
- Risk of modifying it: high, because save timing and normalization behavior are both production-sensitive.
- Suggested improvement priority: `Next`. Stabilize interfaces and parity tests first, then harden persistence behavior.

### Template preview and personalization

- Current responsibility: choose preview source, render template preview, patch live personalization, capture preview text positions, create a draft from template, and persist personalization changes.
- Main files/modules involved: `src/components/TemplatePreviewModal.jsx`, `src/domain/templates/preview.js`, `src/domain/templates/service.js`, `src/domain/templates/personalization.js`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: the preview path is bifurcated. Some templates preview through a direct URL, others through generated HTML. The personalization flow relies on iframe messaging, DOM text position capture inside the iframe, font measurement preparation, deep object patching, and a later Firestore update after the draft is created.
- Fragility type: alternate execution modes, DOM/iframe dependency, implicit rendering contracts, post-copy patching.
- Impact if it fails: template previews can look correct but produce a broken draft, or personalization can partially apply and shift text unexpectedly.
- Risk of modifying it: high, because preview correctness depends on both rendering mode and template content shape.
- Suggested improvement priority: `Next`.

### Template admin/editorial flows

- Current responsibility: open template workspaces, edit template content, commit workspace changes back to template artifacts, and convert drafts into templates.
- Main files/modules involved: `functions/src/templates/editorialService.ts`, `src/domain/templates/adminService.js`, `src/domain/templates/authoring/service.js`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `Medium`, Regression risk `High`.
- Why it is fragile: the same logical template exists in multiple representations: template doc, catalog doc, editor document, workspace draft in `borradores`, and authoring snapshot. The service converts between these representations in several directions, and compatibility branches still matter. There is also terminology drift, such as editorial documents using `estadoBorrador: "active"` while normal draft lifecycle helpers use `borrador_activo` and `borrador_papelera`.
- Fragility type: multiple sources of truth, conversion drift, legacy compatibility branches.
- Impact if it fails: template edits can fail to propagate, catalog data can diverge from editor state, or workspace cleanup can leave broken authoring artifacts.
- Risk of modifying it: high, because it is write-heavy and conversion-heavy.
- Suggested improvement priority: `Later`.

### Preview generation

- Current responsibility: produce preview HTML for drafts and templates before public publication.
- Main files/modules involved: `src/pages/dashboard.js`, `src/domain/templates/preview.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: preview can be built from persisted draft data, template data, or live browser state. Frontend code also imports the backend HTML generator source directly for some preview paths. Public slug fallback logic is repeated, and preview can resolve the current invitation through draft slug, direct publication doc lookup, or query by original slug.
- Fragility type: editor/preview drift, alternate truth resolution, cross-layer coupling.
- Impact if it fails: users approve or publish from a preview that does not match the durable state or the final public HTML.
- Risk of modifying it: high, because preview confidence is a prerequisite for safe publish behavior.
- Suggested improvement priority: `Next`.

### Publish validation

- Current responsibility: validate that a draft can be published before checkout and before final publish.
- Main files/modules involved: `functions/src/payments/publicationPublishValidation.ts`.
- Ratings: Complexity `High`, Fragility `Medium`, Business criticality `High`, Regression risk `Medium`.
- Why it is fragile or not: this area is important and non-trivial, but it is more centralized than most surrounding publish code. It already uses shared contract helpers and focused tests, which makes it less fragile than `publicationPayments.ts` even though it protects a critical business step.
- Fragility type: shared contract dependency, compatibility policy enforcement.
- Impact if it fails: invalid invitations can enter checkout or publish can reject valid invitations.
- Risk of modifying it: medium, because it is a good candidate for additive tests and compatibility-preserving refactors.
- Suggested improvement priority: `Next`. Expand parity coverage before changing validation rules.

### Publication checkout/payment

- Current responsibility: reserve slug, create checkout session, track payment status, poll for approval, and retry conflict scenarios.
- Main files/modules involved: `src/components/PublicationCheckoutModal.jsx`, `functions/src/payments/publicationPayments.ts`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `Very High`, Regression risk `Very High`.
- Why it is fragile: one business flow spans client polling, provider status, slug reservation TTL, conflict recovery, and later finalization. The code has to coordinate pending and approved states with draft/publication state while preserving current production semantics.
- Fragility type: critical multi-step business flow, distributed state, implicit external-provider contract.
- Impact if it fails: users can pay without publish finalizing correctly, lose a reserved slug, or end up in inconsistent paid/published states.
- Risk of modifying it: very high, because defects affect revenue and customer trust directly.
- Suggested improvement priority: `Later`.

### Publish finalization

- Current responsibility: build publish artifacts, generate final HTML, write public metadata, mirror draft linkage, and archive/cleanup prior publication state.
- Main files/modules involved: `functions/src/payments/publicationPayments.ts`.
- Ratings: Complexity `Very High`, Fragility `Very High`, Business criticality `Very High`, Regression risk `Very High`.
- Why it is fragile: finalization is cross-resource and non-atomic. It re-reads the draft, validates and normalizes assets, generates HTML, writes Storage, writes `publicadas/{slug}`, writes draft linkage back, and later archives to `publicadas_historial`. Finalization and expiration logic also interact with read paths and public delivery.
- Fragility type: distributed lifecycle state, cross-resource writes, critical multi-step business flow.
- Impact if it fails: published invitations can become unreachable, stale, partially finalized, or incorrectly archived while the draft state still claims they are active.
- Risk of modifying it: very high, because small sequencing changes can corrupt live publication state.
- Suggested improvement priority: `Later`.

### Public delivery

- Current responsibility: serve the public invitation route and ensure the publication is currently accessible.
- Main files/modules involved: `functions/src/index.ts`.
- Ratings: Complexity `Medium`, Fragility `Medium`, Business criticality `Very High`, Regression risk `High`.
- Why it is fragile: the request path is conceptually simple, but it depends on both Firestore metadata and Storage HTML artifacts. It also finalizes expired publications on access, so read traffic can trigger lifecycle transitions.
- Fragility type: dependency on distributed publish artifacts, read-path side effects.
- Impact if it fails: live invitations stop loading or return inconsistent states after expiration or archive boundaries.
- Risk of modifying it: high, because the surface is public and business-critical even if the implementation is smaller than the publish pipeline.
- Suggested improvement priority: `Later`.

### Public RSVP

- Current responsibility: accept public confirmation responses and persist them under the published invitation.
- Main files/modules involved: `functions/src/index.ts`, `functions/src/rsvp/config.ts`, `src/domain/rsvp/config.js`.
- Ratings: Complexity `Medium`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: it combines public-access checks, expiration checks, current RSVP configuration, and compatibility field writing. There is already a concrete client/server drift: the server normalizer preserves `sheetUrl`, while the client normalizer does not.
- Fragility type: duplicated normalization, legacy compatibility branches, distributed lifecycle dependency.
- Impact if it fails: confirmations can be rejected unexpectedly, stored with incomplete configuration semantics, or accepted for publications that should no longer be active.
- Risk of modifying it: high, because it is part of a live public funnel and schema drift already exists.
- Suggested improvement priority: `Next`.

### Shared render contracts

- Current responsibility: normalize render asset fields and classify legacy versus modern render contracts.
- Main files/modules involved: `shared/renderAssetContract.cjs`, `shared/renderContractPolicy.cjs`.
- Ratings: Complexity `Medium`, Fragility `Low`, Business criticality `High`, Regression risk `Medium`.
- Why it is fragile or not: these modules matter because many flows depend on them, but they are comparatively small, centralized, and already covered by focused tests. They are one of the safest early places to tighten behavior because they expose explicit contract logic rather than orchestration.
- Fragility type: shared dependency, compatibility policy surface.
- Impact if it fails: editor/preview/publish parity breaks across many invitation types.
- Risk of modifying it: medium, but lower than surrounding orchestration because the contract is explicit and testable.
- Suggested improvement priority: `First`. Expand coverage and use them to absorb drift, not to force a rewrite.

### Asset normalization

- Current responsibility: canonicalize asset fields and URLs across editor load, template copy, preview preparation, and publish.
- Main files/modules involved: `shared/renderAssetContract.cjs`, `functions/src/utils/publishAssetNormalization.ts`, template copy helpers under `src/domain/templates`, deep URL refresh logic in editor persistence.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `High`, Regression risk `High`.
- Why it is fragile: logical asset identity and concrete URL identity diverge across stages. Draft load refreshes URLs deeply, template copy rewrites assets, publish normalization only resolves a constrained set of keys (`src`, `url`, `mediaUrl`, `fondoImagen`, `frameSvgUrl`), and publication metadata still carries compatibility-oriented fields.
- Fragility type: inconsistent asset contract, duplication, multi-stage normalization drift.
- Impact if it fails: previews and published invitations can render missing or stale images even when the draft appears intact.
- Risk of modifying it: high, but focused contract-first improvements are still relatively safe.
- Suggested improvement priority: `First`.

### HTML generation

- Current responsibility: convert sections, objects, modal content, and runtime script hooks into the final HTML used for preview and public delivery.
- Main files/modules involved: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.
- Ratings: Complexity `Very High`, Fragility `High`, Business criticality `Very High`, Regression risk `Very High`.
- Why it is fragile: this is the single shared rendering surface for preview and public output, so subtle behavior changes propagate widely. The risk comes from being the executable contract between stored render state and user-visible invitations, not from file length alone.
- Fragility type: shared render surface, broad compatibility burden.
- Impact if it fails: rendered invitations break across preview and production simultaneously.
- Risk of modifying it: very high, because changes can affect many invitation variants and older content.
- Suggested improvement priority: `Later`.

### Lifecycle / history / trash / finalization

- Current responsibility: classify draft trash state, classify publication state, transition active publications, archive history, and clear or mirror linkage between drafts and publications.
- Main files/modules involved: `functions/src/drafts/draftTrashLifecycle.ts`, `functions/src/payments/publicationLifecycle.ts`, `src/domain/drafts/state.js`, `src/domain/publications/state.js`, publication finalization logic in `functions/src/payments/publicationPayments.ts`.
- Ratings: Complexity `High`, Fragility `High`, Business criticality `Very High`, Regression risk `High`.
- Why it is fragile: lifecycle truth is distributed across frontend and backend helper implementations, state fields, timestamps, slug linkage, and history records. The frontend and backend parse similar lifecycle semantics separately. Publication state transitions do not fully mirror paused or trash state back into the draft lifecycle, so the draft can present a simplified state while the publication has richer state transitions.
- Fragility type: distributed lifecycle state, duplicated parsing logic, partial mirroring.
- Impact if it fails: active, paused, trashed, finalized, and historical states can drift, which then affects dashboard visibility, public accessibility, and cleanup behavior.
- Risk of modifying it: high, but helper parity work is one of the safest ways to reduce fragility without altering live semantics.
- Suggested improvement priority: `First`.

## 3. Highest-Risk Cross-Cutting Problems

### Editor / preview / publish drift

The system does not have one authoritative read-only render snapshot contract from editor to publish. The editor exposes live state through browser globals, preview can use live browser state or persisted Firestore state, template preview can bypass some of the normal draft flow, and publish re-reads the draft and validates a separately prepared state. This drift is visible in `src/pages/dashboard.js`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`, `src/domain/templates/preview.js`, and `functions/src/payments/publicationPayments.ts`.

### Inconsistent asset and preview contracts

Preview image resolution scans many aliases in `src/domain/drafts/preview.js` and publication preview helpers. Publish normalization in `functions/src/utils/publishAssetNormalization.ts` only traverses recognized asset keys. Publication writes in `functions/src/payments/publicationPayments.ts` still prioritize compatibility-oriented metadata such as `tipo` and `thumbnailUrl`-derived `portada` instead of cleanly treating modern draft fields as canonical. The result is contract drift rather than one explicit asset model.

### Distributed lifecycle state

Draft lifecycle and publication lifecycle are parsed in different frontend and backend helpers. Active versus historical publication state also depends on archive records and Storage artifacts, not just one Firestore field. This is spread across `src/domain/drafts/state.js`, `functions/src/drafts/draftTrashLifecycle.ts`, `src/domain/publications/state.js`, `functions/src/payments/publicationLifecycle.ts`, and `functions/src/payments/publicationPayments.ts`.

### Dependence on in-memory browser state

The editor runtime is not only stateful; it is externally observable through browser globals and event protocols. Preview generation, toolbar behavior, flush orchestration, and some personalization flows depend on that runtime memory rather than explicit stable interfaces. That is the main reason the editor is fragile even before considering its size.

### Alternate truth resolution paths

The same invitation can be resolved through `slugPublico`, `slugOriginal`, `borradorSlug`, a direct publication document id, or a query by original slug. These paths appear in dashboard preview code, publication helpers, and payment/publish services. This increases the chance that one path is updated while another keeps older behavior.

### Legacy compatibility branches still matter

Legacy public endpoints, render compatibility rules, and compatibility data fields still coexist with the newer flows inside current production code. They are not dead code. They appear in the HTML generators, public HTTP handlers, RSVP writes, render contract policy, and publication metadata. That means refactors must preserve compatibility behavior explicitly rather than assuming the modern path is the only real path.

## 4. Low-Risk / High-Value Improvement Opportunities

These are the best early targets because they reduce fragility without demanding broad rewrites or live schema changes.

- Extract one shared frontend helper for draft/publication resolution by slug and use it in dashboard preview, dashboard home, and publication read paths. The current logic is duplicated and inconsistent, but the change can remain read-only and compatibility-preserving.
- Add parity fixtures for draft and publication lifecycle parsing across frontend and backend helpers. This reduces drift in `state.js` and lifecycle modules without changing stored state semantics.
- Introduce a read-only editor snapshot adapter on top of the existing window bridge. Keep the current globals initially, but migrate preview, thumbnail, and header consumers to the adapter before changing editor internals.
- Align client and server RSVP normalization with explicit parity tests, including preservation of server-supported fields such as `sheetUrl`.
- Expand focused tests around shared render contracts, asset normalization, and publish validation. Those seams are already comparatively fenced and provide safer leverage than dashboard/editor/payment orchestration.
- Start dual-writing modern publication metadata alongside legacy-compatible fields in publish finalization, then keep legacy reads in place until all consumers are migrated. This reduces contract drift without breaking current consumers.

None of these recommendations require a large rewrite. They are additive and intended to shrink hidden coupling before touching the high-risk orchestration layers.

## 5. Areas That Should Not Be Touched Early

These modules are too coupled or too business-critical to use as the first refactor targets:

- `src/components/CanvasEditor.jsx`
- `src/pages/dashboard.js`
- `functions/src/payments/publicationPayments.ts`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarHTMLDesdeObjetos.ts`
- `functions/src/templates/editorialService.ts`

They should be approached only after safer contract, helper, and parity work reduces the surrounding fragility. Refactoring them first would raise regression risk before observability and contract boundaries improve.

## 6. Recommended Improvement Order

### First

- Add parity tests for draft/publication lifecycle helpers across frontend and backend.
- Consolidate asset and preview contract resolution around shared helper behavior and explicit fixtures.
- Introduce shared read-model helpers for draft/public slug resolution and preview image resolution.
- Add a read-only editor snapshot adapter over the current window bridge and migrate non-editor consumers to it.

### Next

- Harden draft persistence around explicit flush and normalization boundaries.
- Stabilize template preview and personalization so both preview modes share more of the same contract path.
- Align public RSVP schema normalization between client and server.
- Expand publish-validation and contract coverage before modifying checkout or finalization behavior.

### Later

- Decompose dashboard shell orchestration after slug resolution, preview contracts, and editor snapshot boundaries are safer.
- Clean up editorial/template workflow conversions after template representations are better documented and fenced by tests.
- Rework checkout/payment state handling only after lifecycle and metadata contracts are more explicit.
- Touch HTML generator and editor runtime internals only for targeted, well-isolated changes backed by representative fixtures.

The guiding principle is to reduce fragility in the interfaces around the most dangerous modules before changing those modules themselves. That is the lowest-regression path for improving production behavior safely.
