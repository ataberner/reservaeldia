# INTERACTION SYSTEM CURRENT STATE

> Updated from code inspection on 2026-04-07.
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

## 2. Current Documentation Inventory

The following inventory classifies the repo documentation that existed at audit time.

| Document | What it claims to describe | Accuracy | Missing / wrong | Action |
| --- | --- | --- | --- | --- |
| `README.md` | Repo/project overview | Outdated | It was still the default Next.js starter README and described `pages/api`/Vercel defaults instead of the actual Firebase-hosted dashboard + Functions architecture. | Update |
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
| `docs/architecture/GROUP_RENDER_MODEL.md` | Group render model | Misleading in a current-state set | It explicitly described a phase contract that is not the authoritative current runtime doc. | Delete |
| `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md` | Preview pipeline analysis | Fully accurate for its scope | It is preview-specific and should not own interaction runtime rules. | Keep |
| `docs/architecture/PREVIEW_SYSTEM_GAPS.md` | Preview gap analysis | Outdated for canonical docs | Gap analysis overlaps fragility work and is not a source of truth. | Delete |
| `docs/architecture/PREVIEW_SYSTEM_TARGET.md` | Target preview architecture | Misleading in a current-state set | It describes intended architecture rather than actual runtime. | Delete |
| `docs/architecture/SYSTEM_FRAGILITY_MAP.md` | Current fragility map | Fully accurate for its scope | It needed path updates after doc reorganization. | Keep and update |
| `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md` | Current editor/preview/publish compatibility | Fully accurate for its scope | It is a compatibility matrix, not an interaction contract. | Keep |
| `docs/testing/EDITOR_REGRESSION_CHECKLIST.md` | Manual regression checklist | Fully accurate for its scope | It benefits from pointing to the canonical interaction architecture doc rather than duplicated contracts. | Keep |
| `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md` | Preview/publish visual baseline | Partially accurate | Its contract anchor pointed at `PREVIEW_SYSTEM_TARGET.md`, which is target-state documentation. | Keep and update |
| `docs/debug/inline-focus-rca-evidence.md` | Inline focus RCA evidence | Partially accurate | Its architecture source pointed at `text-system-rules.md`, which was not an appropriate canonical source. | Keep and update |

## 3. Canonical Documentation Set After Cleanup

After this audit, the minimal current-state documentation set is:

- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- `docs/architecture/EDITOR_SYSTEM.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- `docs/architecture/ARCHITECTURE_GUIDELINES.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/testing/EDITOR_REGRESSION_CHECKLIST.md`
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`
- `docs/debug/inline-focus-rca-evidence.md`

Single-source-of-truth rule after cleanup:

- whole product architecture: `ARCHITECTURE_OVERVIEW.md`
- editor runtime boundaries: `EDITOR_SYSTEM.md`
- interaction/rendering current state: this document
- render/publish compatibility: `RENDER_COMPATIBILITY_MATRIX.md`
- preview pipeline: `PREVIEW_SYSTEM_ANALYSIS.md`
- known fragility/risk map: `SYSTEM_FRAGILITY_MAP.md`

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
4. When movement crosses threshold, `maybeFastStartDrag(...)` calls `onPredragVisualSelectionStart(...)`.
5. `CanvasStageContentComposer.beginPredragVisualSelection(...)`:
   - clears hover
   - allocates drag-overlay session identity
   - sets `dragVisualSelection` with `predragActive: true`
   - may seed internal startup state, but does not allow seeds to become the first visible frame
6. `beginCanvasDragGesture(...)` starts the coordinated drag interaction and marks the interaction coordinator active.
7. Drag samples call `syncControlledDragOverlayBounds(...)` from live-node geometry.
8. The first eligible visible drag-overlay frame comes from `controlled-sync`, not from seeds.

Current move behavior:

- drag-overlay bounds are recalculated from live node bounds
- guides are scheduled separately through `scheduleGuideEvaluation(...)`
- guide evaluation is RAF-coalesced when `requestAnimationFrame` exists
- if snapping moves the live node, the composer re-reads live selection bounds and resynchronizes the controlled drag overlay

Current end behavior:

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
2. `editing.id` becomes active in editor state
3. `CanvasInlineEditingLayer.jsx` mounts the DOM-side backend for the active text node
4. `HiddenSemanticTextBackend.jsx` computes projected geometry from the live Konva text node

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

