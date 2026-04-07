# INTERACTION CONTRACT GAP MAP AND EXECUTION PLAN

> Updated from code inspection and architecture documentation on 2026-04-07.
>
> Source-of-truth inputs:
> `docs/architecture/INTERACTION_CONTRACT.md`,
> `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`,
> `docs/architecture/EDITOR_SYSTEM.md`,
> `docs/architecture/DATA_MODEL.md`,
> `docs/architecture/ARCHITECTURE_OVERVIEW.md`,
> `docs/architecture/ARCHITECTURE_GUIDELINES.md`.

## 1. EXECUTIVE SUMMARY

The current editor already contains many of the right building blocks for a contract-driven interaction system:

- an explicit phase model in architecture docs
- drag-overlay startup and handoff logic in `CanvasStageContentComposer.jsx`
- a split between committed selection, runtime selection, and drag visual selection
- a dedicated inline DOM/Konva authority swap
- guide/snap resync hooks

The contract exists because those pieces are not yet enforced as one deterministic system. The highest-risk instability remains at the boundaries where authority changes hands:

- startup visibility during `predrag -> drag`
- geometry authority during active drag and snap mutation
- drag-overlay -> selected-phase handoff during `settling`
- hover cleanup when a higher-priority owner takes control
- session identity reuse or stale async work

Implementation should proceed in phases because the visible instability is concentrated in a few narrow boundaries, while the overall subsystem has a large blast radius:

- the stage composer coordinates many object families
- selected-phase and drag-phase visuals are still split across different modules
- text uses both Konva and DOM
- guides and hover still depend on imperative cleanup and timing-sensitive guards

The safest path is to stabilize the interaction lifecycle in the order users actually experience it:

1. first visible drag frame
2. steady-state drag geometry and snap resync
3. drag end and selected handoff
4. hover discipline
5. text geometry parity
6. session hardening
7. inline authority cleanup if still needed

## 2. CONTRACT GAP MAP

