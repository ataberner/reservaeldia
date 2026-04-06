# SELECTION BOX DURING DRAG

## 1. Scope And Status
This document is the formal selection-box model for the current editor implementation.

It is grounded in the code paths that are active today. It does not describe an idealized future architecture.

If runtime behavior diverges from this document, one of two things is true:

- the implementation changed and this document is stale
- the runtime is violating the documented model

Normative keywords in this document:

- `MUST` / `MUST NOT` describe enforceable behavior already supported by the current implementation
- `MAY` describes allowed behavior that the current implementation explicitly permits
- `Assumption` marks behavior that the code suggests but this review did not fully prove across every runtime path

Primary code paths reviewed:

- `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`
- `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`
- `src/components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx`
- `src/components/HoverIndicator.jsx`
- `src/components/editor/textSystem/render/konva/selectionVisualModes.js`
- `src/components/editor/canvasEditor/useCanvasInteractionCoordinator.js`
- `src/components/editor/canvasEditor/useCanvasEditorSelectionRuntime.js`
- `src/lib/editorSelectionRuntime.js`
- `src/components/editor/textSystem/render/konva/dragOverlayStartupGate.js`
- `src/components/editor/textSystem/render/konva/dragOverlayVisibilityLifecycle.js`
- `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`
- `src/drag/dragIndividual.js`
- `src/drag/dragGrupal.js`

## 2. Selection Box Model

### 2.1 Model Terms
The current implementation uses three different selection concepts that MUST remain distinct in documentation and in reasoning:

- `logical selection`: the committed editor selection, stored in React state and mirrored through `editorSelectionRuntime`
- `drag-session selection`: the derived selection membership for the active drag-overlay session
- `visual selection`: the ids represented by the currently visible selection-box owner

The current implementation also uses three different authority concepts:

- `visual authority`: which component is allowed to render the visible selection box
- `geometry authority`: which source is allowed to define the box geometry
- `selection authority`: which ids are allowed to define the box membership

Fallback terminology:

- `fallback behavior`: resilience or compatibility behavior that the runtime still carries
- fallback behavior MAY remain active internally
- fallback behavior MUST NOT become visible authority unless the phase contract explicitly promotes it

### 2.2 Phase Contract
The drag lifecycle contract is:

- `idle`
- `hover`
- `selected`
- `predrag`
- `drag`
- `settling`

`predrag`, `drag`, and `settling` are transitional phases.

`idle`, `hover`, and `selected` are terminal or stable phases.

Current fallback allowance:

- a direct drag-start path MAY enter `drag` without a separately observed `predrag` transition
- if that happens, the runtime MUST still satisfy the `predrag` obligations before the first visible drag frame: hover clear, selected-phase suppression, and drag-overlay ownership handoff

### 2.3 Phase Ownership And Authority
| Phase | Visible selection-box owner | Selection authority | Geometry authority | Layers that MUST be suppressed |
| --- | --- | --- | --- | --- |
| `idle` | none | none for visible box | none for visible box | `hover-indicator`, selected-phase box, `drag-overlay` |
| `hover` | `HoverIndicator` | hovered target id, not committed selection | live hover node geometry | selected-phase box, `drag-overlay` |
| `selected` transformer-managed path | `SelectionTransformer` | committed logical selection | live attached Konva nodes | `hover-indicator`, `drag-overlay` |
| `selected` line/group path | `SelectionBoundsIndicator` in `auto` mode | committed logical selection | `resolveSelectionBounds(... requireLiveNodes: false)` | `hover-indicator`, `drag-overlay` |
| `predrag` | `drag-overlay` owns the box even if the box is still visually hidden | drag-session selection | no first visible box yet until startup contract is satisfied | `hover-indicator`, selected-phase box |
| `drag` | drag-layer `SelectionBoundsIndicator` in `controlled` mode | drag-session selection | live-node bounds from `resolveSelectionBounds(... requireLiveNodes: true)` | `hover-indicator`, selected-phase box |
| `settling` | same controlled drag-layer indicator | settle-session drag selection snapshot | frozen last applied controlled bounds snapshot | `hover-indicator`, selected-phase box |

Current selected-phase nuance:

- `SelectionTransformer` is the selected-phase owner for non-line, non-preserved-group selections
- `SelectionBoundsIndicator` in `auto` mode is the selected-phase owner for line and preserved-group paths
- `LineControls` is a selected-phase interaction surface, but it does not replace the selection-box ownership contract

