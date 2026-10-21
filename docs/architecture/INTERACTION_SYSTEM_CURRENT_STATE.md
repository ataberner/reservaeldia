# INTERACTION SYSTEM CURRENT STATE

> Status: Current Implementation Map.
>
> Updated from code inspection on 2026-08-12; drag finalization and guide geometry reviewed on 2026-10-12; GEO03/SNAP01 geometry and cache follow-up on 2026-10-14; drag performance follow-up on 2026-10-15.
>
> Documentation routing corrected on 2026-05-19.
>
> Priority rule: this document describes the current implementation only. When documentation and code disagree, the code wins.

> Reviewed modules for this audit include:
> `src/components/CanvasEditor.jsx`,
> `src/components/HoverIndicator.jsx`,
> `src/components/editor/canvasEditor/useCanvasEditorSelectionRuntime.js`,
> `src/components/editor/canvasEditor/useCanvasEditorSelectionUi.js`,
> `src/components/editor/canvasEditor/useCanvasInteractionCoordinator.js`,
> `src/components/editor/mobile/useStageGestures.js`,
> `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`,
> `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`,
> `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`,
> `src/components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx`,
> `src/components/editor/textSystem/render/konva/selectionBoundsGeometry.js`,
> `src/components/editor/textSystem/render/konva/selectionVisualModes.js`,
> `src/components/editor/textSystem/runtime/useCanvasEditorTextSystem.js`,
> `src/components/editor/textSystem/runtime/useInlineSessionRuntime.js`,
> `src/components/editor/textSystem/runtime/useTextEditInteractionController.js`,
> `src/components/editor/textSystem/render/domSemantic/HiddenSemanticTextBackend.jsx`,
> `src/components/editor/textSystem/render/domOverlay/InlineTextOverlayEditor.jsx`,
> `src/components/editor/canvasEditor/CanvasInlineEditingLayer.jsx`,
> `src/components/editor/overlays/inlineEditor/useInlinePhaseAtomicLifecycle.js`,
> `src/components/editor/overlays/inlineGeometry.js`,
> `src/components/editor/textSystem/adapters/konvaDom/resolveInlineCanvasVisibility.js`,
> `src/hooks/useGuiasCentrado.js`,
> `src/components/editor/canvasEditor/CanvasGuideLayer.jsx`,
> `src/lib/editorSelectionRuntime.js`,
> `src/lib/editorBridgeContracts.js`,
> `src/components/editor/canvasEditor/useCanvasEditorGlobalsBridge.js`,
> `src/components/editor/textSystem/bridges/window/inlineWindowBridge.js`,
> `src/components/editor/countdown/CountdownKonva.jsx`,
> `src/components/editor/GaleriaKonva.jsx`.

## 1. Scope

This document is the canonical current-state reference for the dashboard editor interaction and rendering subsystem. It covers:

- drag lifecycle
- DOM overlay behavior
- selection box ownership
- Konva text rendering and text bounds consumers
- hover behavior
- snapping and centering guides
- selection transformer behavior
- inline text editing
- geometry and bounds synchronization
- multi-layer visual feedback during interaction

It does not define future architecture. It is a baseline for later fixes.

### 1.1 Interaction Documentation Hierarchy

Use the interaction documents in this order:

- Current implementation map: this document. It records the live editor interaction/rendering behavior observed in code.
- Normative interaction contract: `docs/architecture/INTERACTION_CONTRACT.md`. It owns the phase model and rules future interaction work must preserve.
- High-level editor overview: `docs/architecture/EDITOR_SYSTEM.md`. It names subsystem boundaries and routes to focused contracts.
- Historical execution plan: `docs/architecture/INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md`. It is deprecated as a planning authority and remains only as historical implementation context.
- Closure/audit record: `docs/architecture/INTERACTION_FINAL_CLOSURE_AUDIT.md`. It records phase completion status and residual validation gaps; it is not a replacement for the current map or normative contract.
- Preserved group rendering: `docs/architecture/GROUP_RENDER_MODEL.md`. It is the active group render contract and must not be treated as an obsolete interaction target doc.

## 2. Current Documentation Inventory

The following inventory classifies the repo documentation that existed at audit time.

| Document | What it claims to describe | Accuracy | Missing / wrong | Action |
| --- | --- | --- | --- | --- |
| `README.md` | Repo/project overview | Current enough for onboarding | It describes the Firebase-hosted static Next dashboard, Cloud Functions backend, Firestore, Storage, and production workflow at a repo-overview level. It is not an interaction contract. | Keep |
| `docs/architecture/ARCHITECTURE_OVERVIEW.md` | Whole-system architecture | Partially accurate | System description is mostly current, but the interaction section pointed at duplicated specialist docs that no longer serve as the canonical source. | Keep and update |
| `docs/architecture/ARCHITECTURE_GUIDELINES.md` | Architectural working rules | Fully accurate as a guideline document | It is policy/guidance, not a runtime contract. | Keep |
| `docs/architecture/DATA_MODEL.md` | Invitation/editor data model | Mostly accurate | It does not need to own interaction timing or visual authority rules. | Keep |
| `docs/architecture/EDITOR_SYSTEM.md` | Editor runtime architecture | Partially accurate | It duplicated large portions of selection/drag/text contracts that were split across multiple overlapping docs. | Rewrite and keep as a concise editor overview |
| `docs/architecture/SELECTION_BOX_DRAG_BEHAVIOR.md` | Drag/selection-box contract | Partially accurate but misleading as a standalone source | It mixed verified behavior with prescriptive language and duplicated behavior now captured from code in this document. | Merge into this document, then delete |
| `docs/architecture/TEXT_GEOMETRY_CONTRACT.md` | Text geometry contract | Partially accurate but overlapping | It duplicated current-state geometry rules and depended on `SELECTION_BOX_DRAG_BEHAVIOR.md`. | Merge into this document, then delete |
| `docs/architecture/TEXT_VISUAL_BOX_AUTHORITY.md` | Single-text visual-box authority | Partially accurate but overlapping | Useful observations were real, but it was too narrow and depended on another duplicate contract document. | Merge into this document, then delete |
| `docs/architecture/text-system-rules.md` | Text system rules | Misleading for current-state architecture | It mixed diagnosis, rules, and intended guardrails instead of acting as a precise current-state map. | Merge current facts into this document, then delete |
| `docs/architecture/DRAG_ALIGNMENT_GUIDES_ANALYSIS.md` | Current guides analysis | Partially accurate | It contained at least one confirmed mismatch: `scheduleGuideEvaluation` no longer immediately flushes; current code coalesces via `requestAnimationFrame` when available. | Merge relevant facts into this document, then delete |
| `docs/architecture/DRAG_ALIGNMENT_GUIDES_GAP_ANALYSIS.md` | Current vs target gaps for guides | Outdated for canonical docs | Gap analysis is not a current-state contract. | Delete |
| `docs/architecture/DRAG_ALIGNMENT_GUIDES_TARGET.md` | Target guide architecture | Misleading in a current-state set | It describes intended behavior, not the running system. | Delete |
| `docs/architecture/DRAG_OVERLAY_STARTUP_TARGET.md` | Target drag-overlay startup contract | Misleading in a current-state set | It is a target-state document, not the current implementation baseline. | Delete |
| `docs/architecture/GROUP_RENDER_MODEL.md` | Group render model | Accurate for its scope | It is the active contract for `tipo: "grupo"` render/publish behavior and recursive dependency collection. It is not an editor interaction phase document. | Keep |
| `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md` | Preview pipeline analysis | Fully accurate for its scope | It is preview-specific and should not own interaction runtime rules. | Keep |
| `docs/architecture/PREVIEW_SYSTEM_GAPS.md` | Preview gap analysis | Outdated for canonical docs | Gap analysis overlaps fragility work and is not a source of truth. | Delete |
| `docs/architecture/PREVIEW_SYSTEM_TARGET.md` | Target preview architecture | Misleading in a current-state set | It describes intended architecture rather than actual runtime. | Delete |
| `docs/architecture/SYSTEM_FRAGILITY_MAP.md` | Current fragility map | Fully accurate for its scope | It needed path updates after doc reorganization. | Keep and update |
| `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md` | Current editor/preview/publish compatibility | Fully accurate for its scope | It is a compatibility matrix, not an interaction contract. | Keep |
| `docs/testing/EDITOR_REGRESSION_CHECKLIST.md` | Manual regression checklist | Fully accurate for its scope | It benefits from pointing to the canonical interaction architecture doc rather than duplicated contracts. | Keep |
| `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md` | Preview/publish visual baseline | Accurate for its scope | It now anchors to the current preview/publish architecture instead of target-state documentation. | Keep |
| `docs/debug/inline-focus-rca-evidence.md` | Inline focus RCA evidence | Partially accurate | Its architecture source pointed at `text-system-rules.md`, which was not an appropriate canonical source. | Keep and update |

## 3. Canonical Documentation Set After Cleanup

After this audit, the minimal current-state documentation set is:

- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/INTERACTION_CONTRACT.md`
- `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- `docs/architecture/EDITOR_SYSTEM.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- `docs/architecture/ARCHITECTURE_GUIDELINES.md`
- `docs/architecture/GROUP_RENDER_MODEL.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/contracts/GALLERY_SYSTEM_CONTRACT.md`
- `docs/contracts/GALLERY_EDITOR_CONTRACT.md`
- `docs/contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md`
- `docs/contracts/GALLERY_VIEWER_RENDER_CONTRACT.md`
- `docs/testing/EDITOR_REGRESSION_CHECKLIST.md`
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`
- `docs/debug/inline-focus-rca-evidence.md`

Single-source-of-truth rule after cleanup:

- whole product architecture: `ARCHITECTURE_OVERVIEW.md`
- editor runtime boundaries: `EDITOR_SYSTEM.md`
- interaction/rendering current state: this document
- normative editor interaction invariants: `INTERACTION_CONTRACT.md`
- render/publish compatibility: `RENDER_COMPATIBILITY_MATRIX.md`
- preview pipeline: `PREVIEW_SYSTEM_ANALYSIS.md`
- known fragility/risk map: `SYSTEM_FRAGILITY_MAP.md`
- grouped render behavior: `GROUP_RENDER_MODEL.md`
- Gallery behavior: `GALLERY_SYSTEM_CONTRACT.md` and its focused editor/layout/viewer contracts

## 4. Runtime Architecture Map

### 4.1 Main Modules

The current editor runtime is centered on `src/components/CanvasEditor.jsx`.

Its main responsibilities are:

- own React authoring state such as `objetos`, `secciones`, `editing`, selection state, and section/UI state
- compose the current interaction hooks
- register runtime bridges and compatibility globals
- host persistence and critical-flush bridges

Primary runtime modules downstream of `CanvasEditor.jsx`:

- `CanvasStageContentComposer.jsx`
  - stage/layer orchestration
  - drag-overlay session ownership
  - selected-phase vs drag-phase visual mode resolution
  - hover-clear boundaries
  - guide scheduling
  - drag settle and selected-phase handoff logic
- `ElementoCanvasRenderer.jsx`
  - per-object rendering
  - press-time selection decisions
  - same-gesture select-and-drag fast start
  - per-object hover/selection gesture dispatch
- `SelectionTransformer.jsx`
  - selected-phase transformer for non-line selections
  - selected-phase visibility/ready reporting
  - resize/rotation commit logic
- `SelectionBoundsIndicator.jsx`
  - bounds indicator used by both selected-phase and drag-overlay paths
  - controlled drag-overlay bounds API
- `HoverIndicator.jsx`
  - hover visual owner
  - type-specific bounds resolution
  - imperative `forceHide(...)` support
- `useGuiasCentrado.js` + `CanvasGuideLayer.jsx`
  - guide and snap computation
  - guide rendering layer
- inline text system modules
  - `useCanvasEditorTextSystem.js`
  - `useInlineSessionRuntime.js`
  - `useTextEditInteractionController.js`
  - `CanvasInlineEditingLayer.jsx`
  - `HiddenSemanticTextBackend.jsx`
  - `InlineTextOverlayEditor.jsx`
  - `useInlinePhaseAtomicLifecycle.js`

### 4.2 High-Level Runtime Diagram

```text
CanvasEditor.jsx
  |
  |-- React authoring state (`objetos`, `secciones`, `editing`, selection UI state)
  |-- internal selection runtime (`useCanvasEditorSelectionRuntime`)
  |-- interaction coordinator (`useCanvasInteractionCoordinator`)
  |-- globals/bridge sync (`useCanvasEditorGlobalsBridge`)
  |-- text/inline runtime (`useCanvasEditorTextSystem`, `useInlineSessionRuntime`)
  |
  +--> CanvasStageContentComposer.jsx
        |
        |-- Stage + Konva layer stack
        |-- drag overlay session + handoff logic
        |-- transformer visibility decisions
        |-- guide scheduling
        |
        +--> ElementoCanvasRenderer / GaleriaKonva / CountdownKonva
        +--> SelectionTransformer / SelectionBoundsIndicator / HoverIndicator
        +--> CanvasGuideLayer
        +--> CanvasInlineEditingLayer (DOM portal outside Stage)
```

### 4.3 Current Layer Stack

The current stage stack in `CanvasStageContentComposer.jsx` is:

1. `CanvasElementsLayer` for section/base content
2. `CanvasElementsLayer` for main objects
3. `CanvasElementsLayer` for UI overlay content
4. `CanvasGuideLayer`
5. `CanvasElementsLayer` for drag-overlay selection visuals
6. `CanvasInlineEditingLayer` outside the Konva stage, portaled into `document.body`

The current UI overlay layer contains:

- marquee rectangle
- selected-phase selection visuals
- hover indicator
- line controls
- other selection-adjacent UI

### 4.4 Authoritative vs Derived State

Current authoring and interaction state is split across several active boundaries.

Authoritative state by concern:

- persisted authoring model: React state in `CanvasEditor.jsx`
  - `objetos`
  - `secciones`
  - root `rsvp`
  - root `gifts`
- immediate selection-sensitive runtime state: `editorSelectionRuntime`
  - `selectedIds`
  - `preselectedIds`
  - `marquee`
  - `pendingDragSelection`
  - `dragVisualSelection`
- drag-phase selection-box geometry: composer-owned controlled overlay bounds
- selected-phase transformer geometry: live attached Konva nodes inside `SelectionTransformer`
- inline overlay authority: inline mount session + swap ack state in `useInlineSessionRuntime`

Derived or mirrored state:

- compatibility globals such as `window._objetosActuales`, `window._elementosSeleccionados`, `window._pendingDragSelectionId`
- snapshot adapter reads from `window.editorSnapshot`
- hover suppression state derived from drag/resize/inline/crop interaction conditions
- guide lines derived from current live node geometry during individual drag

### 4.5 Event and Bridge Surfaces

The interaction system is not purely local React state. It still exposes imperative bridges and compatibility events.

Active bridge families:

- `window.canvasEditor.*`
  - includes `flushPersistenceNow`
  - includes live editor/session helpers
- `window.editorSnapshot.*`
  - render snapshot read boundary
- compatibility globals
  - `_objetosActuales`
  - `_seccionesOrdenadas`
  - `_elementRefs`
  - `_elementosSeleccionados`
  - `_pendingDragSelectionId`
  - `_pendingDragSelectionPhase`
  - `_isDragging`
  - `_resizeData`
  - `_grupoLider`
  - `_groupDragSession`
- custom events
  - `dragging-start`
  - `dragging-end`
  - `editor-selection-change`
  - `editor-gallery-cell-change`
  - `editor:draft-flush:request`
  - `editor:draft-flush:result`

## 5. Interaction Lifecycle Breakdown

### 5.1 Hover

Current trigger path:

- per-object hover intent originates from object renderers
- stage-level hover state is filtered by `useCanvasEditorSelectionUi`
- `HoverIndicator` renders in the UI overlay layer when a hover id survives suppression

Current suppression reasons resolved in `selectionVisualModes.js`:

- `drag-prop`
- `background-edit`
- `predrag-visual-selection`
- `canvas-interaction-active`
- `canvas-interaction-settling`
- `image-crop`
- `global-drag`
- `group-drag`
- `resize`

Current visual behavior:

- hover is the lowest-priority box-level visual
- hover is suppressed when selected-phase or drag-phase visuals own the box
- hover can be cleared imperatively by `clearHoverForInteractionBoundary(...)` in the composer
- `HoverIndicator.forceHide(...)` is used at interaction boundaries to prevent lingering hover visuals

Current ambiguity / race conditions:

- hover has no durable session identity of its own
- multiple writers can clear it
  - selection UI logic
  - composer boundary clears
  - globals bridge cleanup when an object disappears
- if cleanup is late, the hover box can persist visually longer than logical hover ownership

### 5.2 Selection

Current selection state lives in two active places:

- React state in `CanvasEditor.jsx`
  - `elementosSeleccionados`
  - `elementosPreSeleccionados`
  - marquee rectangle state
- internal runtime snapshot in `editorSelectionRuntime`
  - `selectedIds`
  - `preselectedIds`
  - `marquee`
  - `pendingDragSelection`
  - `dragVisualSelection`

Single-selection trigger path:

1. `ElementoCanvasRenderer.handlePressStart(...)` receives pointer press.
2. `decidePressSelection(...)` determines whether selection should occur on press.
3. `maybeSelectElementOnPress(...)` can emit selection intent immediately.
4. Release-time selection dispatch still exists for paths that do not select on press.

Multi-selection trigger paths:

- Shift-based toggle selection in object gesture handling
- marquee selection in `useStageGestures.js`

Current marquee flow:

1. stage/section/background mouse-down starts marquee from `useStageGestures`
2. pointer move updates `areaSeleccion`
3. live preselection is computed from node `getClientRect(...)`
4. lines use dedicated line intersection logic
5. pointer up commits intersected ids into selection and clears marquee

Current ambiguity / race conditions:

- during same-gesture drag startup, committed selection and visible drag selection can diverge temporarily
- `pendingDragSelection` and `dragVisualSelection` bridge that gap
- selection can be restored after drag from a deferred settling path rather than synchronously on pointer up

### 5.3 Drag Start, Move, and End

Current drag startup is split across press-time gesture handling and composer-owned drag-overlay session setup.

Observed startup flow:

1. `ElementoCanvasRenderer.handlePressStart(...)` receives the pointer start.
2. Press logic may select the element immediately.
3. If the dragged element was not already selected, the renderer may arm same-gesture drag.
4. For touch-like pointers, the shared `editorTouchDragIntent` gate must confirm drag before `maybeFastStartDrag(...)`, Gallery, Countdown, or manual-group activation may enable movement.
5. `CanvasStageContentComposer.beginPredragVisualSelection(...)`:
   - clears hover
   - allocates drag-overlay session identity
   - sets `dragVisualSelection` with `predragActive: true`
   - may seed internal startup state, but does not allow seeds to become the first visible frame
6. `beginCanvasDragGesture(...)` starts the coordinated drag interaction and marks the interaction coordinator active.
7. Drag samples call `syncControlledDragOverlayBounds(...)` from live-node geometry.
8. The first eligible visible drag-overlay frame comes from `controlled-sync`, not from seeds.

Current touch-intent gate:

- `src/lib/editorTouchDragIntent.js` owns the shared direction/distance classification used by normal objects, preserved-group roots, manual multi-selection drag, Gallery, and Countdown; those renderers retain lifecycle adapters but do not own another gesture policy
- `allowNativeTouchScrollOnKonvaPress(...)` leases the actual Konva hit leaf during the pending press by temporarily disabling that leaf's default prevention; the draggable root remains non-draggable and its position stays unchanged
- touch selection for an unselected same-gesture candidate remains deferred while intent is pending
- `resolveTouchDragIntent(...)` never promotes elapsed time or a stationary pause to drag: initial vertical-dominant movement stays scroll-owned, while horizontal-led movement beyond the shared thresholds can claim drag; once claimed, normal drag movement is unconstrained
- a vertical or native-scroll decision cancels the candidate and remains sticky for the rest of the gesture
- the generic renderer keeps post-scroll primary-selection suppression sticky until the next real press, without retaining terminal listeners per element; Gallery and Countdown likewise retain scroll ownership until their next press
- only a confirmed horizontal-led drag calls `claimNativeTouchDrag(...)`, which restores the hit leaf's previous default-prevention value, claims the draggable root, and then prevents the confirming native move; the Stage keeps native `pan-y`, and the implementation does not rely on a late `touch-action` change to reclaim an initial vertical pan
- release, `touchcancel`, `pointercancel`, blur, and unmount clear listeners and restore the leaf lease, draggable state, touch action, and deferred-selection state for the owning gesture only

Current move behavior:

- drag-overlay bounds are recalculated from live node bounds
- individual guide requests run synchronously through `scheduleGuideEvaluation(...)` and `flushScheduledGuideEvaluation(...)` for every object family on the shared pipeline
- if snapping moves the live node, the composer re-reads live selection bounds and resynchronizes the controlled drag overlay
- desktop Alt/Option is carried in the same drag request and temporarily bypasses snap; touch classification still comes from `editorTouchDragIntent.js`

Current end behavior:

Before settling, `applyCanonicalDragFinalization(...)` delegates to
`canvasEditor/dragPositionFinalization.js`. The existing positioning authority
accepts or rejects the drop; the adapter immediately projects that accepted
object back to the live node with `resolveObjectStageY(...)` and the existing
text-origin offsets. If the pose changes, the active selection's controlled
overlay is refreshed through `recordSelectionDragMoveSummary(...)` before its
settling snapshot is frozen. Gallery and Countdown perform this step before
their React state updater and personalized end callback. Unchanged accepted
poses do not request a correction draw; no global React-Konva strict mode is used.

Group commit suppression is scoped to the completed gesture: `dragGrupal.js`
stores `__completedGroupDragSessionId` on each committed node, and the individual
and Gallery end adapters consult `shouldSuppressIndividualDragEnd(...)`.
A new individual start clears only that member's completed marker and residual
skip guard; it cannot clear an active group's protection. Repeated follower
ends do not consume a one-shot flag or create additional individual commits.
These markers remain transient Konva attributes, not persisted object fields.

1. drag end enters a settling phase
2. the composer stores a drag settle session snapshot
3. deferred selection repair can run if the drag started from an unselected object
4. `queuePostDragUiRefresh(...)` waits for the interaction coordinator settle boundary
5. drag-overlay visuals remain mounted until selected-phase visuals are ready and post-paint-confirmed
6. only then does drag-overlay ownership fully release

Current ambiguity / race conditions:

- startup correctness depends on the first visible frame coming from the controlled-sync path
- drag settle can preserve a visual snapshot after pointer up while selection repair completes
- guide-induced snap writes happen to live nodes before overlay resync

### 5.4 Selection Box Updates

There are two different selection-box paths in the current runtime.

Selected-phase path:

- owned by `SelectionTransformer.jsx` or selected-phase `SelectionBoundsIndicator` rendering
- can use `resolveSelectionUnionRect(...)`
- may fall back to object-data geometry when live nodes are unavailable and `requireLiveNodes` is false

Drag-phase path:

- owned by the dedicated drag-overlay `SelectionBoundsIndicator`
- uses controlled bounds pushed by the composer
- current controlled-sync path requires live-node geometry

Current handoff behavior:

- `shouldKeepDragOverlayMountedForSelectedPhaseHandoff(...)` prevents early drag-overlay teardown
- the selected-phase path must report visible + ready
- `handleSelectedPhaseVisualReadyChange(...)` then waits an extra RAF to confirm post-paint before clearing the drag-overlay handoff guard

Current ambiguity / race conditions:

- selected-phase and drag-phase boxes represent the same conceptual selection affordance but are owned by different modules
- selected-phase can tolerate fallback geometry; drag-phase cannot
- stale or duplicated visuals are most likely around the handoff boundary

### 5.5 Transformer Attach / Detach

Current transformer behavior is resolved by `selectionVisualModes.js` and implemented by `SelectionTransformer.jsx`.

Current render modes:

- `none`
- `line-indicator`
- `transformer`

Current suppression conditions include:

- active drag visual ownership
- predrag visual selection
- global interaction settling
- inline editing
- line selections using the dedicated line-controls path instead of the generic transformer

Current ready/visible flow:

- transformer visibility is based on live attached nodes plus render mode
- ready is not treated as immediate mount
- the selected-phase path reports readiness only after valid visible bounds and a post-paint RAF confirmation

Current ambiguity / race conditions:

- the transformer still reads transient globals such as `_isDragging`, `_resizeData`, and group-drag globals
- selected-phase geometry authority is live-node based, but the selected bounds fallback path is not

### 5.6 Inline Text Edit

Current inline editing is a multi-surface lifecycle, not a single React state toggle.

Current entry path:

1. text selection and inline-intent logic starts from the stage/object gesture path
2. a dynamic textual target, when present, resolves its descriptor from the live authoring schema and values
3. `editing.id` becomes active in editor state and retains that optional binding in the same session
4. `CanvasInlineEditingLayer.jsx` mounts the DOM-side backend for the active text node
5. `HiddenSemanticTextBackend.jsx` computes projected geometry from the live Konva text node; date/time bindings instead mount one native typed input anchored from that same node geometry

Current linked-value path:

1. text-like input is normalized according to its field type, multiline policy, and declared maximum length
2. the canvas callback delegates to `useTemplateFieldAuthoring.updateLinkedTextFromCanvas(...)`
3. explicit `eventDetailsRole` selects the person-name, location, or time owner; other fields use the generic value owner
4. target application projects the canonical value to every target and the normal authoring-change notification refreshes sidebar consumers
5. linked commit never patches `objeto.texto`; Escape sends the entry value through the same owner and empty values leave the visual target linked

For a date-linked target, the first valid selection starts the typed branch
directly and focuses its compact control. It does not call `showPicker`; the
browser picker remains closed until the user activates the native calendar
icon. The effective target preset, with its explicit transform ahead of the
field fallback, selects `date` or `datetime-local`. Event date-time edits are
split back into the explicit date and phase start-time fields; changes to either
field reproject all date views while leaving every target transform and text-box
layout property untouched. While the typed control owns its raw input value,
Konva keeps rendering the current target projection; it never substitutes the
raw `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` control value during the session. The
sidebar format selector remains the only authoring operation that changes the
selected target's date preset.

Current caret reposition path while the same inline session remains active:

1. `ElementoCanvasRenderer.jsx` routes the canvas press to `useTextEditInteractionController.handleCanvasPointer(...)`
2. the controller resolves a collapsed semantic caret range from the canvas client point
3. only after that synchronous hit-test completes, the controller arms the short same-session blur/refocus intent
4. a native blur caused by that same canvas press may consume the intent once; stale intents, newer intents, or a different `editing.id` cannot reclaim focus

The post-hit-test arming order is required because the semantic fallback may inspect every logical text offset when the browser point API resolves the canvas rather than the hidden editor. Hit-test duration, including the higher cost of long multiline content, must not consume the blur/refocus window for the press that is still executing.

Current phase-atomic swap path:

1. `useInlinePhaseAtomicLifecycle.js` enters `prepare_fonts`
2. it waits for font readiness or timeout
3. it freezes vertical authority snapshot and computes inline offset
4. it emits `ready_to_swap`
5. `useInlineSessionRuntime.js` handles that request in a microtask and commits swap state
6. authority transitions to `dom-preview`
7. after RAF-based paint stabilization, authority transitions to `dom-editable`
8. caret visibility is enabled and the editable overlay becomes the visible editing owner

Current exit path:

- finish/done/cancel requests clear the mount session
- render authority returns to Konva
- `resolveInlineCanvasVisibility.js` decides whether Konva text or DOM overlay owns visibility at each phase

Current ambiguity / race conditions:

- inline visibility depends on session id, token, mount state, swap acknowledgement, and authority phase
- focus and caret ownership are not equivalent to mount alone
- late or mismatched swap acknowledgements can create session resurrection risk if not ignored
- the semantic point fallback is layout-sensitive and can be expensive for long text, so any future focus guard must continue to measure freshness after caret placement rather than from the start of the canvas press

### 5.7 Snapping and Centering Guides

Current guides are only part of the individual single-element drag path.

Eligibility conditions:

- request exists
- `dragMode === "single-element"`
- `pipeline === "individual"`

Current guide computation:

- section center guides are resolved from the active section
- element-to-element guide candidates are limited to objects in the same section
- candidate preselection is bounded independently for X and Y, then resolved deterministically by distance and semantic priority
- section guides and object guides compete per axis with section-priority bias
- snap locks are stored in `snapLockRef` with drag-session and concrete target identity
- an accepted section or element candidate applies its complete axis delta; guide lines are published only from the post-snap live geometry when the relation is within the explicit alignment tolerance
- section center, center-to-center, edge-to-edge, and center-to-edge relations travel in the existing guide-line shape; `CanvasGuideLayer` maps them to solid, dashed, dotted, and dash-dot treatments respectively
- activation/release radii and guide stroke/dash metrics are converted from perceptual screen pixels by the current visual scale; all snap calculations remain in canvas coordinates
- Gallery geometry uses the shared `resolveNodeSelectionRect(...)` / `resolveGallerySelectionRect(...)` path for both the dragged object and reference candidates. The live `.gallery-transform-frame` takes precedence over persisted layout dimensions and cell overlays.
- `resolveLineSelectionRect(...)`, also consumed by selection unions and drag bounds, preserves finite zero endpoints. Missing or non-finite endpoints use the existing per-coordinate defaults `[0, 0, 100, 0]`; this does not introduce a new rotated-line geometry model.

GEO03/SNAP01 follow-up (2026-10-14):

- Text anchors come from the stage-space AABB of the shared transformed text geometry described in Section 7.3. Snap deltas are expressed in stage coordinates; `applyStageSnapDelta(...)` maps the vector into the parent's local coordinates before mutating the node, including transformed parents.
- The target cache belongs to the current session, stage and dragged object. Each entry retains the live node identity, its relevant live geometry inputs and its last resolved bounds. A new session or guide cleanup discards those entries.
- Each sample checks target membership, refs, stage attachment and effective node visibility. Cheap geometry-input comparisons include live dimensions, transforms and ancestors; automatic text dimensions can therefore invalidate an entry after font measurement without replacing `objetos`. Composite targets include descendant geometry; Gallery uses its `.gallery-transform-frame` and ancestors rather than scanning cell contents when that frame exists.
- Only new or changed entries call the existing live bounds resolver. Unchanged entries reuse their boxes. There is no geometry observer, extra event listener or deferred RAF; the existing drag sample performs validation before candidate/lock resolution.
- A missing, hidden, detached or section-removed target loses its locks immediately. A replaced node releases that target's locks. When the same node's measured bounds change, each axis compares its concrete locked target anchor: only moved or invalid anchors release their lock. Unchanged anchors, including the other axis of a resized target, retain hysteresis; visual-only updates do not cause an anchor switch. Visible non-editable references retain their existing eligibility.
- The input comparison is cache validation, not another geometry authority. It does not derive alternative snap bounds or write persisted object fields.

Activation remains 10 screen pixels for elements and 6 for section centers;
release remains 18/14 pixels, expanded by 1.75 for the first 120 ms. Section
priority bias, tie-breaking, exact snap deltas, Alt/Option bypass and touch
eligibility are unchanged. Cache-reuse tests establish avoided bounds reads,
not an FPS improvement or a measured drag-latency reduction.

Current execution flow:

1. drag move builds the eligible individual guide payload, including the current desktop modifier state
2. `scheduleGuideEvaluation(...)` synchronously calls `flushScheduledGuideEvaluation(...)`
3. `mostrarGuias(...)` reads the legal live geometry, resolves per-axis candidates, and applies an exact snap when eligible
4. `mostrarGuias(...)` re-reads post-snap live geometry and publishes only verified guide relations
5. if the active drag-overlay session still matches, the composer performs `guide-post-snap-sync` from that post-snap geometry
6. `CanvasGuideLayer` renders the current guide lines with visual-scale compensation
7. drag end, cancellation, invalid target/geometry, evaluation failure, or unmount clears pending work, locks, and guide output immediately

Current ambiguity / race conditions:

- guides are not authoritative for multi-selection/group drag
- guide output depends on live node geometry, not just persisted object data

### 5.8 Drag Performance Follow-up (2026-10-15)

The performance pass starts from commit `bf280d44`, preserving the functional
and transformed-geometry fixes above. It does not change snap radii, hysteresis,
coordinates, persisted data or scheduling. Measurements and optional runners
belong to the [regression checklist](../testing/EDITOR_REGRESSION_CHECKLIST.md).

Confirmed PERF01 work and implemented boundary:

- `SelectionBoundsIndicator.maybeLogOverlayTextMismatch(...)` used to resolve
  text geometry and project three rectangles through the DOM before the logging
  policy rejected output. It now returns before those reads when selected-drag
  diagnostics are disabled. Functional controlled bounds application is outside
  this diagnostic callback and remains synchronous.
- `useGuiasCentrado.mostrarGuias(...)` now captures the text diagnostic policy
  once per sample. Its two diagnostic measurements, invariant payloads and
  diagnostic snapshots are constructed only when enabled. The functional
  `readActiveDragBox(...)` calls before and after snap, `postSnapBoxDelta`,
  `snapMovedNode`, guide publication and composer synchronization remain intact.
- Executable regressions failed before the guards: three DOM projections per
  overlay diagnostic call instead of zero, four text bounds reads instead of
  two, and a populated diagnostic snapshot store with logging disabled. All
  nine diagnostic/cache operation tests pass after the guards, including the
  enabled diagnostic path and identical snapping/guide trajectories with the
  flag on/off. These are operation counts, not FPS measurements.
- No diagnostic entry point with functional ownership was disabled wholesale:
  notably, `logSelectionDragLifecycle("drag:summary", ...)` still drives the
  normal live overlay update despite its name.

Measurement boundaries:

- Node 20.19.5, Chromium 138.0.7204.157, Windows build 26200, Intel i5-10210U,
  eight logical CPUs, approximately 7.7 GiB RAM. Physical display refresh was
  unavailable. Browser DPR is 1; Chromium is headless with CPU rasterization
  (`--disable-gpu`). No result establishes physical presentation latency,
  desktop GPU performance or mouse/trackpad feel.
- The offline lab uses real guide/geometry/drag owners, Gallery and a controlled
  `SelectionBoundsIndicator`, but generic nodes replace the full element
  renderer and composer. Its post-snap plus normal overlay calls model the
  ordering under investigation; they are not evidence of PERF02 in the real
  composer. Viewport 850x1050, CSS scale 1/0.6, one excluded warmup plus five
  measured gestures per scenario/modifier. Core coverage is text and shapes at
  1/10/50/100 elements, normal/Alt: 192 gestures per pass, 160 measured.
- Final timing uses production React, an unminified offline bundle, diagnostic
  flags off, passive RAF sampling and CDP metrics. Development diagnostic passes
  separately collect function spans, DOM/Konva calls and Profiler callbacks.
  These populations are not numerically interchangeable. Nested spans and the
  two Profiler scopes overlap; do not sum their durations or count both
  callbacks as distinct React commits.
- Each gesture sends 60 CDP mouse moves along a one-second nominal path. The
  measured window also includes pointer down/up and two final RAF callbacks;
  raw timestamps retain actual dispatch timing. RAF gaps describe callback
  scheduling, not presented frames. Report 16.67/8.33 ms budgets separately;
  neither the fixed-16.7 counter nor headless RAF establishes lost physical
  frames. `ScriptDuration`, `LayoutDuration` and `RecalcStyleDuration` are CDP
  measurements; paint time is unavailable without a separate trace. DOM reads
  alone are not evidence of forced layout.
- Normal versus Alt changes calculation, application and drawing together.
  Diagnostic-only spans distinguish candidate building, axis resolution, snap
  mutation, guide publication and scene/hit drawing without delaying the sample.
  The AST instrumenter is test-only; it is not imported by the application.

Recorded offline comparison:

Seven completed passes contain 1008 gestures including excluded warmups, with
zero browser errors or outbound requests: baseline and after core diagnostic/
timing passes, one repeated unchanged timing baseline at N=100, and a timing
pair covering all eight families at N=10/scale 1. Each case/modifier has five
measured repetitions. The final-node/model/persistible checks passed throughout
the timing passes. The earlier baseline diagnostic pass retained commit/pose
evidence only; its artifact does not establish the later serialization checks.

| Text, N=100, scale 1 | Before | After PERF01 | Measurement |
| --- | ---: | ---: | --- |
| DOM `getBoundingClientRect` calls, normal | 551 | 185 | Diagnostic median calls/gesture |
| DOM calls, Alt | 371 | 185 | Diagnostic median calls/gesture |
| Text pre/post diagnostic calls, normal | 120 | 0 | Diagnostic calls/gesture |
| Functional active bounds reads, normal | 120 | 120 | Diagnostic calls/gesture |
| Live reference input samples, normal | 6039 | 6039 | Diagnostic calls/gesture |
| Konva subtree Profiler callbacks, normal | 38 | 38 | Diagnostic median callbacks/gesture |
| Object layer scene/hit method calls, normal | 62 / 62 | 62 / 62 | Diagnostic calls/gesture, not painted pixels |
| Guide layer scene/hit method calls, normal | 37 / 37 | 37 / 37 | Diagnostic calls/gesture |
| CDP scripting, normal | 162.826 ms | 168.680 ms | Production-React timing median/gesture |

The guards remove work but these timings do **not** establish an FPS, input
latency or aggregate CPU improvement. The shape control changed from 192.617
to 187.541 ms/gesture; an unchanged N=100 baseline repeated at 414.569 ms for
text and 382.094 ms for shapes. That variance is much larger than the expected
guard benefit. RAF p95 remains about 16.8 ms in the primary timing comparison.
Diagnostic timings also improved in untouched phases and the shape control, so
they cannot support a causal speedup claim. Instrumented input-capture to
handler-end p95 changed from 7.0 to 5.9 ms for text and 7.1 to 3.8 ms for shapes;
these are handler observations with instrumentation, not presentation latency.

For scale 1, normal text gestures, production-React CDP scripting medians and
ranges make the variability across scene sizes explicit:

| Elements | Before ms/gesture [min, max] | After ms/gesture [min, max] | RAF p50/p95/p99 before -> after (ms) |
| ---: | ---: | ---: | --- |
| 1 | 49.2 [45.2, 57.5] | 43.4 [40.3, 51.4] | 16.7/16.7/16.8 -> 16.7/16.7/16.8 |
| 10 | 66.0 [62.0, 72.2] | 59.0 [58.2, 68.1] | 16.7/16.7/16.8 -> 16.7/16.7/16.8 |
| 50 | 151.7 [125.6, 226.9] | 113.7 [109.9, 146.1] | 16.7/16.7/16.8 -> 16.7/16.7/16.8 |
| 100 | 162.8 [154.9, 240.2] | 168.7 [165.2, 180.1] | 16.7/16.8/16.8 -> 16.7/16.8/16.8 |