| Contract area | Contract rule | Current implementation status | Modules involved | Status | Severity | User-visible impact | Likely failure mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase model discipline | One authoritative phase model must govern visual, geometry, and selection authority. | Phase transitions are now explicitly emitted from the composer through `phase:transition` with phase, owner, startup source, hover suppression reasons, and drag session identity. Enforcement is still distributed outside the startup boundary. | `CanvasStageContentComposer.jsx`, `selectionVisualModes.js`, `SelectionTransformer.jsx`, `HoverIndicator.jsx`, `useCanvasInteractionCoordinator.js` | Partially satisfied | High | startup jump, delayed teardown, flash between states | one subsystem transitions phases earlier or later than the others |
| Visual authority contract | Only one visible box owner at a time; strict priority `drag-overlay > selected-phase > hover`. | Startup ownership is tighter now: hover is cleared before predrag, the primary selected-phase overlay no longer mounts during predrag, and first-visible drag-overlay frames carry explicit contract-state logs. Ownership is still split across separate modules and remains fragile around settling. | `CanvasStageContentComposer.jsx`, `SelectionTransformer.jsx`, `SelectionBoundsIndicator.jsx`, `HoverIndicator.jsx`, `selectionVisualModes.js` | Partially satisfied | Critical | stale selection box, overlay flicker, dual box flash | drag-overlay and selected-phase both render, or hover survives after authority loss |
| Geometry authority contract | Drag and predrag must use live geometry only; settling must use frozen settle snapshot only; selected fallback must be explicit and non-mixed. | Phase 2 now hardens active drag around live-node authority: drag-overlay sync records `geometrySource`, guide evaluation re-reads the active drag box from the live node only, drag-time text bounds now fail closed instead of falling back to generic client rect, and the non-text guide path now resolves `forma`/`icono` boxes through the same live selection-rect basis used by overlay sync. Selected-phase can still mix live and object-data fallback in one union, and settling is still Phase 3 work. | `selectionBoundsGeometry.js`, `SelectionBoundsIndicator.jsx`, `SelectionTransformer.jsx`, `CanvasStageContentComposer.jsx`, `useGuiasCentrado.js` | Partially satisfied | High | text bounds mismatch, box drift, selected-phase fallback mismatch | selected-phase still mixes geometry sources outside drag, or a later phase reintroduces drag-time fallback |
| Selection authority contract | Committed selection is canonical except during drag-owned visual phases; transitional selection state must reconcile before handoff ends. | Committed selection, runtime selection, `pendingDragSelection`, and `dragVisualSelection` are real and mostly explicit, but convergence depends on deferred repair and cleanup guards rather than one hardened transaction model. | `CanvasEditor.jsx`, `useCanvasEditorSelectionRuntime.js`, `editorSelectionRuntime.js`, `CanvasStageContentComposer.jsx`, `ElementoCanvasRenderer.jsx` | Partially satisfied | High | stale selection box, wrong post-drag selection, session leakage | transient drag selection survives too long or restores the wrong selection |
| Drag lifecycle contract | Drag start, move, and end must follow one explicit lifecycle with no hidden alternate owners. | The drag lifecycle is explicit in the composer, but gallery/countdown/object paths all feed it and the lifecycle still depends on subtle guards and phase-specific cleanup. | `CanvasStageContentComposer.jsx`, `ElementoCanvasRenderer.jsx`, `GaleriaKonva.jsx`, `CountdownKonva.jsx` | Partially satisfied | High | inconsistent drag startup, delayed teardown, stale overlay | one path skips a required boundary or cleanup step |
| Startup contract | First visible drag frame must come only from `controlled-sync`; seed/replay paths must never be visible. | Phase 1 now records blocked startup paths explicitly, keeps the selected-phase overlay out of predrag, and validates first-visible startup ownership through `drag-overlay:shown` plus `startup-contract:violation`. Seed/replay helpers still exist internally, but visible startup is tied to `controlled-sync`. | `CanvasStageContentComposer.jsx`, drag-overlay startup gate helpers, `ElementoCanvasRenderer.jsx` | Satisfied | Critical | startup jump | non-authoritative startup snapshot becomes visible first |
| Handoff contract | Drag-overlay remains sole owner through settling until selected-phase is visible, ready, and post-paint confirmed. | Current code has a real handoff guard and post-paint confirmation, but selected-phase identity is still implicit and handoff safety depends on several coordinated booleans instead of one hardened session model. | `CanvasStageContentComposer.jsx`, `SelectionTransformer.jsx`, `SelectionBoundsIndicator.jsx` | Partially satisfied | Critical | delayed teardown, duplicate visuals, stale selected box | drag-overlay tears down before selected-phase is truly ready |
| Hover contract | Hover only in hover phase; deterministic cleanup; no hover during predrag/drag/settling/inline authority. | Hover suppression is broad and explicit, and Phase 1 now makes startup hover loss observable through `forced-clear`, `stage:suppressed`, `phase:transition`, and first-visible startup traces. Hover identity is still id-only and cleanup is still driven by multiple imperative writers. | `HoverIndicator.jsx`, `CanvasStageContentComposer.jsx`, `useCanvasEditorSelectionUi.js`, `selectionVisualModes.js` | Partially satisfied | High | hover lingering, hover flash during drag start | hover survives the predrag boundary or reappears from stale state |
| Snap & guides contract | Guides are single-element drag only; they may mutate live nodes, but overlay must resync after snap and guides must not become authority. | Phase 2 now keeps single-element text and shape/icon guide evaluation inside the same drag sample instead of letting it trail through RAF scheduling, re-reads post-snap live geometry before returning the guide outcome, and logs pre-resync plus post-resync overlay deltas against the same post-snap live reread. It still relies on drag-session matching rather than a dedicated guide session identity, and the text/shape/icon guide scenarios still require manual verification before the phase can close. | `useGuiasCentrado.js`, `CanvasGuideLayer.jsx`, `CanvasStageContentComposer.jsx`, `CanvasEditor.jsx` | Partially satisfied | Medium | snap mismatch, guide lag, stale guide lines | stale guide work could still target the wrong drag if drag-session checks regress |
| Inline text contract | Konva and DOM must never share visible editing authority; swap must be phase-atomic; text geometry must stay downstream of live Konva geometry. | Inline runtime is the most structured subsystem and already has mount session, swap ack, and authority phases, but it still relies on timing-sensitive focus/caret behavior and does not yet benefit from the same identity hardening as the drag/handoff path. | `useInlineSessionRuntime.js`, `useInlinePhaseAtomicLifecycle.js`, `resolveInlineCanvasVisibility.js`, `CanvasInlineEditingLayer.jsx`, `InlineTextOverlayEditor.jsx`, `HiddenSemanticTextBackend.jsx` | Partially satisfied | High | overlay flicker, focus instability, text overlay/canvas mismatch | late swap/focus work applies after authority has moved |
| Session & identity contract | Drag, selected, hover, guide, and inline work must reject stale async work and prevent cross-session leakage. | Drag and inline have strong partial identity models. Selected-phase and hover do not. Guides rely on drag session checks rather than their own identity. | `CanvasStageContentComposer.jsx`, `editorSelectionRuntime.js`, `useInlineSessionRuntime.js`, `HoverIndicator.jsx`, `useGuiasCentrado.js` | Partially satisfied | High | session resurrection risk, stale overlay, wrong teardown target | old session work mutates current visuals or cleanup |
| Critical invariants | Key invariants must always hold and be observable. | Phase 1 startup invariants remain observable, and Phase 2 now adds `drag-overlay:geometry-sync`, `drag-overlay:geometry-sync-skipped`, geometry-source propagation through the controlled indicator, post-snap overlay drift detection in `guides:post-snap-overlay-sync`, geometry-family propagation for guide evaluation, and family-specific alternation/threshold-oscillation signals in the overlay and guide traces. Handoff and session invariants still need broader enforcement. | `CanvasStageContentComposer.jsx`, `SelectionBoundsIndicator.jsx`, `useGuiasCentrado.js`, `SelectionTransformer.jsx`, inline trace modules | Partially satisfied | Medium | hard-to-debug regressions, hidden non-determinism | contract breach happens without reliable detection |

