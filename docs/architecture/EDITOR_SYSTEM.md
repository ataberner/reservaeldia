# EDITOR SYSTEM

> Status: Current Architecture/System Map.
>
> Updated from code inspection on 2026-09-02.
>
> This document is a high-level overview of the current editor runtime. Detailed interaction/rendering behavior lives in `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`.

## 1. Purpose

The active production editor is the Konva-based invitation editor mounted from `src/components/CanvasEditor.jsx`.

Its job is to:

- load a draft or template-editor document
- render `secciones` and `objetos` as an editable canvas
- coordinate selection, drag, resize, rotation, inline text edit, guides, and section editing
- persist the canonical render state back to draft/template storage
- expose critical-flush and snapshot bridges used by preview and publish-adjacent flows

This document describes the editor as a subsystem boundary. It is not the canonical source for low-level drag, selection-box, hover, guide, or inline DOM lifecycle rules.

## 2. Main Runtime Modules

Current primary modules:

- `src/components/CanvasEditor.jsx`
  - top-level editor state
  - hook composition
  - runtime bridge registration
  - persistence bridge registration
- `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`
  - stage/layer composition
  - drag-overlay session ownership
  - selected-phase vs drag-phase visual orchestration
- `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`
  - per-object render and gesture entry
- `src/components/editor/textSystem/render/konva/SelectionTransformer.jsx`
  - selected-phase transform UI for eligible selections
- `src/components/editor/persistence/useBorradorSync.js`
  - draft/template load
  - autosave
  - immediate flush handling
- `src/components/editor/persistence/editorSessionPersistence.js`
  - session-aware editor read/write authority
  - routes draft sessions to `borradores/{slug}`
  - routes template sessions to template editor callables

Supporting interaction/runtime modules:

- `src/components/editor/canvasEditor/useCanvasEditorSelectionRuntime.js`
- `src/components/editor/canvasEditor/useCanvasEditorSelectionUi.js`
- `src/components/editor/canvasEditor/useCanvasInteractionCoordinator.js`
- `src/components/editor/mobile/useStageGestures.js`
- `src/hooks/useGuiasCentrado.js`
- `src/components/editor/canvasEditor/CanvasGuideLayer.jsx`
- inline text runtime modules under `src/components/editor/textSystem/runtime/` and `src/components/editor/textSystem/render/`

## 3. Current Runtime Boundaries

### 3.1 Authoring State

The current editable render state is:

- `objetos`
- `secciones`
- `rsvp`
- `gifts`
- `eventDetails`

This state is owned by `CanvasEditor.jsx` and persisted through `useBorradorSync.js`, which delegates actual session transport to `editorSessionPersistence.js`.

Dynamic field values are authoring data, not canvas state. Writable drafts read
and write them through `templateInput.values`; template sessions use
`templateAuthoringDraft.defaults`. Canvas objects (including grouped children,
maps, and countdowns) are linked views produced through `applyTargets`. A field
may therefore remain editable with no materialized canvas object, and editing it
must not insert a view implicitly.

`templateAuthoringDraft.detachedVisuals` is the durable, inert presentation cache
for explicitly removed dynamic views. It is neither a render source nor a value
source. Dynamic value changes project into all currently valid targets without
creating canvas-history entries; object position, style, size, text width,
alignment, and wrapping remain object-owned.

All root-removal entry points share one dynamic-view planner. A reached linked
view is removed only after the contextual confirmation and successful ordered
persistence boundary; cancellation and write failure preserve the existing
selection/view. Recovery inserts at most one view and reapplies the current value.
Detailed keyboard, touch, focus, group-child, and undo/redo rules are normative in
`INTERACTION_CONTRACT.md`.

### 3.2 Immediate Interaction State

Selection-sensitive interaction state is also mirrored into the internal selection runtime in `src/lib/editorSelectionRuntime.js`.

Important runtime fields include:

- `selectedIds`
- `preselectedIds`
- `marquee`
- `pendingDragSelection`
- `dragVisualSelection`

This runtime exists because some interaction paths cannot wait for React reconciliation during drag/selection handoff.

### 3.3 Visual Surfaces

The editor currently uses three coordinated visual surfaces:

1. Konva content layers for sections and objects
2. Konva overlay layers for selection, hover, line controls, guides, and drag-overlay visuals
3. DOM overlay surfaces for inline text editing

### 3.3.1 Assistant Guided Tour Layer

