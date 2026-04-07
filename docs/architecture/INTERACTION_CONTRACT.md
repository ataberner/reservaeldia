# INTERACTION CONTRACT

> Updated from code inspection and architecture documentation on 2026-04-07.
>
> This document is the enforceable interaction contract for the dashboard editor subsystem.
> `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md` remains the baseline description of current behavior.
> When current behavior and this contract diverge, this contract governs future interaction work.

## 1. SYSTEM MODEL (AUTHORITATIVE)

### 1.1 Phase Model

The authoritative interaction phase model is:

`idle -> hover -> selected -> predrag -> drag -> settling -> selected|idle`

No subsystem may invent an alternate visible phase model for box ownership, geometry ownership, or selection authority.

### 1.2 Per-Phase Rules

| Phase | Allowed visual owner | Allowed geometry source | Allowed selection authority | Forbidden states |
| --- | --- | --- | --- | --- |
| `idle` | none | none | committed selection may be empty only | visible hover, visible selected-phase box, visible drag-overlay box |
| `hover` | hover only | live node geometry; for single text, authoritative text rect | committed selection remains authoritative; hover does not create selection authority | drag-overlay visibility, selected-phase visibility, fallback geometry, stale hover after ownership loss |
| `selected` | selected-phase owner only | live node geometry; object-data fallback only when explicitly allowed by Section 3 | committed selection in React state is authoritative; runtime selection must converge to it | hover visibility, drag-overlay visibility, mixed live/fallback geometry in one frame |
| `predrag` | drag-overlay owns box authority, but MAY remain visually hidden until valid startup visibility | live node geometry only; for single text, authoritative text rect only | drag visual selection becomes authoritative for the visible box | hover visibility, selected-phase ownership, seed/replay visibility, object-data fallback |
| `drag` | drag-overlay only | live node geometry only; for single text, authoritative text rect only | drag visual selection is authoritative for visible selection | hover visibility, selected-phase visibility, object-data fallback, geometry mixing |
| `settling` | drag-overlay only until handoff contract is satisfied | frozen settle snapshot only, derived from the last valid drag-overlay geometry | drag visual selection remains authoritative for the visible box until handoff completes | hover visibility, early selected-phase ownership, fresh fallback geometry, premature teardown |
| `selected|idle` after settling | selected-phase owner or none | same rules as destination phase | destination phase authority rules apply | residual drag-overlay visibility, stale drag session visibility |

### 1.3 Phase Discipline

- Phase transitions MUST be explicit and traceable.
- Visual authority, geometry authority, and selection authority MUST change in lockstep with the phase model.
- A subsystem MAY maintain internal bookkeeping states, but those states MUST NOT create a second visible phase model.

## 2. VISUAL AUTHORITY CONTRACT

### 2.1 Priority

Visible box authority is strictly ordered:

1. `drag-overlay`
2. `selected-phase`
3. `hover`

No lower-priority owner may remain visible once a higher-priority owner has taken authority.

### 2.2 Owners

- `hover`
  - rendered by `HoverIndicator.jsx`
  - allowed only in phase `hover`
- `selected-phase`
  - rendered by `SelectionTransformer.jsx`, `SelectionBoundsIndicator.jsx`, or the selected-phase line-controls path
  - allowed only in phase `selected`
- `drag-overlay`
  - rendered by the dedicated drag-overlay `SelectionBoundsIndicator`
  - authoritative in `predrag`, `drag`, and `settling`

### 2.3 Transfer Rules

- `hover -> selected`
  - hover MUST be hidden before selected-phase visuals become visible
- `selected -> predrag`
  - selected-phase visuals MUST relinquish visible ownership before or at the same boundary where drag-overlay ownership begins
- `predrag -> drag`
  - drag-overlay retains authority
- `drag -> settling`
  - drag-overlay retains authority
- `settling -> selected`
  - drag-overlay MUST remain the sole visible box owner until the handoff contract in Section 7 is satisfied
- `settling -> idle`
  - drag-overlay MUST fully teardown with no selected-phase or hover box remaining visible

### 2.4 Explicit Prohibitions

- Dual box ownership is forbidden.
- Visual duplication across hover, selected-phase, and drag-overlay is forbidden.
- Fallback visuals that are not phase-aligned are forbidden.
- A component MAY stay mounted for lifecycle reasons, but mount persistence MUST NOT imply visible authority.

## 3. GEOMETRY AUTHORITY CONTRACT