These five-gesture samples are observations, not statistical proof of a
size-dependent speedup. The complete table retains Alt, scale 0.6 and shapes as
controls rather than selecting only conditions with lower elapsed times.

The two core timing runs differ in final snapped Y for two of 192 matched
gestures (shape, N=50, scale 1, normal). The baseline itself already produces
different final Y values on the same nominal path. One divergent baseline
gesture has a final input gap of about 66.5 ms rather than 16.7 ms. Actual
event/lock timing is not fixed by the CDP driver; the 120 ms policy is
time-dependent. A timing-sensitive lock is a supported hypothesis for these
differences, not a confirmed replay: timing mode did not retain candidate IDs
or lock acquisition times. Each completed
gesture retains visual/model/persistible agreement, and the broader timing pair
has exact final-pose agreement. Do not describe wall-clock runs as deterministic
trajectory replay. The controlled-clock unit/UX probes separately verify policy
parity; no threshold was changed to normalize these observations.

Reproducible artifacts are under `.local-isolation/drag-performance/`:
`paired-reports.json`, `paired-diagnostic-n100.json`,
`paired-input-handler-n100.json`, `paired-final-pose-parity.json`, per-run
`results.json`/manifests, `shape-n50-pose-timing-investigation.json`,
`paired-core-table.md` and frozen bundles. Source hashes identify the two
product files changed between versions. Timing and diagnostic results remain
separate populations.

Phase 2 cache evidence (unchanged strategy):

| Elements in section | Target input samples/normal gesture | `getNodeBox` calls/normal gesture | Cache builds / hits | Input validation ms/gesture |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 120 | 1 / 60 | 0 |
| 10 | 549 | 129 | 1 / 60 | 11.8 |
| 50 | 2989 | 169 | 1 / 60 | 26.9 |
| 100 | 6039 | 219 | 1 / 60 | 61.2 |

These recorded diagnostic counts include preparation and 60 move samples:
`61 * (N - 1)` live target input samples, but only `N - 1` reference bounds
resolutions plus 120 functional moving-object reads. Alt still prepares targets
once but bypasses their validation during movement. The cache preserves bounds
reuse; live validation remains linear in eligible references and descendant
geometry. This is not a stale-data workaround or a reason to remove validation.
The time column is the baseline diagnostic median for normal text at scale 1,
including preparation. It measures the current validation function, not the
increment over Phase 1; no comparable Phase 1 timing baseline was captured.
At N=100, candidate construction also takes 69.9 ms/gesture diagnostically,
while guide evaluation totals 225.7 ms inclusive. These are profiling priorities,
not additive exclusive CPU costs or production time estimates. Unchanged
validation drops to 44.1 ms in the after diagnostic run, illustrating why elapsed
deltas cannot be attributed to the guards. No second cache, spatial index or
weakened invalidation was introduced.

For N=100 with all 99 references eligible, the current candidate algorithm
examines 99 targets on each axis, evaluates the three target anchors against
three moving anchors, and keeps at most three candidates per axis. That is
1782 anchor-pair comparisons per move, derived from the inspected loop, not an
independently instrumented counter. Section-center decisions are additional.
The existing bounded top-three insertion already avoids sorting all targets;
an optimization proposal must not assume that a full-scene sort exists.

PERF02 source boundary:

When an individual snap moves the node, `flushScheduledGuideEvaluation(...)`
captures a complete live selection snapshot and applies `guide-post-snap-sync`.
The following `recordSelectionDragMoveSummary(...)` captures it again before
the normal `controlled-sync`. The potential saving is one selection resolution
per sample with effective snapping, not one per every move. Each path already
shares its own snapshot with its consumers.

Both synchronization paths remain functional: the normal summary generates the
token accepted by the overlay startup gate and services pending startup state.
An earlier post-snap application does not replace that token or authorize the
first visible frame. Any future reuse must stay within the same synchronous
sample, with the same session/epoch, selection, node identities, geometry and
overlay context. Reuse must carry the complete selection result, not substitute
the guides' AABB for a rotated selection polygon. A global snapshot cache or an
extra animation frame is not warranted by these observations.

The text-authority diagnostic inside `syncControlledDragOverlayBounds(...)`
is a separate remaining source of geometry reads. It is not covered by the two
PERF01 guards above; distinguish that work from duplicated live snapshots when
interpreting composer measurements.

Decision: defer PERF02 and further cache changes. The offline fixture cannot
measure the complete composer, and no repeatable real-editor before/after
comparison was obtained in this pass. The potential saving does not justify
changing startup-token/handoff semantics without that measurement. This is an
explicit pending investigation, not evidence that the residual cost is zero.
The next focused measurement should separate effective-snap samples, live
selection resolution, the remaining text diagnostic and each functional sync.

Real editor and verification limits:

- A canonical isolated Next development session used synthetic Auth/Firestore
  fixtures, loopback-only services and the existing disabled-admin boundary.
  The specific `getAdminAccess` development error overlay was closed through
  Escape before interaction; no endpoint was enabled. Viewport 1365x1100, DPR 1,
  logical zoom 0.8 and measured CSS scale approximately 0.92, native Stage scale
  1. The 1.15 visual boost belongs to `useViewportScale`.
- `baseline-text-smoke-fixed3-real-timing-text-smoke/results.json` retains four
  successful text/N=10 gestures (one warmup and one measured gesture for each
  normal/Alt mode, nominal 400 ms). Node/model/persisted poses agreed after
  release/settling, no guides remained, and the synthetic collection stayed
  at five documents. This is baseline smoke evidence, not five repetitions,
  not an after-change run and not a real-editor performance comparison.
- Later attempts failed preparation assertions: an ordinary preparatory click
  entered inline editing; a Shift-click attempt later had empty selection.
  These are recorded setup observations, not a diagnosed product regression.
  Two additional warmups passed; the last held-click attempt was interrupted
  without results and is excluded. The real copy was never instrumented or
  patched with PERF01. Real PERF02 timings, consecutive handoff, undo/redo and
  before/after measurements remain pending. Its processes and demo ports were
  verified inactive at closure; the interrupted session marker was not rewritten
  to claim a normal shutdown.
- Node 20 related suites: 290/290 passed, including nine new diagnostic/cache
  tests and all selected Phase 1/2 geometry, drag, selection, overlay, grouping,
  history and persistence regressions. The separate known positioning suite
  remains 6 passed / 1 failed (`0.1` versus `0.502`), without expectation changes.
  Phase 1/2 offline Chromium regressions: 11/11 passed. Syntax and
  `git diff --check` passed. Logs and the exact suite list are under
  `.local-isolation/drag-phase3/`.
- No physical mouse/trackpad/touch study, GPU-backed desktop frame-presentation
  measurement, paint trace or full-editor React Profiler capture was completed.
  Empty real-editor Profiler arrays mean unavailable, not zero commits. The
  instrumentation helpers are test-only and are not imported into production.

UX evidence and next calibration boundary:

`guideUxProbe.mjs` runs the real hook/geometry/decision engine with a controlled
clock, real Konva matrices and a single-render React adapter. Twelve boundary
probes and sixteen trajectories, each repeated five times, confirm activation
10/6 screen pixels, initial release 31.5/24.5 through lock age 120 ms inclusive,
then 18/14. The window starts at each lock acquisition, not just at drag start;
changing anchors can therefore start another expanded window later in a gesture.
Micro-adjustments within a lock remain aligned; axes release independently
on a diagonal. With references 16 px apart, releasing the first may acquire the
second in the same sample, so anchor changes must not be classified as failure
to release the old lock. These deterministic probes do not measure input devices
or perceived smoothness.

A later user-tested calibration can compare initial multiplier 1.75 against
1.25 (22.5/17.5 px release), keeping activation, normal release, 120 ms window,
priorities and Alt unchanged. This is an experimental candidate, not a selected
new default. Measure time/distance to leave an alignment, corrective movement,
alignment errors and switches between nearby anchors with mouse, trackpad and
touch. This phase leaves all thresholds unchanged.

### 5.9 Phase 3B: Real-editor Measurement and Partial Functional Validation (2026-10-15)

This section extends the earlier pass in Section 5.8; its offline results and
then-pending real-editor work remain historical evidence. Phase 3B runs the real
renderer, composer, guides, selection overlay and draft persistence in an
isolated Next development copy with synthetic Firebase emulator data. It adds
no product optimization beyond the two PERF01 guards already described.

Measurement populations and provenance:

- Timing uses the full development editor with private instrumentation and
  selected-drag diagnostics off. Diagnostic passes separately instrument the
  copied source and record composer samples, spans, root React commits and the
  existing `canvasDragPerf` session. Neither population is deployed production
  or the production-React offline lab from Section 5.8.
- Desktop viewport is 1365x1100, DPR 1, headless Chromium with CPU rasterization.
  A declared test-only initial zoom prop in the disposable copy feeds the
  existing `useViewportScale` path; effective scales 1/0.6 are observed, with
  native Stage scale 1. This is not a new product zoom control or an injected
  CSS/Stage transform. The copied source and runner hashes record this setup.
- Each timing case/modifier has one excluded warmup and five measured gestures,
  normally 60 CDP mouse moves over a nominal second. Actual event times vary.
  RAF p50/p95/p99 below pool intervals before the browser mouseup capture
  timestamp, including startup; CDP scripting covers the entire measurement
  window, including release/settling. Neither measures presented FPS or physical
  input-to-paint latency. Node dispatch and browser clocks are not subtracted.
- `A-core-real-timing-core` stopped after 181 recorded gestures when the undo
  persistence poll exceeded 5 seconds outside measurement. Its 15 complete,
  reset-verified cases contribute 150 measured gestures. The final text/N100/
  scale0.6 case was rerun in `A-core-tail-real-timing-core` (12 gestures, 10
  measured). `B-core-real-timing-core` completed 192 gestures, 160 measured.
  The comparison therefore has 16 complete cases/32 modifier cells with five
  repetitions each. The original A run remains `completed:false` with
  `unknown_endcollection`; a valid case does not convert it into a completed run.
- Diagnostic `B-diag-core-v2-real-diagnostic-core` completed 96 gestures at
  scale1 (80 measured). `A-diag-text-v3-real-diagnostic-core` completed 48
  (40 measured). Only their four common text cases/eight Normal/Alt cells are
  paired. All resets are verified; protocol/configuration hashes match, and
  exactly `useGuiasCentrado.js` and `SelectionBoundsIndicator.jsx` differ.
  The full populations remain unequal; B's shape cases are context only.
- The first B diagnostic attempt is instrumentation smoke, excluded from the
  benchmark after an undo-persistence timeout. `A-diag-core-v2` encountered
  `ENOSPC` and its results file was left empty; exclude the entire attempt,
  without reconstructing a completed run from progress logs. B evidence was
  retained with unchanged content hashes, including after NTFS compression.
  Storage capacity and session health are operational prerequisites, not
  explanations for every observed editor frame delay.
- Later functional and dedicated captures use a fresh canonical isolated B
  session after the previous supervisor stopped. Closure evidence verifies its
  13 known processes absent and eight listener ports free; the original report
  is retained. Restart evidence verifies all 1282 copied source hashes against
  frozen B, zero private AST instrumentation files, the canonical loopback/demo
  configuration and healthy emulator endpoints. This is a new session and data
  population, not interchangeable cold state for the earlier A/B comparison.
  See `restart-closure-20261015.json` and `restart-ready-20261015.json`.

Observed timing, text/Normal/effective scale1, five gestures per cell:

| N | RAF before mouseup A -> B, p50/p95/p99 ms | Whole-window script A -> B, median ms/gesture | Observed B-A ms (%) | Equal final endpoints |
| ---: | --- | --- | --- | ---: |
| 1 | 16.7/16.8/150.1 -> 16.7/16.8/50.0 | 730.83 -> 245.69 | -485.14 (-66.38%) | 5/5 |
| 10 | 16.7/16.7/66.6 -> 16.7/16.8/83.3 | 410.24 -> 394.98 | -15.26 (-3.72%) | 5/5 |
| 50 | 16.7/16.8/150.0 -> 16.7/16.8/200.0 | 608.12 -> 652.52 | +44.40 (+7.30%) | 2/5 |
| 100 | 16.7/66.6/350.0 -> 16.7/33.3/283.3 | 1596.90 -> 1487.24 | -109.67 (-6.87%) | 1/5 |

These are descriptive deltas, not a causal speedup. Across the complete timing
matrix, 21/160 paired endpoints differ, all Normal; Alt matches 80/80. Every
accepted gesture agrees with its own visual/model/persisted position. The
unchanged-source A N100 control has 15/40 different endpoints, again all Normal.
For text/N100/scale1/Normal, its script median changes from 1596.90 to 966.39 ms
without either guard changing; B is 1487.24 ms. The corresponding Alt medians
are 820.61, 862.91 and 819.36 ms. Time/order/environment variation and endpoint
variation prevent attributing these whole-window differences to PERF01. The
120 ms lock window is a plausible contributor to endpoint differences, not a
confirmed replay: these timing captures do not retain lock acquisition/target
identity. The thresholds remain unchanged.

Confirmed diagnostic work removal and residual costs, text/Normal/scale1;
five gestures and 300 complete callbacks per row:

| N | Callback p95 A -> B, ms | Text diagnostic calls/sample A -> B | DOM reads/gesture A -> B, median | B cache p95 ms (% callback) | B second resolver p95 ms (% callback) |
| ---: | --- | --- | --- | --- | --- |
| 1 | 4.5 -> 1.6 | 2 -> 0 | 400 -> 199 | 0.1 (1.84%) | 0.2 (1.05%) |
| 10 | 3.3 -> 2.5 | 2 -> 0 | 541 -> 199 | 0.3 (12.42%) | 0.2 (3.54%) |
| 50 | 5.0 -> 4.8 | 2 -> 0 | 565 -> 193 | 1.5 (31.77%) | 0.2 (3.13%) |
| 100 | 12.5 -> 5.7 | 2 -> 0 | 565 -> 199 | 2.7 (43.62%) | 0.2 (2.04%) |

The zero text-diagnostic counts have complete probe coverage. The overlay
mismatch callback is still invoked but returns early: its diagnostic median
cost changes from 19.6/18.1/19.5/38.7 to 0.5/0.2/0.5/0.6 ms per gesture. Global
DOM reads include other callers; they neither identify forced layout nor prove
that every remaining read is avoidable. PERF01 helper durations are measured
over the full probe window, not individually timed inside the sample probe.
The callback p95 values include instrumentation and are not input/display latency.

The B cache records 300 hits and zero movement-time misses per Normal row, with
0/9/49/99 live target-input checks per sample for N1/10/50/100. `getNodeBox` runs
twice per move for the active object; unchanged target bounds are reused.
Preparation is outside those sample counts. Alt still prepares references but
bypasses move-time validation. Cache percentages are the union of recorded
`getSectionGuideTargets` intervals divided by complete callback duration and
include per-candidate instrumentation overhead; they are not production CPU
shares or savings available by disabling invalidation.

PERF02 is now observed in the real composer: B duplicates the selection result
in 30/270/300/300 of 300 Normal text samples as N increases; Alt has none. The
recorded bounds and session/epoch/selection/node/stage/context agree between
`guide-post-snap-sync` and the subsequent normal summary. The second resolver
totals 3.3/17.2/24.0/20.7 ms across five gestures (0.66/3.44/4.80/4.14 ms per
gesture), with p95 0.2 ms. These are observed repeated resolutions, not proof
that their state can safely be reused. The text-authority diagnostic remaining
inside the composer is a separate inclusive span; do not add it to the resolver
or overlay totals as exclusive CPU.

The same recorded B text/N100/scale1/Normal population (five gestures) also
measures the complete sync: two overlay calls per sample, inclusive p95 0.3 ms
per call and interval-union p95 0.6 ms across both calls, accounting for 10.38%
of instrumented callback time. Inclusive `mostrarGuias` p95 is 4.8 ms. Projection
of these existing fields is in `overlay-snap-focus-summary.json`; this is not a
new measurement. Neither total proves a sync can be removed or represents an
attainable saving, and bounds/cache/snap/overlay inclusive spans must not be
summed. Whole-window long-task medians are six tasks and 709 ms per gesture;
that broader window includes other phases, so it is not active-handler cost.

**Decision B: defer PERF02 implementation and further cache optimization.**
The measured second-resolution residual is small relative to the complexity of
startup tokens, complete polygon snapshots and handoff ownership. Preserve both
functional sync paths. Reconsider only after an independent, uninstrumented or
sampled profile establishes material residual cost and regression coverage can
prove same-sample validity. No new cache/index, weakened invalidation, RAF,
tolerance or hysteresis change is justified by these measurements alone.

Representative B diagnostic counts, text/N100/scale1, five gestures per arm:

| Observation | Normal | Alt | Scope |
| --- | ---: | ---: | --- |
| React root commits/gesture, median [min, max] | 53 [49, 53] | 31 [31, 31] | DevTools callbacks, two observed roots; component renders and React duration unavailable |
| Controlled-overlay sync calls/sample | 2 | 1 | Complete composer move samples |
| Controlled-overlay sync calls/gesture | 124 | 64 | Full probe window, including four calls outside move callbacks |
| Guide publications / skipped identical updates | 19 / 42 | 0 / 61 | Existing drag-session counters |
| `objects-main` scene / hit method calls | 61 / 61 | 61 / 61 | Existing per-instance layer counters |
| `drag-overlay` scene / hit method calls | 139 / 139 | 121 / 121 | Existing per-instance layer counters |
| `sections-base` and `ui-overlay`, each scene / hit | 2 / 2 | 2 / 2 | Existing per-instance layer counters |

Recorded scene-method medians are 66.6/73.7 ms for `objects-main` and 6.3/6.2 ms
for `drag-overlay` (Normal/Alt); corresponding hit-method medians are 0.7/0.5
and 1.1/1.2 ms. These are method observations, not presented frames or additive
exclusive CPU. The existing session records five `render:*` events in both
arms; this is not the React commit count. The second renderer does not report
a name/version, so its identity is not inferred. Guide drawing and layer
channels can overlap, and missing channels remain unavailable rather than zero.

Diagnostic coverage and functional defects:

- B has 4800 complete measured samples and A-text has 2400, without truncated
  samples or recorded session changes. Real React DevTools root commit callbacks
  are available; they count root commits, not component renders. Existing Konva
  session data are available. `CanvasElementsLayer` wraps scene/hit methods per
  instance before the prototype probe: absence of a prototype draw span does
  not mean zero draws. Use `existingSession.topStageSceneLayers`/`topStageHitLayers`
  and guide counters independently; top-five lists can omit layers and their
  session ends before the probe's last RAFs. Do not add overlapping channels.
- The accepted diagnostic text pairs have five different Normal endpoints out
  of 20, all at N50/N100; Alt matches 20/20. This remains visible in
  `diagnostic-case-endpoint-parity.json` rather than being hidden by per-gesture
  visual/persistence checks.
- Complete functional batches now cover **160/180 gestures**, 32 batches across
  shape, text, rotated, image, gallery, countdown, persisted group and multiple
  sections at scales1/0.6, Normal/Alt. Each batch keeps the real editor alive for
  five consecutive gestures, ends with immediate release, and verifies per-root
  persistence, final undo/redo and reload without reseeding. All 64 history
  operations and 32 reloads restore recorded poses. Provenance is selected by
  complete functional evidence, never timing: V3 contributes 40 shape/text,
  V8 contributes 60 rotated/image/gallery, V9 contributes 20 countdown, and V11
  contributes 40 group/multisection. Only V11 is a completed original run; V3,
  V8 and V9 remain incomplete, with their hashes and excluded attempts retained.
  Source hashes agree across all four, while runner hashes differ; this is
  functional coverage under recorded preparation versions, not a timing pair.
