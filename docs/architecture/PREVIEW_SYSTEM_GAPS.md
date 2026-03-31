# PREVIEW SYSTEM GAPS

> Updated from code inspection on 2026-03-30.
>
> Primary source for current behavior: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`.
>
> Secondary supporting sources used only to confirm or sharpen findings: `docs/architecture/SYSTEM_FRAGILITY_MAP.md`, `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPipeline.js`, `src/lib/editorSnapshotAdapter.js`, `src/components/ModalVistaPrevia.jsx`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/payments/publicationPublishValidation.ts`.
>
> Priority rule for this document: findings below describe current risk, ambiguity, and drift potential in the existing preview system. They do not define a target architecture.

## 1. Executive Summary

The current preview system is not best understood as a single renderer. It is a layered pipeline that crosses dashboard state, editor bridge methods, timed critical boundaries, persistence flush logic, document re-read logic, live snapshot overlay, generator-side HTML/runtime generation, and preview-modal iframe mutation. That layered structure makes the system fragile internally even when the visible preview result is often acceptable for product use.

The main architectural tension is this: the current preview output is a working baseline, but the path that produces it is distributed across several runtime boundaries with more than one active source of truth. That makes the system hard to reason about, hard to evolve safely, and structurally exposed to preview/publish drift even when visible failures are not consistently present.

This document therefore treats current visible preview behavior as the default output baseline. Internal cleanup, simplification, or documentation improvement must not be treated as permission to change preview output unless a future target document explicitly revisits those behaviors.

## 2. Gap Categories

- **A. Internal fragility without proven output failure**: boundaries that are mechanically brittle or timing-sensitive even when current visible output is usually acceptable.
- **B. Behavior that works today but is hard to reason about**: behaviors that appear coherent to users but are assembled from layered or hybrid rules that are difficult to explain as one clear contract.
- **C. Areas with real or likely preview/publish drift**: places where preview and publish do not clearly consume the same prepared input or runtime assumptions.
- **D. Responsive/layout rules that are currently implicit instead of explicit**: layout behaviors that function today but are encoded procedurally rather than defined as a stable contract.
- **E. Areas where future refactors are high risk because output could accidentally change**: seams where code cleanup is especially likely to alter visible preview behavior.

## 3. Detailed Findings

### A. Internal Fragility Without Proven Output Failure

#### A1. Preview orchestration crosses too many active boundaries

- **Title**: Preview orchestration crosses too many active boundaries
- **Type**: Fragility
- **Description**: The preview path crosses the dashboard header trigger, preview controller session guards, editor bridge methods, inline critical boundary, persistence flush transport, document re-read, snapshot overlay, HTML generation, and modal iframe rendering. No single local subsystem owns the full preview behavior end to end.
- **Why it matters**: Failures become expensive to localize because visible preview behavior depends on several boundaries succeeding in sequence. Small changes at one boundary can alter preview behavior without touching the generator itself.
- **Current visible behavior**: Preview usually opens as one continuous user action and renders generated HTML in the modal.
- **Whether current visible behavior should likely be preserved by default**: Yes. This finding describes internal orchestration fragility, not a confirmed reason to change the current preview result.
- **Affected files/modules**: `src/components/DashboardHeader.jsx`, `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewPipeline.js`, `src/components/ModalVistaPrevia.jsx`
- **Confidence level**: Confirmed

#### A2. Inline critical action depends on mixed authority and timed settle logic

- **Title**: Inline critical action depends on mixed authority and timed settle logic
- **Type**: Fragility
- **Description**: The preview critical boundary reads `editing.id`, `window._currentEditingId`, `inlineOverlayMountedId`, and `inlineOverlayMountSession`, then polls frame by frame until the inline session disappears or the 120 ms boundary expires.
- **Why it matters**: The preview path depends on a timed handoff between React-owned inline state and `window`-level inline state instead of one fully authoritative inline session model.
- **Current visible behavior**: When inline editing is active, preview waits for inline editing to settle before continuing. If that settle boundary fails, preview does not proceed.
- **Whether current visible behavior should likely be preserved by default**: Yes. The visible gating behavior is part of the current preview baseline even though the underlying authority split is fragile.
- **Affected files/modules**: `src/hooks/useDashboardPreviewController.js`, `src/components/CanvasEditor.jsx`, `src/components/editor/canvasEditor/inlineCriticalBoundary.js`
- **Confidence level**: Confirmed

#### A3. Persistence flush depends on dual transports and editor-session branching

