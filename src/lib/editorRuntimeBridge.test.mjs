import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_RUNTIME_COMPATIBILITY_CONTRACT,
  callCanvasEditorMethod,
  readCanvasEditorMethod,
  readCanvasEditorStage,
  readEditorActiveSectionId,
  readEditorInvitationType,
  readEditorObjectById,
  readEditorObjectByType,
  readEditorSelectionSnapshot,
} from "./editorRuntimeBridge.js";
import { syncEditorSnapshotRenderState } from "./editorSnapshotAdapter.js";

test("editor runtime bridge resolves bound canvasEditor methods and stage refs", () => {
  const fakeWindow = {
    canvasEditor: {
      stageRef: { id: "stage-1" },
      counter: 2,
      flushPersistenceNow(options = {}) {
        return {
          counter: this.counter,
          options,
        };
      },
    },
  };

  const flush = readCanvasEditorMethod("flushPersistenceNow", fakeWindow);

  assert.equal(typeof flush, "function");
  assert.deepEqual(flush({ reason: "preview-before-open" }), {
    counter: 2,
    options: { reason: "preview-before-open" },
  });
  assert.deepEqual(
    callCanvasEditorMethod(
      "flushPersistenceNow",
      [{ reason: "checkout-before-open" }],
      fakeWindow
    ),
    {
      counter: 2,
      options: { reason: "checkout-before-open" },
    }
  );
  assert.equal(readCanvasEditorStage(fakeWindow)?.id, "stage-1");
});

test("editor runtime bridge reads object snapshots through the canonical snapshot adapter", () => {
  const fakeWindow = {};

  syncEditorSnapshotRenderState(
    {
      objetos: [
        { id: "countdown-1", tipo: "countdown", nested: { label: "Countdown" } },
        { id: "rsvp-1", tipo: "rsvp-boton" },
      ],
      secciones: [{ id: "section-a", orden: 1, altura: 240 }],
    },
    fakeWindow
  );

  const countdown = readEditorObjectByType("countdown", fakeWindow);
  const rsvp = readEditorObjectById("rsvp-1", fakeWindow);

  assert.deepEqual(countdown, {
    id: "countdown-1",
    tipo: "countdown",
    nested: { label: "Countdown" },
  });
  assert.deepEqual(rsvp, {
    id: "rsvp-1",
    tipo: "rsvp-boton",
  });

  countdown.nested.label = "Mutated";

  assert.deepEqual(readEditorObjectByType("countdown", fakeWindow), {
    id: "countdown-1",
    tipo: "countdown",
    nested: { label: "Countdown" },
  });
});

test("editor runtime bridge preserves legacy precedence for active section and invitation type", () => {
  const fakeWindow = {
    canvasEditor: {
      seccionActivaId: "bridge-section",
      tipoInvitacion: "birthday",
    },
    _seccionActivaId: "legacy-active-section",
    _lastSeccionActivaId: "legacy-last-section",
    _draftTipoInvitacion: "wedding",
    _tipoInvitacionActual: "quince",
  };

  assert.equal(
    readEditorActiveSectionId(fakeWindow),
    "legacy-active-section"
  );
  assert.equal(readEditorInvitationType(fakeWindow), "wedding");

  delete fakeWindow._seccionActivaId;
  delete fakeWindow.canvasEditor.seccionActivaId;
  delete fakeWindow._lastSeccionActivaId;

  syncEditorSnapshotRenderState(
    {
      objetos: [],
      secciones: [{ id: "section-from-snapshot", orden: 1, altura: 320 }],
    },
    fakeWindow
  );

  assert.equal(readEditorActiveSectionId(fakeWindow), "section-from-snapshot");
});

test("editor runtime bridge exposes documented compatibility globals and cloned selection snapshots", () => {
  const fakeWindow = {
    _elementosSeleccionados: ["obj-1"],
    _celdaGaleriaActiva: {
      objId: "gallery-1",
      index: 2,
    },
  };

  const selection = readEditorSelectionSnapshot(fakeWindow);

  assert.deepEqual(selection, {
    selectedIds: ["obj-1"],
    galleryCell: {
      objId: "gallery-1",
      index: 2,
    },
  });
  assert.ok(
    EDITOR_RUNTIME_COMPATIBILITY_CONTRACT.canvasEditor.includes(
      "flushPersistenceNow"
    )
  );
  assert.ok(
    EDITOR_RUNTIME_COMPATIBILITY_CONTRACT.legacySelectionGlobals.includes(
      "_elementosSeleccionados"
    )
  );
  assert.ok(
    EDITOR_RUNTIME_COMPATIBILITY_CONTRACT.bridgeFunctions.includes(
      "__getObjById"
    )
  );

  selection.selectedIds.push("obj-2");
  selection.galleryCell.index = 4;

  assert.deepEqual(readEditorSelectionSnapshot(fakeWindow), {
    selectedIds: ["obj-1"],
    galleryCell: {
      objId: "gallery-1",
      index: 2,
    },
  });
});