## 3. GAP CLUSTERS

### Cluster A: Startup Visibility / Predrag Authority

Touches:

- phase model discipline
- visual authority contract
- startup contract
- selection authority contract

Why these issues belong together:

- startup is where selection authority, hover suppression, visual ownership, and geometry authority all switch at once
- if startup is wrong, every later drag phase inherits the wrong owner or wrong geometry

Visible problems likely resolved:

- `startupJump`
- selected-phase flash before drag
- hover lingering at drag start

### Cluster B: Drag Geometry Authority and Snap Resync

Touches:

- geometry authority contract
- drag lifecycle contract
- snap & guides contract
- critical invariants

Why these issues belong together:

- active drag is the phase where live geometry is non-negotiable
- snap mutates live nodes and therefore directly tests whether overlay resync is truly downstream of live geometry

Visible problems likely resolved:

- drag-overlay drift
- snap mismatch
- stale box after snap

### Cluster C: Handoff / Settling Correctness

Touches:

- handoff contract
- visual authority contract
- selection authority contract
- critical invariants

Why these issues belong together:

- settling is not just teardown; it is the last drag-owned visual phase
- selected-phase readiness, deferred selection repair, and overlay teardown are one coupled boundary

Visible problems likely resolved:

- delayed teardown
- stale selected box
- duplicate box during drag end

### Cluster D: Hover Suppression and Cleanup

Touches:

- hover contract
- visual authority contract
- phase model discipline

Why these issues belong together:

- hover problems are mostly ownership-loss problems
- deterministic hover cleanup can be improved without touching steady-state drag math

Visible problems likely resolved:

- hover lingering
- hover flash after drag or during inline edit

### Cluster E: Text Geometry Authority

Touches:

- geometry authority contract
- inline text contract
- critical invariants

Why these issues belong together:

- text is the only object family that spans Konva geometry, DOM projection, hover/selection/drag boxes, and potential snap consumers
- text mismatch is usually a geometry-authority problem before it is an inline problem

Visible problems likely resolved:

- text bounds mismatch
- text selection box offset
- text drag box inconsistency

### Cluster F: Session Identity Hardening

Touches:

- session & identity contract
- handoff contract
- hover contract
- selection authority contract

Why these issues belong together:

- the remaining fragility is often not wrong logic, but stale logic applied to the wrong session
- hardening session guards reduces resurrection, stale cleanup, and wrong-handoff risks across multiple subsystems

Visible problems likely resolved:

- session resurrection risk
- stale overlay after repeated quick drags
- stale hover/cleanup targeting the wrong object

### Cluster G: Inline Authority Discipline

Touches:

- inline text contract
- visual authority contract
- session & identity contract

Why these issues belong together:

- inline already has a richer authority model than other areas
- remaining work is mostly about tightening authority boundaries and late-session rejection after the drag/text geometry work is stable

Visible problems likely resolved:

- overlay flicker
- focus instability
- DOM/Konva authority overlap

## 4. PRIORITIZATION

