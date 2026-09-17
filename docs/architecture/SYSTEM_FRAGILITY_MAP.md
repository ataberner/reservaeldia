# SYSTEM FRAGILITY MAP

> Status: Current Audit / Risk Map.
>
> Broad editor/render inspection: 2026-04-27. Targeted operational revalidation:
> 2026-09-10, scoped to F9's shared-copy mechanism and F10–F15 below. Earlier
> editor/render findings retain their original evidence date; they were not
> exhaustively re-audited or closed by the documentation work.
>
> References from the 2026-04-27 review: `docs/architecture/ARCHITECTURE_OVERVIEW.md`, `docs/architecture/ARCHITECTURE_GUIDELINES.md`, `docs/architecture/EDITOR_SYSTEM.md`, `docs/architecture/DATA_MODEL.md`, `docs/architecture/INTERACTION_CONTRACT.md`, `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`, `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`, `docs/contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md`, `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`, `docs/contracts/GALLERY_SYSTEM_CONTRACT.md`, `docs/contracts/GALLERY_EDITOR_CONTRACT.md`, `docs/contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md`, `docs/contracts/GALLERY_VIEWER_RENDER_CONTRACT.md`.
>
> Debug evidence reviewed: `docs/debug/inline-focus-rca-evidence.md`.
>
> Rule for this document: distinguish observed implementation, normative claims,
> hypotheses and pending work. Actions are recommendations, not accepted
> architectural decisions or authorization to implement them. Documenting a risk
> does not close it. Local inspection does not establish deployed exposure.
>
> For current operational priorities and closure evidence, start at
> [Operational Readiness](#operational-readiness).

## 1. Executive Read

The previous fragility map was directionally correct, but the current codebase makes four risks much more explicit than before:

1. Publishable draft preview and publish now consume the same backend prepared render payload. Template/fallback preview and iframe framing remain separate paths, but preview code classifies their authority explicitly.
2. Editor selection and drag still cross multiple authorities: committed React state, runtime mirrors, drag-only state, DOM overlay state, Konva live nodes, and legacy globals.
3. Inline text editing is still a timing-sensitive DOM/Konva handoff, and the repo still contains active RCA instrumentation with no closure evidence for the focus issue.
4. Mobile/reflow parity is now explicitly measured: the preview iframe can run in `data-preview-layout-mode="parity"` with a publish-like fixed-section height model, while the legacy iframe height/overflow mutation path remains behind `NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE=0`.

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
| D3 | Reduced but valid | MEDIUM | State Management / Data Contract | Editor-session transport is now centralized, but autosave and flush still depend on transient interaction state. |
| D4 | Reduced but valid | MEDIUM | Data Contract / Rendering | Publishable draft preview and publish share backend asset normalization; editor load, template copy, and template/fallback preview still differ. |
| D5 | Still valid | HIGH | Data Contract | Draft/publication linkage still resolves through compatibility field families. |
| R1 | Reduced but valid | MEDIUM | Data Contract / Rendering | Publishable draft preview now uses the publish prepared payload; template/fallback preview still uses local overlay/generator behavior. |
| R2 | Still valid | HIGH | Rendering | HTML generation is still concentrated in large, branched modules. |
| R3 | Still valid | HIGH | Data Contract / Rendering | Legacy countdown and icon contracts are still active in live render paths. |
| R4 | Still valid | HIGH | Rendering / UX / Visual Consistency | `pantalla`, `yNorm`, and `fullbleed` are still explicit drift zones in publish validation. |
| R6 | Reduced but valid | MEDIUM | Rendering / UX / Visual Consistency | Mobile/reflow parity now has geometry fixtures and a preview iframe parity mode, but smart layout still performs runtime DOM mutation. |
| R5 | Still valid | MEDIUM | Data Contract | Functional CTA behavior is still resolved from root config plus object presence, not from the button object alone. |
| P1 | Reduced but valid | HIGH | Backend / Infra / Data Contract | Lifecycle logic is more centralized, but authority is still reconstructed from multiple persisted fields. |
| P2 | Reduced but valid | MEDIUM | Data Contract / Backend / Infra | Publish safety is now surfaced during backend-prepared preview and checkout, but final publish remains the authoritative gate. |
| P3 | Still valid | HIGH | Backend / Infra | Finalization still permits warning-only partial success. |
| P4 | Reduced but valid | HIGH | Backend / Infra | Publication/payment orchestration is more modular, but still dense and side-effect heavy. |
| P5 | Still valid | MEDIUM | Backend / Infra | Public read/submit paths can still finalize expired publications. |
| V1 | Reduced but valid | HIGH | Rendering / State Management | Preview is still a timing-sensitive multi-step pipeline, but draft-authoritative HTML is now gated by backend prepared validation instead of local render trust. |
| V2 | Reduced but valid | MEDIUM | Rendering / Backend / Infra | Publishable draft preview uses a backend callable; template/fallback preview still imports backend generator source into the frontend path. |
| V3 | Still valid | HIGH | Data Contract / Backend / Infra | Dashboard/editor entry still depend on fallback-heavy read resolution. |
| V4 | Still valid | MEDIUM | Backend / Infra | Public invitation URLs are still hardcoded in client-facing code. |
| V5 | Partially valid | MEDIUM | Backend / Infra | Some read failures are still intentionally swallowed, although the boundaries are now better documented. |
| I1 | Still valid | HIGH | Backend / Infra / Data Contract | Shared render contracts still exist in multiple physical copies/build paths. |
| I2 | Still valid | MEDIUM | Backend / Infra | `functions/src/index.ts` still mixes current production handlers with legacy exports. |
| I3 | Still valid | MEDIUM | Backend / Infra | Production URLs and endpoints are still hardcoded in multiple layers. |
| I4 | Still valid | MEDIUM | Data Contract / Backend / Infra | RSVP submission still writes modern structured fields plus legacy compatibility fields. |

## 3. Current Validated Fragilities

### F1. Template/Fallback Preview Is Explicitly Visual-Only

- Level: MEDIUM
- Type: Data Contract, Rendering
- Revalidates: `R1`, `R4`, `P2`, `V1`
- Evidence: publishable draft preview now calls `prepareDraftPreviewRender`, which uses `prepareRenderPayload()`, `validatePreparedRenderPayload()`, and `generateHtmlFromPreparedRenderPayload()`, and is classified as `previewAuthority: "draft-authoritative"`. Template preview is classified as `"template-visual"` and fallback local preview as `"local-fallback"`; both still use `overlayLiveEditorSnapshot()` plus local `generarHTMLDesdeSecciones(...)` where applicable.
- Contract Mismatch: normal draft preview and publish share server-prepared assets, crop materialization, grouped render preparation, and CTA/root config reconciliation; template/fallback preview does not. This is documented and classified, so it is no longer hidden preview/publish contract drift.
- Failure mode: template/fallback preview can still look correct while backend publish behavior would block, re-resolve assets, or change behavior for `pantalla`, `fullbleed`, unresolved assets, image crop, or functional CTA objects.
- Action: keep template/fallback preview explicitly outside publish parity.
- Expected impact: keeps the main draft "preview passed, publish broke" class closed while leaving template preview scope explicit.
- Compatibility risk: Medium if template preview is moved to backend preparation later.

### F1b. Mobile/Reflow Parity Is Measured, But Still Runtime-Mutated

- Level: MEDIUM
- Type: Rendering, Visual Consistency
- Revalidates: `R4`, `R6`, `V1`
- Evidence: `ModalVistaPrevia` now pre-injects `data-preview-viewport` and `data-preview-layout-mode` into iframe `srcDoc`; `functions/src/utils/mobileSmartLayout/scriptTemplate.ts` uses parity mode to keep embedded preview on the publish-like fixed-section height model; `shared/previewPublishMobileGeometryParity.mjs` captures viewport, section, object, group-child, edge-decoration, and smart-layout geometry across mobile viewports.
- Contract Mismatch: the prepared payload is shared, but final mobile geometry still depends on runtime CSS variables, image/font readiness, viewport APIs, and smart-layout DOM mutation.
- Failure mode: preview and publish can still diverge if runtime timing, fullbleed fit-scaling, `pantalla` viewport math, or grouped object bounds resolve differently after load.
- Action: keep the geometry parity harness as the gate for future mobile changes; only change fullbleed fit-scale or smart-layout heuristics after the harness shows a real mismatch.
- Expected impact: turns mobile drift from subjective screenshots into object/section geometry diffs.
- Compatibility risk: Medium. The rollback flag keeps the legacy iframe behavior available.

### F1c. Edge Decorations Are Additive But Layering-Sensitive

- Level: LOW-MEDIUM
- Type: Rendering, Visual Consistency
- Revalidates: `R4`, `R6`
- Evidence: `decoracionesBorde` is normalized through the shared section asset contract, validated by prepared render payload, and rendered by `generarHTMLDesdeSecciones.ts` as a section-owned `.sec-edge-layer` between the base-background and content layers. Desktop preview/publish uses controlled edge-layer overflow for full edge artwork, while mobile remains on the existing responsive edge sizing and offset path. It is included in the visual baseline and mobile geometry parity snapshots.
- Contract Mismatch: none known in draft-authoritative preview/publish; the remaining sensitivity is CSS layer order, responsive edge-band sizing, and `pantalla` zoom math.
- Failure mode: edge ornaments could drift, become clipped, or accidentally enter object/smart-layout behavior if the layer contract is changed.
- Action: keep the primitive section-owned, non-object, and covered by the `edge-decorations-pantalla` baseline.
- Expected impact: avoids reusing fullbleed objects or cover backgrounds for edge ornaments.
- Compatibility risk: Low for existing templates because the field is additive.

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
- Evidence: `loadBorradorSyncState()` can backfill `tipoInvitacion` on read through the session-aware persistence authority; load also rewrites storage-backed URLs through `refreshUrlsDeep()`; `useBorradorSync.js` skips autosave while `window._resizeData?.isResizing`; flush can travel either through a window event or a direct bridge; `criticalFlush.js` captures the compatibility snapshot only after flush success.
- Failure mode: opening a draft can still mutate it, flush behavior depends on interaction timing, and the snapshot handed to preview is not just "what the editor had in memory". The previous template-vs-draft Firestore transport mismatch is closed by `editorSessionPersistence.js`, but timing fragility remains.
- Action: `P1` remove `tipoInvitacion` write-on-read from the load path and move it to an explicit migration/save repair, then replace the resize global guard with a persistence-owned interaction token instead of `window._resizeData`.
- Expected impact: makes load reproducible and makes persistence timing easier to reason about during preview/publish.
- Compatibility risk: Medium. Old drafts will stop self-healing on open until migrated or saved.

### F7. Publish Safety Still Lives Too Late In The Lifecycle

- Level: HIGH
- Type: Data Contract, Backend / Infra
- Revalidates: `D1`, `P2`, `R3`, `R5`
- Evidence: `normalizeDraftRenderState()` is shallow; backend prepared validation still needs to catch `missing-section-reference`, unsupported shapes, unresolved assets, crop materialization failures, `pantalla` drift, legacy countdown/icon branches, `functional-cta-link-ignored`, and residual CTA/root config issues when `enabled` cannot be normalized.
- Contract Mismatch: the editor lets object-level presence imply behavior, but publish resolves some behavior from root config plus prepared assets plus compatibility policy. Successful publish also now depends on generated share-image readiness, which is intentionally backend-only.
- Failure mode: editor surface still allows states that backend prepared preview/publish will block or warn about, and a publish attempt can now fail if the generated first-section share image cannot be produced and confirmed.
- Action: `P1` improve editor-facing surfacing of prepared validation warnings, not only modal/checkout surfacing.
- Expected impact: shifts real publish failures earlier into authoring without changing generator behavior.
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

### F8b. Checkout Post-Payment UI Can Drift From Backend Publication State

- Level: MEDIUM
- Type: State Management, UX, Publication Lifecycle
- Revalidates: `P1`, `P4`, `V3`
- Evidence: checkout success depends on the backend `publication_checkout_sessions` terminal `published` state and returned `publicUrl`, while retryable post-payment recovery is represented by backend-owned `publicationAutoRetry` metadata on the same session. The preview/dashboard parent also syncs `slugPublico`, `urlPublicaVistaPrevia`, and `urlPublicadaReciente` after publish. If a visible checkout modal reinitializes from those parent props, it can discard its terminal receipt state and show the slug/payment form again even though the backend publication already succeeded. If it treats `payment_approved + lastError` as immediate failure while backend recovery is still active, it can also surface a hard error before the authoritative retry window ends.
- Contract: the authoritative lifecycle is now captured in `docs/contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md`.
- Contract Mismatch: parent publication sync and frontend polling are reflections of backend truth, not new checkout or retry authorities.
- Failure mode: duplicate publish modal, second publish prompt after successful payment/publication, or premature hard failure while backend automatic recovery is still running.
- Action: checkout UI initialization must be keyed to modal open and checkout context (`draftSlug` + operation), terminal success remains keyed to backend `sessionStatus: "published"` plus final public URL, and `publicationAutoRetry.status: "scheduled" | "running"` should be shown as post-payment recovery rather than a terminal error.
- Expected impact: prevents post-payment UI loops and hides transient retryable publish failures behind a bounded backend recovery window without changing Mercado Pago, discount, slug reservation, or publish execution behavior.
- Compatibility risk: Low. The change is frontend state-boundary only and keeps backend settlement authoritative.

### F9. Hardcoded URLs, Duplicated Contract Files, And Dual RSVP Payloads Still Create Environment Drift

- Level: MEDIUM
- Type: Backend / Infra
- Revalidates: `V4`, `I1`, `I3`, `I4`
- Evidence: `buildPreviewDisplayUrl()` hardcodes `https://reservaeldia.com.ar/i/...`; render-contract files still exist under `shared/`, `functions/shared/`, and `functions/lib/shared/`; generated RSVP payload and `publicRsvpSubmit` still carry both modern structured fields and legacy compatibility fields. Revalidation 2026-09-11: `generarModalRSVP.ts` now uses `shared/firebaseEnvironment.cjs`; production destination is preserved and the isolated path uses the demo endpoint (F12).
- Failure mode: environment-specific drift, generated HTML tied to production endpoints, and contract-copy divergence across runtimes.
- Action: `P2` move public base URL and RSVP endpoint to one shared runtime config and treat copied render-contract files as build artifacts from a single checked-in source.
- Expected impact: lowers deployment drift and makes parity testing portable.
- Compatibility risk: Low if config defaults match current production values.

Shared-copy revalidation on 2026-09-10: see F15 for the current source/copy
mechanism, watch gap and closure evidence. Phase 4A updates the RSVP destination
boundary only; other public-URL fallbacks, legacy payload compatibility and the
shared watch gap are not closed by this work.

<a id="operational-readiness"></a>

### Operational Readiness — Targeted Revalidation, 2026-09-10

Scope: local working-tree documentation, Rules, Firebase initialization,
package scripts, two Hosting workflows, selected migrations, shared-copy script,
and focused code/test inspection. The tree already contained uncommitted changes.
No production probes, remote operations, builds, migrations or deployments were
performed. Lint was executed locally without fixing or caching; see F13.

Evidence labels: HECHO = inspected source or executed result; DECLARACIÓN =
normative/documented claim; CONTRADICCIÓN = incompatible sources; PENDIENTE =
missing verification or implementation. Static confirmation is not an emulator
test or evidence of the version deployed to a service.

Priorities here are scoped to operational readiness: P0 before relying on the
affected permission/isolation boundary; P1 before relying on the affected
verification, migration or shared-runtime workflow. They do not authorize fixes
or block independent documentation/read-only investigation. Existing editor
priorities below remain separate recommendations from the earlier review.

### F10. Firestore Compatibility Fallback Grants Broad Authenticated Access

- Priority / surface: **P0**, Firestore client reads/writes and administrative collections.
- HECHO / evidence: [firestore.rules](../../firestore.rules), final `match /{collection}/{document=**}`, permits authenticated reads and writes except for its explicit exclusion list. 4B2A adds `usuarios`, `publicadas`, `publicadas_historial`; 4B2B adds `countdownPresets`. Unmodeled child collections under the 4B2A families retain explicit compatibility grants. `iconos`, `iconos_audit`, `decoraciones`, analytics and other remaining roots still overlap the broad fallback; their narrower restrictions do not remove its grant.
- DECLARACIÓN / CONTRADICCIÓN: [Architecture Guidelines](ARCHITECTURE_GUIDELINES.md), Security First, requires user ownership. Authentication alone in the fallback does not enforce owner or administrative boundaries.
- Verification, 2026-09-11: **reproduced with client SDKs subject to the then-current Rules** in `demo-reservaeldia-local`, FASE 4B1. [Per-case baseline](../testing/SECURITY_RULES_BASELINE_4B1.md): 178 Firestore probes, including 46 acceptance violations (ownership, backend publication/visits and countdown invariants). Characterization also reproduced fallback grants on every named analytics root, audit/snapshot collections and descendants despite their specific restrictions. [Access matrix and 4B2 scope](../contracts/SECURITY_CONTRACT.md#access-matrix). Rules unchanged during 4B1; **F10 remains open**. Deployed version/exposure and real exploitation were not inspected.
- Conditioned work: changes relying on private-user or admin-only access must explicitly address this gap within authorized scope; a UI/backend guard alone cannot certify client Rules isolation.
- Local mitigation, 4B2A, 2026-09-11: [per-ID comparison](../testing/SECURITY_RULES_4B2A.md) verifies **41 Firestore acceptance violations corrected**, including ownership, publication/visit backend writes and filtered owner queries. All selected A1/A2 cases pass; its historical run retained five A4 countdown failures, addressed in 4B2B below. Private profile/RSVP/history own writes and raw owner visit reads are still observed permissions pending policy. **F10 remains open**, locally mitigated only for the [selected operations](../contracts/SECURITY_CONTRACT.md#phase-4b2a); no deployed Rules or other delivery channel was inspected.
- Local mitigation, 4B2B, 2026-09-11: [comparison and executed evidence](../testing/SECURITY_RULES_4B2B.md) corrects the **five original A4 violations**. Root/administrative descendants reject ordinary reads even when published; all countdown SDK writes (including create, versions, operation records and admin claims) are denied. The current admin predicate is preserved, not unified. Raw authenticated version reads remain observed/pending. A1/A2/A3 pass without regression. The full Rules command passes its bounded cases; blocked handlers and deployed state remain unverified. **F10 remains open**.
- Closure evidence: an approved access matrix for affected collections and subcollections, corrected overlapping grants, isolated positive/negative Rules tests for owner, other user, anonymous and administrative identities, and compatibility coverage for required public access. Deployment status needs separately authorized evidence; a local fix alone cannot close deployed-state uncertainty.

### F11. Storage Fallback Overlaps Restricted Asset Paths

- Priority / surface: **P0**, uploaded user assets and administrative catalogs in Storage.
- HECHO / evidence: [storage.rules](../../storage.rules), `match /{topLevel}/{allPaths=**}`, still grants authenticated access outside `proveedores`, `usuarios`, `thumbnails_borradores`, `publicadas` and `assets`. 4B2A scopes image/thumbnail paths by UID and forbids all client writes to `publicadas/**`. 4B2B protects countdown staging/frames/thumbnails; other assets namespaces and unmodeled countdown families retain explicit compatibility grants, as do unmodeled user folders/objects. Other catalog, shared, preview and export prefixes still overlap the broad fallback despite their specific restrictions.
- DECLARACIÓN / CONTRADICCIÓN: the same ownership and user-scoped-path requirements apply. Provider-specific checks are not a general bucket isolation guarantee.
- Verification, 2026-09-11: **reproduced through Storage client SDK operations**, FASE 4B1, same demo bucket and the then-current Rules. [Per-case baseline](../testing/SECURITY_RULES_BASELINE_4B1.md): 122 Storage probes, including 33 acceptance violations (foreign user assets and create/replace/delete of published artifacts); characterization reproduces overlap on icon/decor/shared/export prefixes. Provider-specific deny/shape/public-tuple probes are separate from accepting its pending public projection. **F11 remains open**; Rules were not changed during 4B1. Deployed Rules, IAM, download tokens, signed URLs and actual remote bucket exposure remain unverified.
- Conditioned work: upload/delete/catalog work cannot assume another user's or an admin asset is protected merely because the path is named for an owner.
- Local mitigation, 4B2A, 2026-09-11: [per-ID comparison](../testing/SECURITY_RULES_4B2A.md) verifies **33 Storage acceptance violations corrected**; all selected and new A1/A2 probes pass, including owner positives, exact-prefix objects, nested paths and admin writes against published artifacts. Authenticated published SDK reads remain observed; download tokens, signed URLs, IAM and HTTP remain outside these tests. **F11 remains open**, without remote application or certification.
- Local mitigation, 4B2B, 2026-09-11: [A4 evidence](../testing/SECURITY_RULES_4B2B.md) verifies ordinary/absent-session denial for staging/draft and mixed ancestor listings, and denies all SDK writes to countdown staging/frames/thumbnails, including exact prefix objects, nested SVG/PNG, legacy frames and administrative claims. Existing admin reads/listings and authenticated non-draft reads are characterized separately; other catalog namespaces retain compatibility. Five Storage characterizations change allow→deny under A4. First run exposed four unintended admin-list denials; the corrected Rules passed a full fresh-session rerun without changing those assertions. Tokens/public delivery/retention are unchanged and unverified by Rules. **F11 remains open**.
- Closure evidence: scoped access policy distinguishing private assets, intended public delivery and administrative writes; removal of broad overlapping grants; isolated tests for ownership, roles, anonymous/public reads and upload constraints; separately authorized verification of any deployed change.

### F12. Local Development Does Not Guarantee Service Isolation

- Priority / surface: **P0**, frontend, Functions emulator and generated/public endpoints used during local work.
- Status, revalidated 2026-09-11: **partially resolved by FASE 4A**. The supported development/verification path is implemented and exercised; unrestricted feature parity and specialized local/operational paths remain outside the demonstrated boundary.
- HECHO / implementation: [root commands](../../package.json), including `dev:reset`, and Functions development aliases use [runLocal.cjs](../../scripts/local/runLocal.cjs). It explicitly selects `demo-reservaeldia-local`, all four emulators and a generated local configuration; `.firebaserc` and the production Firebase configuration are preserved. Builds run in a sanitized copy of current sources, including uncommitted work, without personal env files, credentials or imported data fixtures.
- HECHO / implementation: [shared environment contract](../../shared/firebaseEnvironment.cjs), [client initialization](../../src/config/initializeFirebaseServices.js) and [Admin initialization](../../functions/src/firebaseAdmin.ts) reject incompatible/incomplete destinations and connect Auth, Firestore, Functions and Storage before use. Node transport guards, browser/generated-HTML CSP, provider guards and the emulator-only handler allowlist prevent remote effects on the supported path. Generated RSVP resolves locally; Sheets and the local RSVP handler are disabled.
- Executed evidence: configuration/initialization and negative tests; temporary Functions compilation; real synthetic Auth, Firestore, Storage upload/read/delete and existing Functions operations; desktop/mobile browser CSP; absent-emulator failures without production fallback. See [Development Workflow](../operations/DEVELOPMENT_WORKFLOW.md#evidencia-4a--2026-09-11) for final runs, versions and reproducible evidence. Admin corroboration verifies destinations, not Rules authorization.
- PENDIENTE / remaining boundary: enabling and verifying preview/publication, catalog/admin, schedulers/triggers and other disabled handlers; specialized provider/emulator and administrative scripts still require their own destination/effect review. Public-resource fidelity and OS/browser-wide network isolation are not claimed. These gaps cannot be closed by pointing at a running emulator or a passing Admin test.
- Conditioned work: use the documented launcher and synthetic fixtures for 4B. Extend the local allowlist only after tracing dependencies and adding effect/destination evidence; do not enable a blocked provider with real credentials. F10/F11, F13/F14/F15 and Q1 are not resolved by 4A.
- Closure evidence: explicit isolated service configuration including Storage and backend dependencies, failure on unintended production routing, a destination matrix for each mode and generated endpoint, and isolated tests demonstrating all services remain within the intended environment. Keep production-backed development explicit if retained by decision.

### F13. CI Coverage Remains Incomplete

- Priority / surface: **P1**, regression confidence and release checks.
- Historical baseline, 2026-09-10: the two Hosting workflows installed/built/deployed without explicit domain tests, Functions lint/build or Rules tests. The root build's static-release verification did not cover those obligations. The merge workflow also bootstraps history and verifies live Hosting; these destinations/stages are preserved.
- Executed evidence, 2026-09-10: from `functions/`, `node node_modules/eslint/bin/eslint.js . --format json` (the local executable behind `eslint .`, no fix/cache) returned **exit 1: 52 errors, 228 warnings across 117 results**. Examples include parser/project mismatch for `functions/index.js` and `functions/shared/eventDetailsConfig.js`, outside the `src`-only [tsconfig](../../functions/tsconfig.json); see [.eslintrc.js](../../functions/.eslintrc.js).
- Historical verification: workflow/script gap **confirmed statically** and lint failure **reproduced on the then-existing working tree**. Attribution to individual preexisting edits was not verified; no application code/config was changed by that documentation task.
- Local mitigation, FASE 5A: [canonical verification/preparation](../operations/DEVELOPMENT_WORKFLOW.md#verification-5a) reuses 4A/4B2 launchers/tests, adds explicit evidence/failure/cleanup control and prepares a secret-free reusable workflow. Hosting jobs explicitly require `verification`; fork PRs can verify while same-repository preview restrictions remain. [Execution and static CI evidence](../testing/LOCAL_VERIFICATION_5A.md) separates local results, controlled negative checks and the workflow dependency graph.
- Local lint mitigation, FASE 5B: [coverage and evidence](../testing/FUNCTIONS_LINT_5B.md) records a new original-command baseline of **57 errors / 229 warnings / 118 files**, independent of the historical 52/228. Functions lint now covers maintained TS/TSX/JS/CJS/MJS, scripts/config/tests and exact canonical shared sources, with compatible parsers, unchanged production tsconfig and lockfile versions. The repaired local scope is **192 files, zero errors, 233 visible warnings**. `verify:local` makes this script mandatory before costly suites; the reusable workflow keeps consuming that command and preserving its diagnostics. The final local integral passed **1474/1474** plus lint; a new TypeScript file compiled successfully but failed lint, propagated exit 1, preserved evidence and skipped dependent stages. The existing Rules/interruption/prerequisite negatives also passed their expected-failure assertions and cleanup.
- Status: **open, partially mitigated**. **CI preparada, pendiente de validación remota**. GitHub execution, effective remote blocking and branch protection/required checks remain unverified. The command excludes frontend lint, production Next build/export, all-domain tests and blocked handlers; 5C adds mapped-copy/watch checks under F15, without live Functions reload or original-to-prepared synchronization. It does not certify complete quality, deployed Rules, remote configuration or Q1. Warnings retain typing/unused-variable debt. F10/F11 and Q1 keep their states; F12's scope is not expanded.
- Conditioned work: do not claim release readiness or domain correctness from Hosting build or lint success. Preserve warning visibility, justified coverage and negative controls; distinguish local results/static configuration from remote guarantees.
- Remaining closure evidence: demonstrate required checks executing and blocking failures in the intended remote workflow, assess the other release/domain checks and obtain remote policy evidence under separate authorization. 5B does not close F13 as a whole.

### F14. Migration Safeguards Vary By Script

- Priority / surface: **P1**, persistent data, catalog assets and recovery.
- HECHO / evidence: [migrateCountdownPresets.cjs](../../scripts/migrateCountdownPresets.cjs) and [migrateIconCatalogV2.cjs](../../scripts/migrateIconCatalogV2.cjs) set `dryRun` only when `--dry-run` is present; their normal paths commit writes using application-default credentials and a product bucket fallback. Countdown can also create/upload thumbnails. [migrateEventDetailsCeremonyParty.cjs](../../scripts/migrateEventDetailsCeremonyParty.cjs) instead defaults to dry-run unless `--apply`, but still reads collections through Admin credentials and has no explicit project-confirmation gate in its argument parser.
- Counterexample / existing protection: [countdownPhase0.cjs](../../scripts/countdownPhase0.cjs), `runRestore`, verifies the archive, checks source/destination, defaults to a plan, requires `--apply` plus matching `--confirm-project` for writes, and guards overwrite. Its [runbook](../operations/COUNTDOWN_PHASE_0_RUNBOOK.md) describes backup/restore. Those protections do not automatically apply to other scripts.
- Verification: **confirmed in selected scripts**, not an exhaustive migration audit; none executed. Recovery/idempotency across all migrators remains **pending**.
- Conditioned work: any migration needs a review of that exact script, resolved target, read/write effects and recovery evidence; neither a script name nor a dry-run label supplies permission or isolation.
- Closure evidence: inventory of mutating entrypoints, explicit targets and write opt-in, safe defaults, scoped backup/recovery where needed, idempotency/resume and failure tests on disposable fixtures. Validate each script instead of inferring coverage from the countdown runbook.

### F15. Shared Contract Synchronization And Live Consumption

- Priority / surface: **P1**, frontend/backend contract consistency; refines F9 / I1.
- Historical mechanism, 2026-09-10: [syncTemplateContract.cjs](../../functions/scripts/syncTemplateContract.cjs) copied `shared/` into `functions/shared/` and `functions/lib/shared/` before `tsc` in build; `build:watch` ran only `tsc --watch`. At that inspection only the preexisting `functionalAssociations.cjs` pair was hash-compared; no build/sync or exhaustive freshness/watch test was run. This remains a historical baseline, not the current implementation.
- Local implementation, FASE 5C: the same executable map owns sources, targets and input/build classification for sync, read-only checks, lint and watch. Build serializes sync/TypeScript/check; watch observes canonical inputs plus its own src/tsconfig, coalesces saves and reports pending/error/recovery/readiness. It skips identical writes and never deletes unmapped files. The integrated gate checks required input copies before sync, tests synchronization/watch in a disposable tree, and checks all generated copies before consumers. [Commands, tree boundaries and restart procedure](../operations/DEVELOPMENT_WORKFLOW.md#shared-contracts-5c).
- Evidence and status: **partially mitigated; copy/watch mechanism repaired locally, live-consumption limits remain**. [5C execution evidence](../testing/SHARED_CONTRACTS_5C.md) separates all mapped byte pairs, active source changes, replacement/burst recovery, missing/altered/unwritable cases, a real compiled consumer and owned cleanup. An already loaded CommonJS consumer retains old HTML; a fresh process reads the changed contract. Equality and successful compilation therefore do not establish hot reload of a running Functions service. Only Windows/Node 20 is exercised locally; other OSes and remote CI are not certified.
- Remaining limits: preparation/dev still take snapshots. Watch in a prepared/session copy cannot observe subsequent edits to the original tree. Recreate preparation/session when required, wait for readiness and restart consumers; no general repository propagation or Functions module-cache invalidation is implemented. Do not hand-edit generated destinations or infer coverage for unmapped files. Live reload, other runtime/OS evidence and broader propagation require their own scope. F10/F11, Q1, migration safeguards and remote CI/branch-protection states are unchanged.

<a id="open-operational-decisions"></a>

### Open Operational Decisions

**Q1 — Administrative identity policy. Decision: proposed alternatives, unresolved.
Implementation/verification: divergent local interpretations confirmed; chosen policy pending.**

- Question: which identity representation grants admin/superadmin access consistently across backend and client Rules, and who provisions/revokes it?
- Evidence: [adminAuth.ts](../../functions/src/auth/adminAuth.ts), `isAdmin`, accepts `token.admin` or a UID in server environment/runtime-config lists; the `role` branch is commented out and `token.superadmin` is not checked. Both Rules' `isAdmin` accept `admin`, `superadmin` or `role == "admin"` claims. Callers include [iconCatalog/service.ts](../../functions/src/iconCatalog/service.ts) and [decorCatalog/service.ts](../../functions/src/decorCatalog/service.ts). Which claims/UID configuration actually exist remotely was not inspected.
- Alternatives, not accepted choices: [4B1 concrete analysis and recommendation](../contracts/SECURITY_CONTRACT.md#q1-proposal) compares canonical versioned claims with explicit capabilities (recommended) against a documented hybrid of server configuration and claims. It defines proposed user/admin/superadmin capabilities, provisioning/revocation owners, preservation of unrelated claims, previous-token handling, compatibility and transition costs. Existing permissive fallbacks F10/F11 must be corrected regardless of representation.
- Decisions still required: Q1-A accepts or changes the proposed representation/capability matrix; Q1-B designates superadmin provisioning/approval owners and confirms delegated management of other admins; Q1-C chooses revocation freshness and the legacy-claim transition. Exact choices and dependent changes are in the linked analysis. Current remote claims, UID configuration, external issuers and compatibility needs remain unknown; no real identities were inspected.
- Priority / dependent change: **P0** for role-policy unification, claims transitions and administrative authorization tests. Do not select a representation by making tests match one existing implementation. Closure requires an accepted policy in the responsible security/domain authority, compatibility/transition plan where needed and isolated cross-layer allow/deny tests.
- This entry remains the sole decision register. The [security contract](../contracts/SECURITY_CONTRACT.md) is a traced matrix plus accepted obligations and clearly marked proposals, not blanket policy acceptance. Record the explicit resolution here with a link to its accepted sections; mark implementation/verification separately. Characterization passing does not resolve Q1.

Product decisions already have an owner: [AI Assistant Conversation Contract](../contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md), section 2, records accepted style choices and pending length, structure, emojis, follow-up name use and related questions. They remain there; this review neither accepts new choices nor duplicates that register. Ordinary lint, fallback-rule, watch and migration corrections above are technical pending work, not product decisions.

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
| Draft preview rendering | `flushEditorPersistenceBeforeCriticalAction()` + `prepareDraftPreviewRender` | backend prepared validation diverges from editor assumptions | preview is blocked with publish validation instead of showing untrusted HTML |
| Template/fallback preview rendering | `previewAuthority: "template-visual"` or `"local-fallback"` + local preview generator import | preview render boundary is intentionally outside publish preparation | template/fallback preview shows a visual state that is not a publish-parity guarantee |
| Publish generation | `prepareRenderPayload()` + `validatePreparedRenderPayload()` + generator adapter | prepared assets, CTA/root config, group contract, or layout contract diverges from editor assumptions | publish blocked, layout moved, or published HTML differs from canvas |
| Checkout/payment/publish return | checkout modal local receipt state + parent preview publication sync | terminal backend `published` result updates parent props while modal is still visible | success state resets into the slug/payment form after payment |

## 6. Immediate Action Order

The following is the earlier editor/render recommendation order. For permission,
environment, migration and verification readiness, apply F10–F15 and Q1 first
when the task depends on those boundaries; this list is not execution authority.

1. `P0` Keep the prepared render payload boundary covered by regression tests as render contracts evolve.
2. `P0` Collapse selection authority to one imperative runtime bridge and remove selection fallback reads from legacy globals.
3. `P0` Export one explicit inline session state and make critical actions wait on that state.
4. `P1` Sessionize drag/group-drag end-to-end and demote legacy drag globals to debug mirrors.
5. `P1` Tighten post-drag handoff so the first selected-phase frame uses live geometry.
6. `P1` Surface prepared validation warnings earlier in the editor UI, not only at preview/checkout boundaries.
7. `P1` Make lifecycle readers prefer one normalized persisted lifecycle snapshot.
8. `P2` Centralize public URL and RSVP endpoint config, and reduce shared-contract duplication.

## 7. Bottom Line

The system is not mainly fragile because it is undocumented anymore. It is fragile because the editor, preview, and publish paths still cross different authority boundaries at the exact moments that matter: selection handoff, inline settle, preview preflight, and publish preparation.

For render parity, any preview path that does not use the publish prepared
payload must stay explicitly non-authoritative. Operational readiness also
depends on the open permission, environment and verification work above; this
documentation update does not certify the repository or deployment as safe.
