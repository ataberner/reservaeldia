import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_SNAPSHOT_ADAPTER_VERSION,
  ensureEditorSnapshotAdapter,
  readEditorObjectSnapshot,
  readEditorRenderSnapshot,
  readEditorSectionInfo,
  syncEditorSnapshotRenderState,
  syncEditorSnapshotResolvers,
} from "./editorSnapshotAdapter.js";

test("editor snapshot adapter returns cloned render snapshots", () => {
  const fakeWindow = {};

  const adapter = ensureEditorSnapshotAdapter(fakeWindow);
  syncEditorSnapshotRenderState(
    {
      objetos: [{ id: "obj-1", nested: { value: 1 } }],
      secciones: [
        { id: "section-b", orden: 2, altura: 240 },
        { id: "section-a", orden: 1, altura: 180 },
      ],
      rsvp: { enabled: true },
      gifts: { enabled: false },
    },
    fakeWindow
  );

  const firstSnapshot = readEditorRenderSnapshot(fakeWindow);
  assert.ok(firstSnapshot);
  assert.equal(fakeWindow.editorSnapshot, adapter);
  assert.equal(adapter.version, EDITOR_SNAPSHOT_ADAPTER_VERSION);
  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(firstSnapshot.secciones.map((item) => item.id), [
    "section-a",
    "section-b",
  ]);

  firstSnapshot.objetos[0].nested.value = 9;
  firstSnapshot.secciones[0].altura = 999;

  const secondSnapshot = readEditorRenderSnapshot(fakeWindow);
  assert.equal(secondSnapshot.objetos[0].nested.value, 1);
  assert.equal(secondSnapshot.secciones[0].altura, 180);
});

test("editor snapshot adapter falls back to legacy globals during migration", () => {
  const fakeWindow = {
    _objetosActuales: [{ id: "legacy-obj" }],
    _seccionesOrdenadas: [{ id: "legacy-section", orden: 1, altura: 320 }],
    _rsvpConfigActual: { enabled: true, presetId: "minimal" },
    _giftConfigActual: { enabled: true, bank: { alias: "regalos" } },
  };

  const snapshot = readEditorRenderSnapshot(fakeWindow);

  assert.deepEqual(snapshot, {
    objetos: [{ id: "legacy-obj" }],
    secciones: [{ id: "legacy-section", orden: 1, altura: 320 }],
    rsvp: { enabled: true, presetId: "minimal" },
    gifts: { enabled: true, bank: { alias: "regalos" } },
  });
});

test("editor snapshot adapter resolves section and object reads through the adapter", () => {
  const fakeWindow = {};

  syncEditorSnapshotRenderState(
    {
      objetos: [{ id: "obj-1", meta: { label: "Objeto" } }],
      secciones: [
        { id: "section-b", orden: 2, altura: 240 },
        { id: "section-a", orden: 1, altura: 180 },
      ],
    },
    fakeWindow
  );
  syncEditorSnapshotResolvers(
    {
      getSectionInfo: (id) =>
        id === "section-b"
          ? {
              idx: 1,
              top: 180,
              height: 240,
            }
          : null,
      getObjectById: (id) =>
        id === "obj-1"
          ? {
              id: "obj-1",
              meta: { label: "Objeto" },
            }
          : null,
    },
    fakeWindow
  );

  const sectionInfo = readEditorSectionInfo(fakeWindow, "section-b");
  const objectSnapshot = readEditorObjectSnapshot(fakeWindow, "obj-1");

  assert.deepEqual(sectionInfo, {
    idx: 1,
    top: 180,
    height: 240,
  });
  assert.deepEqual(objectSnapshot, {
    id: "obj-1",
    meta: { label: "Objeto" },
  });

  sectionInfo.top = 999;
  objectSnapshot.meta.label = "Mutado";

  assert.deepEqual(readEditorSectionInfo(fakeWindow, "section-b"), {
    idx: 1,
    top: 180,
    height: 240,
  });
  assert.deepEqual(readEditorObjectSnapshot(fakeWindow, "obj-1"), {
    id: "obj-1",
    meta: { label: "Objeto" },
  });
});
