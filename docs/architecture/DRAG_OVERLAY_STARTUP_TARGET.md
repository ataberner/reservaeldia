# DRAG OVERLAY STARTUP TARGET

> Updated from code inspection on 2026-04-06.
>
> Parent contract: [SELECTION_BOX_DRAG_BEHAVIOR.md](./SELECTION_BOX_DRAG_BEHAVIOR.md) ("SELECTION BOX DURING DRAG").
>
> Reviewed current code surfaces: `EDITOR_SYSTEM.md`, `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`, `src/components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx`, `src/components/editor/textSystem/render/konva/dragOverlayStartupGate.js`, `src/components/editor/textSystem/render/konva/dragOverlayVisibilityLifecycle.js`, `src/components/editor/textSystem/render/konva/selectionVisualModes.js`.
>
> Observability basis: current BOXFLOW event names in the reviewed code, plus the delayed-startup BOXFLOW traces referenced in this task.
>
> Priority rule for this document: this file defines the startup-specific target for drag-overlay visibility. It does not replace the broader parent model. It narrows the allowed startup behavior so the current delayed-startup bug can be fixed without ambiguity.

## 1. Scope

- This document governs only drag-overlay startup behavior.
- "Startup" means the handoff from selected/predrag ownership into the first visible drag-overlay frame for the active drag session.
- The broader drag-phase, ownership, selection-authority, geometry-authority, settling, and fallback model remains governed by [SELECTION_BOX_DRAG_BEHAVIOR.md](./SELECTION_BOX_DRAG_BEHAVIOR.md).
- This document is intentionally narrower and stricter than the parent model at one point only: startup visibility timing.
- This document must not be used to redefine non-startup drag behavior.

## 2. Problem Statement

Current observed failure pattern:

- ownership moves to `drag-overlay`
- predrag startup begins through `predrag:visual-selection-start`
- startup render commit occurs through `startup-overlay-render-committed`
- `drag:start` occurs for the same interaction
- authoritative live drag bounds become available through `startup-controlled-sync-ready`
- but the first visible drag-overlay frame does not appear at that startup boundary
- instead, startup falls into deferred controlled-sync through `startup-controlled-sync-apply-deferred`
- the deferred reason in the observed failure is `waiting-controlled-overlay-render-ready`
- the first visible events, `drag-overlay:shown` and drag-layer `selection-box:shown`, arrive later in the drag rather than at drag startup

This is a startup-visibility failure, not a justification to change the parent drag model.

The current code already treats `controlled-sync` as the only valid first-visible authority. The bug is that startup visibility can still be postponed behind render-ready gating even after ownership and authoritative live geometry are already in place.

## 3. Startup Success Criteria

A startup is successful only when all of the following are true:

- The drag overlay becomes visibly shown at the beginning of drag, not later in steady-state drag.
- The first visible frame belongs to the active drag-overlay session.
- The first visible frame uses drag-session selection, not selected-phase logical selection.
- The first visible frame uses authoritative `controlled-sync` geometry derived from live nodes.
- The first visible frame matches the active session identity and the first authoritative startup `syncToken` for that session.
- Hover and selected-phase visuals are already suppressed when that first visible frame appears.
- Later refinement is allowed, but first visibility is not postponed in order to wait for later readiness bookkeeping, replay, or deferred controlled-sync application.

Startup success is therefore not merely "the overlay became visible eventually." It is "the active session became visibly authoritative at drag startup through the first authoritative controlled-sync frame."

## 4. Startup Failure Criteria

The following are invalid startup outcomes:

- `drag:start` occurs, startup ownership is already `drag-overlay`, but the first visible drag-overlay frame appears noticeably later in the same drag.
- `startup-controlled-sync-ready` occurs for the active session, but the session then enters `startup-controlled-sync-apply-deferred`.
- `startup-controlled-sync-apply-deferred` uses `reason = waiting-controlled-overlay-render-ready` and that deferred path is what leads to the first visible frame.
- `startup-controlled-sync-replay-scheduled`, `startup-controlled-sync-waiting-for-mount-ready`, or another later replay/layout-ready path becomes the path that finally produces the first visible frame for that session.
- `drag-overlay:shown` and drag-layer `selection-box:shown` do not occur until after additional drag progression for the same session.
- Any seed, selected-phase visual, or non-authoritative replay becomes the first visible authority.

For this target, the specific invalid pattern called out by current logs is:

1. `drag:start`
2. startup owner already `drag-overlay`
3. `startup-controlled-sync-ready`
4. `startup-controlled-sync-apply-deferred { reason: "waiting-controlled-overlay-render-ready" }`
5. later `drag-overlay:shown`

That sequence is a startup failure even if the later visible frame still uses correct live-node geometry.

## 5. Visibility Vs Readiness

### 5.1 What Counts As Startup Visible

Startup is "visible" only when the drag-overlay selection box has actually become the visible box for the active session.

In current observability terms, that boundary is the first active-session controlled-frame apply that produces:

- `bounds:recalc` for `owner = "drag-overlay"` and `source = "controlled-sync"`
- `drag-overlay:shown` for the same active `dragOverlaySessionKey`
- drag-layer `selection-box:shown` for the same active session

That is the startup visibility boundary.

### 5.2 What Counts As Startup Ready

Startup "ready" is broader and later than startup visible.

Current readiness-related signals include:

- `startup-controlled-sync-ready`
- controlled overlay mount/layout callbacks such as `isControlledMountReady()` / `onControlledMountReady`
- `drag-overlay:ready-state { isReady: true }`

These signals can describe geometry availability, component mount readiness, or lifecycle readiness. They are not allowed to redefine the first visible boundary.

### 5.3 Readiness Checks That May Delay Refinement Only

