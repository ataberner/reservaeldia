# SELECTION BOX DURING DRAG

## 1. Scope
This document describes the current selection-box behavior during element drag in the editor, based on the code paths that are active today.

It does not describe an idealized architecture. When the implementation is hybrid, delayed, or best-effort, this document keeps that behavior explicit.

Primary code paths reviewed for this document:

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
- `src/drag/dragIndividual.js`
- `src/drag/dragGrupal.js`
- `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`

## 2. Current Summary
- The visible selection box during active drag is rendered by a drag-layer `SelectionBoundsIndicator` in `controlled` mode.
- `CanvasStageContentComposer` is the coordinator for drag-overlay session identity, controlled bounds updates, startup gating, settling, and cleanup.
- During active drag, the controlled drag overlay uses live Konva node geometry only. It does not fall back to persisted object geometry.
- The ids represented by the drag overlay are a derived drag-session snapshot, not always the same as committed selection.
- After drag end, the selection box can remain visible through a settling phase while selection restoration, deferred commit, and guide cleanup happen.
- Outside the controlled drag overlay path, selection-box rendering is split between `SelectionTransformer`, `SelectionBoundsIndicator` in `auto` mode, and `HoverIndicator`.

## 3. Participating Layers
| Layer | Real role in current implementation | Authoritative input | Notes |
| --- | --- | --- | --- |
| Logical selection state | Tracks committed selected ids, preselection, marquee state | React state in `CanvasEditor.jsx`, mirrored through `editorSelectionRuntime` | Still split across React and runtime mirrors |
| `pendingDragSelection` | Bridges selection intent and same-gesture drag startup | Selection runtime plus legacy global mirrors | Used when selection and drag start overlap |
| `dragVisualSelection` | Tracks which ids should visually drive the drag overlay | Composer-local state mirrored into selection runtime | Not persisted and not exposed as a stable `window` contract |
| `SelectionTransformer` | Selected-phase box for non-line, non-preserved-group selections | Live attached Konva nodes | Can remain mounted while visuals are suppressed |
| `SelectionBoundsIndicator` (`auto`) | Selected-phase bounds box for line or preserved-group paths | Live nodes when available, otherwise object geometry fallback | Different geometry contract than controlled drag overlay |
| `SelectionBoundsIndicator` (`controlled`) | Drag-layer selection box during predrag, drag, and settling | Imperative bounds pushed by composer | Does not self-compute bounds |
| `HoverIndicator` | Hover-only box | Live hover node geometry | Force-cleared at interaction boundaries |
| Composer | Orchestrates box ownership, drag session identity, controlled sync, cleanup | Drag session refs, selection runtime, live node sampling | Real box-flow owner during drag |
| Drag interaction coordinator | Keeps interaction `active` and `settling` state | `useCanvasInteractionCoordinator()` | Settling lasts for two `requestAnimationFrame` ticks after the last active interaction ends |
| Controlled/buffered snapshots | Keep last drag-overlay bounds and startup metadata | Composer refs plus startup gate state | Includes seed, buffered, pending-visible, and replayable snapshots |
| Legacy globals | Compatibility surface for older consumers | `window._isDragging`, `window._pendingDragSelectionId`, `window._pendingDragSelectionPhase`, others | Still active during selection/drag/transform flows |

## 4. Which Component Renders The Selection Box By Phase
| Phase | Primary visible renderer | What it represents | Geometry source |
| --- | --- | --- | --- |
| Hover | `HoverIndicator` | Hovered node only | Live node client rect or rotated polygon |
| Selected, transformer-managed | `SelectionTransformer` | Committed selection | Live attached nodes |
| Selected, line/group path | `SelectionBoundsIndicator` in `auto` mode | Committed selection | Live nodes when available, otherwise object geometry fallback |
| Predrag | Drag-layer `SelectionBoundsIndicator` in `controlled` mode can become the box owner, even before it is visibly shown | Pending drag visual selection | Seeded live-node bounds may be sampled, but startup gate can keep them non-visible |
| Active drag | Drag-layer `SelectionBoundsIndicator` in `controlled` mode | Active drag overlay selection | Live node bounds only |
| Settling | Same controlled drag-layer indicator | Last drag overlay session snapshot, held during reconciliation | Last applied controlled bounds snapshot |
| Post-cleanup terminal state | `SelectionTransformer`, `SelectionBoundsIndicator` (`auto`), or none | Final committed selection or cleared selection | Depends on surviving selected-phase path |