### 3.1 Allowed Geometry Sources

Only these geometry sources are valid:

- `live node bounds`
  - live Konva node bounds in stage space
- `authoritative text rect`
  - the text-specific live visual rect derived from the live Konva text node
- `frozen settle snapshot`
  - the last valid drag-overlay snapshot captured from live geometry
- `object data fallback`
  - persisted/object-derived geometry

### 3.2 Per-Phase Geometry Rules

- `hover`
  - MUST use live geometry
  - single text MUST use authoritative text rect
  - object-data fallback is forbidden
- `selected`
  - SHOULD use live geometry
  - MAY use object-data fallback only for selected-phase visuals and only when live geometry is unavailable
  - if fallback is used, the frame MUST be a fallback frame, not a mixed-source frame
- `predrag`
  - MUST use live geometry only
  - single text MUST use authoritative text rect
  - object-data fallback is forbidden
- `drag`
  - MUST use live geometry only
  - single text MUST use authoritative text rect
  - object-data fallback is forbidden
- `settling`
  - MUST use frozen settle snapshot only while drag-overlay owns visibility
  - live re-resolution, object-data fallback, or mixed-source recalculation is forbidden before handoff completes

### 3.3 Text Geometry Rules

- The single authoritative base geometry for text is the live Konva text geometry.
- The authoritative text rect is the only allowed text-specific geometry source for:
  - hover box
  - selected-phase single-text box
  - drag-overlay single-text box
  - DOM inline projection
  - snap/guides consumers when text participates
- Generic client rect fallback for text is a compatibility path only and MUST NOT become the preferred text geometry source.

### 3.4 Snap and Geometry

- Snap and guide logic MUST evaluate against live node geometry.
- If snap mutates the live node, any visible drag-overlay bounds MUST be resynchronized after the mutation.
- Snap logic MUST NOT create its own independent geometry authority.

### 3.5 Explicit Prohibitions

- Mixing geometry sources in the same visual frame is forbidden.
- Silent fallback in `predrag`, `drag`, or `settling` is forbidden.
- A frame that contains both live-node and object-data union geometry for the same visible box is forbidden.

## 4. SELECTION AUTHORITY CONTRACT

### 4.1 Selection Authorities

The system has three relevant selection layers:

- `committed selection`
  - React-owned selection state in `CanvasEditor.jsx`
- `runtime selection`
  - `editorSelectionRuntime`
- `drag visual selection`
  - the drag-session-specific selection used by the drag-overlay

### 4.2 Authority by Phase

- `idle`
  - committed selection is authoritative
- `hover`
  - committed selection is authoritative
  - hover does not own selection authority
- `selected`
  - committed selection is authoritative
  - runtime selection MUST mirror it
- `predrag`
  - drag visual selection becomes authoritative for visible selection
  - committed selection MAY lag transiently
- `drag`
  - drag visual selection is authoritative for visible selection
- `settling`
  - drag visual selection remains authoritative for visible selection until handoff completes
- post-settle destination
  - committed selection regains authority after repair/handoff

### 4.3 Transition Rules

- Runtime selection exists to support immediate interaction bookkeeping and MUST converge back to committed selection outside transitional phases.
- `pendingDragSelection` is a transition mechanism only. It MUST NOT survive past drag settlement.
- `dragVisualSelection` is a transition mechanism only. It MUST NOT survive beyond drag-overlay ownership.

### 4.4 Deferred Selection Repair

Deferred selection repair is allowed only for drag sessions that begin from an unselected object.

Rules:

- repair MUST run during or immediately after `settling`
- repair MUST target the active drag session only
- repair MUST either:
  - commit the dragged object as the new committed selection, or
  - restore the predrag committed selection snapshot
- repair MUST complete before drag-overlay ownership is released

## 5. DRAG LIFECYCLE CONTRACT

### 5.1 Drag Start

Before the first visible drag frame:

- hover MUST be cleared
- drag session identity MUST be allocated
- drag visual selection MUST be established
- selected-phase visible ownership MUST be suppressed
- startup visibility MUST remain blocked until the valid startup contract is satisfied

Forbidden at drag start:

- seed frame visibility
- replay frame visibility
- selected-phase visible ownership after drag-overlay has taken authority
- hover visibility after predrag has begun

### 5.2 Drag Move

During drag:

- visible geometry MUST come from live node geometry only
- drag-overlay is the sole visible box owner
- snap/guides MAY mutate the live node, but only inside the constrained guide contract
- overlay geometry MUST be resynchronized after any snap mutation that changes the live node

