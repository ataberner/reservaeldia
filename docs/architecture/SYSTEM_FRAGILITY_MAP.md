# SYSTEM FRAGILITY MAP

> Updated from code inspection on 2026-04-07.
>
> Required references revalidated: `docs/architecture/ARCHITECTURE_OVERVIEW.md`, `docs/architecture/ARCHITECTURE_GUIDELINES.md`, `docs/architecture/EDITOR_SYSTEM.md`, `docs/architecture/DATA_MODEL.md`, `docs/architecture/INTERACTION_CONTRACT.md`, `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`, `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`, `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`.
>
> Debug evidence reviewed: `docs/debug/inline-focus-rca-evidence.md`.
>
> Rule for this document: findings below describe the current implementation and current runtime contracts, not intended architecture.

## 1. Executive Read

The previous fragility map was directionally correct, but the current codebase makes three risks much more explicit than before:

1. Preview and publish still do not consume the same prepared render contract.
2. Editor selection and drag still cross multiple authorities: committed React state, runtime mirrors, drag-only state, DOM overlay state, Konva live nodes, and legacy globals.
3. Inline text editing is still a timing-sensitive DOM/Konva handoff, and the repo still contains active RCA instrumentation with no closure evidence for the focus issue.

No previous item is fully obsolete. Some are better constrained than before because the interaction contract, runtime adapters, and debug traces are now more explicit, but the critical boundaries are still live in code.

## 2. Revalidation Of The Previous Map

| ID | Status | Level now | Type now | Current read |
| --- | --- | --- | --- | --- |
| E1 | Still valid | CRITICAL | State Management / Rendering | Multiple active editor truths still exist: React state, selection runtime, snapshot adapter, legacy `window._*`, and live Konva nodes. |
| E2 | Still valid | CRITICAL | State Management / UX / Visual Consistency | Inline editing still depends on overlay mount, focus reclaim, visibility swap, and settle timing. |
| E3 | Still valid | HIGH | State Management / Rendering | Drag, resize, rotation, and post-drag visuals still rely on transient flags, refs, and overlay choreography. |
| E4 | Reduced but valid | HIGH | State Management | Some logic moved into hooks, but `CanvasEditor.jsx`, `CanvasStageContentComposer.jsx`, and `SelectionTransformer.jsx` are still heavy orchestration points. |
| E5 | Still valid | HIGH | State Management | Global events and runtime bridges still carry important control flow. |
| D1 | Still valid | HIGH | Data Contract | `normalizeDraftRenderState` is still intentionally shallow and permissive. |
| D2 | Still valid | HIGH | Data Contract | Draft load can still mutate Firestore by backfilling `tipoInvitacion`. |
| D3 | Reduced but valid | HIGH | State Management / Data Contract | Write queueing improved ordering, but autosave and flush still depend on transient interaction state and multiple transports. |
| D4 | Still valid | HIGH | Data Contract / Rendering | Asset normalization still differs across load, preview, and publish. |
| D5 | Still valid | HIGH | Data Contract | Draft/publication linkage still resolves through compatibility field families. |
| R1 | Still valid | CRITICAL | Data Contract / Rendering | Preview overlay boundary still does not match publish preparation boundary. |
| R2 | Still valid | HIGH | Rendering | HTML generation is still concentrated in large, branched modules. |
| R3 | Still valid | HIGH | Data Contract / Rendering | Legacy countdown and icon contracts are still active in live render paths. |
| R4 | Still valid | HIGH | Rendering / UX / Visual Consistency | `pantalla`, `yNorm`, and `fullbleed` are still explicit drift zones in publish validation. |
| R5 | Still valid | MEDIUM | Data Contract | Functional CTA behavior is still resolved from root config plus object presence, not from the button object alone. |
| P1 | Reduced but valid | HIGH | Backend / Infra / Data Contract | Lifecycle logic is more centralized, but authority is still reconstructed from multiple persisted fields. |
| P2 | Still valid | CRITICAL | Data Contract / Backend / Infra | Publish safety is still guaranteed only after backend preparation and validation. |
| P3 | Still valid | HIGH | Backend / Infra | Finalization still permits warning-only partial success. |
| P4 | Reduced but valid | HIGH | Backend / Infra | Publication/payment orchestration is more modular, but still dense and side-effect heavy. |
| P5 | Still valid | MEDIUM | Backend / Infra | Public read/submit paths can still finalize expired publications. |
| V1 | Still valid | CRITICAL | Rendering / State Management | Preview is still a timing-sensitive multi-step pipeline, not a pure "render current editor state" action. |
| V2 | Still valid | HIGH | Rendering / Backend / Infra | Dashboard preview still imports backend generator source into the frontend path. |
| V3 | Still valid | HIGH | Data Contract / Backend / Infra | Dashboard/editor entry still depend on fallback-heavy read resolution. |
| V4 | Still valid | MEDIUM | Backend / Infra | Public invitation URLs are still hardcoded in client-facing code. |
| V5 | Partially valid | MEDIUM | Backend / Infra | Some read failures are still intentionally swallowed, although the boundaries are now better documented. |
| I1 | Still valid | HIGH | Backend / Infra / Data Contract | Shared render contracts still exist in multiple physical copies/build paths. |
| I2 | Still valid | MEDIUM | Backend / Infra | `functions/src/index.ts` still mixes current production handlers with legacy exports. |
| I3 | Still valid | MEDIUM | Backend / Infra | Production URLs and endpoints are still hardcoded in multiple layers. |
| I4 | Still valid | MEDIUM | Data Contract / Backend / Infra | RSVP submission still writes modern structured fields plus legacy compatibility fields. |

