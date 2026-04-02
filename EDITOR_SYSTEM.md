# EDITOR SYSTEM

## 1. Overview
The editor is the main authoring runtime for invitation drafts. Its job is to load a draft or template-editor document, render sections and objects on a Konva stage, let the user manipulate that state visually, and persist the resulting render model back to Firestore.

The active production path is centered on `src/components/CanvasEditor.jsx`. That component owns the top-level editor state and composes the current canvas stack:

- `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx` for the stage, layers, selection overlays, and transform commit flow.
- `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx` for object rendering plus drag/select gesture handling.
- `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx` for resize and rotation of non-line selections.
- `src/components/editor/persistence/useBorradorSync.js` for draft load/save.

Responsibilities that belong to this system:

- Render `secciones` and `objetos` as an editable invitation canvas.
- Keep stage-space behavior predictable while storing section-local data in Firestore.
- Coordinate selection, marquee selection, drag, resize, rotation, inline text editing, image crop, and section-level actions.
- Persist canonical draft state to `borradores` and expose an immediate flush path for flows that cannot tolerate stale state.

Scope note: this document describes the dashboard invitation editor used for draft and template-editor sessions, not unrelated admin tools.

`src/pages/dashboard.js` mounts `src/components/CanvasEditor.jsx` as the active editor surface. The separate `src/components/Editor.jsx` file exists in the repository, but it is not part of the dashboard canvas path documented here.

`src/components/ElementoCanvas.jsx` and `src/components/SelectionBounds.jsx` are compatibility aliases. They re-export `ElementoCanvasRenderer` and `SelectionTransformer`, and the active implementation lives in those newer renderer/transformer modules.

## 2. Core Concepts

### Sections
A section is the persisted layout container for a vertical slice of the invitation. Sections are stored in the `secciones` array and rendered in `orden` order.

Fields actively used by the editor include:

- `id`
- `orden`
- `altura`
- `fondo`
- `altoModo`
- `alturaFijoBackup`
- base background image fields such as `fondoTipo`, `fondoImagen`, `fondoImagenOffsetX`, `fondoImagenOffsetY`, `fondoImagenScale`, `fondoImagenDraggable`
- `decoracionesFondo`

Important behavior:

- The editor builds `seccionesOrdenadas` by sorting `secciones` by `orden`.
- Stage Y offsets are derived at render time with `calcularOffsetY`; they are not persisted per object.
- Section base backgrounds and background decorations are stored on `secciones`, not in `objetos`.
- `altoModo: "pantalla"` changes how object Y is stored and restored. Objects in those sections can use normalized `yNorm` instead of persisted pixel `y`.
- Section creation, deletion, reordering, height resize, and `altoModo` toggling all mutate `secciones` and can write directly to Firestore outside the normal autosave debounce.

### Elements
Elements are stored in the `objetos` array. Every persisted object belongs to a section through `seccionId`.

Runtime-supported families in the current editor:

- `texto`
- `imagen`
- `icono`
- `icono-svg`
- `forma`
- `galeria`
- `countdown`
- `rsvp-boton`
- `regalo-boton`

`forma` currently includes these variants in the renderer or insertion path:

- `rect`
- `circle`
- `line`
- `triangle`
- `diamond`
- `star`
- `heart`
- `arrow`
- `pentagon`
- `hexagon`
- `pill`

Common persisted properties depend on type, but the current object model commonly uses:

- `id`
- `tipo`
- `seccionId`
- `x`
- `y`
- `rotation`
- `scaleX`
- `scaleY`
- size fields such as `width`, `height`, or `radius`
- style fields such as colors, typography, stroke, shadow, gradients, alignment

Important relationship rules:

- Persisted coordinates are section-local. The stage computes absolute Y by adding the section offset.
- `yNorm` is a section-mode-specific persistence detail for `altoModo: "pantalla"`.
- Not every visible editable thing is an object. Section base background images and section background decorations live on `secciones`.

## 3. Rendering System
The editor uses React for state ownership and `react-konva` for canvas rendering.

Current render flow:

1. `CanvasEditor.jsx` owns React state such as `objetos`, `secciones`, `elementosSeleccionados`, `editing`, `rsvpConfig`, and `giftsConfig`.
2. `CanvasStageContentComposer.jsx` receives that state and builds the `Stage`.
3. Sections are rendered first, including section fills, section base images, and section background decorations.
4. Objects are rendered by type:
   - `galeria` through `GaleriaKonva`
   - `countdown` through `CountdownKonva`
   - most other object types through `ElementoCanvasRenderer`
5. Overlay behavior is rendered on top of base content:
   - marquee rectangle
   - selection transformer or line controls
   - hover indicator
   - image crop overlay
   - guide lines and drag overlay visuals
6. Inline text editing is rendered outside the Konva stage through `CanvasInlineEditingLayer`, which uses a DOM overlay instead of editing directly inside Konva text nodes.

How stage coordinates are produced:

- `CanvasStageContentComposer` computes a stage-space Y for every object.
- For normal sections, stage Y is `section offset + object.y`.
- For `altoModo: "pantalla"` sections, stage Y uses `yNorm * ALTURA_PANTALLA_EDITOR` when `yNorm` is available.

### Layer Order
The active stage stack is intentionally layered:

- base section and object content
- guide overlay layer
- drag overlay layer for selection/transform visuals that must stay visible during interaction
- DOM inline-edit overlay outside the stage

Object z-order is defined by array order in `objetos`. Front/back operations mutate the `objetos` array directly.

### Re-render Triggers
The canvas re-renders when React state changes, especially:

- `objetos`
- `secciones`
- `elementosSeleccionados`
- inline editing state
- interaction state such as crop, background edit, or section decoration edit

The runtime suppresses or defers some UI sync during active interactions:

- hover is suppressed while dragging, grouped dragging, or resizing
- the transformer can detach or hide during drag-overlay phases
- some resize previews intentionally avoid React state updates to reduce jitter and keep Konva in control until final commit

## 4. Selection System
The selection model is split across committed selection, preselection, and marquee state.

Current selection state in `CanvasEditor.jsx`:

- `elementosSeleccionados`: committed selection
- `elementosPreSeleccionados`: marquee preselection preview
- `seleccionActiva`
- `inicioSeleccion`
- `areaSeleccion`

### Current Runtime Behavior
React state in `CanvasEditor.jsx` still owns the rendered selection state, but the editor now also maintains an internal selection runtime through `useCanvasEditorSelectionRuntime` and `src/lib/editorSelectionRuntime.js`.

Current internal selection runtime snapshot includes:

- `selectedIds`
- `preselectedIds`
- `galleryCell`
- `marquee`
- `pendingDragSelection`
- `dragVisualSelection`

Current behavior versus target architecture:

- current behavior: React remains the render source of truth, while the internal selection runtime is the preferred runtime read/write surface for selection-critical interaction state
- target architecture: continue shrinking direct `window._*` interaction reads, but legacy mirrors and fallbacks still remain in the active runtime for compatibility

The current clear-selection policy is also centralized behind named intents in `selectionClearPolicy`, but those intents still resolve back into the same React state plus runtime snapshot updates.

### Single Selection
Single selection is handled through `handleElementSelectIntent` inside the stage composer and gesture handling inside `ElementoCanvasRenderer`.

Plain primary selection behavior:

- An unmodified primary gesture on a non-inline target resolves to single selection of the clicked object.
- For semantically inline-editable targets, the first valid selection gesture arms inline intent. A later valid gesture on the same target can transition into inline editing instead of repeating plain selection.
- Clicking or tapping empty stage or section background clears object selection.

### Multi-selection
Multi-selection is currently supported through Shift-based toggle:

- Shift-click on an eligible object toggles that object in `elementosSeleccionados`.
- Marquee selection can also produce multi-selection by committing the objects intersecting the selection rectangle.

Marquee behavior:

- `useStageGestures` starts marquee mode when the pointer goes down on empty stage, a section node, or a section background image hit.
- While moving, it computes `elementosPreSeleccionados`.
- On release, it promotes intersecting objects into `elementosSeleccionados`.
- Line objects are tested with dedicated line intersection logic instead of regular bounding boxes.
- Marquee reset and clear-selection behavior now go through shared named intents, but the rendered marquee rect and preselection membership are still driven by React state in `CanvasEditor.jsx`.

### Transformer and Selection UI
Selection affects UI in different ways depending on element type:

- Multi-selection of non-line objects still uses `SelectionTransformer`; the component keeps the actual Konva attach/detach, transform lifecycle, and type-specific commit rules.
- Any selection containing a line stays off the generic transformer path. A single selected line can render `LineControls`, while line bounds still use `SelectionBoundsIndicator`.
- Stage-level visual-selection mode decisions are now centralized in `selectionVisualModes`, but drawing is still split across the composer, transformer, bounds indicator, and line controls.
- Marquee preview is still a stage rectangle plus per-object preselection styling in the renderers.
- While inline editing is active, the main transformer is suppressed.
- During predrag or coordinated drag-settling phases, a drag-layer `SelectionBoundsIndicator` can temporarily replace or suppress transformer visuals.

### Pending Drag And Drag Visual Selection
Same-gesture select-and-drag still depends on transient runtime state.

- `pendingDragSelection` tracks the object id plus phase used to bridge selection and drag decisions.
- `dragVisualSelection` tracks the ids that should drive the drag overlay and whether the editor is still in the predrag visual phase.
- `CanvasStageContentComposer` still owns the live drag-visual overlay state locally, but mirrors it into the internal selection runtime so transformer and bridge reads can reason about the same interaction snapshot.
- `pendingDragSelection` is still mirrored into legacy globals for compatibility. `dragVisualSelection` is intentionally kept internal to the runtime snapshot and stage state; there is no formal `window._dragVisualSelection` contract.

### Interaction Phases And Visual Ownership
Canvas interaction visuals must be treated as an explicit phase model, not as independent overlays that can decide visibility on their own. The active phase boundary is coordinated in `CanvasStageContentComposer.jsx` and `selectionVisualModes.js`, then rendered through `HoverIndicator`, `SelectionTransformer`, or drag-layer `SelectionBoundsIndicator`.

Single-owner rule:

- Exactly one visual owner may render the box-level affordance at a time.
- Valid owners are `hover-indicator`, `transformer-primary`, and `drag-overlay`.
- `LineControls` is a selected-phase variant and must obey the same exclusivity rule as `transformer-primary`.
- Ownership transfer must be explicit at the phase boundary; delayed unmount, passive target loss, or replayed snapshots are not valid ownership handoff mechanisms.

| Phase | Allowed visual owner | Systems that must stay suppressed | Notes |
| --- | --- | --- | --- |
| `idle` | none | hover, transformer-primary, drag-overlay | No hover target and no active selected-phase box owner. |
| `hover` | `hover-indicator` | transformer-primary, drag-overlay | Hover is allowed only while no interaction-owned selection visual has taken control. |
| `selected` | `transformer-primary` | hover-indicator, drag-overlay | This is the normal committed-selection phase for transformer-managed selections. |
| `predrag` | `drag-overlay` owns the phase, but may remain visually hidden until the first valid startup sync | hover-indicator, transformer-primary | Predrag starts visual ownership transfer even before full drag-active runtime state exists. |
| `drag` | `drag-overlay` | hover-indicator, transformer-primary | Active drag must remain locked to the authoritative live drag geometry. |
| `settling` | `drag-overlay` until cleanup/handoff completes | hover-indicator, transformer-primary | Settling may freeze or replay the last valid drag-overlay state, but it does not restore transformer ownership early. |

### Drag-Overlay Startup Invariants
Drag-overlay startup must be deterministic. The first visible overlay frame is architecture-sensitive because startup drift is caused by incorrect startup authority, not by steady-state drag math.

Required invariants:

- The first visible drag-overlay frame must come from authoritative live drag geometry, currently the composer-owned controlled-sync path based on live node bounds.
- A startup frame is valid for visibility only when the controlled-sync belongs to the active drag-overlay session, uses the same session identity/sync cycle as the first live drag sample, and is derived from current live node geometry rather than a buffered snapshot.
- `predrag-seed`, `drag-selection-seed`, `controlled-seed`, buffered startup snapshots, and replay snapshots may update internal runtime/debug state, but they must not create the first visible overlay frame.
- `group-drag-start` or any other startup convenience snapshot is also forbidden from producing the first visible frame unless it has already been promoted into the same authoritative controlled-sync path for the active session.
- The overlay must remain non-visual until the first valid controlled-sync has been applied.
- Startup authority must have one path only. If multiple startup sources can make the overlay visible, the subsystem is back in an invalid state.
- Once the first valid controlled-sync is visible, steady-state drag continues through the same controlled overlay path; startup must not switch owners mid-session.