### 5.7 Snapping and Centering Guides

Current guides are only part of the individual single-element drag path.

Eligibility conditions:

- request exists
- `dragMode === "single-element"`
- `pipeline === "individual"`

Current guide computation:

- section center guides are resolved from the active section
- element-to-element guide candidates are limited to objects in the same section
- section guides and object guides compete per axis with section-priority bias
- snap locks are stored in `snapLockRef`

Current execution flow:

1. drag move stores the latest guide payload
2. `scheduleGuideEvaluation(...)` coalesces work behind `requestAnimationFrame`
3. `flushScheduledGuideEvaluation(...)` calls `mostrarGuias(...)`
4. `mostrarGuias(...)` may mutate the live node position by snapping it
5. if the active drag-overlay session still matches, the composer performs `guide-post-snap-sync` to refresh the drag-overlay box
6. `CanvasGuideLayer` renders the current guide lines

Current ambiguity / race conditions:

- guides intentionally lag behind the raw drag sample by one RAF when RAF exists
- guides are not authoritative for multi-selection/group drag
- guide output depends on live node geometry, not just persisted object data

## 6. Source of Truth and Ownership Map

| Visual artifact | Authoritative owner | Derived readers | Imperative writers | Ownership changes during lifecycle | Duplicated ownership risk |
| --- | --- | --- | --- | --- | --- |
| Selection box | Selected-phase: `SelectionTransformer` or selected-phase `SelectionBoundsIndicator`. Drag-phase: composer-owned controlled drag-overlay bounds. | `selectionVisualModes`, hover suppression, handoff guards, debug traces | Composer calls `applyControlledBounds(...)` / `clearControlledBounds(...)` on drag overlay | `hover -> selected-phase -> drag-overlay -> selected-phase/idle` | Critical |
| Transformer | `SelectionTransformer.jsx` attached to live selected nodes | `selectionVisualModes`, selected-phase ready/visible tracking | Transformer attach/detach logic, resize/rotation handlers | Detached during inline edit, predrag, drag, and settling; reattached after handoff | High |
| Hover indicator | Hover id in selection UI state rendered by `HoverIndicator.jsx` | Visual mode resolution, globals bridge cleanup | Composer boundary clears, `window.setHoverIdGlobal`, `HoverIndicator.forceHide(...)` | `idle <-> hover`, but suppressed by selected/drag phases | Medium |
| Inline overlay | Inline mount session + swap ack state in `useInlineSessionRuntime.js`; visual ownership filtered by `resolveInlineCanvasVisibility.js` | Text controller, DOM backend, Konva visibility adapter | Swap requests, finish/cancel, focus controller | `konva -> dom-preview -> dom-editable -> konva` | Critical |
| Snap guides | `useGuiasCentrado.js` guide state rendered by `CanvasGuideLayer.jsx` | Drag-overlay post-snap sync, live node drag path | `mostrarGuias(...)`, `limpiarGuias(...)`, guide layer imperative API | Appear only during eligible individual drag | Medium |
| Centering guides | Same as snap guides | Same as snap guides | Same as snap guides | Same as snap guides | Medium |
| Text bounds | Preferred authority is live Konva text geometry via `resolveAuthoritativeTextRect(...)` | Hover, selected-phase bounds, drag overlay, inline projection, snap | None as a standalone owner; consumers recompute from live node | Shared across hover/selected/drag/inline consumers | Critical because fallback generic rects still exist |
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
- `resolveSelectionFrameRect(...)`
- `resolveInlineStageViewportMetrics(...)`
- `projectInlineRectToViewport(...)`
- `getInlineKonvaProjectedRectViewport(...)`

### 7.3 Current Bounds Calculation Rules

Current text rule:

- text consumers prefer `resolveAuthoritativeTextRect(...)` when available
- if unavailable, some callers fall back to generic client-rect geometry

Current selection union rules:

- `requireLiveNodes: true`
  - returns `null` if any selected object lacks a live rect
- `requireLiveNodes: false`
  - can combine live-node rects and object-data fallback rects in one union

Current hover rules:

- text uses text-specific visual bounds
- gallery uses object size plus absolute group position
- countdown can use `.countdown-hitbox`
- rotated image/shape/CTA paths can use polygons

### 7.4 Where Drift Can Occur

Known current drift boundaries:

- section-local persisted coordinates vs stage-space drag geometry
- `y` vs `yNorm` conversions for `altoModo: "pantalla"`
- selected-phase fallback bounds vs drag-phase live-only bounds
- guide snap mutating the live node before overlay resync
- DOM overlay projection depending on current stage container viewport metrics
- text geometry consumers falling back from authoritative text rect to generic rects

## 8. Temporal Execution Model

### 8.1 Same-Gesture Drag Startup

Current execution order for same-gesture drag startup is:

1. pointer press enters `ElementoCanvasRenderer.handlePressStart(...)`
2. press-time selection decision runs
3. movement crosses threshold
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
2. drag interaction ends in the interaction coordinator
3. settling snapshot is frozen
4. selected-phase visuals begin reattaching
5. selected-phase visible/ready state is observed
6. extra RAF post-paint confirmation runs
7. drag-overlay handoff guard clears
8. overlay teardown occurs

Timing-sensitive boundary:

- the drag overlay can remain mounted after pointer up even though the drag interaction is logically finished

### 8.3 Inline DOM/Konva Swap

Current execution order for inline swap is:

1. editor enters inline editing state for a text id
2. `CanvasInlineEditingLayer.jsx` mounts the DOM-side backend
3. `useInlinePhaseAtomicLifecycle.js` prepares fonts and offset data
4. it emits `ready_to_swap`
5. `useInlineSessionRuntime.js` commits swap state in a microtask
6. render authority becomes `dom-preview`
7. RAF-based post-paint stabilization runs
8. overlay reports `preview_ready`
9. authority becomes `dom-editable`
10. caret becomes visible and editable focus is reclaimed
11. finish/done/cancel clears the mount session and returns authority to Konva

Timing-sensitive boundaries:

- font readiness or timeout
- microtask swap commit
- RAF-based paint stabilization
- focus reclaim after authority transfer

### 8.4 Guide Evaluation

Current guide evaluation order is:

1. drag sample stores latest guide payload
2. `scheduleGuideEvaluation(...)` requests RAF
3. RAF callback flushes pending payload
4. `mostrarGuias(...)` computes guide lines and may snap the live node
5. `guide-post-snap-sync` updates drag-overlay bounds if the session still matches
6. `CanvasGuideLayer` reflects the latest guide lines

Timing-sensitive boundary:

- guide output is intentionally deferred behind RAF, so guide visuals and snapped overlay sync do not happen in the same micro-step as the raw drag sample

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
| Guide evaluation request | Latest payload + RAF pending state; not a durable public session id | Composer guide scheduler | Late guide flush can target a superseded drag unless the overlay session check rejects it. |

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
| `README.md` described a standard create-next-app project with `pages/api` and Vercel deployment defaults. | The repo is a Firebase-hosted Next.js dashboard with Cloud Functions, Firestore, Storage, and an imported backend generator path. | Repo onboarding from the README was actively misleading. |
| `DRAG_ALIGNMENT_GUIDES_ANALYSIS.md` described `scheduleGuideEvaluation` as effectively an immediate flush behind a scheduling name. | `CanvasStageContentComposer.jsx` now uses RAF coalescing when `requestAnimationFrame` is available and only falls back to immediate flush when RAF is unavailable. | Guide timing, lag, and overlay resync analysis change materially if scheduling is no longer immediate. |
| `PREVIEW_PUBLISH_VISUAL_BASELINE.md` anchored itself to `PREVIEW_SYSTEM_TARGET.md`. | The current preview source of truth is `PREVIEW_SYSTEM_ANALYSIS.md` plus the compatibility matrix/tests, not the target doc. | Test/baseline readers were being sent to intended architecture instead of current behavior. |
| `inline-focus-rca-evidence.md` used `text-system-rules.md` as its architecture source. | The actual current-state inline architecture is distributed across the live runtime modules audited here. | Diagnostic notes need to point to a verified current-state source, not a mixed rules document. |
| `SELECTION_BOX_DRAG_BEHAVIOR.md`, `TEXT_GEOMETRY_CONTRACT.md`, `TEXT_VISUAL_BOX_AUTHORITY.md`, and `text-system-rules.md` acted as separate current-state contracts. | Current behavior is split across composer state, selection visual modes, transformer suppression, inline runtime, hover logic, and guide scheduling. No single one of those deleted documents matched the running system by itself. | Multiple partially-overlapping contract docs create contradictions faster than they reduce ambiguity. |
| Target/gap docs (`*_TARGET.md`, `*_GAPS.md`, `GROUP_RENDER_MODEL.md`) sat next to current-state docs without strong separation. | The code contains current behavior plus compatibility/fallback branches that do not match those target-state documents exactly. | Readers could mistake desired architecture for implemented behavior. |