## 3. Current Validated Fragilities

### F1. Preview And Publish Still Do Not Share One Prepared Render Contract

- Level: CRITICAL
- Type: Data Contract, Rendering
- Revalidates: `R1`, `R4`, `P2`, `V1`
- Evidence: preview re-reads the draft/template, then `overlayLiveEditorSnapshot()` replaces only `objetos`, `secciones`, `rsvp`, and `gifts`; `prepareDashboardPreviewRenderState()` explicitly keeps publish-only preparation on the backend path; publish instead runs `preparePublicationRenderState()`, asset normalization, `resolveFunctionalCtaContract()`, and `validatePreparedPublicationRenderState()`.
- Contract Mismatch: preview treats the live boundary as a four-field overlay, while publish depends on server-prepared assets, crop materialization, grouped render preparation, and CTA/root config reconciliation that are not part of that overlay contract.
- Failure mode: preview can look correct while publish blocks, repositions, or changes behavior for `pantalla`, `fullbleed`, unresolved assets, image crop, or functional CTA objects.
- Action: `P0` add a single `buildPreparedRenderPayloadForPreview()` boundary that reuses the same preparation and validation rules as publish, and make `previewPipeline` render that prepared payload instead of raw `overlayLiveEditorSnapshot()` output.
- Expected impact: removes the main "preview passed, publish broke" class and makes validation messages explain actual render behavior.
- Compatibility risk: Medium. Preview will become stricter for drafts that currently benefit from preview-only leniency.

### F2. Selection Authority Is Still Split Across Committed State, Runtime Mirrors, Drag Visual State, Globals, And Live Nodes

- Level: CRITICAL
- Type: State Management, Rendering
- Revalidates: `E1`, `E3`, `V1`
- Evidence: `CanvasEditor.jsx` owns committed selection; `useCanvasEditorSelectionRuntime()` mirrors it into `editorSelectionRuntime`; `CanvasStageContentComposer.jsx` also drives `pendingDragSelection`, `dragVisualSelection`, `dragSettleSessionRef`, and controlled drag bounds; `editorSelectionRuntime.js` still mirrors legacy globals such as `_elementosSeleccionados` and `_pendingDragSelectionId`; `editorSnapshotAdapter.js` still falls back to legacy render globals if the adapter is missing.
- Contract Mismatch: the docs position runtime adapters as the explicit bridge, but the implementation still allows legacy global fallback and phase-specific side channels to participate as real authorities.
- Failure mode: wrong visible box owner, stale selection after drag, selection/menu drift, or drag-overlay membership collapsing to `[dragId]` even while committed selection still says something else.
- Action: `P0` make `editorSelectionRuntime` the only imperative selection bridge for selection consumers, stop mirroring `_elementosSeleccionados` as an authoritative read path, and remove legacy fallback reads for selection ownership from composer/transformer code.
- Expected impact: shrinks the debugging surface for selection, drag handoff, and menu positioning.
- Compatibility risk: High inside editor runtime, low for persisted data.

