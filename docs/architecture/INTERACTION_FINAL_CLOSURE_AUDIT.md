# INTERACTION FINAL CLOSURE AUDIT

> Updated from code inspection and architecture documentation on 2026-04-07.
>
> Scope:
> `docs/architecture/INTERACTION_CONTRACT.md`,
> `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`,
> `docs/architecture/INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md`,
> `docs/architecture/ARCHITECTURE_GUIDELINES.md`,
> and the current editor codebase.

## 1. Audit Result

Phases 1 through 6 are implemented in the current codebase.

No additional broad implementation phase is justified by the audited code.

The remaining open work falls into two narrower categories:

- validation gaps, especially the browser scenario matrices still called out in Phases 3 through 6
- cleanup or future-improvement items that do not currently justify another large interaction phase

Phase 7 is therefore **optional later**, not required now for interaction-contract correctness.

## 2. Phase-By-Phase Status Review

### Phase 1: Startup Correctness

- Planned objective:
  stabilize `selected -> predrag -> drag` so the first visible drag frame is lawful
- Actual implementation status:
  implemented in code
- Current status:
  Complete
- Evidence from code:
  `CanvasStageContentComposer.jsx` still emits `drag-overlay:shown`, `startup-contract:violation`, and `phase:transition`, and the startup gate remains tied to the active drag-overlay session
- Remaining edge cases:
  none found in this audit beyond normal regression risk

### Phase 2: Drag Steady-State Geometry and Snap Sync

- Planned objective:
  keep drag geometry on live authority and resync after snap mutation
- Actual implementation status:
  implemented in code
- Current status:
  Complete
- Evidence from code:
  drag-overlay sync in `CanvasStageContentComposer.jsx` still records `geometrySource`, text drag uses `resolveAuthoritativeTextRect(...)`, and `SelectionBoundsIndicator.jsx` still checks post-snap text parity against authoritative text rects
- Remaining edge cases:
  guide identity is still drag-session-based rather than guide-session-based, but no new drag geometry gap was found

### Phase 3: Drag End / Settling / Selected Handoff

- Planned objective:
  make `drag -> settling -> selected|idle` deterministic and phase-correct
- Actual implementation status:
  implemented in code, including the stale post-drag ownership fix and stale ready/handoff rejection follow-ups
- Current status:
  Needs Validation
- Evidence from code:
  `CanvasStageContentComposer.jsx` now carries explicit drag-settle identity and rejects stale repair; `SelectionTransformer.jsx` rejects stale ready candidates; handoff-paint confirmation rejects stale ready metadata before releasing drag-overlay ownership
- Remaining edge cases:
  line-specific selected destinations still use their dedicated path rather than the transformer hidden-ready probe, so browser validation should still cover line-specific release/reselection scenarios

### Phase 4: Hover Discipline

- Planned objective:
  keep hover lawful, deterministic, and subordinate to higher-priority owners
- Actual implementation status:
  implemented in code
- Current status:
  Needs Validation
- Evidence from code:
  `CanvasStageContentComposer.jsx` still blocks suppressed hover re-entry, clears stale re-entry, replays lawful post-drag hover, and now invalidates stale replay through `post-drag:replay-ignored` and `hover:stale-replay-ignored`
- Remaining edge cases:
  steady-state hover is still target-id based and compatibility callers may still write through `window.setHoverIdGlobal`

### Phase 5: Text Geometry Parity

- Planned objective:
  enforce one coherent text geometry basis across selection, drag, hover, guides, and inline projection
- Actual implementation status:
  implemented in code
- Current status:
  Needs Validation
- Evidence from code:
  `selectionBoundsGeometry.js` resolves text through `resolveAuthoritativeTextRect(...)` first, `useGuiasCentrado.js` fails closed when text authority is unavailable, and inline projection is downstream of authoritative Konva text geometry
- Remaining edge cases:
  outside drag, selected-phase still permits explicit object-data fallback when live text geometry is unavailable, but that fallback is now source-pure all-fallback rather than a mixed union

### Phase 6: Session Identity Hardening

- Planned objective:
  reject stale work and prevent cross-session authority leakage
- Actual implementation status:
  implemented in code
- Current status:
  Needs Validation
- Evidence from code:
  `CanvasStageContentComposer.jsx` now creates `dragSettleSession.sessionKey`, rejects stale post-drag repair, rejects stale hover replay, and emits explicit stale-session logs; `SelectionTransformer.jsx` rejects stale selected-phase ready candidates
- Remaining edge cases:
  guide evaluation still piggybacks on drag session identity, and selected-phase still derives its effective identity instead of exposing one standalone public token

## 3. Contract Compliance Review