Important distinction:

- Visible ownership is phase-driven.
- Actual implementation still uses suppression, delayed cleanup, and replay-safe snapshots rather than guaranteed immediate unmount of every competing layer.

## 5. Full Drag Lifecycle

### 5.1 Before Native Drag Start
`ElementoCanvasRenderer` receives the press through `handlePressStart`.

Possible outcomes at this stage:

- plain selection only
- same-gesture select-and-drag
- already-selected item entering predrag

For same-gesture select-and-drag, the stage composer can immediately commit selection intent and set:

- `pendingDragSelection = { id, phase: "predrag" }`

This matters because native drag start can happen before the next React render sees the committed selection update.

### 5.2 Predrag Start
Predrag starts when the pointer crosses the movement threshold watched by `ElementoCanvasRenderer.armPredragReleaseListeners`.

When that happens:

- `ElementoCanvasRenderer` calls `onPredragVisualSelectionStart`
- the composer runs `beginPredragVisualSelection`
- hover is force-cleared
- a drag-overlay session is created or updated with phase `predrag`
- `dragVisualSelectionIds` and the mirrored runtime snapshot are updated
- transformer attachment is detached for the dragged node path

Predrag is not only a preview hint. It is the first phase where drag-overlay ownership is established.

The visible box may still remain hidden at this point because the startup gate can reject seed sources such as:

- `predrag-seed`
- `drag-selection-seed`
- `controlled-seed`
- `group-drag-start`

### 5.3 Drag Start
Native Konva `onDragStart` marks drag-active state.

Current drag-start side effects include:

- `window._isDragging = true`
- dispatch of `dragging-start`
- start of individual or group drag engine
- `beginCanvasInteraction("drag")`
- creation or refresh of the drag settle session
- promotion of the drag-overlay session phase to `drag`
- clearing of preselection

The composer also calls `beginDragVisualSelection`.

Selection ids for the drag overlay are resolved in this order:

1. Active drag-overlay session `selectedIds`
2. `dragVisualSelectionIds`
3. Fallback selection snapshot passed by the caller

Then `resolveDragVisualSelectionIds` applies one more rule:

- if the current selection snapshot does not include the active `dragId`, the overlay selection collapses to `[dragId]`

That means visual overlay membership can intentionally diverge from committed selection at drag start.

### 5.4 First Visible Drag Frame
The first visible drag-overlay frame is gated.

Current startup rule:

- only a `controlled-sync` snapshot whose `syncToken` matches the first authoritative live drag sample may become the first visible frame

This is coordinated through:

- `recordSelectionDragMoveSummary`
- `syncControlledDragOverlayBounds`
- `dragOverlayStartupGate`
- `dragOverlayVisibilityLifecycle`

So the first visible box during drag is not a generic seed. It is the first accepted controlled sync derived from live node geometry for the active session.

### 5.5 Active Drag
During active drag:

- drag engines move live Konva nodes
- the composer samples live selection bounds on `dragmove`
- `syncControlledDragOverlayBounds` applies those bounds to the controlled indicator

What is reconciled mid-drag:

- box geometry is re-sampled from live nodes
- drag overlay session identity is preserved
- visual selection membership stays tied to the drag session snapshot

What is not reconciled mid-drag:

- committed selection is not continuously repaired on every move

Selection repair is deferred to post-drag settling when needed.

### 5.6 Drag End
Native `onDragEnd` does not immediately destroy the selection box.

Current drag-end effects:

- `window._isDragging = false`
- dispatch of `dragging-end`
- drag engine finalization runs
- the composer moves the drag-overlay session to `settling`
- `endCanvasInteraction("drag")` starts the interaction coordinator settle countdown
- post-drag UI refresh is scheduled through `scheduleCanvasUiAfterSettle` or `requestAnimationFrame`

### 5.7 Settling
Settling is a real transitional phase in the current implementation.

During settling:

- `showDragSelectionOverlay` can remain `true`
- hover stays suppressed
- transformer visuals remain suppressed
- the controlled drag overlay can continue to render the last applied bounds snapshot

This is not a recomputation from persisted object data.

It is the previous controlled drag snapshot being held while the system resolves:

- deferred selection commit for same-gesture drag starts
- selection restoration for already-selected drags
- guide cleanup
- drag visual selection cleanup