| Rank | Cluster | Why this priority | Dependencies | Should it block later work? |
| --- | --- | --- | --- | --- |
| 1 | Cluster A: Startup Visibility / Predrag Authority | Highest visible instability, highest contract centrality, and narrow enough to tackle without rewriting the whole subsystem. If startup is wrong, all later drag improvements remain visually untrustworthy. | Needs current instrumentation understanding only. No deep identity rewrite required yet. | Yes. It should block later drag-focused work. |
| 2 | Cluster B: Drag Geometry Authority and Snap Resync | After startup is deterministic, steady-state drag geometry is the next most visible stability issue. It also exercises the live-geometry contract directly. | Depends on startup ownership being stable. | Yes for later text and hover stabilization that depends on drag being trustworthy. |
| 3 | Cluster C: Handoff / Settling Correctness | Users see drag end on every drag. If handoff stays fragile, the editor still feels unstable even if startup and drag move improve. | Depends on startup and steady-state drag being stable. | Yes for later hover cleanup and session hardening, because stale teardown can mask those issues. |
| 4 | Cluster D: Hover Suppression and Cleanup | Hover is visible and annoying when wrong, but it is lower priority than drag start/move/end. It becomes safer to harden once drag ownership is trustworthy. | Depends on drag startup and handoff boundaries being clear. | It should not block later text or session work, but it should precede final polish. |
| 5 | Cluster E: Text Geometry Authority | Text geometry is important and high-risk, but it sits on top of the general drag/selection authority rules. Fixing it too early risks redoing work. | Depends on drag geometry and hover discipline. | It should block any deeper inline cleanup that assumes geometry parity. |
| 6 | Cluster F: Session Identity Hardening | Critical for determinism, but safest after the main visible lifecycle boundaries are already stable enough to observe clearly. Some thin guards may land earlier, but the full cluster should come later. | Depends on startup/handoff/hover/text behavior being easier to reason about. | It should block final cleanup and confidence-building, but not the earlier visible stabilization phases. |
| 7 | Cluster G: Inline Authority Discipline | Inline is already relatively structured. It should only be broadened after drag, hover, and text geometry contracts are stable so the remaining issues are clearly isolated. | Depends on text geometry parity and session hardening. | Conditional. Only block if contract gaps remain after Phases 1-6. |

## 5. PHASED EXECUTION PLAN

### Phase 1: Startup Correctness

- Status:
  Implemented on 2026-04-07.
- Objective:
  Stabilize `selected -> predrag -> drag` so the first visible drag frame is always lawful.
- Exact contract areas addressed:
  - phase model discipline
  - visual authority contract
  - startup contract
  - selection authority contract
- Main modules likely involved:
  - `CanvasStageContentComposer.jsx`
  - `ElementoCanvasRenderer.jsx`
  - `selectionVisualModes.js`
  - `SelectionTransformer.jsx`
  - `editorSelectionRuntime.js`
- What must NOT be changed:
  - no settling/handoff rewrite
  - no guide algorithm rewrite
  - no text geometry rewrite
  - no bridge contract changes
- Expected visible improvement:
  - no `startupJump`
  - no hover flash at drag start
  - no selected-phase flash before drag-overlay takes control
- Resolved in this phase:
  - first visible drag frames are now explicitly verified at `drag-overlay:shown` with `startupSource` and `startupContractSatisfied`
  - blocked startup sources are now observable through `startup-visibility:blocked`
  - the primary selected-phase overlay no longer mounts during `predrag`
  - startup contract violations now emit `startup-contract:violation`
  - composer-level `phase:transition` logs now expose `idle -> hover -> selected -> predrag -> drag`
- Remaining edge cases for later phases:
  - steady-state drag geometry and snap resync are still Phase 2 work
  - settling and selected-phase handoff remain unchanged in this phase
  - hover identity is still id-only even though startup hover suppression is now observable
- Main regression risks:
  - drag no longer starts for some object families
  - group/multi-selection drag startup paths diverge
  - drag-overlay becomes invisible too long

### Phase 2: Drag Steady-State Geometry and Snap Sync

- Status:
  In progress on 2026-04-07. The code-side follow-up for the remaining text-plus-guides and shape/icon-plus-guides vibration is now landed, but browser verification is still required before this phase can be closed.
- Objective:
  Make active drag geometry lawful and keep overlay geometry synchronized after snap mutations.
- Exact contract areas addressed:
  - geometry authority contract
  - drag lifecycle contract
  - snap & guides contract
  - critical invariants
- Main modules likely involved:
  - `CanvasStageContentComposer.jsx`
  - `selectionBoundsGeometry.js`
  - `SelectionBoundsIndicator.jsx`
  - `useGuiasCentrado.js`
  - `CanvasGuideLayer.jsx`