| Contract area | Status | Evidence | Residual issue type |
| --- | --- | --- | --- |
| Phase model discipline | Satisfied | `CanvasStageContentComposer.jsx` remains the explicit phase source and continues to emit `phase:transition` across the ownership lifecycle | Validation only |
| Visual authority contract | Partially satisfied | drag-overlay, selected-phase, and hover priority are enforced for the main transformer path; line-specific selected visuals still use a separate path | Cleanup only |
| Geometry authority contract | Satisfied in code | drag/predrag/settling are hardened; text uses one authority source; selected-phase unions now resolve as all-live or all explicit fallback instead of mixing geometry sources in one frame | Validation only |
| Selection authority contract | Satisfied in code | post-drag repair, stale handoff invalidation, and selected-phase rebinding to committed selection are implemented in `CanvasStageContentComposer.jsx` | Validation only |
| Drag lifecycle contract | Satisfied in code | startup gate, controlled drag-overlay sync, drag settle session, and handoff release guards are all present in `CanvasStageContentComposer.jsx` | Validation only |
| Startup contract | Satisfied | first visible drag frame is still tied to `controlled-sync` and violations remain observable | None found |
| Handoff contract | Partially satisfied | transformer-backed selected-phase readiness and post-paint confirmation are enforced; line-specific selected path is still separate | Cleanup only |
| Hover contract | Satisfied in code | higher-priority suppression, same-target conflict blocking, lawful coexistence, replay, and stale replay rejection are all implemented | Validation only |
| Snap & guides contract | Partially satisfied | guide evaluation uses the live drag path and text authority basis, but guide invalidation still depends on drag-session checks instead of a dedicated guide token | Cleanup only |
| Inline text contract | Satisfied in code | `resolveInlineCanvasVisibility(...)`, `useInlineSessionRuntime.js`, and `InlineTextOverlayEditor.jsx` already require matching session, swap, authority, and paint-stable conditions before DOM authority is claimed | Validation only |
| Session & identity contract | Partially satisfied | drag, settle, ready, handoff-paint, and hover replay now reject stale work; selected-phase and guides still do not expose standalone public durable tokens | Cleanup only |
| Critical invariants | Partially satisfied | main-path invariants are explicit and observable; guide identity and the line-specific selected path still have narrower coverage than the transformer path | Cleanup only |

## 4. Remaining Gaps

Only the following items remain materially open after the code audit.

### 4.1 Validation Gaps

- Browser validation for the Phase 3 matrix
- Browser validation for the Phase 4 hover matrix
- Browser validation for the Phase 5 text-geometry matrix
- Browser validation for the Phase 6 repeated-interaction / stale-session matrix

Classification:
validation gap

### 4.2 Cleanup-Only / Future Improvement Items

- line-specific selected rendering still remains separate from the generic transformer-backed selected path
- guide evaluation still uses drag-session identity instead of its own public session token
- steady-state hover remains target-id based and compatibility callers may still write through `window.setHoverIdGlobal`
- selected-phase still derives its effective session from current selection plus attachment/readiness state rather than exposing one standalone public token

Classification:
cleanup only / future improvement

## 5. Phase 7 Decision

Phase 7 is **Optional later**.

Why:

- the inline authority contract is already structurally enforced in the current code
- no active DOM/Konva dual-ownership bug was identified during this audit
- the remaining inline concerns are browser-behavior confidence and potential future simplification, not a demonstrated correctness blocker

Phase 7 should only be reopened if:

- browser validation reveals a real DOM/Konva authority overlap, stale focus reclaim, or ghost-overlay bug
- or the team wants a cleanup pass to unify inline authority diagnostics and reduce implementation complexity

## 6. Documentation Alignment

This audit updates the interaction docs to match the real codebase more closely:

- `INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md`
  - now points to this closure audit for final status
  - no longer treats Phase 7 as the automatic next implementation step
  - Phase 3 status is corrected from reopened work to implemented-in-code / validation-pending
- `INTERACTION_SYSTEM_CURRENT_STATE.md`
  - now includes a closure summary that distinguishes implementation-complete phases from remaining validation or cleanup-only items
- `INTERACTION_CONTRACT.md`
  - now records that selected-phase fallback must remain source-pure all-live or all-fallback
  - now records that further inline work is optional unless browser validation reveals a correctness issue

## 7. Final Recommendation

There is not another broad implementation phase to start right now.

What is left right now:

- run the browser validation matrices for Phases 3 through 6
- keep the remaining cleanup-only items scoped as optional follow-up, not as blockers

If validation passes, the interaction system is sufficiently contract-compliant that the next best step is routine regression coverage and targeted cleanup, not another major interaction rewrite.

## 8. Assumptions

- Assumption: no unpublished local browser-validation evidence exists beyond the logs and code currently visible in the repository.
- Assumption: line-specific selected rendering remains lawful in normal operation, but this audit treats it as cleanup-only because it still bypasses part of the generic transformer handoff machinery.
- Assumption: the remaining cleanup-only items do not currently hide an unobserved correctness bug outside the audited code paths.