### 5.3 Drag End

At drag end:

- the system MUST enter `settling`
- drag-overlay MUST remain the visible box owner
- the last valid drag geometry MUST be frozen as the settle snapshot
- deferred selection repair, if needed, MUST run before overlay teardown
- selected-phase visuals MUST NOT become visible until the handoff contract is satisfied

## 6. STARTUP CONTRACT (CRITICAL)

### 6.1 Single Valid Startup Path

The only valid startup visibility path is:

`predrag authority transfer -> controlled-sync from live geometry -> first visible drag frame`

The first visible drag frame MUST come from `controlled-sync`.

### 6.2 Predrag Requirements

Before a drag-overlay frame is allowed to become visible:

- the system MUST have entered `predrag`
- hover MUST already be suppressed
- drag session identity MUST match the active drag
- visible selection authority MUST already belong to the drag session

### 6.3 Forbidden Startup Paths

These paths MUST NEVER create the first visible drag frame:

- `predrag-seed`
- `drag-selection-seed`
- `controlled-seed`
- replayed snapshot visibility
- transformer restore visibility
- generic fallback snapshot visibility

Temporary coexistence rule:

- non-visible seed or replay paths MAY exist internally for bookkeeping or resilience
- they MUST remain non-visible and subordinate to `controlled-sync`

## 7. HANDOFF CONTRACT (DRAG -> SELECTED)

### 7.1 Exit Conditions for Drag-Overlay

Drag-overlay MAY release visible authority only when all of the following are true:

- the drag session is no longer active
- the settle snapshot is no longer needed
- deferred selection repair is complete
- the selected-phase destination is known
- selected-phase visuals are visible
- selected-phase visuals are ready
- post-paint confirmation has completed

### 7.2 Selected-Phase Readiness

Selected-phase readiness requires:

- the correct selected-phase renderer for the destination selection
- live attachment to the correct nodes where applicable
- valid visible bounds
- a post-paint confirmation boundary

### 7.3 Explicit Prohibitions

- Premature drag-overlay teardown is forbidden.
- Dual rendering between drag-overlay and selected-phase visuals is forbidden.
- Selected-phase visibility without readiness is not sufficient to release drag-overlay authority.

## 8. HOVER CONTRACT

### 8.1 Allowed Hover States

Hover is allowed only when:

- phase is `hover`
- no selected-phase owner is visible
- no drag-overlay owner is active
- no suppressing interaction boundary is active

### 8.2 No-Hover Zones

Hover MUST be suppressed during:

- `predrag`
- `drag`
- `settling`
- inline edit while DOM owns visibility
- resize
- image crop
- background-edit modes
- active canvas interaction coordinator states that claim interaction ownership

### 8.3 Cleanup Rules

- hover cleanup MUST be deterministic
- ownership loss MUST clear hover at the boundary where the higher-priority owner takes control
- lingering hover visibility after ownership loss is forbidden

## 9. SNAP & GUIDES CONTRACT

### 9.1 Scope

Guides and snap are valid only in the individual single-element drag pipeline unless a future contract explicitly expands them.

### 9.2 Rules

- guides MUST evaluate against live node geometry
- guides MAY mutate the live node position
- if guides mutate the live node, drag-overlay geometry MUST resync after mutation
- guides are not authoritative for multi-selection or group drag
- guides MUST NOT become a visible box owner

### 9.3 Explicit Constraints

- multi-selection/group-drag guide authority is forbidden under this contract
- guide output MUST NOT outlive the drag session that produced it
- a snapped node and its visible drag-overlay box MUST converge in the same drag session

## 10. INLINE TEXT CONTRACT

### 10.1 Visual Authority Boundary

Inline text has two render surfaces:

- Konva text
- DOM inline overlay

Only one may be the visible editing authority at a time.

### 10.2 Swap Rules

The Konva -> DOM handoff MUST be phase-atomic:

- Konva remains the visual authority until the inline session is ready to swap
- DOM preview authority may begin only after a matching swap commit
- DOM editable authority may begin only after post-paint stabilization
- caret visibility requires DOM editable authority
- finish/done/cancel MUST return visual authority to Konva

### 10.3 Geometry Rules

- the authoritative base geometry for inline text remains the live Konva text geometry
- DOM projection MUST be downstream of that geometry
- inline editing MUST NOT introduce an independent text box geometry model

### 10.4 Snap During Inline Edit