The Assistant guided tour is an editor/dashboard overlay, not a second Assistant flow. It is mounted from `DashboardSidebar.jsx` through `src/components/editor/assistantTour/AssistantGuidedTour.jsx` and observes the existing Assistant state (`assistantStepIndex`, `assistantSubstepIndex`, current step/substep, and the real footer action button).

Stable targets are exposed with `data-assistant-tour-target` on the existing Assistant controls and first-step form fields. First-step field targets also expose `data-assistant-tour-hydrated` so the tour can skip only values that belong to the hydrated draft state, not fallback UI text or transient bridge state. The tour must use those semantic targets rather than visible text selectors. It may highlight, scroll within `#sidebar-panel`, and listen for user `input`/`change`/`click` events, but it must not call Assistant navigation handlers except for the one initial activation through the existing `openAssistantAtStep` mechanism when a draft opens without Assistant active.

The opt-out preference is user-scoped under `usuarios/{uid}.uiPreferences.assistantTourOptOut` and is read/written via callable functions. The callable write must persist a real nested `uiPreferences` map when using Firestore `set(..., { merge: true })`; dotted payload keys are not the authority read by the preference loader. Closing the tour is session-only and must not persist this preference. The dashboard account menu exposes restoration both outside and inside writable draft/template editors by writing that same preference to `false`; in the dashboard menu the row remains immediately before Trash. Once that write is confirmed, the editor shell emits one session-only restart opportunity and `AssistantGuidedTour` clears its previous close/completion/initialization latches, so an explicit restoration can show the tour again during the active edit without remounting the editor. The restart opportunity is not another preference authority and is consumed once to remain safe under repeated effects. A confirmed opt-out keeps the tooltip visible briefly with green success feedback before the session closes.

Section-owned visuals are authored through `secciones`, not `objetos`. The editor renders base backgrounds, `decoracionesFondo`, `decoracionesBorde`, and generated SVG `divisores` in the section background surface. `decoracionesBorde` can be assigned from an existing image asset into the top or bottom slot; sizing follows the same bounded edge-decoration model documented in `DATA_MODEL.md`. A double click opens the section-owned decoration edit/settings flow for users with `canManageSite` access. The edge overlay commits `offsetDesktopPx`; it does not make the edge decoration a normal selectable object, and it does not enter resize, rotation, grouping, z-index, or smart-layout object flows. `divisores` is also pointer-inert and is rendered from the shared preset geometry without an edit overlay.

### 3.3.2 Designer AI Adapter

`Diseñador AI` is a superadmin-only conversational adapter mounted by
`DashboardSidebar` in writable draft sessions. It reads the same draft and
delegates to the same authoring/configuration/Gallery/CTA owners as Assistant;
it owns no canvas state or render values. A leaf-level conversational ledger is
reconciled from the current draft after each turn. Persisted
`designerAiConversation` metadata stores only provenance, value fingerprints,
document-name policy, and documented decisions; editor owners and their normal
persistence remain authoritative for every effective value. The versioned
allowlist, capability inventory and trusted-control boundary are canonical in
[`DESIGNER_AI_CAPABILITY_CONTRACT.md`](../contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md).
Conversation policy lives in
[`AI_ASSISTANT_CONVERSATION_CONTRACT.md`](../contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md),
while context construction, backend authorization, sessions, persistence,
security guarantees and current gaps live in
[`AI_ASSISTANT_SYSTEM.md`](AI_ASSISTANT_SYSTEM.md).

Opening this panel deactivates Assistant, so the Guided Tour remains unmounted.
The panel and its reused local controls must not expose Assistant tour targets.

When Designer AI needs a precise visual/provider-backed choice, the panel keeps
the conversation mounted and inserts only the relevant specialized control in
the chat log. The location implementation uses
`DesignerAiLocationControl.jsx`, while both that control and
`MiniToolbarTabDetallesEvento.jsx` share `googlePlaces.js` and
`locationAuthoring.js`; neither surface owns a second autocomplete or mutation
shape. The inline location control must not mount unrelated event fields, and
opening/canceling it does not count as an editor mutation.

### 3.3.3 Section Design Panel

`DashboardLayout` mounts `EditorPanelCoordinatorProvider`, whose `activePanel` is the only mutual-exclusion authority for `"left"`, `"section-design"`, or `null`. `DashboardSidebar` keeps its existing hover, pinned-tab, assistant, and responsive state, but its panel is effective only while the coordinator selects `"left"`. Opening any left tab/assistant path selects `"left"`; the section action `Diseño` selects `"section-design"`. Closing either side clears only its own active panel, so a stale close cannot close the opposite side. This coordination uses React context/reducer state, not window events, globals, duplicated open flags, or competing effects.