- What must NOT be changed:
  - no startup visibility redesign
  - no selected handoff redesign
  - no inline authority changes
- Expected visible improvement:
  - drag-overlay stays aligned during drag
  - snap does not leave the box behind
  - no drag-phase object-data fallback
- Resolved in this phase:
  - active drag guide evaluation now reads the dragged box from the live node only, not from an input-position-adjusted pose
  - drag-time text geometry now requires `resolveAuthoritativeTextRect(...)`; generic text client-rect fallback no longer participates in drag-phase bounds resolution
  - drag-overlay sync now logs `geometrySource` (`live` or `textRect`) and reports skipped drag syncs when live-authoritative bounds are unavailable
  - post-snap overlay resync now logs the pre-resync delta against the post-snap live reread so drift is explicitly observable
  - `SelectionBoundsIndicator.jsx` now compares rendered drag-overlay text geometry against authoritative text rects instead of generic text client rects
  - text guide evaluation now flushes synchronously inside the same drag sample, instead of waiting for a later RAF boundary that could expose raw text movement before snapped overlay convergence
  - non-text guide evaluation now resolves `forma`/`icono` boxes through `resolveNodeSelectionRect(..., { relativeTo: stage, requireLiveNodes: true })`, so guide decisions use the same live selection-rect basis as drag-overlay sync
  - single dragged `forma`, `icono`, and `icono-svg` elements now flush guide evaluation synchronously inside the same drag sample instead of waiting for a later RAF boundary
  - guide and post-snap resync logs now expose `geometryFamily`, overlay rects before and after resync, and `mismatchRelativeToSnap` so remaining vibration can be classified as stale overlay vs threshold chatter across families
- Root cause confirmed in this phase:
  - vibration across families was caused by both snap timing and geometry inconsistency
  - for text, the dominant code-level mismatch was geometry inconsistency: the guide path could evaluate text against an input-position-derived pose while drag-overlay sync used live selection bounds
  - the remaining text bug after that first fix was scheduler timing: text guide evaluation could still land one visual step later than the raw dragmove sample because guide work was RAF-coalesced even for text near guide thresholds
  - the remaining non-text bug after the text fix was a family-specific geometry-basis plus scheduler mismatch: `forma`/`icono` guide evaluation could still use a broader stage client rect than overlay sync, and that guide work could still land one visual step later than the raw dragmove sample because it remained RAF-coalesced
- Remaining edge cases for later phases:
  - selected-phase geometry can still mix live-node and object-data fallback outside drag
  - settling and drag-overlay -> selected handoff remain Phase 3 work
  - guide stale-work rejection still depends on drag-session matching instead of a dedicated guide identity
  - Phase 2 itself remains open until the text, shape, and icon drag scenarios near horizontal/vertical guides confirm that the family-aligned synchronous guide path removed visible vibration
- Main regression risks:
  - snap feels weaker/stronger accidentally
  - guide rendering lags or disappears
  - multi-selection drag is affected indirectly

### Phase 3: Drag End / Settling / Selected Handoff

- Objective:
  Make `drag -> settling -> selected|idle` deterministic and phase-correct.
- Exact contract areas addressed:
  - handoff contract
  - visual authority contract
  - selection authority contract
  - critical invariants
- Main modules likely involved:
  - `CanvasStageContentComposer.jsx`
  - `SelectionTransformer.jsx`
  - `SelectionBoundsIndicator.jsx`
  - `editorSelectionRuntime.js`
  - `useCanvasInteractionCoordinator.js`
- What must NOT be changed:
  - no new selected-phase architecture
  - no hover redesign in this phase
  - no text/inline authority work
- Expected visible improvement:
  - no duplicate box during drag end
  - no early transformer return
  - cleaner drag-to-idle and drag-to-selected outcomes
- Main regression risks:
  - overlay lingers forever
  - selected-phase never reappears
  - wrong post-drag selection restoration

### Phase 4: Hover Discipline

- Objective:
  Make hover lawful, deterministic, and subordinate to all higher-priority owners.
- Exact contract areas addressed:
  - hover contract
  - visual authority contract
  - phase model discipline
- Main modules likely involved:
  - `HoverIndicator.jsx`
  - `CanvasStageContentComposer.jsx`
  - `useCanvasEditorSelectionUi.js`
  - `selectionVisualModes.js`
- What must NOT be changed:
  - no drag startup changes unless strictly necessary
  - no guide algorithm changes
  - no DOM inline swap changes