- **Title**: Persistence flush depends on dual transports and editor-session branching
- **Type**: Fragility
- **Description**: The preview flush path branches between direct bridge transport for template sessions and event-based `editor:draft-flush:request` / `editor:draft-flush:result` transport for draft sessions, with a 6000 ms request timeout on the event path.
- **Why it matters**: Flush correctness is not one uniform operation. It depends on session kind, bridge availability, event handling, and the internal persistence scheduler used by `useBorradorSync`.
- **Current visible behavior**: Preview typically reflects recently edited state before generating HTML, but that result depends on which flush transport was used successfully.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current preview output should remain baseline even though the flush boundary is implemented through more than one transport.
- **Affected files/modules**: `src/domain/drafts/criticalFlush.js`, `src/domain/drafts/flushGate.js`, `src/components/editor/persistence/useBorradorSync.js`, `src/components/editor/window/useEditorWindowBridge.js`
- **Confidence level**: Confirmed

#### A4. Live snapshot reads still depend on dual snapshot authorities

- **Title**: Live snapshot reads still depend on dual snapshot authorities
- **Type**: Fragility
- **Description**: `readEditorRenderSnapshot()` reads the snapshot adapter first and still falls back to legacy `window._*` globals when the adapter is unavailable or empty.
- **Why it matters**: The preview system does not rely on one fully converged live render-state boundary. It still depends on compatibility reads across two authority families.
- **Current visible behavior**: Preview usually captures a live editor snapshot that aligns with the current canvas state closely enough to support preview generation.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current snapshot result is part of the preview baseline even though the read boundary is internally duplicated.
- **Affected files/modules**: `src/lib/editorSnapshotAdapter.js`, `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`
- **Confidence level**: Confirmed

#### A5. Preview iframe rendering depends on post-load runtime mutation

- **Title**: Preview iframe rendering depends on post-load runtime mutation
- **Type**: Fragility
- **Description**: After iframe load, the preview modal writes preview data attributes, mutates iframe document overflow behavior, stores preview viewport metadata in the iframe window, dispatches `preview:mobile-scroll:enable`, and triggers a synthetic `resize`.
- **Why it matters**: The preview modal is not only a passive container for generated HTML. It is part of the runtime that shapes preview behavior after the HTML document is already loaded.
- **Current visible behavior**: Desktop and mobile previews display inside styled shells with modal-controlled scaling and preview-specific iframe behavior.
- **Whether current visible behavior should likely be preserved by default**: Yes. These mutations are part of how the current preview output is achieved.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `src/components/preview/modalVistaPreviaLayout.js`
- **Confidence level**: Confirmed

### B. Behavior That Works Today but Is Hard to Reason About

#### B1. Re-read plus live snapshot overlay creates a hybrid source of truth

- **Title**: Re-read plus live snapshot overlay creates a hybrid source of truth
- **Type**: Ambiguity
- **Description**: The preview pipeline first re-reads the source document and then replaces the top-level render fields `objetos`, `secciones`, `rsvp`, and `gifts` with a live editor snapshot when one is available.
- **Why it matters**: The final preview input is neither purely persisted state nor purely live editor state. That makes it harder to explain exactly what preview is showing at a given moment.
- **Current visible behavior**: Preview generally resembles the latest editor state while still using a freshly re-read document as its base object.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current hybrid precedence is part of how preview reaches its visible result today.
- **Affected files/modules**: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `src/lib/editorSnapshotAdapter.js`
- **Confidence level**: Confirmed

#### B2. Preview output is the result of layered render systems, not one render contract