### 2.4 Phase Transition Contract
| Phase | Core allowed transitions | Fallback-only transitions | Forbidden transitions |
| --- | --- | --- | --- |
| `idle` | `hover`, `selected`, `predrag` | none confirmed | `drag`, `settling` |
| `hover` | `idle`, `selected`, `predrag` | `drag` only when a direct drag-start path misses predrag and relies on drag-start hover clear | `settling` |
| `selected` | `idle`, `selected`, `predrag` | `drag` only when a direct drag-start path misses predrag and relies on drag-start suppression | `hover`, `settling` |
| `predrag` | `drag`, `selected`, `idle` | none confirmed | `hover`, `settling` |
| `drag` | `settling` | none | `idle`, `hover`, `selected`, `predrag` |
| `settling` | `selected`, `idle` | none | `hover`, `predrag`, `drag` |

Transition rules:

- `drag` MUST NOT return directly to `selected` or `idle`
- `drag` MUST pass through `settling`
- `settling` MUST finish before the runtime returns visible ownership to `selected` or `idle`
- `hover` MUST NOT remain visible once `predrag` has started

### 2.5 Authority Model And Priority Rules

#### Visual Authority
Visible selection-box ownership MUST follow this priority order:

1. `drag-overlay`
2. selected-phase box (`SelectionTransformer` or `SelectionBoundsIndicator` auto path)
3. `HoverIndicator`

Rules:

- only one layer MAY visibly own the selection box at a time
- a lower-priority layer MAY remain mounted or mirrored internally
- a lower-priority layer MUST NOT remain visibly authoritative once a higher-priority layer owns the phase

#### Selection Authority
Selection authority MUST be resolved differently depending on phase.

Stable phases:

- in `selected`, the visible box MUST use committed logical selection
- in `hover`, the visible box MUST use the hovered target id, not committed selection

Drag-related phases:

- in `predrag`, `drag`, and `settling`, the visible box MUST use drag-session selection, not committed logical selection
- committed logical selection MAY lag during same-gesture select-and-drag startup
- that lag MUST be repaired during settling, not by forcing mid-drag logical selection mutation

Current drag-session selection priority:

1. active drag-overlay session `selectedIds`
2. composer-local `dragVisualSelectionIds`
3. committed selection snapshot from runtime or React state
4. collapse to `[dragId]` when the committed snapshot does not contain the active dragged id

So the current drag box model is:

- logical selection remains the editor's committed selection authority
- drag-session selection becomes the visible selection authority during `predrag`, `drag`, and `settling`
- visual selection is the output of the phase owner using that phase's authority

#### Geometry Authority
Geometry authority MUST also be phase-specific:

- `hover` MUST use live hover node geometry
- `selected` transformer-managed path MUST use live attached node geometry
- `selected` auto path MUST use `resolveSelectionBounds(... requireLiveNodes: false)`
- `drag` MUST use live-node geometry from `resolveSelectionBounds(... requireLiveNodes: true)`
- `settling` MUST use the frozen last controlled drag snapshot

## 3. Geometry Contract

### 3.1 Drag Phases
For `predrag` visible startup, `drag`, and `settling`:

- the drag overlay MUST be the only visible geometry authority
- active drag geometry MUST come from live nodes only
- object-data fallback MUST NOT be used as drag-overlay geometry authority
- the visible drag overlay MUST NOT mix geometry from multiple visual owners in the same phase

### 3.2 Selected Phase
For selected transformer-managed selections:

- geometry MUST come from live attached Konva nodes

For selected line/group auto-indicator selections:

- geometry MUST be resolved through `resolveSelectionBounds(... requireLiveNodes: false)`
- this resolver MUST prefer live nodes
- this resolver MAY fall back to object `x/y/width/height` when live nodes are missing

Important current limitation:

- the selected auto-indicator resolver can combine live-node rects and object-data fallback rects inside one union calculation
- that mixed-source union is permitted only inside this selected-phase fallback contract
- it MUST NOT be promoted into drag-overlay geometry authority

### 3.3 Settling Geometry
During `settling`:

- the visible selection box MUST represent the last controlled drag snapshot that was already applied for the active settle session
- settling geometry MUST be frozen
- settling geometry MUST NOT be recomputed from object data
- settling geometry MUST NOT switch to selected-phase auto fallback geometry before drag-overlay ownership ends
- settling geometry MUST NOT switch back to transformer geometry before drag-overlay ownership ends

### 3.4 Recompute Rules
Geometry MUST be recomputed when:

- active drag `dragmove` produces a new live-node bounds sample for the active session
- a selected-phase box is newly mounted or remounted after drag-overlay cleanup

Geometry MUST NOT be recomputed when:

- `settling` is holding the last controlled drag snapshot
- startup has not yet reached the first valid visible controlled-sync boundary

## 4. Startup Contract

### 4.1 Ownership Before Visibility
`predrag` transfers ownership to the drag overlay before the overlay is allowed to become visible.

That means:

- `predrag` MUST clear hover
- `predrag` MUST suppress the selected-phase box
- `predrag` MAY prepare internal drag-overlay state without making the box visible

### 4.2 First Visible Drag Frame
The first visible drag-overlay frame is a strict invariant.

The first visible frame MUST:

- come from `controlled-sync`
- belong to the active drag-overlay session
- use the same `syncToken` as the first authoritative live drag sample recorded for that session
- use live-node geometry

The first visible frame MUST NOT come from:

- `predrag-seed`
- `drag-selection-seed`
- `controlled-seed`
- `group-drag-start`
- buffered startup snapshots
- stored current controlled snapshots
- replayed post-startup snapshots

### 4.3 Allowed Deferred Application
The runtime currently allows one deferred-application path without creating a second startup authority:

- a `pendingStartupVisibleSnapshot` MAY be applied later if the startup gate has already promoted it from the same authoritative `controlled-sync` and same drag-overlay session

This path is allowed because it is not a new startup authority. It is a deferred visual application of the already-authoritative startup snapshot.

### 4.4 Replay After Startup
After the first visible frame has already been established for a session:

- a stored controlled snapshot with `startupVisibleEligible === true` MAY be replayed for that same session as a resilience path
- that replay MUST NOT redefine startup authority
- that replay MUST NOT redefine session identity
- that replay MUST NOT be treated as a new first visible frame

### 4.5 Visibility Events
Startup event ordering is part of the contract:

- the first visible controlled-sync frame is the visibility boundary
- `drag-overlay:shown` MUST refer to that boundary
- drag-layer `selection-box:shown` MUST follow the same boundary
- `drag-overlay:ready-state` MUST remain a later readiness notification, not startup visibility authority

## 5. Settling Contract

### 5.1 What Settling Represents
`settling` is the post-drag reconciliation phase.

During `settling`, the visible selection box represents:

- the last controlled drag-overlay bounds snapshot for the active settle session

It does not represent:

- a newly persisted object snapshot
- a selected-phase auto-indicator fallback box
- a restored transformer box

### 5.2 How Long Settling May Last
The current implementation allows settling to last only while the drag handoff is unresolved.

Concretely:

- settling begins after native drag end when the composer moves the drag-overlay session into `settling`
- settling MAY remain active through the interaction coordinator's two-`requestAnimationFrame` settle window
- settling MAY remain active until the scheduled post-drag UI task finishes
- settling MUST end once that scheduled cleanup either clears drag-overlay ownership or hands control back to a selected-phase owner or to `idle`

### 5.3 Cleanup Required Before Terminal State
Before returning to `selected` or `idle`, the normal cleanup path MUST resolve:

- `pendingDragSelection`
- deferred selection commit for same-gesture drag starts, when needed
- selection restoration for already-selected drags, when needed
- guide cleanup
- drag visual selection cleanup when the visual session still matches the settle session

Current fallback cleanup:

- if normal post-drag cleanup does not clear leftover drag visual state, idle cleanup MAY remove it after drag and settling are already over
- idle cleanup is resilience behavior, not the primary terminal-state handoff

### 5.4 Visual Handoff Out Of Settling
The runtime MUST NOT hand visible ownership back early.

Rules:

- the drag overlay MUST remain the visible owner throughout `settling`
- the selected-phase box MUST remain suppressed until drag-overlay cleanup is complete
- once drag-overlay cleanup is complete, the runtime MAY return to `selected` or `idle`

## 6. Layer Priority And Exclusivity

### 6.1 Visible Exclusivity
Only one layer MAY visibly own the selection box at a time.

Priority order:

1. `drag-overlay`
2. selected-phase box
3. `HoverIndicator`

### 6.2 Suppression Contract
Suppression is part of the model, not a cosmetic detail.

When a higher-priority layer owns the phase:

- lower-priority visible layers MUST be hidden, detached, or attach-blocked before or at the same visible boundary
- internal mirrors, refs, buffered snapshots, and compatibility state MAY continue to exist
- those internal paths MUST NOT remain visible authority

Current suppression boundaries:

- `hover` MUST be force-cleared at `predrag`
- selected-phase box MUST be suppressed or detached before the drag overlay becomes visible
- selected-phase box MUST remain suppressed through `drag` and `settling`