## 12. Failure Taxonomy

| Failure class | Current architectural cause |
| --- | --- |
| `stale geometry` | Different consumers read different geometry sources: live nodes, fallback object data, projected DOM rects, or frozen settle snapshots. |
| `flicker` | Visual ownership changes across hover, transformer, drag overlay, and inline DOM authority are not one atomic renderer swap. |
| `hover persistence` | Hover has id-only identity and multiple delayed cleanup paths. |
| `delayed teardown` | Drag-overlay and transformer teardown are intentionally delayed by settle and handoff guards. |
| `startup desync` | First visible drag-overlay frame correctness depends on `controlled-sync` winning over seed/replay/fallback paths. |
| `session resurrection` | Late settle/cleanup/swap work can target a no-longer-current drag or inline session if identity checks regress. |
| `guide / snap lag` | Guide evaluation is RAF-coalesced and can mutate live nodes after the drag sample that triggered it. |
| `overlay / canvas mismatch` | DOM inline projection depends on stage viewport metrics and authority timing, while canvas visuals depend on live Konva geometry and suppression rules. |
| `text bounds mismatch` | Text consumers prefer authoritative text rects, but generic rect fallbacks still exist. |

## 13. Risk and Fragility Analysis

Current highest-risk interaction areas, ranked by severity:

1. Drag-overlay startup and handoff
   - correctness depends on one specific visibility boundary and delayed selected-phase handoff confirmation
2. Inline DOM/Konva authority swap
   - focus, caret, visual authority, and geometry projection are coordinated across multiple phase boundaries
3. Selection-box ownership split
   - selected-phase and drag-phase use different owners and different geometry tolerance rules
4. Text geometry consumers
   - hover, selection, drag overlay, snap, and DOM overlay all depend on the same live text geometry but do not all fail the same way
5. Guide/snap live mutation plus overlay resync
   - snapping is live-node mutation, not a pure preview calculation
6. Compatibility globals and custom events
   - external consumers and some internal consumers still depend on non-local imperative contracts

## 14. Missing Documentation

This audit reduces ambiguity substantially, but the repo still lacks a few useful supporting documents:

- a bridge/event glossary listing producers and consumers of each custom event and `window.canvasEditor` method
- a focused geometry/projection reference for stage-space to viewport-space conversion utilities
- a current mobile/touch interaction note covering stage tap, scroll, marquee, and post-drag guards
- a debug instrumentation guide for BOXFLOW and inline focus traces

## 15. Document Cleanup Plan

### 15.1 Delete

Delete these outdated or overlapping documents:

- `docs/architecture/SELECTION_BOX_DRAG_BEHAVIOR.md`
- `docs/architecture/TEXT_GEOMETRY_CONTRACT.md`
- `docs/architecture/TEXT_VISUAL_BOX_AUTHORITY.md`
- `docs/architecture/text-system-rules.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_ANALYSIS.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_GAP_ANALYSIS.md`
- `docs/architecture/DRAG_ALIGNMENT_GUIDES_TARGET.md`
- `docs/architecture/DRAG_OVERLAY_STARTUP_TARGET.md`
- `docs/architecture/GROUP_RENDER_MODEL.md`
- `docs/architecture/PREVIEW_SYSTEM_GAPS.md`
- `docs/architecture/PREVIEW_SYSTEM_TARGET.md`

### 15.2 Rewrite from Scratch

Rewrite these docs to reduce duplication and point to one canonical source:

- `README.md`
- `docs/architecture/EDITOR_SYSTEM.md`

### 15.3 Update and Keep

Update cross-references in:

- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
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
2. For single dragged `texto`, `forma`, `icono`, and `icono-svg` elements, `scheduleGuideEvaluation(...)` now flushes guide evaluation synchronously instead of waiting for a later RAF boundary, so the guide decision, snap mutation, post-snap reread, and overlay resync remain inside the same drag sample.
3. `mostrarGuias(...)` in `useGuiasCentrado.js` now reads the active drag box from the live node only; it no longer feeds drag input position into the active drag box reader, and for non-text families it aligns that live reread with the same selection-rect basis used by overlay sync.
4. If snap commits, `mostrarGuias(...)` still mutates the live node, then immediately re-reads `postSnapBox` from the same family-aligned live geometry path before returning the guide outcome.
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
- Single dragged `forma`, `icono`, and `icono-svg` elements now use the same synchronous guide-evaluation timing rule as text so guide snap cannot lag one visual beat behind the raw dragmove sample.
- `SelectionBoundsIndicator.jsx` now reads authoritative text rects, not generic `getClientRect(...)`, when comparing the rendered drag overlay against visible text geometry.
- The verified root cause of the text vibration was both timing-sensitive snap resync and geometry inconsistency.
- The dominant earlier correctness issue for text in code was geometry inconsistency: the guide path could reason from an input-position-adjusted text pose while the drag overlay was synchronized from live selection bounds.
- The remaining Phase 2 bug after that first text fix was the scheduling gap: text guide evaluation could still be deferred behind the ordinary dragmove sample, exposing raw-position text first and snapped overlay convergence later when guide activity was active.
- The verified remaining non-text correctness issue was a combined geometry-basis and scheduler mismatch: shapes/icons could still evaluate guide thresholds from a different live envelope than overlay sync, and that guide work could still be deferred one visual step through RAF.
- Current instrumentation now logs threshold-oscillation hints (`rapidFlip`, `thresholdOscillationLikely`), geometry family (`authoritative-text-rect`, `selection-live-rect`, or fallback), before/after overlay rects, and mismatch classification so text, shape, and icon guide scenarios can be validated explicitly.

Verification note:

- The code-side Phase 2 follow-up is implemented, but this current-state document does not treat Phase 2 as operationally closed until the text, shape, and icon drag scenarios near horizontal/vertical guides are manually re-verified in the browser with the new instrumentation.

## 19. Architectural Unknowns

- The code provides strong local sequencing around drag-overlay startup and inline swap, but there is no single end-to-end runtime trace that proves every intra-frame ordering across all React effects in every browser.
- Hover and guide behavior are clear for the main canvas path, but this audit did not attempt to enumerate every possible external caller of `window.setHoverIdGlobal`.
- The exact cross-browser selection/caret quirks of `InlineTextOverlayEditor.jsx` are not fully documented in code comments; the runtime compensations are visible, but not all browser-specific motivations are explicit.

## 20. Assumptions

- Assumption: where this document describes exact sub-frame ordering inside the inline DOM swap path, that order is inferred from the hook structure, emitted phase transitions, and runtime state transitions in the audited modules; the code does not expose one centralized timeline tracer for every inner step.
- Assumption: template editor sessions use the same interaction/rendering subsystem as draft sessions unless a preview/publish-facing bridge explicitly branches by session kind. This matches the active `CanvasEditor.jsx` composition.

## 21. Critical Invariants

These invariants are detectable in the current code and should be treated as explicit system rules for future work:

- Persisted object coordinates are section-local. Stage-space Y is derived at render time and converted back on commit.
- Box-level visual ownership is prioritized: drag-overlay over selected-phase visuals, selected-phase visuals over hover.
- The first visible drag-overlay frame must come from the active session's `controlled-sync` path using live-node geometry.
- During active drag, text geometry must come from `resolveAuthoritativeTextRect(...)` or the drag-time bounds resolution must fail closed for that frame.
- Guide snap is allowed to mutate the live node, but the drag overlay must then resynchronize from a post-snap live reread in the same guide outcome path.
- Guide evaluation only participates in the individual single-element drag pipeline; it is not the authority for multi-selection/group drag.
- If guide snap mutates the live node during drag, the drag-overlay bounds must be resynchronized from live geometry afterward.
- Inline DOM overlay visual ownership requires a matching inline mount session, matching session/token acknowledgement, `swapCommitted`, and `renderAuthority` in a DOM-owned phase.
- Drag-overlay teardown after drag end is not allowed to preempt selected-phase readiness; the handoff waits for visible, ready, and post-paint confirmation.
- Text consumers should prefer authoritative live text geometry. Generic client-rect fallback is a compatibility path, not a preferred geometry source.
- External consumers should read live editor state through `window.editorSnapshot`, documented bridges, or custom events, not through scratch globals.
