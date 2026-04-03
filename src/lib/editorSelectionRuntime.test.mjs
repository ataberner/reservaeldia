import test from "node:test";
import assert from "node:assert/strict";

import {
  clearEditorSelectionTransientState,
  ensureEditorSelectionRuntime,
  readEditorSelectionRuntimeSnapshot,
  setEditorCommittedSelection,
  setEditorDragVisualSelection,
  setEditorPendingDragSelection,
  syncEditorSelectionRenderState,
} from "./editorSelectionRuntime.js";

test("editor selection runtime returns cloned snapshots and mirrors compatibility globals", () => {
  const fakeWindow = {};

  const runtime = ensureEditorSelectionRuntime(fakeWindow);
  assert.ok(runtime);

  syncEditorSelectionRenderState(
    {
      selectedIds: ["obj-1"],
      preselectedIds: ["obj-2"],
      galleryCell: { objId: "gallery-1", index: 3 },
      marquee: {
        active: true,
        start: { x: 10, y: 20 },
        area: { x: 10, y: 20, width: 40, height: 50 },
      },
    },
    fakeWindow
  );
  setEditorPendingDragSelection(
    {
      id: "obj-1",
      phase: "predrag",
    },
    {},
    fakeWindow
  );
  setEditorDragVisualSelection(
    {
      ids: ["obj-1", "obj-2"],
      predragActive: true,
      sessionKey: "drag-overlay:1:obj-1",
      dragId: "obj-1",
    },
    {},
    fakeWindow
  );

  const snapshot = readEditorSelectionRuntimeSnapshot(fakeWindow);

  assert.deepEqual(snapshot, {
    selectedIds: ["obj-1"],
    preselectedIds: ["obj-2"],
    galleryCell: { objId: "gallery-1", index: 3 },
    marquee: {
      active: true,
      start: { x: 10, y: 20 },
      area: { x: 10, y: 20, width: 40, height: 50 },
    },
    pendingDragSelection: {
      id: "obj-1",
      phase: "predrag",
    },
    dragVisualSelection: {
      ids: ["obj-1", "obj-2"],
      predragActive: true,
      sessionKey: "drag-overlay:1:obj-1",
      dragId: "obj-1",
    },
  });
  assert.deepEqual(fakeWindow._elementosSeleccionados, ["obj-1"]);
  assert.deepEqual(fakeWindow._celdaGaleriaActiva, {
    objId: "gallery-1",
    index: 3,
  });
  assert.equal(fakeWindow._pendingDragSelectionId, "obj-1");
  assert.equal(fakeWindow._pendingDragSelectionPhase, "predrag");

  snapshot.selectedIds.push("obj-9");
  snapshot.galleryCell.index = 99;
  snapshot.marquee.area.width = 999;
  snapshot.dragVisualSelection.ids.push("obj-10");

  assert.deepEqual(readEditorSelectionRuntimeSnapshot(fakeWindow), {
    selectedIds: ["obj-1"],
    preselectedIds: ["obj-2"],
    galleryCell: { objId: "gallery-1", index: 3 },
    marquee: {
      active: true,
      start: { x: 10, y: 20 },
      area: { x: 10, y: 20, width: 40, height: 50 },
    },
    pendingDragSelection: {
      id: "obj-1",
      phase: "predrag",
    },
    dragVisualSelection: {
      ids: ["obj-1", "obj-2"],
      predragActive: true,
      sessionKey: "drag-overlay:1:obj-1",
      dragId: "obj-1",
    },
  });
});

test("editor selection runtime falls back to legacy globals until initialized", () => {
  const fakeWindow = {
    _elementosSeleccionados: ["legacy-1"],
    _celdaGaleriaActiva: {
      objId: "legacy-gallery",
      index: 1,
    },
    _pendingDragSelectionId: "legacy-1",
    _pendingDragSelectionPhase: "deferred-drag",
  };

  assert.deepEqual(readEditorSelectionRuntimeSnapshot(fakeWindow), {
    selectedIds: ["legacy-1"],
    preselectedIds: [],
    galleryCell: {
      objId: "legacy-gallery",
      index: 1,
    },
    marquee: {
      active: false,
      start: null,
      area: null,
    },
    pendingDragSelection: {
      id: "legacy-1",
      phase: "deferred-drag",
    },
    dragVisualSelection: {
      ids: [],
      predragActive: false,
      sessionKey: null,
      dragId: null,
    },
  });

  ensureEditorSelectionRuntime(fakeWindow);

  assert.deepEqual(readEditorSelectionRuntimeSnapshot(fakeWindow), {
    selectedIds: ["legacy-1"],
    preselectedIds: [],
    galleryCell: {
      objId: "legacy-gallery",
      index: 1,
    },
    marquee: {
      active: false,
      start: null,
      area: null,
    },
    pendingDragSelection: {
      id: "legacy-1",
      phase: "deferred-drag",
    },
    dragVisualSelection: {
      ids: [],
      predragActive: false,
      sessionKey: null,
      dragId: null,
    },
  });
});

test("editor selection runtime clears transient drag state without dropping committed selection", () => {
  const fakeWindow = {};

  setEditorCommittedSelection(["obj-1"], {}, fakeWindow);
  setEditorPendingDragSelection(
    {
      id: "obj-1",
      phase: "deferred-drag",
    },
    {},
    fakeWindow
  );
  setEditorDragVisualSelection(
    {
      ids: ["obj-1"],
      predragActive: true,
      sessionKey: "drag-overlay:2:obj-1",
      dragId: "obj-1",
    },
    {},
    fakeWindow
  );
  syncEditorSelectionRenderState(
    {
      selectedIds: ["obj-1"],
      preselectedIds: ["obj-3"],
      galleryCell: null,
      marquee: {
        active: true,
        start: { x: 0, y: 0 },
        area: { x: 0, y: 0, width: 10, height: 10 },
      },
    },
    fakeWindow
  );

  clearEditorSelectionTransientState(
    {
      clearPendingDrag: true,
      clearDragVisual: true,
      clearMarquee: true,
    },
    fakeWindow
  );

  assert.deepEqual(readEditorSelectionRuntimeSnapshot(fakeWindow), {
    selectedIds: ["obj-1"],
    preselectedIds: ["obj-3"],
    galleryCell: null,
    marquee: {
      active: false,
      start: null,
      area: null,
    },
    pendingDragSelection: {
      id: null,
      phase: null,
    },
    dragVisualSelection: {
      ids: [],
      predragActive: false,
      sessionKey: null,
      dragId: null,
    },
  });
  assert.deepEqual(fakeWindow._elementosSeleccionados, ["obj-1"]);
  assert.equal(fakeWindow._pendingDragSelectionId, null);
  assert.equal(fakeWindow._pendingDragSelectionPhase, null);
});