`SectionActionsOverlay` exposes `Diseño` only when the existing `canManageSite` authority is true (`admin` or `superadmin`). `SectionDesignPanel` edits only the divider fields of the current `CanvasEditor.seccionActivaId` through `updateSectionDividers` and `setSecciones`, preserving the normal autosave authority. Section background color remains owned by the pre-existing background controls outside this panel. The panel root uses `data-preserve-canvas-selection`, and closing it changes neither selection nor section data.

The per-section `Adaptar para celular` action is available in every writable editor session, independently of `canManageSite`. `SectionActionsOverlay` delegates that action to `useSectionsManager`, which remains the single mutation and persistence owner; protected sections and read-only sessions remain non-mutable.

Desktop layout uses `src/domain/dashboard/editorCanvasLayout.js` as the shared measurement authority. The persistent navigation rail and the expanded left panel publish their measured right edge through the existing sidebar-layout event; the section-design panel width is `376px`, with the normal dashboard canvas gap reserved separately. When the expanded left panel closes in favor of section design, the canvas keeps the fixed navigation rail inset instead of falling back to the viewport origin. The resulting canvas center is therefore derived from the unobscured interval between the navigation rail and the right panel, without negative margins or a second positioning state.

Render ownership remains split by surface without splitting geometry authority: `FondoSeccion` owns the Konva canvas layer; `generarHTMLDesdeSecciones` owns both draft preview and published HTML; `shared/sectionDividerPresets` owns the SVG paths used by both. The dashboard clean capture includes the divider because it belongs to the `sections-base` render layer, while the DOM action and panel remain outside the Konva stage.

The normative role and conversion contract for image/content, free decorations, section backgrounds, and top/bottom decorations lives in `docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md`. That contract requires any conversion from a normal image object into a section-owned visual role to remove the original object from `objetos`; current top/bottom edge conversion follows that rule and clears stale object selection.

Gallery objects (`tipo: "galeria"`) are normal content objects in `objetos`, not section-owned visuals. Current Gallery editing uses Konva rendering plus sidebar/runtime bridges, including active Gallery-cell state. Writable normal sessions may insert simple independent Galleries from the Fotos tab through the existing `insertar-elemento` route; admin/superadmin users keep the advanced Gallery Builder in template-authoring context. The current/future Gallery entry point lives in [`docs/contracts/GALLERY_SYSTEM_CONTRACT.md`](../contracts/GALLERY_SYSTEM_CONTRACT.md), and editor/sidebar-specific rules live in [`docs/contracts/GALLERY_EDITOR_CONTRACT.md`](../contracts/GALLERY_EDITOR_CONTRACT.md). Those contracts must be used for changes to selected-Gallery sidebar behavior, Gallery cell mutation, role-based Gallery authoring, global public lightbox behavior, and preview/publish parity.

Decoration creation and management controls are role-gated UI entry points. Regular users can use `Imagen (contenido)` and `Fondo de la sección`; `Decoración`, `Decoración arriba`, and `Decoración abajo` are visible only to admin/superadmin users through the existing `canManageSite` prop (`isAdmin || isSuperAdmin`). Existing decoration data remains render-compatible for all users. The section actions menu must not expose delete buttons for free, top, or bottom decorations; removal, when available, belongs to the decoration-specific settings menu.

Preserved groups are stored as `tipo: "grupo"` roots in `objetos`. The group owns section placement and child objects keep group-local `x`/`y` coordinates while reusing the normal render contracts for text, images, shapes, CTAs, countdowns, and galleries. The detailed preview/publish contract lives in `docs/architecture/GROUP_RENDER_MODEL.md`.

### 3.4 Persistence Boundary

`editorSessionPersistence.js` is the transport authority for editor-session persistence. `useBorradorSync.js` is the editor hook that hydrates state, schedules autosave, and exposes the flush bridge.

Current behavior:

- loads draft or template-editor state through `readEditorSessionDocument`
- normalizes the render payload
- debounces autosave
- exposes immediate flush for critical actions
- persists autosave snapshots through `persistEditorSessionSnapshot`
- persists section height, `altoModo`, create, delete, reorder, name, and authoring patches through `persistEditorSessionPatch`
- shares write ordering through the draft-write coordinator for autosave, flush, and section mutation writes
- persists a reached dynamic-field operation as one ordered session mutation over `templateInput`, `templateAuthoringDraft`, `objetos`, `secciones`, and `eventDetails`, rather than through a private authoring queue
- drains pending name, location, date, and time edits before a critical flush; later autosaves read the latest complete snapshot