- The excluded V8 countdown batch has four gestures: its immediate center
  target was already the current position, so the corrected 2 px miss returned
  to the initial pose and could not prove a new history entry. The test-only
  trajectory now adds 40 units of Y displacement in that specific case while
  keeping a single movement event and the original X snap expectation. The
  excluded V9 group batch has five gestures/history but lacks accepted reload
  evidence: the fixture omitted text-style defaults added by canonical persistence.
  V11 builds that group fixture through existing `buildPersistableRenderState`
  before seeding, retaining strict full-child comparisons. Neither adjustment
  changes product behavior, snapping thresholds, persistence or RAF scheduling.
- Fourteen Normal individual immediate cases verify an intentional 2-screen-pixel
  correction before release. Recorded guide-node counts vary: gallery has three,
  countdown has one/three, and the other individual families have zero at that
  instant. This proves imperative snapping, not presentation timing. Fourteen
  separate paused examples verify an exact center guide, cleanup and 28 screenshot
  files. Group cases retain their separate expectations; no individual 2 px snap
  requirement is inferred for them.
- **Confirmed contract defect:** all 160 functional gesture checks and all 64
  history checks retain `dragVisualSelection.ids` after visual handoff. Earlier
  real snapshots also retain its session/drag identity. Selected/runtime selected
  IDs and visible frames can converge while this transient state remains stale.
  History correctly clears committed selection and visible frames, but still
  fails transient cleanup. This violates the existing interaction contract;
  `functionalValid` only describes observable pose/selection/persistence checks,
  never an integral PASS. Correction and subsequent regrab/cancel/undo validation
  remain pending; no expectation was relaxed to conceal the defect.
- Loader/DOM occlusion and preparatory selection failures are recorded separately
  from product drag failures. Live node refs alone do not prove that the editor
  is ready for pointer interaction. Later preparation changes have distinct
  runner hashes and cannot be mixed into timing comparisons. The functional
  harness now observes DOM `elementFromPoint` plus Konva hit ancestry and chooses
  an exposed interior point belonging to the requested root, excluding Transformer
  handles. Gallery/countdown reuse their existing interaction frame. It records
  rejected candidates and does not mutate product selection or geometry. Earlier
  rotated attempts without a fifth valid movement remain incomplete.
- Multi-selection has **no accepted five-gesture batch** at this checkpoint.
  V10 Normal/scale1 and three V12 Normal/Alt scale1/0.6 cells each fail their fifth,
  single-movement-and-release attempt after four successful sweeps: four failed
  immediate attempts and 16 preceding sweeps that moved and persisted both roots.
  Those 16 also fail strict transient cleanup and do not complete any batch.
  The failure occurs before fifth-gesture persistence/settling and history/reload;
  no such evidence is claimed. The assertion text says "must commit", but the
  evidence proves unchanged position, not a count of commits or history entries.
- **Confirmed manual-pointer mechanism:** three V12 cells record pointer-down
  `(260,140)`, activation pointer `(380,140)`, preview delta `(0,0)` and
  `hasPreviewSinceActivation:false`; both nodes/models remain unchanged. In
  `dragGrupal.js`, the armed update that crosses the threshold calls
  `activateManualGroupDragSession` with the current pointer as activation origin
  and returns `activated` without applying preview. Release at that origin has
  zero delta. V10 Normal/scale1 reproduces the same position result, but its
  engine-path attribution is source-inferred because that failed gesture lacks
  the V12 runtime fields. Reproduction with Alt means snapping is not necessary
  for this limitation. It is a synthetic one-event worst case, not a measured
  physical mouse/trackpad event-rate result.
- The intended first-sample policy remains an explicit decision: inspected
  contracts do not require discarding the first move. Characterize the real
  armed/update/finish exports, decide the expected displacement on activation,
  then scope any product correction separately. Existing tests activate at the
  initial pointer before updating, so they do not cover this path. No artificial
  activation movement or relaxed assertion was added. The remaining 20 gestures
  are unaccepted because of the four failing batches, not unexecuted coverage.

Dedicated trace/CPU capture, separate from timing and immediate handoff:

`B-trace-postrelease-v1-real-timing-core` completed eight gestures in the fresh B
session; exactly one Normal shape/N100 and one Normal text/N100 gesture at scale1
have traces and CPU profiles. Sampling interval requested is 1000 microseconds;
analysis uses recorded `timeDeltas`, retaining idle/unknown and missing values.
The capture includes a further requested 1500 ms after the normal probe stops.
These two samples are neither a percentile population nor an A/B performance
comparison. Tracing/profiling overhead and the delayed final observation exclude
them from core timing and immediate handoff acceptance.

| Window or observation, ms | Shape | Text |
| --- | ---: | ---: |
| Pointerdown to beginning of pointerup | 1624.583 | 1654.965 |
| Pointerup to probe end, including release and two RAF callbacks | 570.257 | 417.659 |
| Additional observation after probe end | 1509.400 | 1508.800 |
| Synchronous mouseup dispatch, inside release | 134.953 | 124.851 |
| Recorded scripting union during active pointer window | 663.611 | 1004.887 |
| Recorded scripting union during release/settling | 541.486 | 396.747 |
| Recorded scripting union during additional observation | 718.706 | 834.711 |

Four matching EventTiming events per capture establish the page-to-trace clock
offset with zero observed spread; eight matching request IDs give zero timestamp
difference between trace and Network. The profiles also contain 1744.495/554.827 ms
before pointerdown, excluded from the three phase windows above. Renderer-main
metadata determines the analyzed thread. Duration-event unions remove nesting
within each category; do not add overlapping categories or CPU stack-presence
figures. The numbers are elapsed event envelopes or sampling estimates, not
presented frames, physical input latency or exact process CPU accounting.

During the active pointer window, sampled self time is 262.294/461.114 ms in React
and 170.241/235.287 ms in Konva (shape/text). During release/settling it is
396.239/281.547 ms in React and 99.900/69.119 ms in Konva. `exports.jsxDEV` and
`renderCanvasObject` appear among prominent sampled frames; this is evidence of
substantial development-render work in this capture, not a production cost
estimate or proof that one callback caused it. Recorded active-window layout /
style / paint unions are 0.351/2.694/0.251 ms for shape and
0.135/2.501/0.047 ms for text. No forced-layout attribution follows; unrecorded
categories remain unavailable, and Paint does not measure GPU/display completion.

Only the additional observation has sampled stacks containing
`cloneDashboardStageLayersForExport -> Konva clone` (9.805/8.780 ms inclusive)
and `exportDashboardImageFromStage -> toDataURL/_toKonvaCanvas`
(29.464/27.761 ms inclusive). Report these scopes separately: they do not explain
the entire 541.486/396.747 ms release scripting window, and no asynchronous
thumbnail ancestry is fabricated. Source review confirms that
`guardarThumbnailDesdeStage` awaits export, then Storage upload, download URL and
Firestore thumbnail metadata update. Requests start after pointerup: first
Firestore Write at +1102.285/+1076.996 ms, Storage POST at +1483.805/+1501.984 ms,
and thumbnail GET at +1565.838/+1577.939 ms. Those requests returned HTTP 200;
Storage request-to-finished duration is 76.531/41.538 ms, separate from CPU.
No newly started requests were recorded in the active/release windows; existing
streams are not excluded by that observation. This supports later export/autosave
work, without attributing all React costs or frame delays to the thumbnail.

The local CPU analyzer's raster-export label was narrowed to full method names
after finding that a substring match also accepted `ElementoCanvas`. The summary
was regenerated and the positive/negative regression passed in the 33/33 local
analyzer suite (five CPU-profile tests). This affects only local evidence analysis, not
the captured source, protocol or productive code. The capture does not change
Decision B for PERF02.

Evidence lives under `.local-isolation/drag-phase3b/`: `final-metrics-table.md`/
`.json`, `core-case-comparison.json`, `control-comparison.json`,
`diagnostic-case-comparison.json`, `diagnostic-case-endpoint-parity.json` and
`functional-handoff-v3-coverage.json`, the later
`functional-handoff-complete-160-coverage.json`/`-summary.json`, plus
`multiselect-activation-report.json`, `dedicated-capture-findings.md` and
the dedicated run's `dedicated-capture-summary.json`, and partial UX
`real-ux-case-coverage.json`, `real-ux-case-summary.json` and
`real-ux-residual-table.md`, with raw results/manifests,
traces, profiles and hashes. The local analysis helpers and artifacts are ignored experiment files;
their absence in a fresh checkout is not a passing check. Commands and remaining
acceptance gates are in the matching Phase 3B regression checklist.

Pending at this checkpoint: the first-sample behavior decision and correction/
revalidation of 20 unaccepted multi-selection gestures, correction/revalidation of
the native-drag repeated-destination defect described below, further visual inspection, broader
repeated trace/profile validation, production/GPU and
physical mouse/trackpad/touch measurements. The controlled-clock `guideUxProbe`
from Section 5.8 still proves only the unchanged policy boundaries. Raw browser
motion has no target/lock-age identity and cannot establish a 120 ms release
boundary by itself. No new perceptual calibration is selected here.

The real UX capture uses diagnostic observers on unchanged B timing source
(no private AST instrumentation), in the same fresh session. Its first run has
one complete horizontal/scale1 case (12 gestures including two warmups), then
fails the expected local demo-overlay preparation timeout before the next case.
This is not an in-gesture failure. The later harness increases only that setup
wait from two to ten seconds and filters trajectories for segmented capture.
The horizontal/scale0.6 rerun completed its 12 gestures. The remaining-run attempt
then completed ten more cases before failing in immediate/scale1/Alt; its original
status remains incomplete. The aggregate accepts **12/14 complete cases**, covering
horizontal, vertical, diagonal, reverse, micro and fast at scales1/0.6:
**120 measured gestures and 24 excluded warmups**. Source hashes and session match
across the three artifacts; the first run has different setup/protocol hashes.
Normal/Alt comparisons stay within each complete case/run, never across those
preparation versions as an A/B timing population.

Preparation also deduplicates the initial preseed by family/N: different scales
and trajectories share that fixture identity. Per-case reset/seed behavior remains
explicit and outside measurement. Test-only `verifySeedAfterTimeout.mjs` handles
only a PATCH rejection named `TimeoutError` or `AbortError`: it does not retry the
write, but makes one authenticated GET bounded to five seconds. Acceptance requires
the exact fixture owner/session and `isDeepStrictEqual` equality of all expected
Firestore REST fields, including scalar types and timestamp strings. Missing,
extra, coerced or normalized-equivalent fields are rejected. A failed verification
rethrows the original error; successful exact readback is recorded in
`manifest.seedResponseReconciliations`. Its 14/14 tests passed, including mismatch,
read-failure and original-error cases. This is evidence about ambiguous setup
responses, not a product persistence fix or a change to the measured gesture;
helper/runner hashes record the preparation version.

All 60 Normal/Alt repetition pairs have the same recorded client-displacement
sequence. The analysis pairs 6240 native-input/motion observations without pointer
coordinate mismatches (60 samples per gesture, except fast with 12). In these 120
gestures, final node position equals the last recorded motion position; strict
transient cleanup still fails 120/120. This adds UX observations, not a replacement
for the separate 160/180 consecutive-handoff acceptance matrix.

The table reports pooled p95/maximum magnitude of the local-node-anchor displacement
minus recorded cursor displacement in screen pixels, five gestures per arm. It is
not text-AABB alignment error or cursor-to-display latency. Signed X/Y ranges remain
in `real-ux-residual-table.md` and raw references are retained.

| Trajectory | Normal scale1 p95/max px | Normal scale0.6 p95/max px |
| --- | ---: | ---: |
| Horizontal | 28.312 / 31.824 | 18.152 / 21.683 |
| Vertical | 0.558 / 3.785 | 9.864 / 23.856 |
| Diagonal | 26.232 / 30.866 | 17.963 / 20.760 |
| Reverse | 29.771 / 31.727 | 27.523 / 35.163 |
| Micro | 9.765 / 9.765 | 5.873 / 5.873 |
| Fast | 29.866 / 29.866 | 25.137 / 25.137 |

Alt has stable small reference offsets: p95/max magnitude 0.558/0.558 px at scale1
and 1.072/1.072 px at scale0.6, except vertical/scale1 with maximum 3.785 px in
both arms. These offsets are not labeled physical lag. No sampled axis step
opposes cursor direction above the analysis epsilon of 0.5 screen px; this does
not prove absence of perceived jitter. Two-axis magnitudes cannot be compared
directly with uniaxial snap thresholds. Different event timing can change behavior
even when the spatial sample sequence matches.

The observer API can be installed with `realSamples.version:1` while unchanged B
source emits no private samples. Collector installation is not source-instrumentation
coverage: absent callback/snap outcomes and lock identity/age remain unavailable
(`null`), not zero work. No browser residual is attributed to a 120 ms lock age or
used to select a new hysteresis value; the separate controlled-clock replay remains
the policy-boundary evidence. The updated analyzer explicitly tests installed
`version:1`/empty samples with `sourceHashes.privateInstrumentation:false`.

Both immediate cases are excluded from the complete UX population. At scale1 the
partial run records two warmups and one Normal repetition; that Normal changes Y
by snapping while requested X displacement is absent, so it is not successful
horizontal/center motion despite satisfying a generic nonzero-movement check.
The subsequent Alt attempt fails actual movement. The fourth artifact,
`B-ux-immediate06-lastpos-v1-real-diagnostic-ux`, reproduces the same partial
sequence at scale0.6 and remains incomplete; neither case is pooled into the 120.

**Confirmed native-drag cache defect after undo:** the scale0.6 readbacks retain
the same Konva node id31. The first warmup Alt moves `(240,120)` to `(320,120)`
and stores `_lastPos=(320,120)`. Undo returns the node to `(240,120)` while leaving
that cache unchanged. The next single-event gesture requests `(320,120)` again;
`Konva.Node._setDragPosition` compares only `_lastPos` with that requested position
before calling `setAbsolutePosition`, so it skips the write although the current
node is elsewhere. Normal subsequently changes Y to112 through snapping while X
stays240; the next Alt retains `(240,120)`. Browser readbacks establish the same
node, stale cache and skipped destination; they do not trace the internal guard
branch. The installed Konva9.3.20 method reproduces that guard in **3/3 separate
characterization tests**, with different-destination and fresh-node controls.
Root and isolated `Node.js` have identical SHA256. Together these establish the
scale0.6 mechanism; the matching scale1 failure lacks this detailed
cache capture and must not be presented as a separately instrumented confirmation.
This is Konva's native position cache, distinct from the SNAP01 guide-target cache
and from the manual multi-selection activation-origin issue above. Preserve the
failing criterion and fix/revalidate the appropriate native-drag/undo lifecycle
only in a separately authorized product change. No extra activation move masks it.

`native-last-position-after-undo-report.json` preserves source anchors, browser
readbacks, limits and the characterization log. Its SHA256 is
`6c03a44b67de0e3821376072cf2405461ad7ed7a67c53ffb2486f6cec73265a0`.
The three tests exercise the installed method without assigning `_lastPos` or
replacing the tested method. They characterize the defect; they do not fix it or
turn the failed browser cases into a pass. They are separate from the 33 analyzer
tests below.

Observer overhead and the partial-case failures
exclude claims of full 14-case acceptance, production performance or device UX.

Controlled-clock replay was rerun against current source into the new
`ux/guide-ux-evidence-phase3b-20261015.json`, preserving the Phase3 artifact.
It records 15 source/helper/Konva hashes, 12 boundary probes at ages119/120/121ms
and 16 hook trajectories at scales1/0.6, identical across five deterministic
repetitions. Activation remains 10/6 screen px (element/section); release is
18/14 px after the initial window, expanded by1.75 through age120ms inclusive
to31.5/24.5 px. Old-lock release and acquisition of another nearby candidate are
distinguished. These are policy assertions using a controlled clock and node
doubles, not five independent hardware/performance measurements. No tolerance,
hysteresis or calibration default changed. The local analysis suite has **33
distinct tests passing** across eight files; repeated earlier runs are not added.

Final operational closure is recorded separately from functional acceptance.
Ctrl+C through the original owning session left the canonical wrapper reporting
exit3, unable to confirm its process-tree shutdown; that failed report and the
original marker remain unchanged. Independent checks in
`closure-poststop-verification-20261015.json` then found all 13 recorded owned PIDs
absent, all eight canonical ports free and zero owned Chrome processes. This does
not relabel the wrapper result as PASS. Concurrent root Hosting-cache,
configuration and SEO/landing changes were preserved. Hash evidence in
`closure-isolated-config-provenance.json` confirms the measured runtime used the
frozen B configuration/source, not the later root configuration; it is provenance
evidence, not an operating-system-wide access trace.

### 5.10 Phase 3C: Drag Lifecycle Corrections (2026-10-15)

This implementation addresses the three functional failures recorded in 5.9;
the Phase 3B measurements and failed cases remain historical evidence. It does
not implement PERF-02, calibrate snapping, or establish an FPS improvement.

- **Repeated native destination after undo/reconciliation:** Konva 9.3.20 keeps
  its private `_lastPos` across gestures even when React restores the node pose.
  `drag/konvaDragSession.js::resetNativeDragPositionCache` invalidates that cache
  at an accepted native start, before Konva applies the first movement. The
  callers are `startDragIndividual`, the new native leader branch of
  `startDragGrupalLider`, and Gallery's specialized individual start. Countdown,
  text, image, shapes and persisted group roots reuse those existing owners.
  Suppressed followers, duplicate starts and manual arming do not reset it.
  Native bounds constraints and redundant-write suppression within the gesture
  remain intact. No coordinates, history entries or persisted metadata are
  changed to compensate. This small compatibility adapter depends on a private
  Konva field: rerun the installed-Node regressions on any Konva upgrade, and
  remove it when the dependency itself safely scopes the cache to a gesture.
- **Residual visual selection:** the composer's effect publishing
  `dragVisualSelection` now observes `dragOverlayBoxFlowSession`. Previously the
  auxiliary IDs could clear while the overlay was still settling; its later
  retirement did not rerun the effect, leaving the runtime's IDs/session/drag ID
  behind. Retirement now reruns the effect, which publishes the empty state
  through the existing owner; this is not a new synchronous teardown writer.
  Readiness, post-paint handoff and session-identity guards are unchanged.
- **Persisted-group handoff:** real-editor validation exposed a second cause of
  retained ownership. The group uses `SelectionBoundsIndicator`, rather than a
  generic Transformer; that destination was excluded from readiness and could
  not mount while the overlay waited for it. `SelectionTransformer` now prepares
  the existing group indicator in a hidden parent during the readiness probe,
  reads its applied bounds through its existing API, and uses the same session
  and post-paint gate. The probe validates the geometry actually applied by the
  selected renderer, retaining its existing source-pure fallback policy. It does
  not claim that every selected-indicator bound is live-node geometry. The
  destination becomes
  visible only when overlay ownership is released. A bounds-ready notification
  reevaluates the existing gate after a late mount. This does not introduce a
  geometry authority, bypass readiness, or add a frame to movement/snapping.
  The shared gate retains its legacy `transformer-primary`/`transformer-live`
  diagnostic labels; for `renderMode: "line-indicator"`, the bounds source is
  the mounted indicator's applied digest, not a generic Transformer.