### F3. Inline Text Editing Still Depends On Timed Overlay Settle Instead Of One Explicit Session State

- Level: CRITICAL
- Type: State Management, UX / Visual Consistency
- Revalidates: `E2`, `V1`
- Evidence: `CanvasEditor.jsx` exposes `ensureInlineEditSettledBeforeCriticalAction({ maxWaitMs: 120 })`; `inlineCriticalBoundary.js` resolves settle state from `editingId`, `window._currentEditingId`, `inlineOverlayMountedId`, and `inlineOverlayMountSession`; `InlineTextOverlayEditor.jsx` still performs multi-step authority handoff under `phase_atomic_v2`; `docs/debug/inline-focus-rca-evidence.md` confirms the RCA instrumentation is still active and explicitly says there is no repo evidence that the focus incident is closed.
- Contract Mismatch: visible overlay is not equivalent to "focus operativo"; the debug contract explicitly requires activeElement, valid range, input without extra click, and no immediate blur in the same session.
- Failure mode: click-2 inline edit not actually editable, stale text in preview/publish boundary, overlay misalignment, or half-committed content during a critical action.
- Action: `P0` export one explicit inline session token from the existing overlay runtime (`opening | ready | editing | finishing | settled`) and make preview/publish flush wait on that token instead of polling mixed refs and globals.
- Expected impact: makes critical actions deterministic without rewriting the inline UI itself.
- Compatibility risk: Medium. Some existing timing assumptions around close/focus will change.

### F4. Drag And Group Drag Still Depend On Session Refs, Epoch Heuristics, And Legacy Globals

- Level: HIGH
- Type: State Management, Rendering
- Revalidates: `E3`, `E5`
- Evidence: `CanvasStageContentComposer.jsx` owns drag startup gating, controlled overlay bounds, settle sessions, and handoff guards; `useCanvasInteractionCoordinator.js` uses `interactionEpoch`, active counts, and a two-RAF settle phase; `dragGrupal.js` still uses `_groupDragSession`, `_grupoLider`, `_recentGroupDragGuard`, `_skipIndividualEnd`, and manual pointer fallback; `dragIndividual.js` still suppresses or skips end handling based on group-drag globals.
- Contract Mismatch: the interaction contract is phase-based, but active drag ownership is still partly encoded in mutable refs and global projection rather than one editor-owned session object.
- Failure mode: startup jump, stale drag overlay after settle, wrong member set in group drag, or skipped individual end handling after a group interaction.
- Action: `P1` keep legacy drag globals as debug mirrors only and pass one session object from composer into `dragGrupal` and `dragIndividual` so stale work rejection is keyed by session id, not by scattered globals.
- Expected impact: reduces same-gesture drag drift and post-drag ghost state.
- Compatibility risk: High inside editor drag paths, but localized.

### F5. Geometry Authority Still Changes By Phase, Not Just By Box Owner

- Level: HIGH
- Type: Rendering, Data Contract
- Revalidates: `E3`, `R4`
- Evidence: drag overlay uses `SelectionBoundsIndicator` with `requireLiveNodes: true`; selected-phase visuals use `requireLiveNodes: false` and can fall back to object geometry; debug metadata in `SelectionBoundsIndicator.jsx` and `selectionBoundsGeometry.js` still exposes `geometrySource`, `selectionUnionSource`, and `mixedSourcePrevented`.
- Contract Mismatch: visual authority changes by phase, but geometry authority also changes by phase. That means selected-phase handoff after drag can still show persisted/object fallback geometry while drag overlay was using live geometry only.
- Failure mode: post-drag box drift, selected-phase zero-bounds or fallback box, snap/box mismatch, or visible jump when ownership changes.
- Action: `P1` require live selected bounds for the first ready-confirmed selected-phase frame after drag or resize settle; allow object-data fallback only for idle reattachment, not immediate post-interaction handoff.
- Expected impact: removes the highest-value box drift without rewriting the whole selection renderer.
- Compatibility risk: Medium. Some stale boxes will disappear instead of being shown.