- Expected visible improvement:
  - no hover lingering
  - no hover reappearing after drag end
  - no hover during inline authority ownership
- Main regression risks:
  - hover stops appearing when it should
  - external hover clears via global bridge break

### Phase 5: Text Geometry Parity

- Objective:
  Make text a first-class citizen of the geometry authority contract.
- Exact contract areas addressed:
  - geometry authority contract
  - inline text contract
  - critical invariants
- Main modules likely involved:
  - `selectionBoundsGeometry.js`
  - `SelectionBoundsIndicator.jsx`
  - `HoverIndicator.jsx`
  - text geometry helpers currently used by the Konva text pipeline
  - `CanvasStageContentComposer.jsx`
- What must NOT be changed:
  - no inline focus behavior rewrite yet
  - no generic non-text geometry changes unless required for consistency
- Expected visible improvement:
  - single-text hover/selection/drag box parity
  - less text box drift between states
- Main regression risks:
  - text bounds become too tight/too loose
  - text snapping changes unintentionally

### Phase 6: Session Identity Hardening

- Objective:
  Reject stale work reliably and reduce cross-session leakage.
- Exact contract areas addressed:
  - session & identity contract
  - selection authority contract
  - handoff contract
  - hover contract
- Main modules likely involved:
  - `CanvasStageContentComposer.jsx`
  - `editorSelectionRuntime.js`
  - `useCanvasEditorSelectionRuntime.js`
  - `HoverIndicator.jsx`
  - `useGuiasCentrado.js`
  - `useInlineSessionRuntime.js`
- What must NOT be changed:
  - no broad lifecycle redesign
  - no new abstraction rewrite across the whole editor
- Expected visible improvement:
  - repeated quick drags behave consistently
  - stale cleanup stops targeting current sessions
  - reduced resurrection risk
- Main regression risks:
  - valid late work is dropped incorrectly
  - session guards become too strict and suppress legal updates

### Phase 7: Inline Authority Cleanup

- Objective:
  Tighten remaining DOM/Konva inline authority edges after general drag/text/session stability is in place.
- Exact contract areas addressed:
  - inline text contract
  - visual authority contract
  - session & identity contract
- Main modules likely involved:
  - `useInlineSessionRuntime.js`
  - `useInlinePhaseAtomicLifecycle.js`
  - `resolveInlineCanvasVisibility.js`
  - `CanvasInlineEditingLayer.jsx`
  - `InlineTextOverlayEditor.jsx`
- What must NOT be changed:
  - no new editing features
  - no unrelated drag/hover rewrites reopened unless a hard dependency is proven
- Expected visible improvement:
  - cleaner Konva/DOM authority swap
  - fewer focus/caret edge-case artifacts
- Main regression risks:
  - inline edit fails to start or commit
  - focus reclaim becomes less reliable in some browsers

## 6. ACCEPTANCE CRITERIA PER PHASE

### Phase 1 Acceptance Criteria

- The first visible drag frame always comes from `controlled-sync`.
- No hover is visible once `predrag` begins.
- No selected-phase box is visible after drag-overlay ownership begins.
- Seed/replay paths never produce the first visible drag frame.
- Same-gesture drag on an unselected element does not require a second gesture and does not flash the wrong owner.

Validation modes:

- BOXFLOW-style startup logs
- targeted manual drag-start scenarios

### Phase 2 Acceptance Criteria

- During `drag`, the visible drag-overlay uses live-node geometry only.
- After horizontal or vertical snap mutation, the overlay resyncs to the snapped live node before the frame is considered stable.
- No object-data fallback is used for the visible drag-overlay box.
- Guides remain restricted to the eligible single-element drag pipeline.

Validation modes:

- geometry-source logs
- snap mutation + overlay resync logs
- manual snap scenarios

### Phase 3 Acceptance Criteria

- Drag-overlay remains the sole visible box owner throughout `settling`.
- Selected-phase visuals never appear before readiness plus post-paint confirmation.
- `drag -> idle` leaves no stale drag-overlay or selected-phase box.
- `drag -> selected` restores the correct destination selection without duplicate visuals.

Validation modes:

- handoff logs
- ready/visible/post-paint markers
- manual drag-end scenarios

### Phase 4 Acceptance Criteria

- Hover cannot remain visible after a higher-priority owner takes authority.
- Hover is suppressed for `predrag`, `drag`, `settling`, inline DOM authority, resize, crop, and background-edit modes.
- Hover reappears only in lawful `hover` phase states.
- Hover cleanup is observable with a deterministic suppression/clear reason.