- **Immediate manual multiselection:** crossing the existing activation
  threshold now retains the pointer-down origin and applies the first preview
  in that same `updateManualGroupDragSession` call. The existing renderer handles
  `activatedNow: true` with `mode: "preview"`: it starts the lifecycle and
  forwards the moved bounds synchronously. Release at that same pointer commits
  the displacement instead of zero. Pointer ownership, touch scroll-intent
  policy, thresholds and the existing batched draw are unchanged; no additional
  animation frame or second movement is required.

Executable regression evidence lives in `drag/konvaDragSession.test.mjs`,
`drag/dragGrupal.test.mjs` and
`textSystem/render/konva/dragVisualSelectionLifecycle.test.mjs`, plus
`textSystem/render/konva/preservedGroupHandoff.test.mjs`. Before changes,
four native individual cases, one native group case, seven manual activation
cases and four visual-selection cases failed. The native tests exercise the
installed Konva methods; the selection tests execute production callbacks and
dependency lists against the real selection runtime. Logs, the preserved initial
working tree, hashes and isolated browser evidence belong to
`.local-isolation/drag-phase3c/`. They are local artifacts, not production assets.

The resumed real-editor run preserved 160 gestures in
`runs/phase3c-families-v1-real-timing-handoff/results.json`: 140 passed strict
cleanup and 20 persisted-group gestures retained the overlay owner. All 64
history checks and 32 reloads passed; this failed run is not acceptance evidence.
`persisted-group-residual-handoff-report.json` preserves those failures. The
group regression first reproduced four failing checks; the late-mount case then
failed without the bounds-ready callback. All ten group regressions pass after
the scoped fix. An exploratory live-only fallback expectation was discarded
after checking the selected-phase contract; it is not an additional defect.

The first V2 all-family run stopped during preparation after 45 strict passes:
the next dashboard navigation stayed on `DashboardHomeStartupLoader` for the
existing 120-second readiness deadline, before any canvas mounted. The raw
`phase3c-families-v2-real-timing-handoff` run remains incomplete and excluded from
acceptance. No browser error or blocked external origin was recorded; that does
not establish the cause of the startup wait. The same rotated/zoom1/Alt cell
opened in a fresh browser with identical source/protocol and no timeout change.
Complete family batches are used for the subsequent validation; the partial 45
gestures are not substituted into the acceptance matrix. See
`families-v2-startup-timeout-report.json` for the retained failure evidence.

Automated checks after the group handoff correction used Node 20.19.5:
319/319 related regressions, 76/76 infrastructure checks (plus the intentionally
opt-in local-browser test skipped in that unit invocation), 16/16 acceptance
analyzer checks, and 11/11 Chromium offline cases. The known positioning suite
was run separately: six checks pass and the existing `0.1 !== 0.502` case fails.
Syntax parsing of the 13 affected code/test files also passes. The offline
scene and unit checks do not substitute for the real-editor runs below.

The final scoped real-editor acceptance passes in `acceptance-final-v2.json`:
180 consecutive handoff gestures (nine families, zoom1/0.6, Normal/Alt, five per
cell), 72 undo/redo checks, 36 reloads without reseeding, and 20 one-move repeated
destinations after undo plus four warmups. All ten accepted runs are complete;
the analyzer reports zero errors and zero missing cells. Fixtures contain ten
objects and exercise shape, text, 45-degree text, image, Gallery, Countdown,
persisted group, multiselection and multiple sections. This is functional
acceptance in Next development, with real React/Konva, emulated Firebase and
synthetic CDP input; it is not the 1/10/50/100-object performance benchmark.
The environment used Node 20.19.5, Chromium 138 headless on Windows, DPR1 and
viewport1365x1100. `final-browser-runtime-evidence-v2.json` verifies nine
identical protocol hashes, 391 identical runtime source hashes, and the six
product files matching root, prepared copy and runtime.

`persisted-group-v2-owner-verification.json` additionally verifies the actual
overlay-to-selected-indicator node-identity change in all 20 group gestures.
`gallery-v2-local-data-verification-full-snapshots.json` records 56 comparisons
of complete Gallery objects, excluding only x/y, across gestures, history and
reload: all pass. That fixture uses two background cells in `grid_1x2`; it does
not certify every Gallery media/crop/layout combination. Position summaries and
persisted-pose polls are not full-object evidence; the latter's local-data check
comes from reload without reseed. `resume-visual-review.json` records screenshot
review separately from executable assertions and includes both historical V1
captures and explicitly identified accepted V2 captures.

V2 closure retains the supervisor's Ctrl+C exit1 and unchanged `stopped:false`
marker in `v2-supervisor-stop-result.json`. Independent OS checks in
`v2-closure-process-verification.json` and `v2-closure-port-verification.json`
confirm all 13 owned PIDs absent, zero owned Chrome processes and all eight
loopback ports free. The independent closure evidence does not relabel the
supervisor result as successful. No commit, deploy or production operation was
performed for this phase.

The real-editor protocol now distinguishes injected instrumentation declarations
from marker strings/comments using the existing TypeScript parser. Its source
inventory includes the runner and instrumenter themselves; a substring search
previously rejected those harmless literals before interaction could start.
All source hashes and the rejection of actual injected probes are retained.
Immediate group checks additionally require the full requested X/Y movement of
the leader before pointerup and after release, using only CDP rounding tolerance.
The follower is observed after release, while unit regressions cover both members
before release. Screenshots are taken after settling, outside the immediate
gesture. These infrastructure changes do not alter production drag behavior.

The known `canvasObjectPositioning.test.mjs` mismatch (`0.1 !== 0.502`) remains
separate and unchanged. Physical mouse/trackpad/touch feel and production-build
performance still require validation; passing synthetic interaction tests must
not be reported as presentation-latency or FPS evidence.

### 5.11 Cursor-following Latency Investigation (2026-10-16)

Status: initial ten-object characterization, **not a demonstrated product latency fix**.
No product source, snapping thresholds, hysteresis, coordinate contract or drag
scheduling changed. Sustained cursor-following lag was not reproduced with the
synthetic input below; physical mouse/trackpad and presentation remain open.

The real editor ran with the canonical demo Auth/Firestore/Storage/Functions
session, clean environment and blocked external destinations. Node20.19.5,
Chromium138.0.7204.157 headless, Windows/i5-10210U, DPR1, viewport1365x1100,
ten synthetic objects, CSS zoom1/0.6, Normal/Alt, text/shape/image. The production
export (`cyj1IG86SRa-ylE5LJBOV`) was built directly inside the isolated workspace,
without Hosting hooks. A guarded request interceptor served its verified files
on the existing localhost origin; missing files did not fall back to Next dev.
This is a local production build, not a production-services test.

`runs/production-baseline-v2-five-real-timing-latency/results.json` contains
72 strict passes: 60 measured gestures and 12 warmups, five per cell. Each path
combines slow horizontal movement, fast movement, diagonal motion and reversal,
away from all guides; zero guide/snap corrections were checked. CDP delivery is
serial and can fall behind its requested schedule. The observer distinguishes
event receipt, first native activation, subsequent native writes and scene draw
events; it projects the pointer-down local anchor through offsets/transforms/CSS
once. It does not measure physical input or display presentation.

With `--disable-gpu`, subsequent input-to-node p95 was 0.2–0.3ms, complete
capture-to-bubble p95 0.8–1.8ms and node-to-scene-end p95 0.6–2.0ms across the
12 cells. Those measurements include observer work. Spatial residual was at most
2.84e-14px and no changed pose lacked its corresponding scene draw. Repeated
quantized pointer coordinates legitimately need no new draw. Root React commits
concentrated at startup; these counts are not component render durations.
Direct snapping/cache/overlay-handler timings were not instrumented in this
baseline; Normal/Alt differences cover the entire changed path.

The full held windows also exposed genuine pauses: every measured image gesture
had a 64–262ms LongTask before native drag activation. These are not discarded as
warmup or hidden by the low steady-handler percentiles. Two late LongTasks also
occurred in the shape/0.6/Normal cell; their cause was not established. The
expanded image trace locates 69.105ms wall/66.979ms CPU inside Chromium
`LayerTreeHost::DoUpdateLayers`, within an 83ms task; pointermove and Konva RAF
work were much smaller. Four Skia filter cycles are present. The four shadowed
`ImageCropOverlay` controls are a candidate, not a proven node-level cause.

A separate configuration control removed only `--disable-gpu` and retained the
same export, fixture and observer: five measured image/Normal/zoom1 gestures
plus warmup passed. ANGLE Intel UHD Graphics/D3D11 reported enabled canvas,
compositing and rasterization. Pre-activation LongTasks fell from 5/5 to 0/5 and
RAF gaps above 25ms from five to zero. Steady input-to-node p95 stayed 0.3ms.
RAF median changed from 16.7ms to 22.0ms: this is **not an FPS improvement or a
before/after product optimization**. The result limits extrapolation of the
disabled-GPU baseline; it does not explain the user's physical-device symptom.

Development startup has a separate cost. One traced text activation spent
41.78ms of 45.7ms inside `commitStartupDragOverlayRender`/`flushSync`, dominated
by development JSX/React element creation. Production activation medians were
4.5–6.5ms in the final baseline. Mode comparisons are not product improvements.
No evidence justified changing PERF-02, adding forced draws, delaying snapping,
or weakening the first-frame and handoff gates.

All artifacts live under `.local-isolation/drag-latency-20261016/`:
`latency-findings.md/json`, `final-production-summary.json`, the raw runs,
profiles, source/protocol hashes and `manual-real-input.md`. ObserverV1 image
timings are excluded: its cleanup removed a runtime-installed image diagnostic
wrapper. V2 observes public `beforeDraw`/`draw` events instead; its local
regression went from 3/4 to 4/4. Earlier raw evidence remains intact. Node20
related regressions pass 319/319; the known positioning suite remains 6 pass,
1 fail (`0.1 !== 0.502`). The local manual snippet passes guards and installation/
arm/finish smoke without input. No physical gesture has been validated. The
next discriminating check is that instrumented manual reproduction on the
affected device. The supervisor's Ctrl+C returned exit1; its result is retained
separately from the independent closure check confirming 13 owned PIDs absent,
zero owned Chrome processes and all eight canonical ports free. See
`closure-supervisor-stop-result.json` and `closure-independent-verification.json`.

### 5.12 Long Invitation Canvas Cost (2026-10-16)

The subsequent user reproduction uses Chrome/trackpad, approximately 30 objects
and eight sections; short invitations do not show the symptom. A production-local
control held the same 30 objects and their positions in the first section, then
added seven empty 1000px sections. Chromium138, default enabled GPU backend,
DPR1 and zoom1 reproduced pauses with both text and image, including Alt and no
guide crossings. Five measured gestures plus warmup per cell passed position,
handoff, persistence and undo checks (48/48 total). Scene and hit canvas size per
layer grew from 800x1000 to 800x8000. Adding sections also adds their backgrounds
and controls; this first comparison alone does not attribute the cost to pixels.

The controlled native trace identified a specific avoidable cost in installed
Konva9.3.20: `Layer.drawHit()` clears the whole hit canvas before its container
checks hit eligibility. Repeated clears of an already-empty bitmap cause deferred
renderer-main `CanvasRenderingContext2D::FinalizeFrame` / `SkCanvas::drawRect`
work, outside the JavaScript draw callback. In one profiled gesture per family,
suppressing only redundant empty clears removed all 105 text / 56 image slow
`drawRect` spans. Inclusive FinalizeFrame CPU fell from 712.647 to 0.588ms for
text and 305.443 to 1.126ms for image, with essentially unchanged visible draw
counts. These are native CPU totals for profiled windows, not handler latency,
presented FPS or a guarantee of equivalent savings on physical trackpad input.

`CanvasElementsLayer` now owns `createKonvaLayerHitDraw` inside its existing hit
draw adapter. It preserves the first ordinary clear, then remembers only an empty
hit bitmap, its canvas identity and dimensions. It rechecks Konva's live hit
eligibility on every call. An eligible layer can also be empty if it has no own
cache or clip function and every direct child is hit-ineligible; custom per-node
`drawHit` overrides fall back to normal drawing. A layer clip function may paint
before children, so it cannot use that shortcut. Eligible draws, custom arguments,
freeze, canvas replacement, dimensions and exceptions invalidate empty evidence.
The next eligible draw rebuilds the hit graph normally. Product consumers do not
write directly to these hit canvases or override child hit drawing; future such
consumers must preserve this invariant or bypass the shortcut. This state is not
a geometry/candidate cache. Scene drawing, scheduling, listening, coordinates,
snapping and persistence are unchanged; `CanvasGuideLayer` has a separate adapter
and is outside this change.

The laboratory timing contrast remains deliberately qualified. A1 / empty-clear
guard / unchanged A2 gave synthetic event-age p95 133.9/101.9/73.2ms for text and
115.8/106.4/105.2ms for image. RAF callback p95 was 145.7/62.4/83.3ms and
104.5/83.3/62.6ms respectively. A2 confirms substantial variation without a
product change: these figures do not establish a reliable overall latency or FPS
gain. Spatial residual was zero; the remaining pauses are not stale coordinates.
The concrete native work removal justifies the bounded optimization, while the
user's complete latency acceptance remains open. PERF-02 and snapping
calibration are unchanged.

The integrated production-local build `oDrUuoloXZ9lZPPSrV-fH` passed 24/24
benchmark gestures without the laboratory wrapper. Its exact source comparison
contains only the layer adapter change and new hit-draw helper. The original
391-file runtime filter omitted `CanvasElementsLayer`; its original bytes were
therefore verified separately against the complete 1314-file copy manifest,
rather than treating an added hash entry as proof of unchanged source. The
Functions entrypoint adjustment is the same canonical isolation step in both
copies, not an optimization difference.

Four final profiled product gestures (two warmups and two measured) passed and
confirmed zero expensive steady `drawRect` spans without a laboratory wrapper.
With the same 54 steady inputs and visible draw counts, FinalizeFrame CPU totals
were 1.209ms for text and 0.954ms for image; event wall-time p95 was 0.052/0.056ms.
This confirms the native cost removal in the integrated build, not only in the
intervention. Scheduling/GPU pauses remain in the trace.

The final product timing still does not demonstrate a reliable global latency
gain. Continuous capture-to-bubble p95 (including observer work), original to
product, was text Normal 19.2 to 12.1ms, text Alt 5.3 to 6.5ms, image Normal 12.4
to 8.5ms and image Alt 5.8 to 4.4ms. Synthetic event-age p95 was 110.2 to 109.0,
133.9 to 133.7, 133.1 to 142.6 and 115.8 to 134.8ms respectively. The unchanged
A2 baseline and remaining long gaps prohibit interpreting the favorable cells
as a general cursor-latency improvement. Error against each processed pointer
sample remained zero. Direct snapping, cache and overlay-handler times were not
instrumented in this timing population; scene boundaries are not presentation.

Validation with Node20.19.5: 319/319 related regressions and 17/17 new hit-draw
tests pass. Real Konva pixel checks pass five cases (6/6 including parent), and
the previous offline suite passes 11/11 including parent. Separately, 20/20
strict full-editor gestures cover rotated text, Gallery, Countdown, persisted
groups and multiselection at zoom1/0.6, sweep and immediate release, plus undo/
redo and emulator reload for each family/zoom cell. The known positioning suite
remains 6 pass, 1 fail (`0.1 !== 0.502`), unchanged. These automated functional
results preserve the bounded optimization without declaring the physical lag
resolved. No commit, deploy or production-service operation was performed.

Evidence and reproducible protocols are under
`.local-isolation/drag-latency-20261016/scaling-20261016/`: `scaling-findings.md`,
`hit-clear-aba-comparison.md`, `hit-clear-native-causal-comparison.json`,
`product-native-causal-comparison.json`,
`product-before-after.md`, `product-compact-metrics.md`, frozen fixtures/runners,
raw results, traces and source hashes. The Chrome155 installed
on this machine failed full-editor local authentication with an LNA check;
exact-origin permissions and separate local GET/POST probes did not resolve the
full scenario. No Chrome155 gesture or physical presentation result is claimed.

## 6. Source of Truth and Ownership Map

| Visual artifact | Authoritative owner | Derived readers | Imperative writers | Ownership changes during lifecycle | Duplicated ownership risk |
| --- | --- | --- | --- | --- | --- |
| Selection box | Selected-phase: `SelectionTransformer` or selected-phase `SelectionBoundsIndicator`. Drag-phase: composer-owned controlled drag-overlay bounds. | `selectionVisualModes`, hover suppression, handoff guards, debug traces | Composer calls `applyControlledBounds(...)` / `clearControlledBounds(...)` on drag overlay | `hover -> selected-phase -> drag-overlay -> selected-phase/idle` | Critical |
| Transformer | `SelectionTransformer.jsx` attached to live selected nodes | `selectionVisualModes`, selected-phase ready/visible tracking | Transformer attach/detach logic, resize/rotation handlers | Detached during inline edit, predrag, drag, and settling; reattached after handoff | High |
| Hover indicator | Hover id in selection UI state rendered by `HoverIndicator.jsx` | Visual mode resolution, globals bridge cleanup | Composer boundary clears, `window.setHoverIdGlobal`, `HoverIndicator.forceHide(...)` | `idle <-> hover`, but suppressed by selected/drag phases | Medium |
| Inline overlay | Inline mount session + swap ack state in `useInlineSessionRuntime.js`; visual ownership filtered by `resolveInlineCanvasVisibility.js` | Text controller, DOM backend, Konva visibility adapter | Swap requests, finish/cancel, focus controller | `konva -> dom-preview -> dom-editable -> konva` | Critical |
| Snap guides | `useGuiasCentrado.js` guide state rendered by `CanvasGuideLayer.jsx` | Drag-overlay post-snap sync, live node drag path | `mostrarGuias(...)`, `limpiarGuias(...)`, guide layer imperative API | Appear only during eligible individual drag | Medium |
| Centering guides | Same as snap guides | Same as snap guides | Same as snap guides | Same as snap guides | Medium |
| Text bounds | Authoritative owner is live Konva text geometry via `resolveAuthoritativeTextRect(...)`; explicit object-data fallback is allowed only where the phase contract permits it | Hover, selected-phase bounds, drag overlay, inline projection, snap | None as a standalone owner; consumers recompute from live node or explicit phase-legal fallback | Shared across hover/selected/drag/inline consumers | Critical because every text surface must stay on one geometry basis |
| Drag bounds | Composer-owned controlled overlay snapshot during drag | Selected-phase handoff, drag readiness, debug traces | Composer controlled-sync and post-snap sync | `predrag -> drag -> settling` | Critical |

Primary duplicated-ownership hotspots in the current code:

- selection box
- inline visual ownership
- text bounds

## 7. Coordinate Systems and Geometry

### 7.1 Active Coordinate Spaces

The current runtime uses several coordinate spaces at once.

1. Persisted section-local object space
   - object `x`
   - object `y`
   - `seccionId`
2. Persisted normalized vertical space for `altoModo: "pantalla"`
   - object `yNorm`
3. Section-order-derived stage space
   - section offsets computed from `calcularOffsetY(...)`
   - stage Y resolved in the composer
4. Konva live-node bounds space
   - `getClientRect({ relativeTo: stage })`
5. Selection polygon space
   - rotated polygons from `buildSelectionFramePolygon(...)`
6. Viewport / DOM overlay space
   - inline projection utilities convert stage-relative geometry into viewport/body coordinates

### 7.2 Current Projection Utilities

Important geometry/projection helpers in active use:

