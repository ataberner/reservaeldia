import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNextSectionHeightState,
  buildNextSectionModeState,
  buildSectionCreationState,
  buildSectionMutationWritePayload,
  shouldPersistSectionMutationSnapshot,
} from "./sectionMutationPersistence.js";

function normalizarAltoModo(value) {
  return String(value || "").trim().toLowerCase() === "pantalla"
    ? "pantalla"
    : "fijo";
}

test("section height mutation builds a single nextSecciones snapshot", () => {
  const current = [
    { id: "sec-1", altura: 300, altoModo: "fijo", orden: 0 },
    { id: "sec-2", altura: 420, altoModo: "fijo", orden: 1 },
  ];

  const next = buildNextSectionHeightState(current, {
    seccionId: "sec-2",
    altura: 641.2,
  });

  assert.notEqual(next, current);
  assert.equal(next[0], current[0]);
  assert.equal(next[1].altura, 641);
});

test("section mode payload normalizes object placement for pantalla persistence", () => {
  const nextSecciones = buildNextSectionModeState(
    [
      {
        id: "sec-1",
        altura: 320,
        altoModo: "fijo",
        orden: 0,
      },
    ],
    {
      seccionId: "sec-1",
      normalizarAltoModo,
      ALTURA_REFERENCIA_PANTALLA: 500,
    }
  );

  const { payload } = buildSectionMutationWritePayload({
    secciones: nextSecciones,
    objetos: [
      {
        id: "obj-1",
        tipo: "texto",
        seccionId: "sec-1",
        y: 125,
      },
    ],
    reason: "section-mode-toggle",
    includeObjetos: true,
    ALTURA_PANTALLA_EDITOR: 500,
    createTimestamp: () => "ts",
  });

  assert.equal(payload.secciones[0].altoModo, "pantalla");
  assert.equal(payload.secciones[0].altura, 500);
  assert.equal(payload.objetos[0].y, 125);
  assert.equal(payload.objetos[0].yNorm, 0.25);
  assert.equal(payload.draftContentMeta.lastReason, "section-mode-toggle");
  assert.equal(payload.ultimaEdicion, "ts");
});

test("section creation reuses the computed section snapshot for object placement persistence", () => {
  const { nuevaSeccion, nextSecciones, nextObjetos } = buildSectionCreationState({
    datos: {
      desdePlantilla: true,
      objetos: [
        {
          id: "legacy-1",
          tipo: "texto",
          seccionId: "legacy",
          y: 40,
        },
      ],
    },
    secciones: [{ id: "sec-1", altura: 300, altoModo: "fijo", orden: 0 }],
    objetos: [],
    crearSeccion: (_datos, prevSecciones) => ({
      id: `sec-${prevSecciones.length + 1}`,
      altura: 300,
      altoModo: "fijo",
      orden: prevSecciones.length,
    }),
    createObjectId: () => "obj-generated",
  });

  assert.equal(nuevaSeccion.id, "sec-2");
  assert.equal(nextSecciones.length, 2);
  assert.equal(nextObjetos.length, 1);
  assert.equal(nextObjetos[0].id, "obj-generated");
  assert.equal(nextObjetos[0].seccionId, nuevaSeccion.id);

  const { payload } = buildSectionMutationWritePayload({
    secciones: nextSecciones,
    objetos: nextObjetos,
    reason: "section-create",
    includeObjetos: true,
    ALTURA_PANTALLA_EDITOR: 500,
    createTimestamp: () => "ts",
  });

  assert.equal(payload.secciones.length, 2);
  assert.equal(payload.objetos[0].seccionId, nuevaSeccion.id);
  assert.equal(payload.draftContentMeta.lastReason, "section-create");
});

test("section reorder payload preserves the current secciones-only write contract", () => {
  const { payload } = buildSectionMutationWritePayload({
    secciones: [
      { id: "sec-1", altura: 300, altoModo: "fijo", orden: 1 },
      { id: "sec-2", altura: 300, altoModo: "fijo", orden: 0 },
    ],
    reason: "section-reorder",
    ALTURA_PANTALLA_EDITOR: 500,
    createTimestamp: () => "ts",
  });

  assert.equal(payload.draftContentMeta.lastReason, "section-reorder");
  assert.equal(payload.ultimaEdicion, "ts");
  assert.equal("objetos" in payload, false);
});

test("section delete payload preserves the current secciones plus objetos contract", () => {
  const { payload } = buildSectionMutationWritePayload({
    secciones: [{ id: "sec-2", altura: 300, altoModo: "fijo", orden: 0 }],
    objetos: [{ id: "obj-1", tipo: "texto", seccionId: "sec-2", y: 20 }],
    reason: "section-delete",
    includeObjetos: true,
    ALTURA_PANTALLA_EDITOR: 500,
    createTimestamp: () => "ts",
  });

  assert.equal(payload.draftContentMeta.lastReason, "section-delete");
  assert.equal(payload.objetos.length, 1);
  assert.equal(payload.objetos[0].seccionId, "sec-2");
});

test("delayed section mutation persists only while the captured snapshot is still current", () => {
  const nextSecciones = [{ id: "sec-1" }];
  const nextObjetos = [{ id: "obj-1" }];

  assert.equal(
    shouldPersistSectionMutationSnapshot({
      currentSecciones: nextSecciones,
      currentObjetos: nextObjetos,
      nextSecciones,
      nextObjetos,
    }),
    true
  );

  assert.equal(
    shouldPersistSectionMutationSnapshot({
      currentSecciones: [{ id: "sec-1" }],
      currentObjetos: nextObjetos,
      nextSecciones,
      nextObjetos,
    }),
    false
  );
});
