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

### Transformer and Selection UI
Selection affects UI in different ways depending on element type:

- Non-line selections use `SelectionTransformer`.
- Line selections do not attach to the transformer; they render `LineControls` instead.
- While inline editing is active, the main transformer is suppressed.
- During drag-overlay phases, the transformer can be hidden or detached temporarily to avoid visual glitches and stale attachment state.

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

### Immediate Flush
The editor exposes an immediate flush path because preview/publish-like flows cannot rely on pending debounce state.

Current immediate flush contracts:

- `onRegisterPersistenceBridge(...).flushNow(...)`
- window event `editor:draft-flush:request`
- window event `editor:draft-flush:result`

### Coexisting Direct Writes
Not all section mutations go through the debounced draft sync hook.

The current editor also writes directly to Firestore for:

- section height resize
- section creation
- section deletion
- section reorder
- `altoModo` toggle

This means persistence is intentionally split between:

- debounced full-draft sync
- immediate section-specific writes

## 8. Constraints and Rules
These rules are enforced by the current implementation and should not be broken.

- `objetos` and `secciones` are the canonical editable render model and must stay Firestore-serializable.
- Persisted object coordinates are section-local. Stage-space Y is derived at render time and must be converted back before commit.
- `yNorm` is specific to `altoModo: "pantalla"` sections and must stay consistent with that section mode.
- Section visuals stored on `secciones` must not be moved into `objetos` without updating the full editor contract.
- Transformer-managed resize/rotation and drag commit logic must keep persisted geometry flattened when the current code expects flattened data.
- `forma.line` must remain on the dedicated `LineControls` path; it is not interchangeable with `SelectionTransformer`.
- Drag must not break committed selection, post-drag selection restoration, or guide cleanup.
- Section order comes from `orden`, and rendering depends on sorting by that field.
- The current insertion/update flow enforces one persisted `countdown` per draft and avoids duplicate functional CTA buttons.
- Undo/redo depends on `ignoreNextUpdateRef`; changes to history behavior must preserve that guard.
- Preview/publish-adjacent flows depend on immediate persistence flush; that bridge is a runtime contract, not an optional convenience.
- Window-mirrored runtime state and custom events are part of the current editor contract. Renaming or removing them is a breaking change unless every consumer is updated together.

## 9. Known Complexity Areas
The current editor is functional, but several areas are tightly coupled and fragile.

- `CanvasEditor.jsx` is still the main orchestration surface and owns many interacting state domains.
- Selection, drag handoff, and inline text intent are tightly coupled. The current runtime uses pending selection phases and release guards to decide whether a gesture should select, drag, or enter inline edit.
- Group drag depends on shared runtime globals and legacy compatibility behavior, not just local React state.
- `SelectionTransformer` is heavily specialized by element type. Text resize, image resize, image rotation, countdown resize, and gallery resize do not share the same commit rules.
- Drag-capable element families do not all finalize through one persistence branch. Generic objects, galleries, and countdowns each have their own commit path.
- Persistence is split between debounced draft sync and direct section writes, so changes to save timing can create subtle consistency bugs.
- Hover, transformer visibility, drag overlays, and guide lines are actively suppressed or deferred during interaction for performance reasons.
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
- If a section action writes directly to Firestore, keep it consistent with the debounced full-draft sync model.

## 11. Runtime Contracts and Hidden Dependencies
The current editor exposes non-trivial runtime contracts through `window` and custom events. They are part of the active system, even though they are not typed public APIs.

### `window.canvasEditor`
The editor currently merges capabilities into `window.canvasEditor`, including:

- active section data
- undo/redo helpers
- stage reference access
- background color mutation entrypoints
- template authoring helpers
- immediate persistence flush

### Other window helpers
The current runtime also exposes standalone helpers outside `window.canvasEditor`, including:

- `window.asignarImagenACelda` for gallery cell media assignment
- `window.__getSeccionInfo` for resolved section lookup
- `window.__getObjById` for object lookup
- `window.setHoverIdGlobal` for hover reset from external UI

### Mirrored globals
The runtime mirrors editor state into globals such as:

- `window._elementosSeleccionados`
- `window._objetosActuales`
- `window._elementRefs`
- `window._seccionesOrdenadas`
- `window._rsvpConfigActual`
- `window._giftsConfigActual`
- `window._altoCanvas`
- `window._seccionActivaId`
- `window._celdaGaleriaActiva`
- `window._isDragging`
- `window._grupoLider`
- `window._groupDragSession`
- `window._resizeData`
- `window._pendingDragSelectionId`
- `window._pendingDragSelectionPhase`

These globals are used by drag, selection, external panels, and bridge-style editor actions.

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
Treat these bridges as compatibility-sensitive system boundaries. If one of them changes, the matching consumers in sidebars, overlays, template tooling, or publish/preview triggers must be updated in the same change.