### Hover Lifecycle Rules
Hover is not allowed to survive interaction-owned selection phases.

- Hover must terminate at predrag start, not at drag-active as a later fallback.
- Forced clear must remove both hover session ownership and the currently visible hover box in the same boundary.
- Forced clear is not complete if only `hoverId` or hover session identity is reset. The visible hover snapshot, bounds cache, and rendered hover box state must be cleared in the same lifecycle step.
- Hover must not remain visible during `predrag`, `drag`, or `settling`.
- Delayed target-loss, component-unmount, or passive session-end cleanup are fallback safety nets only. They are not valid primary hover-hide paths for predrag or drag startup.
- Drag-start hover clear still exists as a fallback for direct-start drag paths that do not pass through predrag first, but predrag is the primary hover termination boundary.

### Ordering Guarantees
These ordering guarantees are required for a correct startup handoff:

1. Hover must be cleared before or at the same boundary as `predrag:visual-selection-start`.
2. `transformer-primary` must be suppressed or detached before `drag-overlay` is allowed to render visibly.
3. The first visible drag-overlay frame must happen only after controlled-sync has been applied from authoritative live drag geometry.
4. `settling` keeps drag-overlay ownership until cleanup is complete; transformer restoration happens only after the overlay has ended.

### Ownership Handoff Table
| Transition | Outgoing owner | Incoming owner | Required suppression | Minimum condition to complete handoff |
| --- | --- | --- | --- | --- |
| `hover -> predrag` | `hover-indicator` | `drag-overlay` phase owner, still allowed to be visually hidden | hover visual state must be cleared immediately | hover forced-clear has removed both logical hover state and visible hover snapshot before or at `predrag:visual-selection-start` |
| `selected -> predrag` | `transformer-primary` | `drag-overlay` phase owner, still allowed to be visually hidden | transformer-primary must detach/hide | drag-overlay ownership has started and transformer is no longer rendering a visible box |
| `predrag -> drag` | `drag-overlay` | `drag-overlay` | hover-indicator and transformer-primary remain suppressed | first authoritative controlled-sync for the active drag-overlay session has been applied and is now allowed to become visible |
| `drag -> settling` | `drag-overlay` | `drag-overlay` | hover-indicator and transformer-primary remain suppressed | active drag has ended and the overlay is holding or replaying the last valid drag-session state without reopening startup ownership |
| `settling -> selected|idle` | `drag-overlay` | `transformer-primary` or none | drag-overlay must end before another owner appears | overlay cleanup is complete; then transformer may restore for a surviving selection or the system may return to no owner |

### Failure Modes This Model Prevents
- `startupJump`: the first visible drag-overlay frame came from stale seed geometry, buffered replay, or another non-authoritative startup source instead of the first live controlled-sync.
- Hover lingering: hover ownership was cleared logically, but visible hover cleanup happened later through passive session-end or component unmount instead of the predrag boundary.
- Multiple startup paths: transformer, seed snapshots, replayed overlay state, and controlled-sync each tried to own startup visibility. Future changes must keep exactly one startup authority.

## 5. Transformations

### Drag
Drag handling lives mainly in `ElementoCanvasRenderer`, `dragIndividual.js`, `dragGrupal.js`, and the stage composer commit logic.

Current drag pipeline:

- Individual object drag:
  - Konva moves the node visually.
  - Some drag paths evaluate guides and overlays without committing React state on every move.
  - On drag end, the node pose is resolved canonically and committed through `onChange`.
- Group drag:
  - A dedicated group-drag session decides leader and followers.
  - Group drag relies on shared runtime state and mirrored globals to keep all members synchronized.
  - Final group commit updates all selected members together.

Persistence rules for drag:

- Final drag commit uses absolute stage Y only as an intermediate value.
- The generic object commit path in the stage composer converts final Y back into section-local persistence.
- `determinarNuevaSeccion` decides whether the object stays in its current section or moves to a different one.
- If the generic object path keeps the object in the same section, Y is converted with `convertirAbsARel`.
- In that same generic object path, a destination section with `altoModo: "pantalla"` stores `yNorm` and removes pixel `y`.
- `galeria` and `countdown` use dedicated drag handlers. They still resolve section reassignment, but they do not finalize through the same `finalizoDrag` branch as generic objects.