## 7. Core Behavior Vs Fallback Behavior
| Mechanism | Classification | Allowed role | MUST NOT do |
| --- | --- | --- | --- |
| active drag-overlay session `selectedIds` | core behavior | primary selection authority for `predrag`, `drag`, `settling` | diverge from active session identity |
| `dragVisualSelectionIds` | core drag coordination | bridge visual selection before or alongside active session reads | become a separate geometry authority |
| `pendingDragSelection` | core coordination state | bridge selection intent and same-gesture drag startup | render the visible box directly |
| `predrag-seed`, `drag-selection-seed`, `controlled-seed`, `group-drag-start` | fallback startup state | seed internal state only | create the first visible drag frame |
| `pendingStartupVisibleSnapshot` already promoted by the startup gate | deferred application of core startup authority | apply the first visible frame later for the same authoritative session | act as a second startup authority |
| replay of a stored controlled snapshot after startup | fallback resilience | reapply the same session's already-established overlay | redefine startup or session authority |
| legacy `window._*` mirrors | compatibility fallback | mirror runtime state for older consumers | override composer/runtime authority |
| drag-start hover clear | fallback cleanup boundary | clear hover if a direct drag-start path missed predrag | replace predrag as the primary hover termination rule |
| idle drag-visual cleanup | fallback cleanup boundary | remove leftover drag visual state after interactions end | clear an active drag session early |
| object-data fallback inside selected auto-indicator path | selected-phase fallback geometry | render selected line/group bounds when live nodes are missing | become drag-overlay geometry authority |

## 8. Hard Invariants
These rules are strict architectural invariants for the current implementation.

- one real drag gesture MUST correspond to one interaction session
- predrag is the primary ownership boundary before drag visibility; if a direct drag-start fallback path misses an explicit `predrag` transition, it MUST still satisfy the same predrag obligations before the first visible drag frame
- only one layer MAY visibly own the selection box at a time
- hover MUST NOT survive into `predrag`, `drag`, or `settling`
- transformer-managed selected-phase visuals MUST NOT remain visibly active while drag-overlay ownership is active
- the first visible drag frame MUST come from authoritative `controlled-sync`
- drag-overlay geometry MUST NOT use object-data fallback during `drag`
- settling MUST freeze the last controlled drag snapshot until cleanup finishes
- drag MUST NOT return directly to `selected` or `idle`
- fallback paths MUST remain subordinate to the phase contract and MUST NOT silently take visual authority

## 9. Traceability To Current Implementation
This model maps directly to the current code:

| Concern | Current implementation surface |
| --- | --- |
| phase visibility decisions | `selectionVisualModes.js` |
| drag-overlay session ownership | `CanvasStageContentComposer.jsx` |
| startup gate and first visible frame | `dragOverlayStartupGate.js`, `dragOverlayVisibilityLifecycle.js` |
| selected-phase transformer path | `SelectionTransformer.jsx` |
| selected-phase auto-indicator path | `SelectionBoundsIndicator.jsx`, `selectionBoundsGeometry.js` |
| hover visibility and forced clear | `HoverIndicator.jsx`, `hoverLifecycle.js` |
| settling window and post-settle scheduling | `useCanvasInteractionCoordinator.js`, `queuePostDragUiRefresh` in `CanvasStageContentComposer.jsx` |
| selection runtime mirrors | `editorSelectionRuntime.js`, `useCanvasEditorSelectionRuntime.js` |

## 10. Clarified Ambiguities
Compared with the previous descriptive version of this document, the model now makes these points explicit:

- `predrag` is a contract boundary, not just a descriptive startup moment
- drag-session selection is the visible selection authority during `predrag`, `drag`, and `settling`
- the first visible drag frame has exactly one valid authority: `controlled-sync`
- replay is split into two cases: deferred application of an already-authoritative startup snapshot, and later resilience replay after startup is already established
- `settling` is a required transitional phase with frozen geometry, not a vague cleanup window
- fallback paths are classified and constrained instead of being described as generic runtime complexity

## 11. Remaining Flexible Points
- The selected auto-indicator path still permits object-data fallback because the current helper supports it.
- The runtime still carries fallback cleanup and replay paths for resilience.
- `Assumption`: some direct drag-start paths on specific devices or element families may still rely on drag-start hover clear instead of reaching predrag first. The fallback is active in code, but this review did not prove which concrete user paths still need it.

## 12. Remaining Fragilities
- Selection authority is still split across React state, runtime mirrors, drag-session refs, legacy globals, and live node state.
- The selected auto-indicator path still permits a mixed live-node plus object-data union inside its fallback resolver.
- Cleanup still depends on timed settle windows and session-matching guards.
- Transformer detach and restore still rely on imperative sequencing and delayed recovery.

## 13. Open Questions
- Whether the selected auto-indicator path should remain allowed to use mixed live-node and object-data union geometry long term, or whether that should be reduced to a stricter single-source fallback later.
- Whether any remaining consumers still depend on `_pendingDragSelectionId` or `_pendingDragSelectionPhase` timing relative to drag-overlay visibility.
- Whether every touch, mobile, gallery, countdown, and group drag path consistently reaches `predrag` before the first visible drag-overlay frame.