Validation modes:

- hover suppression logs
- manual hover-to-drag and hover-after-drag checks

### Phase 5 Acceptance Criteria

- Single-text hover, selected-phase, and drag-overlay visuals all use the authoritative text rect.
- The visible text box does not silently fall back to generic client rect in contracted paths.
- Text drag and snap preserve box alignment with the live text geometry.

Validation modes:

- geometry-source logs on text paths
- manual single-text interaction checks

### Phase 6 Acceptance Criteria

- Late drag, hover, guide, or selection cleanup work is ignored on session mismatch.
- Repeated quick drags do not resurrect stale drag-overlay state.
- `pendingDragSelection` and `dragVisualSelection` do not outlive drag-overlay ownership.
- Selected-phase handoff targets the current selection generation only.

Validation modes:

- session-id logs
- repeated quick-drag manual tests

### Phase 7 Acceptance Criteria

- During active inline edit with DOM authority, DOM is the sole visible editing authority.
- Caret visibility occurs only under DOM editable authority.
- Finish/done/cancel always return visible authority to Konva with no ghost overlay.
- Late inline swap/focus work is ignored on session mismatch.

Validation modes:

- inline session logs
- manual enter/edit/exit scenarios

## 7. CRITICAL TEST SCENARIOS

The following minimum scenario matrix should be exercised after each phase. Phase-specific scenarios may receive extra scrutiny, but none of these should be dropped.

| Scenario | What should be observed | Contract invariants being validated |
| --- | --- | --- |
| Hover -> drag on unselected element | Hover disappears at predrag, first visible drag frame is aligned, no selected-phase flash. | startup path, hover suppression, drag-overlay sole authority |
| Selected element -> immediate drag | Selected-phase transfers cleanly to drag-overlay without duplicate box. | visual authority transfer, startup contract |
| Drag with snap on horizontal guide | Live node snaps, overlay resyncs after snap, no visible mismatch. | live geometry authority, snap resync invariant |
| Drag with snap on vertical guide | Same as horizontal, but on the alternate axis. | live geometry authority, snap resync invariant |
| Drag end -> selected handoff | Overlay remains visible through settling, selected-phase appears only after readiness and post-paint confirmation. | handoff contract, settling owner invariant |
| Drag end -> idle | No residual drag-overlay, no stale selected-phase box, no stale hover. | teardown correctness, hover cleanup |
| Repeated quick drags | No stale overlay resurrection, no wrong-session cleanup, no startup regression on subsequent drags. | session identity, startup invariant |
| Single text selected -> drag | Text box remains aligned across selected, predrag, drag, and settling. | authoritative text rect, drag geometry authority |
| Enter inline text edit -> exit | Konva hands off to DOM cleanly; exit returns cleanly with no dual visual authority. | inline authority, session identity |
| Multi-selection drag | Drag path remains stable and does not accidentally enable guide authority if contract scope remains single-element only. | selection authority, guide scope restriction |
| Line selection if relevant | Selected-phase line path remains lawful and does not conflict with drag-overlay authority. | visual owner exclusivity, selected-phase correctness |
| Grouped selection drag if still part of current runtime | Current runtime group path still respects startup/handoff ownership even if guides remain out of scope. | drag lifecycle, authority exclusivity |

## 8. LOGGING / INSTRUMENTATION PLAN

Instrumentation should extend existing trace channels rather than introduce a second undocumented debug system.

Preferred anchor points:

- existing BOXFLOW-style logging in `CanvasStageContentComposer.jsx`
- hover trace output in `HoverIndicator.jsx`
- inline trace output in the inline runtime/debug modules

Minimum signals required during implementation:

- current interaction phase
- active visual owner
- active geometry source
- active selection authority
- drag session identity
- selected-phase readiness state
- handoff completion reason
- snap mutation event plus overlay resync event
- hover suppression reason

Additional signals strongly recommended:

- first visible drag-frame source
- deferred selection repair result
- selected-phase destination type
- inline render authority (`konva`, `dom-preview`, `dom-editable`)
- session mismatch rejections for drag, hover, guide, and inline work

Instrumentation ownership by area:

- `CanvasStageContentComposer.jsx`
  - phase
  - visual owner
  - drag session id
  - handoff completion reason
  - snap mutation + overlay resync
- `selectionBoundsGeometry.js` / `SelectionBoundsIndicator.jsx`
  - geometry source
  - live vs fallback decision
