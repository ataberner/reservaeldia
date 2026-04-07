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
- Current fragility map: `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- Current render compatibility matrix: `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