- `resolveObjectStageY(...)`
- `resolveSelectionUnionRect(...)`
- `resolveNodeSelectionRect(...)`
- `resolveSingleTextSelectionVisualBounds(...)`
- `resolveAuthoritativeTextGeometry(...)` / `resolveAuthoritativeTextRect(...)`
- `resolveSelectionFrameRect(...)`
- `resolveInlineStageViewportMetrics(...)`
- `projectInlineRectToViewport(...)`
- `getInlineKonvaProjectedRectViewport(...)`

### 7.3 Current Bounds Calculation Rules

Current text rule:

- `konvaAuthoritativeBounds.js` owns the measured local Text box and its projection. `resolveAuthoritativeTextGeometry(...)` returns `localRect`, the six-value `transform` matrix, transformed corner `points`, and their axis-aligned enclosing `rect` (AABB). Rotation, signed scales, offsets and inherited transforms participate in that projection. This is the measured layout box (including configured width), not a tight glyph-ink boundary or a shadow/stroke envelope. A measured zero dimension, such as empty text during inline editing, retains its matrix; missing, negative or non-finite dimensions do not acquire a fallback local box.
- Canvas consumers default to coordinates relative to `node.getStage()`. `resolveAuthoritativeTextRect(...)` is the compatibility wrapper returning that geometry's `rect`; it no longer treats a rotated box as an untranslated width/height pair.
- Text selection polygons consume the same authority through `buildSelectionFramePolygon(...)`. `resolveTransformedTextSelectionPolygon(...)` supplies the shared transformed-axis decision to hover and `SelectionBoundsIndicator.resolveSelectionBounds(...)`, including inherited rotation with zero local rotation; unions and snap anchors use the AABB. If live text authority is unavailable during drag, consumers fail closed instead of silently substituting a generic client rect.
- DOM projection requests `relativeTo: null`, which includes native Stage transforms. `inlineGeometry.js` applies the container/CSS viewport conversion once to this geometry and exposes the corresponding viewport transform. The semantic backend uses local dimensions plus that matrix for rotated, scaled, skewed or reflected text and for any native Stage transform; it does not rotate the already enlarged AABB again. Native Stage translation also takes the existing transformed/native-caret path because synthetic decorations only invert CSS projection. Ordinary text at CSS zoom retains its existing projected-box path.
- Explicit object-data fallback remains governed by phase and source-purity rules below. These changes do not alter persisted text positions, dimensions or rotation fields.

Verification anchors for GEO03/SNAP01 are
`src/components/editor/canvasEditor/konvaAuthoritativeBounds.test.mjs`,
`src/components/editor/canvasEditor/textGeometryConsumers.test.mjs`,
`src/hooks/useGuiasCentrado.cache.test.mjs` and the optional Phase 2 cases in
`src/drag/dragPhase1.browser.test.mjs`; commands and limits belong to the
[editor regression checklist](../testing/EDITOR_REGRESSION_CHECKLIST.md).
Pure tests use real Konva matrices with supplied dimensions and a single-render
hook lifecycle adapter. The offline browser scene adds real React/Konva Text
measurement, local-font remeasurement and Gallery rendering. It does not certify
the full editor's font-loading lifecycle, inline focus/caret, or selected/drag/
settling handoff; those remain interaction checks in the real editor.

Current selection union rules:

- `requireLiveNodes: true`
  - returns `null` if any selected object lacks a live rect
- `requireLiveNodes: false`
  - resolves the frame as all-live when every selected object has lawful live geometry
  - otherwise resolves the frame as all explicit object-data fallback when fallback is allowed for that phase
  - mixed live-node plus object-data union frames are no longer allowed
  - if no lawful full-frame source exists, the union fails closed

Current hover rules:

- text uses text-specific visual bounds
- gallery prefers the live frame through `resolveNodeSelectionRect(...)`; object size plus absolute group position is only its explicit hover fallback
- countdown can use `.countdown-hitbox`
- rotated image/shape/CTA paths can use polygons

### 7.4 Where Drift Can Occur

Known current drift boundaries:

- section-local persisted coordinates vs stage-space drag geometry
- `y` vs `yNorm` conversions for `altoModo: "pantalla"`
- selected-phase fallback bounds vs drag-phase live-only bounds
- guide snap mutating the live node before overlay resync
- DOM overlay projection depending on current stage container viewport metrics
- text geometry readers needing an explicit fallback decision when authoritative live text geometry is unavailable

## 8. Temporal Execution Model

### 8.1 Same-Gesture Drag Startup

Current execution order for same-gesture drag startup is:

1. pointer press enters `ElementoCanvasRenderer.handlePressStart(...)`
2. press-time selection decision runs
3. for touch-like pointers, the shared intent gate confirms drag; mouse remains threshold-based
4. `maybeFastStartDrag(...)` requests predrag visual selection
5. `beginPredragVisualSelection(...)` allocates drag-overlay session state and clears hover
6. React commit mounts or updates the drag-overlay session state
7. actual drag samples arrive
8. `syncControlledDragOverlayBounds(...)` reads live node bounds
9. first eligible `controlled-sync` may make the overlay visible
10. Konva draw reflects both dragged node movement and the drag-overlay bounds indicator
11. guide evaluation can later adjust node position and trigger post-snap overlay resync

Timing-sensitive boundary:

- visibility ownership transfers at predrag, but the overlay is not allowed to become visible until the first valid controlled-sync frame

### 8.2 Drag End and Selected-Phase Handoff

Current execution order around drag end is:

1. drag end callback enters composer settle logic
2. `updateDragOverlayBoxFlowSessionPhase("settling", ...)` freezes the last lawful drag-overlay geometry as the settle snapshot
3. the interaction coordinator ends the drag and runs its short settle window
4. `queuePostDragUiRefresh(...)` waits for that settle window, then resolves deferred selection repair only if the queued `dragId` and `interactionEpoch` still match the active settle session
5. while the drag overlay remains mounted, the selected-phase destination may mount underneath it
6. for transformer-backed destinations, `SelectionTransformer.jsx` can run a hidden readiness probe under the overlay once selection repair is complete and the attached nodes match the expected handoff selection
7. selected-phase readiness and the extra composer-level post-paint handoff confirmation both complete before the overlay handoff guard clears
8. the drag overlay is then removed
9. only after overlay removal does selected-phase become the user-visible owner again

Timing-sensitive boundary:

- the drag overlay remains the sole visible owner during settling even though the selected-phase renderer may already be mounted and proving readiness underneath it

### 8.3 Inline DOM/Konva Swap

Current execution order for inline swap is:

1. editor enters inline editing state for a text id
2. `CanvasInlineEditingLayer.jsx` mounts the DOM-side backend; a date/time-linked session mounts its anchored native input and keeps Konva as visual text authority
3. `useInlinePhaseAtomicLifecycle.js` prepares fonts and offset data
4. it emits `ready_to_swap`
5. `useInlineSessionRuntime.js` commits swap state in a microtask
6. render authority becomes `dom-preview`
7. RAF-based post-paint stabilization runs
8. overlay reports `preview_ready`
9. authority becomes `dom-editable`
10. caret becomes visible and editable focus is reclaimed
11. finish/done/cancel clears the mount session and returns authority to Konva

Steps 3-10 apply to the text DOM/Konva swap. The typed linked-field branch uses
the same `editing.id`, finish boundary, and critical-action drain without taking
visual text authority away from Konva.

Timing-sensitive boundaries:

- font readiness or timeout
- microtask swap commit
- RAF-based paint stabilization
- focus reclaim after authority transfer

### 8.4 Guide Evaluation

Current guide evaluation order is:

1. drag sample stores latest guide payload
2. `scheduleGuideEvaluation(...)` invokes the flush synchronously
3. the flush consumes the payload within that drag sample
4. `mostrarGuias(...)` computes guide lines and may snap the live node
5. `guide-post-snap-sync` updates drag-overlay bounds if the session still matches
6. `CanvasGuideLayer` reflects the latest guide lines

Timing-sensitive boundary:

- evaluation, snap, post-snap reread and overlay resync share the drag sample; adding a guide-only RAF would violate the current interaction contract. The guide layer still has its own React/Konva rendering lifecycle.

## 9. Session and Identity Model

| Concern | Current identity model | Where it is created | Current risks |
| --- | --- | --- | --- |
| Drag interaction session | `buildDragInteractionSessionKey(sequence, dragId)` | Composer drag-start path | Redundant restarts can fragment one conceptual drag into multiple runtime sessions if guards regress. |
| Drag overlay box-flow session | `buildDragOverlayBoxFlowSessionKey(sequence, dragId, selectedIdsDigest)` | Composer predrag/drag-overlay path | If the selected-id digest diverges from the actual drag membership, overlay identity must collapse to `[dragId]`. |
| Drag visual selection | `{ ids, predragActive, sessionKey, dragId }` | Selection runtime mirror of composer state | Late cleanup can resurrect stale drag visuals if session matching fails. |
| Pending drag selection | `{ id, phase }` where phase is `predrag` or `deferred-drag` | Selection runtime during same-gesture drag | Lingering pending state can confuse post-drag selection repair. |
| Selected-phase identity | Effective `selectedIds` plus live attached nodes; no dedicated session id | React selection state + transformer attachment | There is no explicit durable selected-phase session token to compare against old handoff work. |
| Hover identity | Hovered element id only | Selection UI hover path | No session guard exists; stale hover cleanup depends on imperative clears. |
| Inline mount session | `id`, `sessionId`, `token`, `mounted`, `swapCommitted`, `renderAuthority`, phase metadata | `useInlineSessionRuntime.js` | Strongest identity model in the subsystem, but late acks still need to be ignored correctly. |
| Inline swap ack | Mirrors session/token/phase for swap coordination | `useInlineSessionRuntime.js` | Late or mismatched acks can target an old overlay session. |
| Guide evaluation request and target cache | Request carries drag-session identity; cache is scoped to session/stage/dragged node and validates target identity and live inputs | Composer request builder and `useGuiasCentrado.js` | New geometry must invalidate affected entries/locks before the synchronous sample; overlay resync still checks the active drag session. |

Current fallback identity logic:

- drag-overlay identity resolution can fall back from drag interaction session key to drag-overlay session key to selected-ids digest
- selected-phase visuals do not use a comparable explicit session token
- hover has id-only identity

This mismatch is one of the main reasons selection-box behavior remains timing-sensitive.

## 10. Visibility vs Existence Model

| Visual layer | When it mounts / exists | When it hides vs unmounts | When it is recreated | Stale-visual persistence risk |
| --- | --- | --- | --- | --- |
| Hover indicator | Exists as part of the UI overlay path while the stage is mounted | Can be cleared while component tree stays mounted; visibility depends on hover id and suppression | Reappears on next valid hover | Medium |
| Selected-phase transformer / bounds | Exists when selection UI path is rendered and mode is eligible | Can be hidden or detached during drag/inline/settling without full logical selection loss | Recreated or reattached after selection/interaction changes | High |
| Drag-overlay selection box | Dedicated drag-overlay layer exists with the stage; active overlay mounts/updates per drag session | Can remain mounted through settling/handoff even after pointer up | Recreated per drag-overlay session | Critical |
| Line controls | Exist only for eligible line selection states | Hidden when selection mode changes or line path is suppressed | Recreated on next eligible line selection | Medium |
| Guide layer | `CanvasGuideLayer` exists with the stage | Guide lines are cleared without unmounting the layer | Reused on next guide evaluation | Low |
| Hidden semantic text backend | Mounted when `editing.id` exists and a live node is present | Can remain mounted during preview/editable phases; unmounts when editing ends | Recreated for each inline session | High |
| DOM inline editor overlay | Mounted during active inline session | Visibility/authority changes before unmount; not every phase change unmounts it immediately | Recreated per inline session | Critical |

## 11. Documentation vs Code Mismatches

| Documentation claim | What the code currently does | Why it matters |
| --- | --- | --- |
| `DRAG_ALIGNMENT_GUIDES_ANALYSIS.md` described `scheduleGuideEvaluation` as effectively an immediate flush behind a scheduling name. | `CanvasStageContentComposer.jsx` now uses RAF coalescing when `requestAnimationFrame` is available and only falls back to immediate flush when RAF is unavailable. | Guide timing, lag, and overlay resync analysis change materially if scheduling is no longer immediate. |
| Older preview baseline references anchored themselves to `PREVIEW_SYSTEM_TARGET.md`. | The current preview source of truth is `PREVIEW_SYSTEM_ANALYSIS.md` plus the compatibility matrix/tests, not target-state docs. | Test/baseline readers must be sent to current behavior rather than intended architecture. |
| `inline-focus-rca-evidence.md` used `text-system-rules.md` as its architecture source. | The actual current-state inline architecture is distributed across the live runtime modules audited here. | Diagnostic notes need to point to a verified current-state source, not a mixed rules document. |
| `SELECTION_BOX_DRAG_BEHAVIOR.md`, `TEXT_GEOMETRY_CONTRACT.md`, `TEXT_VISUAL_BOX_AUTHORITY.md`, and `text-system-rules.md` acted as separate current-state contracts. | Current behavior is split across composer state, selection visual modes, transformer suppression, inline runtime, hover logic, and guide scheduling. No single one of those deleted documents matched the running system by itself. | Multiple partially-overlapping contract docs create contradictions faster than they reduce ambiguity. |
| Target/gap docs (`*_TARGET.md`, `*_GAPS.md`) sat next to current-state docs without strong separation. | The code contains current behavior plus compatibility/fallback branches that do not match target-state documents exactly. Existing execution-plan docs are now historical records, not current authorities. | Readers could mistake desired architecture for implemented behavior. |

## 12. Failure Taxonomy

| Failure class | Current architectural cause |
| --- | --- |
| `stale geometry` | Different consumers read different geometry sources: live nodes, fallback object data, projected DOM rects, or frozen settle snapshots. |
| `flicker` | Visual ownership changes across hover, transformer, drag overlay, and inline DOM authority are not one atomic renderer swap. |
| `hover persistence` | Hover has id-only identity and multiple delayed cleanup paths. |
| `delayed teardown` | Drag-overlay and transformer teardown are intentionally delayed by settle and handoff guards. |
| `startup desync` | First visible drag-overlay frame correctness depends on `controlled-sync` winning over seed/replay/fallback paths. |
| `session resurrection` | Late settle/cleanup/swap work can target a no-longer-current drag or inline session if identity checks regress. |
| `guide / snap lag` | Evaluation and post-snap resync are synchronous; handler cost and the guide layer's rendering still require browser measurement. There is no current guide-only RAF delay. |
| `overlay / canvas mismatch` | DOM inline projection depends on stage viewport metrics and authority timing, while canvas visuals depend on live Konva geometry and suppression rules. |
| `text bounds mismatch` | Canvas AABBs, selection polygons and DOM projection must consume the same transformed text geometry in their declared coordinate spaces; generic client-rect fallback is not a drag-time substitute. |

## 13. Risk and Fragility Analysis

Current highest-risk interaction areas, ranked by severity:

1. Drag-overlay startup and handoff
   - correctness depends on one specific visibility boundary and delayed selected-phase handoff confirmation
2. Inline DOM/Konva authority swap
   - focus, caret, visual authority, and geometry projection are coordinated across multiple phase boundaries
3. Selection-box ownership split
   - selected-phase and drag-phase use different owners and different geometry tolerance rules
4. Text geometry consumers
   - hover, selection, drag overlay, snap, and DOM overlay now share the same authoritative text basis, but selected-phase still has an explicit source-pure object-data fallback path when live text geometry is unavailable outside drag
5. Guide/snap live mutation plus overlay resync
   - snapping is live-node mutation, not a pure preview calculation
6. Compatibility globals and custom events
   - external consumers and some internal consumers still depend on non-local imperative contracts

## 14. Missing Documentation

This audit reduces ambiguity substantially, but the repo still lacks a few useful supporting documents:

- a bridge/event glossary listing producers and consumers of each custom event and `window.canvasEditor` method
- a focused geometry/projection reference for stage-space to viewport-space conversion utilities
- a debug instrumentation guide for BOXFLOW and inline focus traces

## 15. Document Cleanup Plan

### 15.1 Delete

If these outdated or overlapping documents reappear, keep them out of the canonical current-state set or mark them deprecated. They have already been superseded by this document and the normative interaction contract:

- `docs/architecture/SELECTION_BOX_DRAG_BEHAVIOR.md`
- `docs/architecture/TEXT_GEOMETRY_CONTRACT.md`
- `docs/architecture/TEXT_VISUAL_BOX_AUTHORITY.md`
- `docs/architecture/text-system-rules.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_ANALYSIS.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_GAP_ANALYSIS.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_TARGET.md`
- `docs/architecture/DRAG_OVERLAY_STARTUP_TARGET.md`
- `docs/architecture/PREVIEW_SYSTEM_GAPS.md`
- `docs/architecture/PREVIEW_SYSTEM_TARGET.md`

### 15.2 Historical / Deprecated

Keep these documents for context only. They must not be used as the current implementation map:

- `docs/architecture/INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md`

### 15.3 Keep Current

Keep these as active references with their current roles:

- `README.md`: repo onboarding and workflow overview
- `docs/architecture/EDITOR_SYSTEM.md`: high-level editor overview
- `docs/architecture/GROUP_RENDER_MODEL.md`: active preserved group render contract
- `docs/architecture/INTERACTION_FINAL_CLOSURE_AUDIT.md`: historical closure status and validation-gap record
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`
- `docs/debug/inline-focus-rca-evidence.md`

## 16. Document Reorganization

Root-level architecture docs belong under `docs/architecture/`, not the repo root.

Final structure:

```text
docs/
  architecture/
    ARCHITECTURE_OVERVIEW.md
    ARCHITECTURE_GUIDELINES.md
    DATA_MODEL.md
    EDITOR_SYSTEM.md
    INTERACTION_SYSTEM_CURRENT_STATE.md
    PREVIEW_SYSTEM_ANALYSIS.md
    SYSTEM_FRAGILITY_MAP.md
  contracts/
    RENDER_COMPATIBILITY_MATRIX.md
  testing/
    EDITOR_REGRESSION_CHECKLIST.md
    PREVIEW_PUBLISH_VISUAL_BASELINE.md
  debug/
    inline-focus-rca-evidence.md