### 5.8 Visual Cleanup
`queuePostDragUiRefresh` performs the main cleanup after settling.

Cleanup can:

- clear `pendingDragSelection`
- commit `[dragId]` as the selection if drag started before committed selection caught up
- restore missing committed selection if the drag began from an already-selected object
- clear guides
- clear drag visual selection if the visual session still matches the settle session

There is also an idle fallback effect that clears leftover drag visual selection when drag, settling, and settle session state are all gone.

## 6. Source Of Truth During Drag

### 6.1 Selection Membership
There is no single selection source that owns every drag phase.

Current hierarchy:

1. Active drag-overlay session `selectedIds`
2. Composer-local `dragVisualSelectionIds`
3. Committed selection snapshot from runtime or React state
4. `resolveDragVisualSelectionIds` collapse to `[dragId]` when the committed snapshot does not contain the dragged id

Practical consequence:

- the visible drag box is driven by a derived drag-session selection snapshot
- committed selection can lag behind it during same-gesture drag startup

### 6.2 Geometry
The controlled drag overlay uses:

- `resolveSelectionBounds(... requireLiveNodes: true)`

So active drag geometry comes from current live Konva node bounds only.

It does not use:

- the last persisted object snapshot
- a fallback rect from object `x/y/width/height`

Outside the controlled drag overlay path, `SelectionBoundsIndicator` in `auto` mode can use object geometry fallback when live nodes are missing.

### 6.3 Post-Drag Settling
During settling, the still-visible drag selection box represents:

- the last controlled live-drag bounds snapshot that was already applied

It does not necessarily represent:

- freshly committed persisted geometry
- a fresh recomputation from committed selection state

## 7. Priority Between Visual Layers
Current visible priority is:

1. Drag overlay during `predrag`, `drag`, and `settling`
2. Selected-phase box (`SelectionTransformer` or `SelectionBoundsIndicator` auto path)
3. Hover box

That priority is enforced through a mix of:

- explicit phase checks
- attach suppression
- visibility suppression
- forced hover clear
- delayed post-settle cleanup

It is not implemented as a single central unmount switch.

## 8. Terminal And Transitional States
Transitional states:

- `predrag`
- `drag`
- `settling`

Terminal states:

- `selected`
- `idle`

Current implementation detail:

- `onDragEnd` enters a transitional state, not a terminal one
- the system only returns to a terminal state after settle scheduling and cleanup finish

## 9. What The Selection Box Represents During Drag
| Moment | Selection membership | Geometry meaning |
| --- | --- | --- |
| Predrag before first visible frame | Drag session selection snapshot, often already resolved around `dragId` | Seed/live bounds may be sampled but can still be non-visible |
| Active drag | Derived drag session snapshot | Current live node geometry |
| Settling | Last drag session snapshot still associated with the settle session | Last applied controlled bounds snapshot |
| Selected-phase auto indicator outside drag | Committed selection | Live node geometry when possible, otherwise object geometry fallback |

So the drag selection box is currently a hybrid:

- membership is a derived drag-session snapshot
- active-drag geometry is live node geometry
- settling geometry is the last retained controlled snapshot

## 10. Why The Selection Box Can Become Offset

### 10.1 Same-Gesture Drag Starts Can Begin With A Stale Committed Selection Snapshot
Committed selection lives in React state plus the selection runtime mirror.

During same-gesture select-and-drag, drag can start before the next render reflects the new committed selection.

Current compensation path:

- `pendingDragSelection`
- `dragVisualSelection`
- drag-overlay session `selectedIds`
- deferred commit in post-drag settling

Result:

- the visible box can be correct for the drag session while committed selection still points at the previous snapshot

### 10.2 Seed, Buffered, And Replay Snapshots Still Exist Internally
The startup gate prevents seed snapshots from being the first visible frame, but the system still stores:

- buffered startup snapshots
- pending visible snapshots
- replay-eligible controlled snapshots after first visibility

Assumption:

- a replayed controlled snapshot can become user-visible after a remount or visibility interruption because replay is allowed once the first visible frame was already established for the session

This is a code-path conclusion from `dragOverlayStartupGate.js`. This review did not confirm a specific on-screen remount sequence.

### 10.3 Settling Holds The Last Drag Snapshot While Logical Selection Reconciles
After drag end, the box can remain visible on the last applied controlled bounds while:

- selection is committed or restored
- guides are cleared
- drag visual state is checked against the settle session

That means the visible box can temporarily describe the final live drag sample instead of the newly committed selection state.

### 10.4 Different Box Paths Use Different Geometry Fallback Rules
`SelectionBoundsIndicator` in `auto` mode can fall back to object geometry.

The controlled drag overlay cannot.

So a handoff between:

- drag overlay
- transformer
- auto bounds indicator

can expose geometry differences when live nodes are missing, stale, or restored on different frames.

### 10.5 Transformer Detach And Restore Are Not Instantaneous
Predrag explicitly detaches the transformer for the dragged node path.

Restore can happen later through:

- a later render
- an element ref registration event
- `requestAnimationFrame`-timed cleanup

This creates a real transitional window where the visible selection box depends on drag-overlay timing rather than immediate transformer continuity.

## 11. Authoritative Vs Best-Effort Layers
Authoritative during active drag:

- active drag-overlay session identity
- `resolveDragVisualSelectionIds` collapse rule
- live node bounds used by `syncControlledDragOverlayBounds`
- first visible controlled-sync gate

Best-effort or compatibility layers:

- React committed selection during same-gesture drag startup
- legacy global mirrors
- hover cleanup fallbacks at drag start
- idle cleanup of leftover drag visual state
- auto indicator object-geometry fallback
- replay-safe snapshot retention

## 12. Expected Behavior Vs Actual Behavior Vs Previous Documentation
| Concern | Expected mental model | Actual current behavior | Documentation change |
| --- | --- | --- | --- |
| Source of truth during drag | One committed selection state owns both logic and box | Visual box membership is a drag-session snapshot that can diverge from committed selection | This document and `EDITOR_SYSTEM.md` now split logical selection from drag-visual selection |
| Drag box geometry | Selection box follows persisted object geometry continuously | Active drag uses live node bounds only; settling holds last controlled snapshot | Docs now distinguish active drag geometry from settling and persisted data |
| Drag end | Box disappears immediately on drag end | Box can remain through settling and post-drag cleanup | Docs now treat drag end as transitional, not terminal |
| Selection-box renderer | Same component renders the box through the whole flow | Hover, transformer, auto bounds indicator, and controlled drag overlay all participate | Docs now name the renderer by phase |
| Fallback behavior | All selection boxes use the same geometry rules | Controlled drag overlay requires live nodes; auto indicator may fall back to object geometry | Docs now document geometry fallback differences explicitly |

## 13. Confirmed Behavior
- Predrag starts before full drag-active state and already transfers visual ownership away from hover and transformer paths.
- The first visible drag-overlay frame is gated to a `controlled-sync` snapshot that matches the first authoritative drag sample for the active session.
- Active drag overlay geometry comes from live Konva nodes only.
- The drag overlay can outlive native drag end and remain visible during settling.
- Post-drag cleanup can commit deferred selection, restore missing selection, clear guides, and only then clear drag visual selection.
- Outside the controlled drag overlay path, selected-phase bounds can come from either transformer geometry or auto indicator fallback geometry.

## 14. Ambiguous Behavior
- Assumption: replay-eligible controlled snapshots can become visible after remount or visibility interruption, but this review did not confirm a concrete user-visible remount sequence.
- Assumption: some drag starts may still rely on drag-start hover clear as the primary boundary instead of predrag on specific device or element paths, because the fallback is still implemented and kept active.

## 15. Fragilities
- Selection authority is still split across React state, runtime mirrors, drag-session refs, legacy globals, and live node state.
- Visual ownership and logical selection reconciliation are intentionally decoupled during drag startup and drag end.
- Different selection-box paths use different geometry source rules.
- Cleanup depends on timed settle windows and session-matching guards.
- Transformer detach and restore still rely on imperative sequencing and delayed recovery paths.

## 16. Open Questions
- Whether replay-safe controlled snapshots are still needed only for remount resilience, or whether they remain part of a broader startup-recovery strategy.
- Whether any remaining consumers still depend on the exact timing of `_pendingDragSelectionId` or `_pendingDragSelectionPhase` relative to drag-overlay visibility.
- Whether all touch, mobile, group, gallery, and countdown drag paths enter predrag consistently before the first visible drag-overlay frame, or whether some still rely on the drag-start fallback path.