- **Title**: Preview output is the result of layered render systems, not one render contract
- **Type**: Ambiguity
- **Description**: The final preview image is assembled by modal shell scaling, generated section/runtime CSS, object-level renderer rules, preview-specific iframe mutation, and optional mobile smart layout reflow.
- **Why it matters**: A visible preview result may look coherent while still being the product of several systems acting in sequence rather than one clearly bounded render contract.
- **Current visible behavior**: Preview often appears visually coherent in product use.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current visible result should remain baseline even though the path that produces it is layered.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/mobileSmartLayout/*`
- **Confidence level**: Confirmed

#### B3. The same HTML is rendered twice, but final appearance depends on viewport context

- **Title**: The same HTML is rendered twice, but final appearance depends on viewport context
- **Type**: Ambiguity
- **Description**: The preview modal uses one generated HTML string for both desktop and mobile previews, but each iframe receives a different logical viewport size and post-load runtime metadata.
- **Why it matters**: Desktop/mobile preview differences are not explained by separate render generation. They emerge from the same HTML reacting differently to viewport and iframe context.
- **Current visible behavior**: The modal shows separate desktop and mobile previews at the same time, and they can differ visually without separate HTML generation.
- **Whether current visible behavior should likely be preserved by default**: Yes. This dual-view behavior is part of the current preview baseline.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `src/components/preview/modalVistaPreviaLayout.js`
- **Confidence level**: Confirmed

#### B4. Functional behavior is resolved partly outside the visible object tree

- **Title**: Functional behavior is resolved partly outside the visible object tree
- **Type**: Ambiguity
- **Description**: The generated preview can reconcile CTA behavior and publication-link compatibility by using root `rsvp` and `gifts` config plus publication-link reads, not only the visible canvas objects themselves.
- **Why it matters**: What the user sees on the canvas is not always the full explanation for how preview will behave or what URLs/actions will be associated with the preview state.
- **Current visible behavior**: Preview can show CTA-related behavior and public URL metadata that depend on more than the object list alone.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current visible behavior is part of the working preview baseline even though it depends on cross-object/root reconciliation.
- **Affected files/modules**: `src/domain/dashboard/previewSession.js`, `src/domain/dashboard/previewPipeline.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`
- **Confidence level**: Confirmed

#### B5. Template preview shares the pipeline but not the same behavior envelope as draft preview

- **Title**: Template preview shares the pipeline but not the same behavior envelope as draft preview
- **Type**: Ambiguity
- **Description**: Template preview uses the same controller/generator family, but it re-reads a different source document, disables publish compatibility reads, and does not expose publish actions in the preview UI.
- **Why it matters**: The system looks like one preview pipeline, but the draft path and template path are not behaviorally identical.
- **Current visible behavior**: Template preview uses the same preview modal style and generator family while omitting draft-only publication behavior.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current template/draft distinction is part of the visible preview baseline.
- **Affected files/modules**: `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewPipeline.js`, `src/pages/dashboard.js`
- **Confidence level**: Confirmed

### C. Areas With Real or Likely Preview/Publish Drift

#### C1. Preview and publish do not use the same preparation path

- **Title**: Preview and publish do not use the same preparation path
- **Type**: Drift risk
- **Description**: Preview uses `prepareDashboardPreviewRenderState`, which applies browser-safe asset normalization only, while publish uses `preparePublicationRenderState`, which applies publish asset normalization and publish validation inputs.
- **Why it matters**: Preview and publish do not begin HTML generation from the same prepared contract, so parity risk is structural even when visible preview output is often acceptable.
- **Current visible behavior**: Preview can look acceptable and still not guarantee that publish will consume the same prepared input.
- **Whether current visible behavior should likely be preserved by default**: Yes. Current preview output should remain baseline until a target parity contract explicitly changes it.
- **Affected files/modules**: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`, `src/domain/dashboard/previewSession.js`, `functions/src/payments/publicationPublishValidation.ts`
- **Confidence level**: Confirmed

#### C2. Preview can show live boundary state that publish does not consume

- **Title**: Preview can show live boundary state that publish does not consume
- **Type**: Drift risk
- **Description**: Preview favors the flush-boundary snapshot and then live snapshot fallback, while publish remains a backend re-read and preparation flow without the same live editor overlay boundary.
- **Why it matters**: Preview can structurally represent the latest boundary state more aggressively than publish, even when the visible difference is not obvious in every case.
- **Current visible behavior**: Preview often looks closer to the latest editor state than a pure persisted re-read would.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current overlay precedence is part of the preview baseline unless parity rules are explicitly redefined later.
- **Affected files/modules**: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `functions/src/payments/publicationPublishValidation.ts`
- **Confidence level**: Likely

#### C3. `pantalla`, `yNorm`, and `fullbleed` remain active drift zones

- **Title**: `pantalla`, `yNorm`, and `fullbleed` remain active drift zones
- **Type**: Drift risk
- **Description**: Publish validation already emits warnings such as `pantalla-ynorm-drift` and `fullbleed-editor-drift`, which confirms these layout-sensitive contracts are still recognized as parity-sensitive.
- **Why it matters**: These are not hypothetical drift zones. The backend already treats them as areas where preview/editor and publish can diverge.
- **Current visible behavior**: Preview often remains usable, but the current system already encodes these contracts as higher-risk layout areas.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current visual interpretation of these contracts should be treated as baseline until a target document revisits them.
- **Affected files/modules**: `functions/src/payments/publicationPublishValidation.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/generarHTMLDesdeSecciones.ts`
- **Confidence level**: Confirmed

#### C4. Embedded preview runtime is not the same environment as public rendering

- **Title**: Embedded preview runtime is not the same environment as public rendering
- **Type**: Drift risk
- **Description**: Preview runs inside an embedded iframe, uses preview document markers, preview viewport metadata, embedded-context detection, and preview-only mobile scroll handling.
- **Why it matters**: Even when the same generator family is used, preview and public rendering do not run inside the same environmental assumptions.
- **Current visible behavior**: Preview often looks acceptable inside the modal, but it does so with embedded-runtime adjustments that public rendering does not share in the same form.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current preview environment is part of the current output baseline and should not be changed accidentally.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `functions/src/utils/generarHTMLDesdeSecciones.ts`
- **Confidence level**: Confirmed

#### C5. Preview uses backend generator code on the frontend without going through full publish gating

- **Title**: Preview uses backend generator code on the frontend without going through full publish gating
- **Type**: Drift risk
- **Description**: The frontend preview path imports `generarHTMLDesdeSecciones` directly and can render preview output before publish validation is complete and without full publish preparation.
- **Why it matters**: Preview can succeed visually in cases where publish would still warn or block, which makes preview success an incomplete signal about publish readiness.
- **Current visible behavior**: Preview can render and then later surface publish validation results as a separate step.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current preview-first behavior is part of the working product flow unless a future target document explicitly changes it.
- **Affected files/modules**: `src/hooks/useDashboardPreviewController.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/payments/publicationPublishValidation.ts`
- **Confidence level**: Confirmed

### D. Responsive/Layout Rules That Are Currently Implicit Instead of Explicit

#### D1. The canonical layout truth is currently hybrid rather than explicit

- **Title**: The canonical layout truth is currently hybrid rather than explicit
- **Type**: Implicit design rule
- **Description**: Current preview layout combines section-local authored coordinates with viewport-derived scale variables and runtime viewport calculations.
- **Why it matters**: The system behaves as though it already has a layout model, but that model is hybrid and procedural rather than declared as one clear contract.
- **Current visible behavior**: Layout often appears stable enough in preview because section-local coordinates are reinterpreted consistently enough through the current runtime.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current visible layout result should remain baseline even though the underlying truth model is hybrid.
- **Affected files/modules**: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`
- **Confidence level**: Confirmed

#### D2. `pantalla` behavior is procedural, not defined as a stable contract

- **Title**: `pantalla` behavior is procedural, not defined as a stable contract
- **Type**: Implicit design rule
- **Description**: `pantalla` behavior is currently produced by viewport-fit calculations, safe-area inputs, zoom variables, text zoom logic, and vertical base-offset variables rather than by a single explicit architectural contract.
- **Why it matters**: The visible `pantalla` result can be preserved today while still being hard to define precisely for future evolution or parity decisions.
- **Current visible behavior**: `pantalla` sections use the current viewport-driven scaling and offset behavior encoded in the generated document runtime.
- **Whether current visible behavior should likely be preserved by default**: Yes. Current `pantalla` behavior is part of the preview output baseline.
- **Affected files/modules**: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`
- **Confidence level**: Confirmed

#### D3. `content` vs `fullbleed` is a live anchor contract but not a documented design contract

- **Title**: `content` vs `fullbleed` is a live anchor contract but not a documented design contract
- **Type**: Implicit design rule
- **Description**: The generator actively splits objects into `.sec-content` and `.sec-bleed`, and those layers use different scaling rules and positioning assumptions.
- **Why it matters**: The system already behaves as though `content` and `fullbleed` are distinct layout anchors, but that contract is still encoded mainly in renderer logic.
- **Current visible behavior**: `fullbleed` objects are rendered in the bleed layer and use width-oriented scaling that differs from normal content objects.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current anchor interpretation is part of the existing preview output baseline.
- **Affected files/modules**: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`
- **Confidence level**: Confirmed

#### D4. Mobile smart layout behaves like a runtime layout contract without being declared as one

- **Title**: Mobile smart layout behaves like a runtime layout contract without being declared as one
- **Type**: Implicit design rule
- **Description**: The mobile smart layout runtime clusters, orders, stacks, fits, and sometimes expands section height after HTML generation, which makes it an active layout contract for generated mobile preview output.
- **Why it matters**: Mobile preview output is not only determined at generation time. It also depends on a post-generation reflow runtime with its own behavioral rules.
- **Current visible behavior**: Mobile preview can reorder or refit generated content through the mobile smart layout runtime while still looking like one preview result.
- **Whether current visible behavior should likely be preserved by default**: Yes. Current mobile smart layout behavior is part of the preview output baseline.
- **Affected files/modules**: `functions/src/utils/mobileSmartSectionLayout.ts`, `functions/src/utils/mobileSmartLayout/*`
- **Confidence level**: Confirmed

#### D5. The modal dual-preview model is part of output behavior, but not defined as a first-class contract

- **Title**: The modal dual-preview model is part of output behavior, but not defined as a first-class contract
- **Type**: Implicit design rule
- **Description**: The preview modal renders desktop and mobile iframes together, computes wrapper-specific scales, and treats that dual rendering model as the normal preview presentation.
- **Why it matters**: The modal is not neutral display chrome. It is part of the product-level preview behavior that users see.
- **Current visible behavior**: Preview normally shows desktop and mobile renderings side by side or stacked within the same modal.
- **Whether current visible behavior should likely be preserved by default**: Yes. The dual-preview model is part of the current visible output baseline.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `src/components/preview/modalVistaPreviaLayout.js`
- **Confidence level**: Confirmed

### E. Areas Where Future Refactors Are High Risk Because Output Could Accidentally Change

#### E1. `useDashboardPreviewController` is a high-risk orchestration seam

- **Title**: `useDashboardPreviewController` is a high-risk orchestration seam
- **Type**: Refactor risk
- **Description**: The controller owns preview session guards, inline critical gating, flush triggering, re-read wiring, generator invocation, validation refresh side effects, and preview-state commits.
- **Why it matters**: Cleanup in this module can easily change sequencing, stale-request behavior, or preview input precedence even without intentionally changing rendering.
- **Current visible behavior**: Preview behaves like one user action even though the controller coordinates several internal stages.
- **Whether current visible behavior should likely be preserved by default**: Yes. Controller cleanup should not accidentally change preview sequencing or resulting output.
- **Affected files/modules**: `src/hooks/useDashboardPreviewController.js`
- **Confidence level**: Likely

#### E2. `generarHTMLDesdeSecciones.ts` is a high-risk render/runtime seam

- **Title**: `generarHTMLDesdeSecciones.ts` is a high-risk render/runtime seam
- **Type**: Refactor risk
- **Description**: This module emits section markup, document CSS, preview-only runtime, viewport logic, background layout logic, and mobile smart layout injection.
- **Why it matters**: Cleanup in this file can alter visible preview behavior across section layout, runtime scaling, mobile behavior, and embedded preview behavior at once.
- **Current visible behavior**: Preview section rendering, responsive behavior, and preview-only runtime currently emerge from this one generator seam.
- **Whether current visible behavior should likely be preserved by default**: Yes. Generator cleanup in this seam is especially likely to alter preview output.
- **Affected files/modules**: `functions/src/utils/generarHTMLDesdeSecciones.ts`
- **Confidence level**: Likely

#### E3. `generarHTMLDesdeObjetos.ts` is a high-risk layout/object-contract seam

- **Title**: `generarHTMLDesdeObjetos.ts` is a high-risk layout/object-contract seam
- **Type**: Refactor risk
- **Description**: This module encodes object placement, `pantalla` top logic, `fullbleed` scaling, object-family-specific responsive behavior, and family-specific data attributes that later affect mobile reflow.
- **Why it matters**: Cleanup can alter object-level geometry and anchor semantics even when the surrounding section/runtime logic remains unchanged.
- **Current visible behavior**: Object placement and responsive behavior currently depend heavily on this renderer.
- **Whether current visible behavior should likely be preserved by default**: Yes. Object-renderer cleanup is a high-risk zone for accidental output change.
- **Affected files/modules**: `functions/src/utils/generarHTMLDesdeObjetos.ts`
- **Confidence level**: Likely

#### E4. `mobileSmartLayout` is a high-risk output-preserving cleanup zone

- **Title**: `mobileSmartLayout` is a high-risk output-preserving cleanup zone
- **Type**: Refactor risk
- **Description**: The mobile smart layout runtime mutates generated DOM positions, grouping, order, fit scale, and sometimes fixed-section height. Its behavior is visible even though it happens after generation.
- **Why it matters**: Cleanup here is very likely to change mobile preview appearance even if the generator still outputs the same initial HTML.
- **Current visible behavior**: Mobile preview can depend on runtime clustering, stacking, fit scaling, and post-generation section expansion.
- **Whether current visible behavior should likely be preserved by default**: Yes. Current mobile reflow output should be treated as baseline unless explicitly revisited.
- **Affected files/modules**: `functions/src/utils/mobileSmartLayout/*`
- **Confidence level**: Likely

#### E5. `ModalVistaPrevia` is a high-risk preview-environment seam

- **Title**: `ModalVistaPrevia` is a high-risk preview-environment seam
- **Type**: Refactor risk
- **Description**: The modal owns dual iframe rendering, viewport shell selection, iframe mutation after load, and preview/fullscreen branching.
- **Why it matters**: Cleanup that treats the modal as presentational-only can accidentally remove behavior that currently shapes preview output directly.
- **Current visible behavior**: The modal defines how desktop and mobile preview are presented and how preview-specific iframe behavior is activated.
- **Whether current visible behavior should likely be preserved by default**: Yes. The modal is part of the output baseline, not only surrounding UI chrome.
- **Affected files/modules**: `src/components/ModalVistaPrevia.jsx`, `src/components/preview/modalVistaPreviaLayout.js`
- **Confidence level**: Likely

#### E6. Snapshot overlay precedence and snapshot adapter fallbacks are high-risk truth-boundary seams

- **Title**: Snapshot overlay precedence and snapshot adapter fallbacks are high-risk truth-boundary seams
- **Type**: Refactor risk
- **Description**: Preview currently depends on flush-boundary snapshot precedence and on snapshot adapter reads that can still fall back to legacy globals.
- **Why it matters**: Cleanup that changes precedence, fallback order, or live snapshot capture timing can alter preview input without changing the generator.
- **Current visible behavior**: Preview often reflects the latest editor state closely because of the current snapshot precedence and fallback behavior.
- **Whether current visible behavior should likely be preserved by default**: Yes. The current truth-boundary behavior is part of the preview baseline.
- **Affected files/modules**: `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `src/lib/editorSnapshotAdapter.js`
- **Confidence level**: Likely

## 4. Current Behaviors That Should Be Treated As Output Baseline Until Explicitly Revisited

- The same generated HTML is used for desktop and mobile preview. Desktop/mobile differences are currently achieved by viewport context and preview runtime, not by generating separate documents.
- The preview modal renders dual desktop/mobile iframes rather than switching one iframe between modes. That dual rendering model is part of what users currently see.
- Preview overlay precedence favors the flush-boundary snapshot, then live snapshot fallback, and replaces the top-level render fields `objetos`, `secciones`, `rsvp`, and `gifts`.
- Current `pantalla` preview behavior is the baseline, including its viewport-driven desktop/mobile scaling, text zoom, and vertical base-offset behavior.
- Current `fullbleed` interpretation is the baseline, including separate bleed-layer rendering and width-oriented scaling behavior.
- Current mobile smart layout behavior is the baseline for generated mobile preview output, including post-generation clustering, ordering, fit scaling, and possible fixed-section expansion.
- Current preview-specific iframe/runtime mutations are behaviorally significant. Data attributes, preview viewport metadata, preview mobile-scroll activation, and synthetic resize behavior are part of the preview path today.

## 5. High-Risk Refactor Zones

1. **Preview controller critical path**: sequencing changes here can alter which state reaches preview and when stale-request guards apply.
2. **Generator section/runtime layer**: changes here can alter section structure, viewport logic, preview-only runtime, and responsive output together.
3. **Object layout renderer**: changes here can alter anchor interpretation, object geometry, `pantalla` placement, and family-specific responsive behavior.
4. **Mobile smart layout runtime**: changes here can alter mobile preview output after generation even if HTML generation stays the same.
5. **Preview modal iframe mutation layer**: changes here can alter scaling, scroll behavior, and preview-specific runtime activation without touching generator code.
6. **Snapshot overlay / snapshot adapter boundary**: changes here can alter preview truth precedence before HTML generation begins.

## 6. Questions That Must Be Answered In The Target Document

- What is the canonical layout truth for preview and publish?
- What does preview/publish parity mean in concrete terms?
- What responsive drift is acceptable?
- Is mobile reflow a fallback behavior or a first-class contract?
- How is `pantalla` supposed to anchor and scale across viewports?
- How should `content` and `fullbleed` behave as layout anchors?
- Should preview continue to overlay live render state after re-read?
- Which iframe/embedded preview mutations are part of the intended contract versus local preview tooling?