Editor modules must not call `doc(db, "borradores", slug)` to persist editor-session state. New session kinds must be represented explicitly in `normalizeEditorSession`; unsupported kinds fail closed at the persistence authority instead of falling back to draft.

Canvas undo/redo snapshots include `objetos`, `secciones`, and
`dynamicVisualState`. The latter contains object-scope dynamic targets plus
`detachedVisuals`, but never structured values. Undoing or redoing a visual
mutation restores the link/presentation and reapplies the current structured
value. History suppression and autosave suppression are separate guards.

## 4. Runtime Bridges

The editor currently exposes compatibility-sensitive runtime bridges through:

- `window.canvasEditor`
- `window.editorSnapshot`
- legacy `window._*` mirrors
- custom events such as `editor-selection-change`, `dragging-start`, `dragging-end`, `editor:draft-flush:request`, and `editor:draft-flush:result`

These are active system boundaries, not incidental implementation details.

`window.canvasEditor.scrollToDynamicFieldTarget(fieldKeyOrKeys, options?)` is a sidebar-to-canvas navigation bridge for dynamic-field editing. It may scroll the dashboard viewport toward the first linked render object for the requested field, but it must not mutate render data, selection state, hover state, inline edit state, or overlay ownership.

The dynamic-field bridge surface is:

- `getTemplateAuthoringSnapshot()`, which exposes the effective `values`, schema,
  Places metadata, targets, and inert `detachedVisuals`;
- `updateTemplateFieldValue(fieldKey, value, options?)` and
  `updateTemplateFieldValues(valuesPatch, options?)`, the canonical field-write
  entry points;
- `restoreDynamicFieldRepresentation({ fieldKey, representationKind })`, where
  `representationKind` is `"auto"`, `"text"`, `"map"`, or `"countdown"`;
- `getDynamicFieldRepresentationStatus(...)`, which reports the derived
  `visible | hidden | absent` state and counts without persisting another index.

Existing person-name, location, date/time, and
`updateTemplateAuthoringDefault` methods are compatibility adapters over those
owners. `editor:dynamic-field-edit-request` carries normalized
`{ fieldKey, objectId }` from a linked canvas text to the owning sidebar field;
it is the only event for that handoff and does not authorize inline content
mutation.

`window.canvasEditor.getCoverImage()` exposes the effective editor-session cover to
the Sidebar. It resolves the visual referenced by `portadaSource`. Template sessions
and template-derived drafts return no effective cover when that reference is absent
or stale; standalone legacy drafts may use `portada` as a compatibility fallback.

Template editing preserves `portadaSource` in the full template editor document and
`copiarPlantilla` carries it into template-derived drafts. Object and section IDs are
the stable identity boundary for this transfer; the template catalog thumbnail is
not a cover-selection authority and cannot enable the Assistant cover block.

`window.canvasEditor.updateCoverImage(imageInput, options?)` is the single
sidebar-to-editor cover mutation. It persists through `editorSessionPersistence`
and the shared draft-write FIFO. `options.coverSource` may bind the cover to a
specific canvas object or section background. With `syncLinkedVisuals: false`, it
changes only cover metadata. With `syncLinkedVisuals: true`, it also replaces the
bound visual plus canvas image objects and base section backgrounds whose previous
source matched the old cover, preserving geometry/placement and leaving unrelated
visuals unchanged. It must
not create or select an `objetos[]` image.

`window.canvasEditor.replaceFirstSectionBackgroundImage(...)` remains a compatibility
adapter for callers migrating to `updateCoverImage`; it delegates to the same cover
owner with linked-visual synchronization and is not a second mutation path.

## 5. Related Documents

- Designer AI technical architecture and owners: `docs/architecture/AI_ASSISTANT_SYSTEM.md`
- Designer AI capability/tool contract: `docs/contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md`
- Designer AI conversation contract: `docs/contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md`
- Whole product architecture: `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- Current interaction/rendering source of truth: `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- Current preview pipeline: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- Preserved group render model: `docs/architecture/GROUP_RENDER_MODEL.md`
- Current fragility map: `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- Current render compatibility matrix: `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- Image placement UX/render contract: `docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md`
- Gallery system contract: `docs/contracts/GALLERY_SYSTEM_CONTRACT.md`
- Gallery editor/sidebar contract: `docs/contracts/GALLERY_EDITOR_CONTRACT.md`
- Gallery layout preset contract: `docs/contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md`
- Gallery preview/publish viewer contract: `docs/contracts/GALLERY_VIEWER_RENDER_CONTRACT.md`