Drag-related side effects that must stay aligned:

- guides from `useGuiasCentrado`
- post-drag selection guard
- drag overlay visuals
- hover suppression
- `dragging-start` and `dragging-end` events

### Resize
Resize is split by element family.

Transformer-based resize:

- Implemented by `SelectionTransformer`.
- Uses a single `bottom-right` resize anchor for transformer-managed objects.
- Excludes `forma.line`, which uses `LineControls`.

Current type-specific resize behavior:

- `texto`:
  - resize is converted into `fontSize`
  - commit tries to preserve visual centering
  - node scale is flattened back to `1`
- `countdown`:
  - resize resolves to persisted `width` and `height`
  - countdown-specific metrics are normalized so persisted geometry stays stable
- `galeria`:
  - resize recalculates `width`, `height`, `widthPct`, `x`, and dynamic blueprint data when needed
- `imagen`:
  - resize resolves to persisted geometry and can interact with pending transform commit logic
  - image crop is a separate overlay path, not the same as generic resize
- `forma.circle`:
  - resize commits via `radius`
- `forma.triangle`:
  - resize commits via `radius`
- generic width/height shapes:
  - resize commits to persisted `width` and `height`

Line resize/edit:

- `forma.line` does not use `SelectionTransformer`.
- `LineControls` edits line endpoints directly and can also participate in grouped drag behavior.

Section background resize:

- Section base background images are resized through `FondoSeccion` and a dedicated transformer.
- That path updates section background fields, not `objetos`.

### Rotation
Rotation is handled by `SelectionTransformer` for transformer-managed selections.

Current rules:

- Rotation is disabled for galleries.
- Live rotation snaps are enabled for most non-image transformer targets using fixed angles.
- The current snap angles are the standard 45-degree increments.
- Single selected images use a specialized rotation path:
  - live rotation uses dedicated overlay/performance handling
  - commit can snap to the nearest canonical angle with tighter tolerance
  - final pose is stabilized so the visual center stays consistent after commit

Rotation is persisted in the object `rotation` field.

## 6. State Management
The main editor state lives in `CanvasEditor.jsx`.

Primary state buckets:

- render state: `objetos`, `secciones`
- selection state: `elementosSeleccionados`, `elementosPreSeleccionados`, marquee state
- inline edit state: `editing`
- section UI state: `seccionActivaId`, section deletion modal state, section animation state
- auxiliary domain state: `rsvpConfig`, `giftsConfig`, background edit state, section decoration edit state
- history state: `historial`, `futuros`

State update paths are intentionally split:

- direct React setters in `CanvasEditor`
- helper utilities such as `applyObjectUpdateAtIndex`, `applyObjectUpdateById`, and `applyLineUpdate`
- specialized hooks for persistence, sections, history, stage interaction, and external event bridges

Notable hook boundaries:

- `useBorradorSync`: load/save
- `useSectionsManager`: section height resize, create section, `altoModo` toggle
- `useCanvasEditorSectionFlow`: section deletion, section movement, active-section sync
- `useHistoryManager`: undo/redo snapshots
- `useEditorEvents`: external event-driven mutations
- `useCanvasEditorGlobalsBridge` and `useEditorWindowBridge`: runtime bridge contracts

### History
Undo/redo history is not a full snapshot of all editor state.

The current history manager records:

- `objetos`
- `secciones`

It does not snapshot selection, inline editing, `rsvpConfig`, or `giftsConfig`.

History recording is also skipped while:

- resizing
- dragging
- grouped dragging
- `ignoreNextUpdateRef` is active

## 7. Firestore Integration
The main persistence path is `useBorradorSync`.

### Load Path
On load, the editor:

- reads from `borradores/{slug}` for draft sessions
- reads the template editor document for template sessions
- normalizes the render state through `normalizeDraftRenderState`
- refreshes Firebase Storage URLs when needed
- migrates missing `yNorm` for `altoModo: "pantalla"` sections
- normalizes `rsvp` and `gifts`
- sets the initial active section when possible

High-level loaded shape:

- `objetos`
- `secciones`
- optional `rsvp`
- optional `gifts`

### Save Path
Autosave behavior:

- debounced at `500ms`
- runs when `objetos`, `secciones`, `rsvp`, or `gifts` change
- skipped on first hydration
- skipped in read-only mode
- skipped while resize is active
- can be bypassed by an immediate flush request

Before writing, the current persistence path normalizes:

- countdown geometry
- line points
- text color/stroke/shadow fields
- section decoration payloads
- `rsvp`
- `gifts`

For draft sessions, the editor writes back to `borradores/{slug}`:

- `objetos`
- `secciones`
- `rsvp`
- `gifts`
- `draftContentMeta`
- `ultimaEdicion`

It can also generate a draft thumbnail after non-immediate saves on non-mobile runtime.

### Ordering and Write Coordination
Persistence is still split by trigger type, but it is no longer unordered.

- `CanvasEditor.jsx` creates a shared `draftWriteCoordinator`.
- `useBorradorSync` uses that coordinator for autosave and flush work.
- Section-level direct writes still exist for section height resize, section creation, section deletion, section reorder, and `altoModo` toggle.
- Those section-specific writes now join the same FIFO through `enqueueDraftWrite` when the coordinator is available.

Current ordering rules:

- autosave is scheduled by `borradorSyncScheduling` with a `500ms` debounce
- flush clears any scheduled autosave before persisting immediately
- a cleared autosave is restored only when the immediate persist declined to write for guard reasons such as `resize-in-progress` or `draft-not-loaded`
- `hasPendingDraftWrites()` reflects whether the shared FIFO still has work in flight

Practical consequence:

- autosave, direct section writes, and immediate flush now observe one serialized write order
- persistence is still conceptually split, but preview/publish flushes no longer race an independent section-write channel

### Immediate Flush
The editor exposes an immediate flush path because preview and publish-adjacent flows cannot rely on pending debounce state.

Current immediate flush contracts:

- `onRegisterPersistenceBridge(...).flushNow(...)`
- window event `editor:draft-flush:request`
- window event `editor:draft-flush:result`

Transport rules used by `flushEditorPersistenceBeforeCriticalAction`:

- draft sessions use the window event protocol
- template sessions prefer direct `window.canvasEditor.flushPersistenceNow` when available
- successful critical flushes can capture a compatibility snapshot through `readEditorRenderSnapshot()`

The event protocol is compatibility-sensitive:

- request detail carries `requestId`, `slug`, and `reason`
- result detail carries `requestId`, `slug`, `ok`, `reason`, and `error`

### Preview and Publish Boundaries
Preview and publish do not consume editor state the same way.

Preview flow:

- requests a critical flush before opening
- re-reads the draft or template editor document after that flush
- overlays the flush boundary snapshot on top of the re-read payload when a compatible snapshot is available
- uses the backend HTML generator from the dashboard

Publish flow:

- does not rely on a live editor overlay
- re-reads the draft on the backend
- runs `preparePublicationRenderState(...)`
- runs `validatePreparedPublicationRenderState(...)`
- generates the public HTML artifact only from that prepared backend state

## 8. Constraints and Rules
These rules are enforced by the current implementation and should not be broken.

- `objetos` and `secciones` are the canonical editable render model and must stay Firestore-serializable.
- Persisted object coordinates are section-local. Stage-space Y is derived at render time and must be converted back before commit.
- `yNorm` is specific to `altoModo: "pantalla"` sections and must stay consistent with that section mode.
- Section visuals stored on `secciones` must not be moved into `objetos` without updating the full editor contract.
- Transformer-managed resize/rotation and drag commit logic must keep persisted geometry flattened when the current code expects flattened data.
- `forma.line` must remain on the dedicated `LineControls` path; it is not interchangeable with `SelectionTransformer`.
- Drag must not break committed selection, post-drag selection restoration, or guide cleanup.
- Group drag must preserve leader/follower membership, shared overlay state, and final all-members commit.
- A drag gesture must not silently drop committed multi-selection while the session is active.
- Section order comes from `orden`, and rendering depends on sorting by that field.
- The current insertion/update flow enforces one persisted `countdown` per draft and avoids duplicate functional CTA buttons.
- Undo/redo depends on `ignoreNextUpdateRef`; changes to history behavior must preserve that guard.
- Preview/publish-adjacent flows depend on immediate persistence flush; that bridge is a runtime contract, not an optional convenience.
- Inline text editing owns focus through the DOM overlay. While inline editing is active, the main transformer must stay suppressed and the same text object must not present conflicting Konva and DOM editing surfaces.
- `window.editorSnapshot` is the canonical read boundary for non-editor consumers. Legacy `window._*` render globals are still a migration fallback, not the preferred read API.
- Formal bridge globals and events are compatibility contracts. Transient scratch globals are not.
- Window-mirrored runtime state and custom events are part of the current editor contract. Renaming or removing them is a breaking change unless every consumer is updated together.
- External consumers such as preview, sidebar actions, and template tooling must use the documented bridge methods, adapter reads, or custom events, not arbitrary scratch runtime state.