### F6. Draft Load And Draft Persist Are Still Not A Pure, Reproducible Boundary

- Level: HIGH
- Type: Data Contract, State Management
- Revalidates: `D2`, `D3`, `D4`
- Evidence: `loadBorradorSyncState()` can backfill `tipoInvitacion` on read; load also rewrites storage-backed URLs through `refreshUrlsDeep()`; `useBorradorSync.js` skips autosave while `window._resizeData?.isResizing`; flush can travel either through a window event or a direct bridge; `criticalFlush.js` captures the compatibility snapshot only after flush success.
- Failure mode: opening a draft can mutate it, flush behavior depends on interaction timing, and the snapshot handed to preview is not just "what the editor had in memory".
- Action: `P1` remove `tipoInvitacion` write-on-read from the load path and move it to an explicit migration/save repair, then replace the resize global guard with a persistence-owned interaction token instead of `window._resizeData`.
- Expected impact: makes load reproducible and makes persistence timing easier to reason about during preview/publish.
- Compatibility risk: Medium. Old drafts will stop self-healing on open until migrated or saved.

### F7. Publish Safety Still Lives Too Late In The Lifecycle

- Level: HIGH
- Type: Data Contract, Backend / Infra
- Revalidates: `D1`, `P2`, `R3`, `R5`
- Evidence: `normalizeDraftRenderState()` is shallow; publish validation still needs to catch `missing-section-reference`, unsupported shapes, unresolved assets, crop materialization failures, `pantalla` drift, legacy countdown/icon branches, and CTA/root config issues such as `functional-cta-link-ignored`, `gift-missing-root-config`, and `rsvp-missing-root-config`.
- Contract Mismatch: the editor lets object-level presence imply behavior, but publish resolves some behavior from root config plus prepared assets plus compatibility policy.
- Failure mode: last-mile publish blockers, or published HTML honoring a stricter contract than the editor surface suggests.
- Action: `P1` run `validatePreparedPublicationRenderState()` as a visible preflight during preview open and before enabling publish/checkout, not only at the final publish boundary.
- Expected impact: shifts real publish failures earlier without changing generator behavior first.
- Compatibility risk: Low for persisted data, medium for UI because more warnings will appear sooner.

### F8. Publication Lifecycle And Finalization Still Depend On Distributed Fields And Warning-Only Cleanup

- Level: HIGH
- Type: Backend / Infra, Data Contract
- Revalidates: `P1`, `P3`, `P5`
- Evidence: lifecycle still resolves from `estado`, `publicationLifecycle.state`, `enPapeleraAt`, `pausadaAt`, `venceAt`, `vigenteHasta`, and lifecycle expiration fields; `executePlannedPublicationFinalization()` writes history first, then performs warning-only storage delete and warning-only publication delete before releasing reservation and updating the draft; public read and RSVP flows can finalize expired publications.
- Contract Mismatch: public access is not a pure read boundary, and cleanup success is not equivalent to lifecycle success.
- Failure mode: hard-to-explain public state, partial cleanup, or draft/publication/reservation drift after finalization.
- Action: `P1` persist one normalized lifecycle snapshot on every publish, transition, pause, trash, and finalize write, and make readers prefer that snapshot before legacy fallback reconstruction.
- Expected impact: reduces lifecycle ambiguity and makes finalization logs easier to trust.
- Compatibility risk: Low if added as an additive field; medium if readers drop legacy fallback too early.

### F9. Hardcoded URLs, Duplicated Contract Files, And Dual RSVP Payloads Still Create Environment Drift

- Level: MEDIUM
- Type: Backend / Infra
- Revalidates: `V4`, `I1`, `I3`, `I4`
- Evidence: `buildPreviewDisplayUrl()` hardcodes `https://reservaeldia.com.ar/i/...`; `generarModalRSVP.ts` hardcodes `https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit`; render-contract files still exist under `shared/`, `functions/shared/`, and `functions/lib/shared/`; generated RSVP payload and `publicRsvpSubmit` still carry both modern structured fields and legacy compatibility fields.
- Failure mode: environment-specific drift, generated HTML tied to production endpoints, and contract-copy divergence across runtimes.
- Action: `P2` move public base URL and RSVP endpoint to one shared runtime config and treat copied render-contract files as build artifacts from a single checked-in source.
- Expected impact: lowers deployment drift and makes parity testing portable.
- Compatibility risk: Low if config defaults match current production values.