The following may delay later refinement, confirmation, or replay-safe bookkeeping only:

- `drag-overlay:ready-state`
- controlled mount/layout readiness
- replay scheduling
- post-startup replay of an already visible authoritative snapshot for the same session

### 5.4 Readiness Checks That Must Never Block First Visible Startup Frame

The following must never block the first visible startup frame once authoritative live-node controlled-sync geometry exists for the active session:

- `waiting-controlled-overlay-render-ready`
- `waiting-controlled-overlay-layout-ready`
- `waiting-controlled-overlay-layout-commit`
- any generic "mount ready" or "render ready" confirmation that arrives after authoritative startup geometry already exists

Important distinction:

- lack of authoritative live-node controlled-sync geometry is a correctness precondition
- render-ready or mount-ready gating is not a valid reason to postpone the first visible startup frame

## 6. Log Invariants

### 6.1 Valid Startup

Expected BOXFLOW pattern for a valid startup:

```text
predrag:visual-selection-start
startup-overlay-render-committed
drag:start
startup-controlled-sync-ready
bounds:recalc { source: "controlled-sync", owner: "drag-overlay", phase: "drag" }
drag-overlay:shown { reason: "first-visible-controlled-sync" }
selection-box:shown { source: "drag-overlay", owner: "drag-overlay", phase: "drag" }
drag-overlay:ready-state { isReady: true }   // may occur later
```

Current code also allows `startup-controlled-sync-render-eligible` in the same startup window, but it is not the visibility boundary by itself. The visibility boundary is the first visible controlled-sync frame described above.

### 6.2 Invalid Startup

Observed invalid pattern for the current bug:

```text
predrag:visual-selection-start
startup-overlay-render-committed
drag:start
startup-controlled-sync-ready
startup-controlled-sync-apply-deferred { reason: "waiting-controlled-overlay-render-ready" }
startup-controlled-sync-replay-scheduled
... same-session drag continues ...
drag-overlay:shown
selection-box:shown
```

If `drag-overlay:shown` first appears only after that deferred path, startup failed.

### 6.3 Allowed Late Refinement After Valid Startup

Allowed pattern after startup is already valid:

```text
drag-overlay:shown { session = A }   // already happened
selection-box:shown { session = A }  // already happened
drag-overlay:ready-state { isReady: true }   // later readiness is allowed
bounds:recalc { source: "controlled-sync", session = A, syncToken = next }
... later same-session controlled-sync updates ...
```

Allowed late refinement rules:

- it must stay within the same active session
- it must remain `controlled-sync` / live-node based during drag
- it must not create a second startup authority
- it must not create a second first-visible event for the same session

### 6.4 Forbidden Delayed First Visible Frame Case

The following case is forbidden:

```text
startup ownership transferred correctly
authoritative controlled-sync became available
but first visibility waited for render-ready / replay / mount-ready
and only then emitted drag-overlay:shown
```

That case is forbidden even if:

- the eventual visible frame is still session-correct
- the eventual visible frame is still live-node based
- the eventual visible frame still comes from a stored authoritative startup snapshot

Those properties preserve authority correctness, but they do not satisfy startup visibility timing.

## 7. Architectural Constraints

The fix defined by this target must preserve all of the following:

- single visual authority
- no second visible authority
- no hover or selected-phase visual surviving into drag startup visibility
- no geometry fallback during drag startup
- no promotion of `predrag-seed`, `drag-selection-seed`, `controlled-seed`, `group-drag-start`, or selected-phase fallback geometry into first-visible startup authority
- drag-session selection remains the visible selection authority during startup
- active session identity remains continuous across `predrag -> drag -> settling`
- no regression in single selection, multi-selection, same-gesture select-and-drag, group drag, resize, rotation, inline editing, or publish compatibility

This document does not authorize a startup fix that solves visibility delay by:

- showing a second box
- briefly restoring transformer visibility
- using object-data fallback geometry
- redefining startup around `ready-state`
- changing the broader parent drag-phase model

## 8. Assumptions And Open Questions

- Assumption: the delayed BOXFLOW traces referenced in this task correspond to the current deferred startup path in `CanvasStageContentComposer.jsx` where authoritative startup controlled-sync is postponed by overlay render-ready gating.
- Assumption: the startup target in this document applies equally to the individual, gallery, countdown, and group drag entry paths because they converge on the same composer-owned startup visibility machinery.
- Open Question: some device-specific or family-specific paths may still miss a separately observed `predrag` event and enter `drag` directly. The parent document already allows that fallback. This target still applies unchanged: the first visible frame must appear at startup and must not be postponed behind readiness-only gating.

## 9. Acceptance Checklist

- [ ] For the tested drag session, ownership reaches `drag-overlay` before or at startup visibility.
- [ ] After `drag:start`, the first visible boundary for that session is the active-session controlled-sync boundary, not a later replay boundary.
- [ ] The first visible startup frame is logged through the current boundary sequence: `bounds:recalc` -> `drag-overlay:shown` -> `selection-box:shown`.
- [ ] `drag-overlay:shown` refers to the active `dragOverlaySessionKey`.
- [ ] The first visible frame uses drag-session selection and `geometryAuthority = "live-nodes"`.
- [ ] `drag-overlay:ready-state` does not replace or postpone `drag-overlay:shown` as startup visibility authority.
- [ ] No startup failure trace shows `startup-controlled-sync-apply-deferred { reason: "waiting-controlled-overlay-render-ready" }` as the path to the first visible frame.
- [ ] No second visible authority appears during startup.
- [ ] No geometry fallback is used during startup.
- [ ] Selection, multi-selection, drag, resize, rotation, inline editing, and publish-compatibility regression checks still pass.