## 9. Known Complexity Areas
The current editor is functional, but several areas are tightly coupled and fragile.

- `CanvasEditor.jsx` is still the main orchestration surface and owns many interacting state domains.
- Selection, drag handoff, and inline text intent are tightly coupled. The current runtime uses pending selection phases and release guards to decide whether a gesture should select, drag, or enter inline edit.
- The internal selection runtime reduced direct selection/global coupling, but group drag and some interaction timing still depend on shared runtime globals and legacy compatibility behavior, not just local React state.
- `SelectionTransformer` is heavily specialized by element type. Text resize, image resize, image rotation, countdown resize, and gallery resize do not share the same commit rules.
- Drag-capable element families do not all finalize through one persistence branch. Generic objects, galleries, and countdowns each have their own commit path.
- Persistence ordering is safer than it used to be because writes share one FIFO, but save semantics are still split between debounced whole-draft sync and direct section mutations.
- Hover, transformer visibility, drag overlays, guide lines, and transformer restore-after-settle timing are actively suppressed or deferred during interaction for performance reasons.
- Section auto-selection and auto-scroll during section reorder are coupled to viewport calculations and animation timing.
- The editor still depends on window bridges and custom events for sidebar and external panel coordination.

## 10. Extension Guidelines
Use these rules when extending the editor without breaking existing behavior.

### Add a new element type

- Add insertion defaults in `computeInsertDefaults`.
- Add rendering in the active renderer path, not only in legacy re-export files.
- Decide whether the element should use `SelectionTransformer`, `LineControls`, a custom overlay, or no transform support.
- Define how final drag commit converts stage-space coordinates back into section-local persistence.
- Define how resize and rotation flatten into persisted fields, if supported.
- Keep the persisted shape compatible with `useBorradorSync`.
- If the element must survive preview/publication, also update the shared render/export path outside the editor runtime.

### Modify drag behavior

- Keep the distinction between stage-space preview and section-local persisted commit.
- Preserve `determinarNuevaSeccion`, `convertirAbsARel`, and the section-mode-specific `yNorm` normalization used by the generic object drag path.
- Do not remove post-drag selection restoration, guide cleanup, or drag overlay synchronization.
- Treat individual drag and group drag as separate pipelines, and do not assume gallery/countdown drag commits automatically follow the generic object branch.

### Extend selection or transform behavior

- Update the gesture decision path and the commit path together.
- If the target is a line, prefer the `LineControls` path instead of forcing it into the generic transformer.
- If a transform preview intentionally avoids React state today, keep that behavior unless you have measured a safe replacement.
- Keep inline text editing, selection, and transform suppression rules aligned so the editor does not show conflicting UI states.

### Extend section-level editing

- Store section background/base-image/decoration data on `secciones`, not `objetos`.
- Normalize section decoration payloads through the existing section background domain helpers.
- If a section action writes directly to Firestore, keep it consistent with the shared draft-write FIFO so flush observes the latest section mutation order.

## 11. Runtime Contracts and Hidden Dependencies
The current editor exposes non-trivial runtime contracts through `window`, the snapshot adapter, and custom events. They are part of the active system, even though they are not typed public APIs.

### `window.canvasEditor`
The formal compatibility keys currently exposed on `window.canvasEditor` are:

- `deshacer`
- `rehacer`
- `flushPersistenceNow`
- `getTemplateAuthoringStatus`
- `getTemplateAuthoringSnapshot`
- `repairTemplateAuthoringState`
- `stageRef`
- `seccionActivaId`
- `tipoInvitacion`
- `snapshot`