- `HoverIndicator.jsx` / `useCanvasEditorSelectionUi.js`
  - hover suppression reason
  - forced clear reason
- `editorSelectionRuntime.js`
  - committed/runtime/drag selection transitions
- inline runtime modules
  - inline session id
  - render authority
  - swap commit and mismatch rejection

## 9. RISK MANAGEMENT

| Phase | Main regressions it could introduce | Blast-radius containment | Rollback / safety strategy | Validation gate before next phase |
| --- | --- | --- | --- | --- |
| Phase 1 | Drag no longer starts, some object-family startup paths diverge, overlay appears too late | Limit changes to startup authority, predrag suppression, and first-visible-frame rules; do not touch settle logic yet | Keep non-visible seed/replay helpers available as safety paths while forbidding their visibility | All startup scenarios pass, especially unselected hover -> drag and selected -> immediate drag |
| Phase 2 | Snap stops feeling correct, guide lines disappear, multi-selection drag regresses indirectly | Limit changes to live geometry authority and post-snap overlay resync; do not redesign guide candidate math unless required | Preserve current guide candidate logic and section priority behavior while changing only authority/resync boundaries | Horizontal/vertical snap scenarios pass with no overlay drift |
| Phase 3 | Overlay never tears down, transformer never returns, wrong post-drag selection restored | Limit changes to settling and handoff boundaries; do not reopen startup logic | Keep existing handoff guard structure and strengthen conditions rather than replacing everything at once | Drag end -> selected and drag end -> idle scenarios pass repeatedly |
| Phase 4 | Hover disappears entirely, external hover resets stop working | Limit changes to hover suppression and cleanup; do not change drag geometry | Preserve current external bridge surface and only harden lawful visibility rules | Hover scenarios pass before and after drag/inline boundaries |
| Phase 5 | Text boxes resize unexpectedly, text snapping changes, inline overlay projection drifts | Limit changes to text-specific geometry authority; do not modify generic non-text geometry without proof | Keep text changes behind text-specific geometry paths first | Single-text selection/drag/inline scenarios pass |
| Phase 6 | Legitimate late updates get dropped, guards become too strict | Add session checks incrementally by subsystem; do not centralize into a new framework first | Introduce stronger rejection paths with trace visibility before deleting any compatibility behavior | Repeated quick-drag and stale-work scenarios pass without lost lawful updates |
| Phase 7 | Inline edit fails to start/commit, focus regresses in some browsers | Keep scope strictly inside inline authority paths; do not reopen drag/hover work unless proven necessary | Preserve current phase-atomic swap skeleton and tighten authority checks around it | Enter/edit/exit inline scenarios pass on the supported runtime matrix |

## 10. ARCHITECTURAL UNKNOWNS

- The current codebase does not expose a first-class selected-phase session token. Execution ordering assumes that a lightweight selected-phase attachment generation can be introduced or observed without a broad rewrite.
- It is not fully enumerated which external callers may still drive hover cleanup through `window.setHoverIdGlobal`. That could affect how safely hover hardening can be isolated.
- Group drag and multi-selection drag still share some runtime globals and compatibility behavior. Assumption: they can follow the same startup and handoff ownership rules without a separate early refactor.
- Line selection uses a different selected-phase path from generic transformer selections. Assumption: the same visibility exclusivity contract still applies even if the renderer differs.
- Inline edit and drag appear mostly disjoint in the current docs. Assumption: no hidden inline snap path exists outside the audited drag-guide pipeline.
- Existing BOXFLOW and inline trace channels are present but not yet guaranteed to emit every signal needed for the acceptance criteria. Some instrumentation work may be needed before Phase 1 can be validated confidently.

## 11. FINAL RECOMMENDATION

Phase 2 should remain open until the text, shape, and icon drag scenarios near guides are re-verified with the new instrumentation.

The immediate next step is a **Phase 2 family-guide validation pass**, not Phase 3 yet.

That validation pass should check:

- text drag far from guides
- slow text drag into horizontal and vertical guides
- text drag hovering near the snap threshold
- fast text drag across the same guides
- shape drag far from guides
- slow shape drag into horizontal and vertical guides
- slow icon drag into horizontal and vertical guides
- shape/icon drag hovering near the snap threshold
- fast shape/icon drag across the same guides
- image drag near the same guides as a control comparison

If those scenarios confirm no visible text/overlay or shape/icon-overlay vibration and the new logs stay on one geometry chain, then Phase 3 becomes the next implementation phase.