```

Reorganization rules after this cleanup:

- no root-level architecture duplicates
- no target-state documents mixed into the current-state architecture set
- no more than one canonical current-state doc per topic

## 17. Startup Behavior (Post Phase 1)

Phase 1 changed the startup boundary in two concrete ways.

Current startup flow after the change:

1. `ElementoCanvasRenderer.jsx` still arms selected-predrag and same-gesture select-and-drag through `onPredragVisualSelectionStart(...)`.
2. `CanvasStageContentComposer.jsx` still clears hover immediately through `clearHoverForInteractionBoundary(...)` before predrag ownership starts.
3. `beginPredragVisualSelection(...)` still opens the drag-overlay session and still may record seed snapshots for bookkeeping.
4. The stage now suppresses `SelectionTransformer.jsx` mounting during `predrag` through the composer-owned `shouldMountPrimarySelectionOverlay` gate, so selected-phase visuals do not remain mounted at the startup ownership boundary.
5. Seed paths such as `predrag-seed`, `drag-selection-seed`, and `controlled-seed` remain in the runtime, but they are now explicitly logged as `startup-visibility:blocked` and remain non-visible while startup visibility is unresolved.
6. The first visible drag-overlay frame is still admitted only through the startup gate when `controlled-sync` matches the first authoritative drag sample.
7. The first visible frame is now logged by `drag-overlay:shown` with `startupSource`, `startupContractSatisfied`, `hoverId`, and selected-phase visibility state.
8. If a first visible startup frame ever appears from a non-`controlled-sync` source, while hover is still visible, or while selected-phase is still visible, the composer now emits `startup-contract:violation`.
9. The composer now emits `phase:transition` logs for the visible interaction phase model (`idle`, `hover`, `selected`, `predrag`, `drag`, `settling`) together with the active owner and current startup source.

Paths eliminated or made non-visible:

- Selected-phase mount at the predrag boundary is now suppressed at the stage-composition level instead of relying only on internal transformer suppression.
- Seed/replay helper paths remain present, but no seed source is allowed to become the visible startup owner. Visible startup remains tied to `controlled-sync`.

How controlled-sync is enforced:

- `resolveDragOverlayStartupApply(...)` still decides visibility eligibility.
- `syncControlledDragOverlayBounds(...)` now records explicit blocked-startup traces when startup is still pending.
- `handleDragOverlayFirstVisibleFrame(...)` now records whether the first visible source was `controlled-sync` and whether hover or selected-phase leaked into the startup frame.

## 18. Drag Geometry and Snap Behavior (Post Phase 2)

Phase 2 tightened steady-state drag geometry around one rule: active drag visuals now stay downstream of live Konva node geometry, not synthetic drag-time poses.

The final Phase 2 follow-ups had to remove two family-specific guide mismatches:

- text still had a timing gap: guide evaluation could sit behind the ordinary dragmove overlay sync through RAF-coalesced scheduling, so near centering-guide thresholds one drag sample could first show the raw dragmove text position and only afterward apply the snapped text reread plus overlay resync
- `forma` and `icono` still had both a timing gap and a geometry-basis gap: guide evaluation could still trail through RAF, and `useGuiasCentrado.js` could read a broader stage `getClientRect(...)` basis while drag-overlay sync used the selection live rect basis from `selectionBoundsGeometry.js`
- that meant guide decisions and overlay resync could still reason about slightly different live envelopes for the same dragged non-text node, making threshold chatter visibly easier to expose for shapes/icons than for text once the text-specific path had already been corrected

Current drag geometry flow after the change:

1. `recordSelectionDragMoveSummary(...)` in `CanvasStageContentComposer.jsx` still resolves drag-overlay bounds from `resolveLiveDragSelectionSnapshot(...)`.
2. That path still uses `resolveSelectionBounds({ requireLiveNodes: true })`, but drag-time text now refuses generic client-rect fallback: if `resolveAuthoritativeTextRect(...)` is unavailable for text, the drag snapshot resolves to `null` instead of silently falling back.
3. For non-text families, the guide path now resolves the dragged box through `resolveNodeSelectionRect(..., { relativeTo: stage, requireLiveNodes: true })`, so guide evaluation and overlay sync share the same live selection rect basis for `forma`, `icono`, and `icono-svg` instead of mixing selection rects with a broader raw stage client rect.
4. `syncControlledDragOverlayBounds(...)` now logs `drag-overlay:geometry-sync` with `geometrySource` (`live` or `textRect`) plus `geometryKind`, and logs `drag-overlay:geometry-sync-skipped` when a drag-phase live snapshot cannot be resolved lawfully.
5. `SelectionBoundsIndicator.jsx` now propagates `geometrySource` through controlled-bounds logs and samples, so the overlay render path exposes whether the active box came from generic live-node bounds or authoritative text bounds.

Current snap mutation timing after the change:

1. Drag move still schedules eligible guide evaluation through `scheduleGuideEvaluation(...)`.
2. For every eligible single-element family on the individual pipeline, `scheduleGuideEvaluation(...)` now flushes guide evaluation synchronously instead of waiting for a later RAF boundary, so the guide decision, snap mutation, post-snap reread, and overlay resync remain inside the same drag sample.
3. `mostrarGuias(...)` in `useGuiasCentrado.js` now reads the active drag box from the live node only; it no longer feeds drag input position into the active drag box reader, and for non-text families it aligns that live reread with the same selection-rect basis used by overlay sync.
4. If snap commits, `mostrarGuias(...)` applies the complete axis delta to the live node, then immediately re-reads `postSnapBox` from the same family-aligned live geometry path before returning the guide outcome; a relation line is emitted only when that reread verifies alignment within tolerance.
5. `flushScheduledGuideEvaluation(...)` in the composer still performs `guide-post-snap-sync`, but it now records the pre-resync and post-resync overlay rects, geometry families, and mismatch classification against the post-snap live reread so drift would be observable if the resync failed.

Overlay resync mechanism after snap:

- The composer captures the pre-resync overlay snapshot.
- It resolves a fresh live selection snapshot after snap mutation.
- It computes `overlayPreResyncDelta` and `overlayWouldDriftWithoutResync`.
- It immediately calls `syncControlledDragOverlayBounds(..., { source: "guide-post-snap-sync" })`.
- It then records `overlayRectAfterResync`, `overlayPostResyncDelta`, and whether any mismatch persisted after resync.
- The post-snap sync therefore reuses the same live-node authority as the ordinary drag sync path instead of introducing a second geometry authority.

Corrected text drag geometry order after the final Phase 2 follow-up:

1. raw dragmove updates the live text node
2. if the dragged element is text, guide evaluation flushes in the same drag sample
3. guide evaluation reads the live authoritative text box
4. snap may mutate the live text node
5. the guide path re-reads the post-snap authoritative text box from the live node
6. the composer performs `guide-post-snap-sync` from that post-snap live reread
7. later drag-overlay samples in the same session continue from the same live-node authority chain

This keeps the text node, guide evaluation, authoritative text rect, and drag-overlay on one drag-time geometry chain instead of letting guide snap land one visual step later.

Family-specific handling after the change:

- `useGuiasCentrado.js` now requires authoritative text geometry for the active dragged text box and does not use input-position pose shifting for drag-time text snap evaluation.
- `useGuiasCentrado.js` now resolves active dragged `forma` and `icono` boxes through the same live selection-rect helper used by overlay sync, rather than a broader raw stage client rect that could include a different envelope near guide thresholds.
- All eligible individual-drag families now use the same synchronous guide-evaluation timing rule that Phase 2 first established for text, `forma`, `icono`, and `icono-svg`, so Gallery, Countdown, CTA/button, image, and other generic-renderer families cannot lag one visual beat behind the raw dragmove sample.
- `SelectionBoundsIndicator.jsx` now reads authoritative text rects, not generic `getClientRect(...)`, when comparing the rendered drag overlay against visible text geometry.
- The verified root cause of the text vibration was both timing-sensitive snap resync and geometry inconsistency.
- The dominant earlier correctness issue for text in code was geometry inconsistency: the guide path could reason from an input-position-adjusted text pose while the drag overlay was synchronized from live selection bounds.
- The remaining Phase 2 bug after that first text fix was the scheduling gap: text guide evaluation could still be deferred behind the ordinary dragmove sample, exposing raw-position text first and snapped overlay convergence later when guide activity was active.
- The verified remaining non-text correctness issue was a combined geometry-basis and scheduler mismatch: shapes/icons could still evaluate guide thresholds from a different live envelope than overlay sync, and that guide work could still be deferred one visual step through RAF.
- Current instrumentation now logs threshold-oscillation hints (`rapidFlip`, `thresholdOscillationLikely`), geometry family (`authoritative-text-rect`, `selection-live-rect`, or fallback), before/after overlay rects, and mismatch classification so text, shape, and icon guide scenarios can be validated explicitly.

Verification note:

- Phase 2 is now the current stable drag-geometry baseline. The Phase 2 instrumentation remains in place so later phases can verify they did not reintroduce drag/snap drift across text and non-text object families.
- The current guide refinement preserves that baseline while adding exact snap, per-axis bounded candidates, scale-compensated presentation/radii, semantic relation styles, deterministic session cleanup, and desktop Alt/Option bypass inside the same owners.

## 19. Drag End / Settling / Handoff (Post Phase 3)

Phase 3 tightens drag end around one rule: once pointer-up enters settling, drag-overlay remains the sole visible box owner until the destination selected-phase is both selection-correct and paint-ready for the current session.

Actual execution order after the Phase 3 changes:

1. Drag end still enters `startDragSettleSession(...)` and `updateDragOverlayBoxFlowSessionPhase("settling", ...)`, so the last lawful drag geometry becomes the frozen settle snapshot.
2. `queuePostDragUiRefresh(...)` now carries the current drag interaction epoch. When it eventually runs, it refuses stale settle work if either the `dragId` or the `interactionEpoch` no longer matches the active settle session.
3. `resolveDragSettleOutcome(...)` still performs deferred selection repair, but it now reports `selectionRepairCompleted` and `selectionRepairResult`, and `selection:repair-complete` is emitted before handoff release is allowed.
4. While `selectionRepairPending` remains true for the active settle session, `shouldKeepDragOverlayMountedForSelectedPhaseHandoff` forces drag-overlay ownership to stay mounted and visible.
5. Once repair is complete, the composer computes the destination selection ids for handoff and passes them to `SelectionTransformer.jsx` as `selectedPhaseHandoffExpectedSelectionIds`.
6. If the destination uses the transformer path, `SelectionTransformer.jsx` can attach to the live nodes and run a hidden readiness probe while drag-overlay still suppresses selected-phase visibility. The readiness gate now treats `readyProbeActive` as lawful readiness input, so it can emit `selected-phase:ready-pending` and `selected-phase:ready-confirmed` without creating dual visible ownership.
7. The composer still performs one extra handoff RAF (`selected-phase:handoff-paint-pending` -> `selected-phase:handoff-paint-confirmed`) after the transformer reports post-paint readiness.
8. Only after repair is complete and the destination selected-phase is ready plus handoff-paint-confirmed does `shouldKeepDragOverlayMountedForSelectedPhaseHandoff` clear and let the overlay disappear.
9. The actual user-visible ownership transfer then happens on the next selected-phase render, not by showing both owners at once.
10. If committed selection changes to a different non-empty target after drag end but before the old settle session finishes, the composer now treats that newer committed selection as an override of the stale drag handoff target.
11. In that override case, the composer clears the stale settle session, clears stale drag visual selection / drag-overlay session state, resets selected-phase ready/visibility handoff caches, and recomputes selected-phase destination ids from the current committed selection instead of the old drag destination.
12. The transformer now reports attached node ids and `readyProbeActive` through selected-phase visibility/ready callbacks, so the composer can log divergence between committed selection, selected-phase attachment, and the currently visible box owner.
13. The verified remaining Phase 3 deadlock came from that hidden-ready path measuring the suppressed transformer shell itself during drag-overlay handoff. Because the transformer is intentionally hidden while drag-overlay still owns visible authority, that shell could report `zero-bounds` even when the newly selected live node was present and current, so `selected-phase:ready-blocked` repeated and drag-overlay teardown stayed deferred on `waiting-selected-phase-visual-ready`.
14. The current code now resolves hidden ready-probe bounds from the live attached selection target instead of the suppressed transformer shell. For single-text selections it prefers the authoritative live text rect when available; otherwise it falls back to the attached-node live union. This lets the new committed selection prove readiness under the overlay and prevents the old drag-overlay owner from remaining visible indefinitely only because the hidden transformer shell measured as `0x0`.

Settling snapshot behavior:

- During settling, `CanvasStageContentComposer.jsx` continues to render the drag-overlay from the frozen controlled snapshot rather than recomputing fresh selected-phase geometry.
- The settle snapshot remains the geometry authority until the overlay is actually removed.
- Phase 3 therefore avoids any handoff-time geometry recomputation race between the drag-overlay and selected-phase paths.

Selected-phase readiness detection now works like this:

- Actual selected-phase visibility remains suppressed while `dragSelectionOverlayVisible` is true.
- For transformer-backed destinations, readiness can still be proven underneath the overlay through the hidden ready probe once selection repair is complete and the attached selection matches the expected destination ids.
- That hidden ready probe now measures the live attached selection target, not the visually suppressed transformer shell. This is the current fix for the verified `zero-bounds` deadlock that could otherwise keep stale drag-overlay ownership latched to the old drag target after committed selection had already moved.
- If a newer committed selection overrides the stale drag settle target, the hidden-ready / handoff path for the old target is invalidated immediately rather than being allowed to keep driving selected-phase destination state.
- The readiness gate now emits `selected-phase:ready-reset` if a previously confirmed hidden-ready state becomes stale, hidden, or invalid before release.
- Single-line selected destinations still use the existing line-specific selected-phase path rather than the transformer hidden-ready probe. Assumption: that existing path remains lawful, but it is not yet instrumented with the same hidden-ready contract as generic transformer selections.

Post-paint confirmation role:

- `SelectionTransformer.jsx` still requires valid post-paint bounds before it reports ready.
- `CanvasStageContentComposer.jsx` then adds one more compositor-owned RAF confirmation before overlay teardown.
- This two-step confirmation means selected-phase readiness must survive both the transformer post-paint check and the composer handoff-paint check before ownership can move.

Overlay teardown timing and observability:

- `handoff:dual-ownership-violation` now fires if selected-phase becomes actually visible while the drag overlay is still rendered.
- `drag-overlay:teardown-violation` now fires if the overlay disappears while repair is still pending or before selected-phase readiness / handoff paint confirmation is complete.
- `selection:repair-complete` now records whether the current session deferred-committed, restored prior selection, or required no committed-selection change.
- `selection:repair-complete` now also records `selection-overridden` when a newer committed selection supersedes the stale drag settle target before repair applies.
- `selected-phase:post-drag-divergence`, `selected-phase:stale-handoff-invalidated`, `selected-phase:recovery-state`, and `selected-phase:visual-recovered` now expose:
  - committed selected ids
  - runtime selected ids
  - current visible box owner target ids
  - handoff expected selection ids
  - selected-phase attached node ids
  - `readyProbeActive`
  - drag-overlay / settling / handoff activity
- Earlier Phase 1 / Phase 2 instrumentation was too centered on startup, drag move, snap, and overlay sync to explain the remaining post-drag bug by itself. The current post-drag diagnostic layer now also emits:
  - `drag:end-enter`
  - `post-drag:selection-diagnostic-state`
  - `click:new-selection-after-drag`
  - `selected-phase:diverged-from-committed-selection`
  - `selected-phase:rebound-to-current-selection`
  - `post-drag:why-selection-box-still-on-old-target`
  - `handoff:complete`
  - `hover:blocked-after-drag`
  - `hover:allowed-after-drag`
- Those diagnostic records intentionally combine committed selection, runtime selection, drag visual selection, pending drag selection, visible selection-box target, transformer attachment, gear-menu target ids, hover suppression, drag-overlay ownership, settling/handoff state, and stale session/epoch markers in one payload so post-drag divergence can be traced as one timeline.
- `transformer:stale-attachment` and `transformer:attachment-rebound` now expose when transformer attachment does or does not match the current committed selection target after drag.
- `drag-overlay:hidden` and `settling:end` remain the authoritative teardown markers once the overlay is actually removed.

Verification note:

- The code-side Phase 3 handoff hardening now includes stale post-drag selected-phase invalidation and the hidden-ready `zero-bounds` deadlock fix, but this current-state document does not treat Phase 3 as operationally closed until the release and post-drag reselection scenarios are manually re-verified in the browser with the new instrumentation.

## 20. Hover Behavior (Post Phase 4)

Phase 4 tightens hover around one rule: raw hover id is no longer allowed to survive as a dormant state under higher-priority owners. The follow-up refinement makes selected-phase suppression target-aware, not globally blanket, and the latest post-drag recovery fix restores lawful different-target hover once drag-end no-hover boundaries have actually cleared.

Actual hover visibility rules after the Phase 4 changes:

1. `CanvasStageContentComposer.jsx` now resolves the stage hover gate through `resolveStageHoverSuppression(...)`.
2. That suppression state now distinguishes:
   - global no-hover boundaries
     - `drag-overlay-owner`
     - `predrag-visual-selection`
     - `drag-prop`
     - `global-drag`
     - `group-drag`
     - `canvas-interaction-settling`
     - `inline-dom-authority`
     - `resize`
     - `image-crop`
     - `background-edit`
     - `canvas-interaction-active`
   - target-conflict suppression
     - `selected-phase-target-conflict`
3. `effectiveHoverId` is now derived from that one composer-owned suppression result, so the hover indicator only receives a hover target when no global no-hover boundary is active and the hovered target does not conflict with the current selected target ids.
4. Selected-phase no longer acts as a blanket hover blocker. If element `A` is selected and the pointer is over element `B`, hover on `B` is now lawful as long as no global no-hover boundary is active.
5. Same-target coexistence remains forbidden. If the hovered target matches the selected target set, the composer suppresses that hover, blocks new writes through `setHoverIdWhenIdle(...)`, and clears stale same-target hover state if it reappears.
6. Post-drag recovery now distinguishes two cases explicitly:
   - if drag-overlay ownership, handoff wait, or coordinator settling is still active, different-target hover is still lawfully blocked as a global no-hover boundary
   - once those boundaries clear, the last blocked post-drag hover target is replayed automatically so the system returns to ordinary selected-plus-hover coexistence without waiting for a second `mouseenter`
7. The composer phase trace still reports `hover` when a lawful different-target hover exists, even while selected-phase remains visible on its own target. In that state the selected box stays mounted on the selected element and the hover box owns only the hovered target.
8. Post-drag hover recovery now also depends on selected-phase visual recovery being current. If a stale drag handoff target is invalidated by a newer committed selection, hover suppression re-evaluates against the new selected target instead of the old drag destination.

Suppression boundaries now treated as authoritative hover clear boundaries:

- `predrag`
- `drag`
- `settling`
- inline DOM authority
- resize
- image crop
- background edit
- any remaining active interaction-coordinator boundary that suppresses hover

Selected-phase is no longer a global clear boundary by itself. It becomes a hover clear boundary only when the current raw hover target conflicts with the selected target set.

Clear ownership model after the change:

- `clearHoverForInteractionBoundary(...)` is now the shared boundary clear path for composer-owned hover teardown.
- It records the higher-priority owner, suppression reasons, clear driver, and phase before calling both `HoverIndicator.forceHide(...)` and `setHoverId(null, ...)`.
- The raw hover state therefore does not remain parked behind the visual gate once ownership has moved elsewhere.
- Inline-entry hover clear and image-crop interaction start now both go through that same boundary clear helper instead of clearing hover ad hoc.

Cleanup timing after the change:

1. A higher-priority owner or suppression boundary becomes active.
2. The composer suppression snapshot detects the transition.
3. If raw hover state is still present under a global boundary or a same-target selected conflict, the composer emits `forced-clear` and clears it immediately through the shared boundary helper.
4. If a stale hover write arrives while suppression is still active, the composer emits `stale-reentry:blocked` and clears it again.
5. If a different-target hover write lands during the short post-drag global boundary window, the composer records it as pending recovery instead of dropping it permanently.
6. When drag-overlay ownership, handoff wait, coordinator settling, and runtime drag flags have truly cleared, the composer replays that pending hover target through the normal hover gate.
7. If selection remains active but the hovered target differs from the selected target set, the composer now logs `coexistence:allowed` instead of suppressing that hover globally.
8. Once suppression ends, hover may re-enter through a fresh lawful hover write or through the pending post-drag replay path, both of which return the system to the normal target-aware hover state.

Observability added in Phase 4:

- `stage:suppressed` / `stage:resumed` now include the current phase, current owner, higher-priority owner, selected target ids, and whether suppression is `global`, `target-conflict`, or `mixed`.
- `forced-clear` now records whether the clear was boundary-driven, which suppression reason triggered it, and whether the clear came from a global boundary or a selected-target conflict.
- `reentry:blocked` records hover writes that were rejected before they could become visible under a global no-hover boundary.
- `target-conflict:blocked` records hover writes that were rejected because the hovered target matched the selected target set.
- `coexistence:allowed` records lawful selected-phase-plus-hover coexistence when the hovered target differs from the selected target set.
- `post-drag:blocked`, `post-drag:allowed`, and `post-drag:recovery-state` now expose whether hover-after-drag is still under a lawful global boundary, has a pending replay target, or has returned to normal selected-plus-hover coexistence.
- `stale-reentry:blocked` records raw hover state that tried to reappear after a boundary clear while suppression was still active.
- `visibility:violation` now records any case where the hover indicator is still visibly mounted during a global no-hover boundary or on the same target already owned by selected-phase.
- `HoverIndicator.jsx` now reports `box:shown`, `box:hidden`, and `box:unavailable` together with the current phase, current owner, higher-priority owner, and suppression reasons supplied by the composer.

Remaining caveats:

- Hover identity is still id-only for steady-state visibility. Phase 6 now hardens the replay path with epoch/session/selection checks, but that does not yet turn hover into a fully standalone session-token subsystem.
- `window.setHoverIdGlobal` remains available for compatibility. External callers can still attempt unlawful hover writes, but the composer now suppresses and clears them deterministically if they arrive during a no-hover boundary.
- `useCanvasEditorSelectionUi.js` now shares the same runtime drag/group-drag/resize suppression helper as the composer for bridge compatibility, but the composer remains the authoritative hover visibility gate for stage rendering.
- Same-target selected-phase conflict is currently determined from the selected target id set, not from a dedicated selected-phase session token. Phase 6 now hardens the late ready/handoff apply points around that path, but the selected-phase identity still remains derived rather than fully first-class.
- Post-drag hover recovery currently replays the latest blocked lawful hover target. Assumption: the last blocked target is the correct recovery target for the user-visible pointer position because the hover pipeline is still `mouseenter`/`mouseleave` driven rather than pointer-position sampled.

Verification note:

- The code-side Phase 4 hover hardening is implemented, but this current-state document does not treat Phase 4 as operationally closed until the hover scenarios are manually re-verified in the browser with the new instrumentation.

## 21. Text Geometry Parity (Post Phase 5)

Phase 5 closes the main text-geometry ambiguity by enforcing one shared rule in code: text geometry readers now resolve the authoritative live Konva text rect first and may only use a fallback through an explicit, surface-aware decision.

Authoritative text geometry source:

- `resolveAuthoritativeTextRect(...)` is the single authoritative base geometry for text.
- `selectionBoundsGeometry.js` now treats text differently from generic objects:
  - if the authoritative text rect exists, text readers return it
  - if it does not exist, text readers no longer silently substitute the generic node `getClientRect(...)`
  - the caller either fails closed for that surface or uses an explicit higher-level fallback that is legal for the current phase

Current text-surface contract after Phase 5:

- `HoverIndicator.jsx`
  - hover text bounds go through `resolveSingleTextSelectionVisualBounds(...)`
  - that helper now resolves text from the authoritative live rect only and logs the `hover` surface explicitly
- `SelectionBoundsIndicator.jsx`
  - selected-phase and drag-overlay reads now tag the text geometry surface explicitly (`selected-phase` or `drag-overlay`)
  - for text, the shared resolver no longer treats generic client rect as a quiet fallback source
- `CanvasStageContentComposer.jsx`
  - drag-overlay live bounds still come from `resolveSelectionBounds(..., { requireLiveNodes: true })`
  - inline-edit outline geometry now also prefers the authoritative text rect instead of raw client rect
- `useGuiasCentrado.js`
  - active text guide evaluation now fails closed if the authoritative text rect is unavailable
  - generic client-rect fallback is no longer allowed for text guide geometry
- `inlineGeometry.js`
  - `getInlineKonvaProjectedRectViewport(...)` now projects DOM inline geometry from the authoritative text rect when available
  - if that authoritative rect is unavailable, the helper exposes and logs the fallback explicitly instead of silently swapping geometry basis

Legal fallbacks:

- During `hover`, `predrag`, `drag`, and guide evaluation, text geometry now fails closed when the authoritative live text rect is unavailable.
- During `selected`, explicit object-data fallback is still allowed by the broader geometry contract when live geometry is unavailable.
- That selected-phase fallback is now explicit in `resolveSelectionUnionRect(...)`, logged as `object-data-fallback`, and applied as an all-fallback frame rather than a mixed live-plus-fallback union.

How text differs from generic object geometry now:

- generic object readers may still use ordinary live selection rects or explicit object-data fallback depending on phase
- text readers must first attempt the authoritative text rect
- text may only fall back through an explicit surface/phase decision, not through an implicit generic client-rect path

Inline DOM projection boundary:

- DOM inline editing still owns visible caret and editing authority during DOM phases
- the DOM overlay projection is now explicitly downstream of the same authoritative Konva text geometry used by hover/selection/drag/snap readers
- the remaining DOM/Konva differences are therefore projection differences, not a separate text-bounds authority model

Observability added for Phase 5:

- surface-specific text geometry contract logs now distinguish:
  - `hover`
  - `selected-phase`
  - `drag-overlay`
  - `snap-system`
  - `inline-dom-projection`
- explicit fallback and mismatch cases are now observable through:
  - `text-geometry-source-of-truth`
  - `text-geometry-explicit-fallback`
  - `guide-text-authority-source`
  - `inline-projection-geometry-source`
  - the existing drag/snap/inline overlay parity traces

Remaining caveats:

- selected-phase still allows explicit object-data fallback when live text geometry is unavailable outside drag; that is legal by the current contract, but it remains a lower-fidelity all-fallback frame than live authoritative text geometry
- the line-specific selected path is still separate from the transformer-backed selected-phase path
- browser validation is still required for text selection, hover, drag, snap, inline enter/exit, and text-to-text reselection scenarios before Phase 5 can be treated as operationally closed

## 22. Session Identity Hardening (Post Phase 6)

Phase 6 hardens the interaction paths that were still vulnerable to late-session re-entry. The code now treats stale post-drag repair, stale selected-phase ready confirmation, stale handoff paint confirmation, and stale hover replay as explicit rejectable work instead of letting those paths fail only through incidental state drift.

Main interaction/session identities now active in code:

- `useCanvasInteractionCoordinator.js`
  - `interactionEpoch` remains the outer interaction boundary for drag/transform settle work
  - after-settle callbacks still run only for the settled epoch that scheduled them
- `CanvasStageContentComposer.jsx`
  - `dragInteractionSession.sessionKey` governs the drag interaction ownership lane
  - `dragOverlayBoxFlowSession.sessionKey` governs drag-overlay visual ownership
  - `dragSettleSession.sessionKey` now explicitly identifies the post-drag repair/handoff session and carries the owning drag id, interaction epoch, overlay session key, and drag interaction session key
- `SelectionTransformer.jsx`
  - selected-phase readiness still derives its effective session from the current attached selection target, but post-paint confirmation now explicitly rejects stale ready candidates instead of silently letting an older candidate finish
- post-drag hover recovery
  - pending hover replay now carries the interaction epoch, last drag-end epoch, drag interaction session key, drag-overlay session key, and the committed selection digest that was current when the replay target was blocked

Current validity / rejection rules after Phase 6:

- post-drag repair
  - `queuePostDragUiRefresh(...)` now rejects repair work when the settle session is missing, the drag id no longer matches, the interaction epoch no longer matches, or the explicit `dragSettleSession.sessionKey` no longer matches the session that scheduled the repair
  - stale repair rejection is now observable through `selection:repair-ignored-stale-session`
- selected-phase ready confirmation
  - `SelectionTransformer.jsx` now treats the ready candidate key as a session-scoped apply token
  - if the attached target / visibility / bounds candidate changes before the RAF confirmation lands, the old ready candidate is ignored and logged as `selected-phase:stale-ready-ignored`
- composer handoff-paint confirmation
  - the second composer-owned post-paint confirmation now also verifies the latest ready metadata against the scheduled readiness key before applying
  - stale confirmation is ignored and logged as `selected-phase:handoff-paint-ignored-stale-session`
- post-drag hover replay
  - pending replay is now invalidated when a newer interaction epoch, newer drag-end marker, newer drag session, newer drag-overlay session, or newer committed selection supersedes the blocked hover target
  - stale replay rejection is now observable through `post-drag:replay-ignored` and `hover:stale-replay-ignored`

Current-user-authority-wins rule in practice:

- if a newer committed selection or newer interaction replaces the old drag/handoff context, stale settle repair can no longer complete against that old session
- if selected-phase readiness changes before the old RAF confirmation lands, the old ready/handoff confirmation loses immediately
- if a hover replay target belonged to an obsolete post-drag boundary, it is dropped instead of replaying into the new state

Observability added for Phase 6:

- `drag-settle:session-started`
- `selection:repair-ignored-stale-session`
- `selected-phase:stale-ready-ignored`
- `selected-phase:handoff-paint-ignored-stale-session`
- `post-drag:replay-ignored`
- `hover:stale-replay-ignored`

Remaining caveats:

- selected-phase still does not expose one standalone durable public token; in practice its effective identity is still derived from committed selection membership plus the active attached selection target / ready candidate
- guide evaluation still relies on active drag session checks rather than a first-class guide session identity
- the line-specific selected path remains separate from the generic transformer-backed selected path
- browser validation is still required for quick repeated drags, quick reselection after drag, hover-after-drag replay, and multi-selection/line-specific edge cases before Phase 6 can be treated as operationally closed

## 23. Architectural Unknowns

- The code provides strong local sequencing around drag-overlay startup and inline swap, but there is no single end-to-end runtime trace that proves every intra-frame ordering across all React effects in every browser.
- Hover and guide behavior are clear for the main canvas path, but this audit did not attempt to enumerate every possible external caller of `window.setHoverIdGlobal`.
- The exact cross-browser selection/caret quirks of `InlineTextOverlayEditor.jsx` are not fully documented in code comments; the runtime compensations are visible, but not all browser-specific motivations are explicit.

## 24. Assumptions

- Assumption: where this document describes exact sub-frame ordering inside the inline DOM swap path, that order is inferred from the hook structure, emitted phase transitions, and runtime state transitions in the audited modules; the code does not expose one centralized timeline tracer for every inner step.
- Assumption: template editor sessions use the same interaction/rendering subsystem as draft sessions. Persistence, preload, preview re-read, authoring, and section mutations branch only through `editorSessionPersistence.js`; preview/publish-facing bridges may still branch by session kind for authority/transport semantics.

## 25. Critical Invariants

These invariants are detectable in the current code and should be treated as explicit system rules for future work:

- Persisted object coordinates are section-local. Stage-space Y is derived at render time and converted back on commit.
- Box-level visual ownership is prioritized: drag-overlay over selected-phase visuals, selected-phase visuals over hover.
- The first visible drag-overlay frame must come from the active session's `controlled-sync` path using live-node geometry.
- During active drag, text geometry must come from `resolveAuthoritativeTextRect(...)` or the drag-time bounds resolution must fail closed for that frame.
- Guide snap is allowed to mutate the live node, but the drag overlay must then resynchronize from a post-snap live reread in the same guide outcome path.
- Guide evaluation only participates in the individual single-element drag pipeline; it is not the authority for multi-selection/group drag.
- If guide snap mutates the live node during drag, the drag-overlay bounds must be resynchronized from live geometry afterward.
- Inline DOM overlay visual ownership requires a matching inline mount session, matching session/token acknowledgement, `swapCommitted`, and `renderAuthority` in a DOM-owned phase.
- Drag-overlay teardown after drag end is not allowed to preempt current-session selection repair, selected-phase readiness, or composer handoff-paint confirmation; selected-phase readiness may be proven while still hidden under the settling overlay, but dual visible ownership is forbidden.
- If committed selection changes to a different non-empty target after drag end, the old drag settle target is no longer allowed to keep selected-phase or drag-overlay visual ownership; stale handoff-specific target state must be invalidated and selected-phase must rebind to the current committed selection.
- Hover is lawful only when no global no-hover boundary is active and the hovered target does not conflict with the current selected target set; after drag end, the system returns to that target-aware hover state only once drag-overlay ownership, handoff wait, coordinator settling, and runtime drag suppression have all cleared, and any blocked lawful hover target from that window must be replayed or replaced by a newer hover write.
- Post-drag repair, selected-phase ready/post-paint confirmation, and hover replay must all verify the session/epoch/target identity that scheduled them before they apply; if a newer interaction or committed selection has superseded that identity, the late work must be ignored.
- Text consumers must resolve authoritative live text geometry first. If it is unavailable, the surface must either fail closed or use an explicit phase-legal fallback; silent generic client-rect substitution is no longer a lawful steady-state path for text.
- External consumers should read live editor state through `window.editorSnapshot`, documented bridges, or custom events, not through scratch globals.

## 26. Closure Audit Summary (Post Phases 1-6)

The final post-implementation audit found the following current-state summary:

- Phases 1 through 6 are implemented in code.
- Phase 1 and Phase 2 do not show a remaining implementation gap in the audited code.
- Phase 3 through Phase 6 still require browser validation before they should be called operationally closed.
- No new broad implementation phase is justified by the current codebase.
- The former mixed-source selected-phase union gap in `resolveSelectionUnionRect(...)` is now resolved: selected-phase unions are source-pure all-live or all-fallback, and mixed live+object-data frames are no longer allowed.

Remaining non-blocking items:

- line-specific selected rendering still uses its own path instead of the generic transformer hidden-ready probe
- guide invalidation still relies on drag-session identity instead of a public guide session token
- steady-state hover remains target-id based, even though stale post-drag replay is now identity-hardened

Phase 7 decision:

- Inline authority cleanup is optional later, not currently required for correctness
- the inline path already enforces matching mount session, swap acknowledgment, render authority, and paint-stable conditions before DOM editable authority can claim visibility
- any future Phase 7 work should be driven by browser validation findings or by cleanup goals, not by a currently demonstrated contract breach

## 27. Ceremony/Party compositions by mode (2026-10-16)

Implementation of the accepted UX proposal D. The persisted shape and compatibility
rules belong to [Data Model, event layouts](DATA_MODEL.md); functional/group
rendering remains in [Group Render Model](GROUP_RENDER_MODEL.md).

- `shared/eventLayout.cjs` owns initialization, mode transitions, explicit reset
  and root-membership reconciliation. Root `x/y/yNorm` are the active position;
  `seccion.eventLayout` retains the inactive composition and initial reset poses.
  Styles, content, sizes, rotations and group hierarchy remain shared.
- `useEventLayoutState` coordinates objects, sections and event configuration in
  one React update. A first manual positional mutation or explicit manual
  transform freezes both legacy presentations from the same pre-mutation source.
  Changing mode captures the outgoing composition and materializes the incoming
  one. There is no layout evaluation scheduled during `dragmove`.
- Loading an untouched legacy document does not initialize layouts. Loading or
  restoring an existing layout whose materialized mode differs from configuration
  reconciles only that existing checkpoint in memory. It does not initialize
  missing layouts or add a write on open.
- `functionalRenderPose` adapts scene X to the former base frame only at mutation
  boundaries. The finalizer restores accepted nodes with the functional offset
  and text origin applied once. Transient mutation metadata keeps queued previews
  in the correct frame after the first preview initializes a section; unchanged
  or rejected objects cannot be moved by that metadata.
- `commitGroupDragChanges` publishes one `BATCH_UPDATE_GROUP_FINAL` containing all
  accepted member patches. Composer canonicalizes them before one object-state
  update, preventing the first member's initialization from changing the frame
  used by subsequent members. Individual commits and specialized Gallery/Countdown
  paths use the same position boundary.
- Managed render roots bypass legacy `recalcGroupAlign`; automatic legacy
  alignment and text-center preservation retain explicit automatic reasons and
  do not initialize layouts just by mounting or changing text. Text measurement
  and auto-width semantics remain unchanged.
- History captures only `eventMode`, alongside its existing objects, sections and
  dynamic visual slice. Restore retains current semantic field values. Existing
  layout reconciliation occurs before authoring persistence and React restoration
  so both consume the same mode/positions/checkpoints, including protected sections.
- The Details sidebar exposes an explicit reset of the current mode's initial
  positions in editable event sections. It is undoable and leaves the other mode's
  composition intact. Hidden objects remain in the model. Removing, grouping or
  moving a root to another section prunes obsolete checkpoints; undo restores its
  own complete snapshot. New roots use their current pose until captured.
- Editor, dashboard preview and backend preparation consume the shared functional
  resolver. Initialized sections retain authored positions instead of continuous
  joint centering. Backend copies are generated by the existing contract map.
  Mobile `auto`/`preserve` policies, snapping thresholds and hysteresis are unchanged.

Verification evidence is stored locally under
`.local-isolation/event-layout-implementation-20261016/` and the domain review in
`.local-isolation/event-positioning-audit-20261016/analysis-model/implementation-domain-final-review.json`.
Pure and coordinator regressions cover initial offset transfer, companion stability,
repeated mode changes, membership, reset, history, persistence and render preparation.
The generated-HTML checks do not certify the production preview callable or a deploy.

Executed implementation validation (Node 20.19.5):

- 56 related suites / 518 tests passed, including the event-mode coordinator,
  functional offsets, batch group commits, history, persistence, geometry,
  selection and overlay regressions. Syntax checks passed for 50 changed source
  and test files; the contract map verified 80 generated copies.
- Isolated real-editor Chromium validation passed five drag fixtures: ordinary
  text, legacy-associated text, groups in both modes, and a single-mode object
  with an independent companion. Each checked live/accepted/persisted positions,
  strict selection handoff, one history entry, undo/redo and emulator reload.
- A continuous sequence used the actual mode selector and reset button, without
  an owner-bridge fallback. It preserved independent positions through repeated
  switching, mode undo/redo, undoable reset and reload in each mode. Legacy open
  did not create `eventLayout`; moving one root did not move its companions.
- Four canonical payload + freshly compiled HTML generator checks passed in
  isolated Chromium at an 800 px viewport. DOM coordinates and screenshots
  matched the saved active composition, including hidden Party roots.
- Evidence: `unit-regressions.json`, `syntax-and-diff.json` and
  `runs/implementation-d-v1-real-timing-core/{results,mode-transition,preview-renderer}.json`
  inside the implementation evidence directory above. The `*-settled.png` editor
  screenshots were captured after reload, without restored selection; they are
  composition evidence, not screenshots of the earlier handoff assertions.

Validation limits: the separate offline Phase 1 browser launcher failed before
opening a page (zero gestures), while the real-editor run above completed. The
known `canvasObjectPositioning.test.mjs` result remains 6 passed / 1 preexisting
failure (`0.1 !== 0.502`), unchanged. Physical input, mobile reflow, Gallery and
Countdown browser interactions, the preview callable/UI and production publishing
were not newly exercised here; their pure/boundary regressions do not substitute
for those checks. No frontend production build, commit or deploy is claimed. Future rollout
must update the editor writer and preview/publication resolver together, as
documented in the data model.

The real run summary (`validation-summary.json`) records seven drag gestures,
42/42 persisted checkpoints, 17 history checks and seven reloads, with no page
errors or external browser origins. Local aborted requests and expected isolation
overlays remain in the raw evidence. The supervisor did not confirm teardown, so
its error and unchanged marker were retained; independent OS verification in
`closure-independent-e5izMJ.json` confirmed 14 owned PIDs absent, eight ports free
and no owned Chromium process. No prior evidence or user files were deleted when
available disk space declined to approximately 286 MB.