## 4. Systemic Fragility

- Lack of one long-lived source of truth: the editor still has separate logical, runtime, visual, and global bridges for the same interaction.
- Implicit contracts still coexist with explicit ones: the interaction contract is strong on paper, but legacy global fallback and compatibility fallbacks still remain legal execution paths.
- Correctness still depends on timing: drag settle, overlay mount, post-paint confirmation, and flush boundaries all use `requestAnimationFrame`, bounded waits, or mutable session refs.
- Responsibilities are still mixed: major modules still combine render ownership, state coordination, debug tracing, and compatibility logic.
- Compatibility is still part of the live path, not just migration support: countdown, icon, lifecycle, CTA, and RSVP compatibility behavior still runs in production code.
- Debug instrumentation is still acting as runtime scaffolding: inline RCA traces and box-flow/drag diagnostics are still embedded in hot paths, which is useful, but also evidence that those paths still need guardrails to stay correct.

## 5. Flow Risk Map

| Flow | Weakest point | Where it can break | Typical failure |
| --- | --- | --- | --- |
| Single selection | `CanvasStageContentComposer.jsx` selection intent + `editorSelectionRuntime` mirror | committed selection, pending drag selection, and inline-finish side effects do not converge in the same tick | wrong selected box, wrong menu target, or select-only becoming select-and-drag |
| Multi-selection with Shift | `handleElementSelectIntent()` plus `toggleCommittedSelectionRuntime()` | additive selection toggles while pending drag or stale visual selection still exists | lost membership, stale overlay, or menu/transformer attached to the wrong set |
| Drag start and move | `CanvasStageContentComposer.jsx`, `dragIndividual.js`, `dragGrupal.js` | drag startup authority, membership collapse, or manual group fallback diverges from logical selection | startup jump, wrong drag box, or group drag member drift |
| Post-drag stabilization | `dragSettleSessionRef` handoff + `useCanvasInteractionCoordinator()` + `SelectionTransformer.jsx` ready-probe | selected-phase readiness, post-paint confirmation, and deferred repair do not finish before overlay release | stale box, no box, or hover/selection replay on the wrong target |
| Inline text editing | `InlineTextOverlayEditor.jsx` + `inlineCriticalBoundary.js` | overlay mounted, but focus/caret/session is not truly ready before preview/publish/selection change | extra click required, stale text, or overlay misalignment |
| Preview rendering | `flushEditorPersistenceBeforeCriticalAction()` + `overlayLiveEditorSnapshot()` + preview generator import | flush boundary and preview render boundary are not the same as publish preparation | preview shows a state that is not actually publishable |
| Publish generation | `preparePublicationRenderState()` + `validatePreparedPublicationRenderState()` + generator | prepared assets, CTA/root config, group contract, or layout contract diverges from editor assumptions | publish blocked, layout moved, or published HTML differs from canvas/preview |

## 6. Immediate Action Order

1. `P0` Unify preview and publish around one prepared render payload.
2. `P0` Collapse selection authority to one imperative runtime bridge and remove selection fallback reads from legacy globals.
3. `P0` Export one explicit inline session state and make critical actions wait on that state.
4. `P1` Sessionize drag/group-drag end-to-end and demote legacy drag globals to debug mirrors.
5. `P1` Tighten post-drag handoff so the first selected-phase frame uses live geometry.
6. `P1` Move publish validation earlier into preview/publish UI preflight.
7. `P1` Make lifecycle readers prefer one normalized persisted lifecycle snapshot.
8. `P2` Centralize public URL and RSVP endpoint config, and reduce shared-contract duplication.

## 7. Bottom Line

The system is not mainly fragile because it is undocumented anymore. It is fragile because the editor, preview, and publish paths still cross different authority boundaries at the exact moments that matter: selection handoff, inline settle, preview preflight, and publish preparation.

If only one thing changes first, it should be this: preview must stop rendering from a contract that publish does not use.