- active inline edit MUST NOT create a second snap authority
- Assumption: inline edit does not participate in the drag-guide pipeline while DOM authority is active, because the current guide pipeline is drag-specific

## 11. SESSION & IDENTITY CONTRACT

### 11.1 Drag Sessions

A drag session MUST have a stable identity spanning:

- drag interaction session
- drag-overlay box-flow session
- `dragId`
- drag visual selection membership

Rules:

- stale drag work MUST be ignored on session mismatch
- visual ownership MUST NOT leak across drag sessions
- if committed selection and drag membership diverge at startup, visible drag selection MUST collapse to the actual dragged membership rather than preserving a mismatched snapshot

### 11.2 Selection Sessions

Committed selection is the canonical long-lived selection identity.

Required rule going forward:

- selected-phase work MUST treat committed selection membership plus the active selected-phase attachment generation as the effective selection session identity

This is required even if the current code does not yet expose a dedicated selected-phase session token.

### 11.3 Inline Sessions

Inline sessions MUST be identified by matching:

- editing target id
- session id
- swap token

Rules:

- late async work MUST be ignored on mismatch
- DOM visibility MUST NOT survive beyond the owning inline session
- caret/focus reclaim from an old session is forbidden

## 12. FORBIDDEN PATTERNS

The following patterns MUST NOT exist:

- dual ownership of the selection box
- mixed geometry sources in the same phase-visible frame
- object-data fallback during `predrag`, `drag`, or `settling`
- hover persistence after ownership loss
- multiple visible startup paths
- session resurrection
- unsynchronized drag-overlay after snap mutation
- DOM and Konva both acting as visible inline-edit owners at the same time
- selection authority that is visually represented by a box owner from a different phase

## 13. CRITICAL INVARIANTS (TESTABLE)

The following invariants MUST always hold and are intended to be testable or loggable:

- During `drag`, only drag-overlay may own the visible box.
- During `predrag`, hover must not be visible.
- The first visible drag frame must be produced by `controlled-sync`.
- Seed or replay paths must never produce the first visible drag frame.
- During `settling`, drag-overlay remains the sole visible box owner until selected-phase readiness and post-paint confirmation are complete.
- If snap changes the live node during drag, the visible drag-overlay bounds must be refreshed afterward from live geometry.
- During active inline edit with DOM authority, DOM is the sole visible editing authority and caret visibility requires DOM editable authority.
- Single-text hover/selection/drag visuals must derive from the authoritative text rect, not a separate persisted visual-box field.
- `pendingDragSelection` and `dragVisualSelection` must be cleared or reconciled before drag-overlay ownership ends.
- Hover must not remain visible after any higher-priority owner takes authority.

## 14. MIGRATION NOTES

Current code areas that violate or only partially satisfy this contract:

- Selected-phase fallback geometry can currently mix live-node and object-data bounds in one union when `requireLiveNodes` is false. That violates the contract prohibition on mixed geometry sources in one visible frame.
- Hover does not currently have a dedicated session identity and relies on multiple imperative cleanup writers. That only partially satisfies the deterministic cleanup requirement.
- The selected-phase path does not currently expose an explicit durable session token. Handoff safety is enforced indirectly through visibility/ready/post-paint guards rather than a formal selected-phase session identity.
- Guide evaluation does not currently expose a durable public session identity of its own; it relies on the active drag-overlay session checks to reject stale work.
- Transient globals such as `_isDragging`, `_resizeData`, and group-drag globals are still used by some selected-phase suppression logic. That only partially satisfies the contract goal of singular explicit authority boundaries.
- Internal seed/replay/startup support paths still exist in the drag-overlay subsystem. They appear constrained away from visible startup ownership, but their coexistence remains temporary and must stay subordinate to the startup contract.
- Selection-box ownership is still split across selected-phase and drag-overlay modules. The contract allows this only if phase exclusivity is maintained; current code treats this as a high-fragility area rather than a fully simplified model.

## 15. ASSUMPTIONS

- Assumption: active inline editing does not participate in drag snapping/guides because the audited guide pipeline is drag-only and the current-state documentation does not identify an inline snap path.
- Assumption: the effective selected-phase session identity can be defined as committed selection membership plus selected-phase attachment generation even though the current implementation does not expose that as a first-class token.
- Assumption: non-visible startup seed/replay paths remain acceptable temporary coexistence only while they do not create visible authority, because the current runtime still carries resilience/fallback logic internally.