This is the stable compatibility surface for `window.canvasEditor` in the current codebase. Other ad hoc properties should not be documented or consumed as if they were part of the same contract.

### `window.editorSnapshot`
The editor snapshot adapter is the canonical read boundary for external consumers that need live render state.

Current adapter API:

- `window.editorSnapshot.getRenderSnapshot()`
- `window.editorSnapshot.getSectionInfo(id)`
- `window.editorSnapshot.getObjectById(id)`

Important behavior:

- the editor keeps this adapter synchronized through `useCanvasEditorGlobalsBridge` and `useEditorWindowBridge`
- adapter reads return cloned data
- section snapshots are sorted by `orden`
- legacy `window._objetosActuales` / `window._seccionesOrdenadas` fallback still exists for migration compatibility

### Internal Selection Runtime
The editor now maintains an internal selection runtime through `useCanvasEditorSelectionRuntime` and `src/lib/editorSelectionRuntime.js`.

Current role:

- preferred internal runtime surface for committed selection, preselection, marquee state, gallery cell state, pending drag selection, and drag visual selection
- immediate read/write surface for selection-sensitive interaction code that cannot wait for React reconciliation during drag handoff
- source used by `readEditorSelectionSnapshot()` before legacy `window._*` fallbacks

Important boundary:

- this runtime is real and active, but it is still an internal editor surface, not a documented public bridge for external consumers
- `useCanvasEditorGlobalsBridge` continues to synchronize render-state globals and compatibility events, but committed selection mirroring itself now comes from the selection runtime

### Other window helpers
The current runtime also exposes standalone helpers outside `window.canvasEditor`, including:

- `window.asignarImagenACelda` for gallery cell media assignment
- `window.__getSeccionInfo` for resolved section lookup
- `window.__getObjById` for object lookup
- `window.setHoverIdGlobal` for hover reset from external UI

### Mirrored globals
The formalized legacy-compatible mirrored globals are grouped like this:

- render state: `window._objetosActuales`, `window._seccionesOrdenadas`, `window._rsvpConfigActual`, `window._giftConfigActual`, `window._giftsConfigActual`
- editor session: `window._draftTipoInvitacion`, `window._tipoInvitacionActual`, `window._seccionActivaId`, `window._lastSeccionActivaId`
- selection: `window._elementosSeleccionados`, `window._celdaGaleriaActiva`, `window._pendingDragSelectionId`, `window._pendingDragSelectionPhase`
- interaction: `window._elementRefs`, `window.setHoverIdGlobal`, `window._isDragging`, `window._resizeData`
- group drag: `window._groupDragSession`, `window._grupoLider`, `window._grupoElementos`, `window._grupoSeguidores`, `window._dragStartPos`, `window._dragInicial`, `window._groupPreviewLastDelta`

These globals are used by drag, selection, external panels, and compatibility bridges.

Current runtime behavior:

- `_elementosSeleccionados`, `_celdaGaleriaActiva`, `_pendingDragSelectionId`, and `_pendingDragSelectionPhase` are now compatibility mirrors or fallbacks for the internal selection runtime, not the preferred internal selection authority
- drag visual selection does not have a formal mirrored global; it remains internal to the stage runtime and selection runtime snapshot

Not part of the formal compatibility contract:

- transient scratch globals such as `_skipUntil`, `_recentGroupDragGuard`, `_objetosCopiados`, `_selectionThrottle`, `_currentEditingId`, and `editing`

Those values can exist at runtime, but external systems should not depend on them as stable bridge APIs.

### Custom events
The current runtime relies on custom events for cross-surface coordination. Important examples include:

- `insertar-elemento`
- `actualizar-elemento`
- `agregar-cuadro-texto`
- `crear-seccion`
- `aplicar-estilo-efectos`
- `editor-selection-change`
- `editor-gallery-cell-change`
- `seccion-activa`
- `editor-tipo-invitacion`
- `motion-effects-applied`
- `element-ref-registrado`
- `dragging-start`
- `dragging-end`
- `editor:draft-flush:request`
- `editor:draft-flush:result`

### Practical rule
Treat these bridges as compatibility-sensitive system boundaries. If one of them changes, the matching consumers in sidebars, overlays, template tooling, preview triggers, or publish-adjacent flows must be updated in the same change.
