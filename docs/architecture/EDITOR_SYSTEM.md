# EDITOR SYSTEM

> Updated from code inspection on 2026-04-07.
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

This state is owned by `CanvasEditor.jsx` and persisted through `useBorradorSync.js`.

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

Section-owned visuals are authored through `secciones`, not `objetos`. The editor renders base backgrounds, `decoracionesFondo`, and `decoracionesBorde` in the section background surface. `decoracionesBorde` can be assigned from an existing image asset into the top or bottom slot; sizing follows the same bounded edge-decoration model documented in `DATA_MODEL.md`. A double click opens the section-owned decoration edit/settings flow for users with `canManageSite` access. The edge overlay commits `offsetDesktopPx`; it does not make the edge decoration a normal selectable object, and it does not enter resize, rotation, grouping, z-index, or smart-layout object flows.

The normative role and conversion contract for image/content, free decorations, section backgrounds, and top/bottom decorations lives in `docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md`. That contract requires any conversion from a normal image object into a section-owned visual role to remove the original object from `objetos`; current top/bottom edge conversion follows that rule and clears stale object selection.

Gallery objects (`tipo: "galeria"`) are normal content objects in `objetos`, not section-owned visuals. Current Gallery editing uses Konva rendering plus sidebar/runtime bridges, including active Gallery-cell state. The current/future Gallery entry point lives in [`docs/contracts/GALLERY_SYSTEM_CONTRACT.md`](../contracts/GALLERY_SYSTEM_CONTRACT.md), and editor/sidebar-specific rules live in [`docs/contracts/GALLERY_EDITOR_CONTRACT.md`](../contracts/GALLERY_EDITOR_CONTRACT.md). Those contracts must be used for changes to selected-Gallery sidebar behavior, Gallery cell mutation, role-based Gallery authoring, global public lightbox behavior, and preview/publish parity.

Decoration creation and management controls are role-gated UI entry points. Regular users can use `Imagen (contenido)` and `Fondo de la sección`; `Decoración`, `Decoración arriba`, and `Decoración abajo` are visible only to admin/superadmin users through the existing `canManageSite` prop (`isAdmin || isSuperAdmin`). Existing decoration data remains render-compatible for all users. The section actions menu must not expose delete buttons for free, top, or bottom decorations; removal, when available, belongs to the decoration-specific settings menu.

Preserved groups are stored as `tipo: "grupo"` roots in `objetos`. The group owns section placement and child objects keep group-local `x`/`y` coordinates while reusing the normal render contracts for text, images, shapes, CTAs, countdowns, and galleries. The detailed preview/publish contract lives in `docs/architecture/GROUP_RENDER_MODEL.md`.

### 3.4 Persistence Boundary

`useBorradorSync.js` is the main persistence boundary.

Current behavior:

- loads draft or template-editor state
- normalizes the render payload
- debounces autosave
- exposes immediate flush for critical actions
- shares write ordering through the draft-write coordinator even when section mutations still use direct writes

## 4. Runtime Bridges

The editor currently exposes compatibility-sensitive runtime bridges through:

- `window.canvasEditor`
- `window.editorSnapshot`
- legacy `window._*` mirrors
- custom events such as `editor-selection-change`, `dragging-start`, `dragging-end`, `editor:draft-flush:request`, and `editor:draft-flush:result`

These are active system boundaries, not incidental implementation details.

## 5. Related Documents

- Whole product architecture: `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- Current interaction/rendering source of truth: `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- Current preview pipeline: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- Preserved group render model: `docs/architecture/GROUP_RENDER_MODEL.md`
- Current fragility map: `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- Current render compatibility matrix: `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- Image placement UX/render contract: `docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md`
