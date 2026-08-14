import test from "node:test";
import assert from "node:assert/strict";
import {
  applyKeyboardNudgeToCanvasSelection,
  canonicalizeFinalizedDragPatch,
  resolveCanvasKeyboardNudgeIntent,
} from "./canvasObjectPositioning.js";

const sections = [
  { id: "fixed", orden: 0, altura: 100, altoModo: "fijo" },
  { id: "screen", orden: 1, altura: 100, altoModo: "pantalla" },
];

function calcularOffsetY(seccionesOrdenadas, index) {
  return seccionesOrdenadas
    .slice(0, index)
    .reduce((total, section) => total + section.altura, 0);
}

function convertirAbsARel(yAbs, sectionId, seccionesOrdenadas) {
  const index = seccionesOrdenadas.findIndex((section) => section.id === sectionId);
  return index < 0 ? yAbs : yAbs - calcularOffsetY(seccionesOrdenadas, index);
}

function determinarNuevaSeccion(yAbs, currentSectionId, seccionesOrdenadas) {
  let offsetY = 0;
  for (const section of seccionesOrdenadas) {
    if (yAbs >= offsetY && yAbs < offsetY + section.altura) {
      if (section.id === currentSectionId) {
        return { nuevaSeccion: null, coordenadasAjustadas: {} };
      }
      return {
        nuevaSeccion: section.id,
        coordenadasAjustadas: { y: yAbs - offsetY },
      };
    }
    offsetY += section.altura;
  }

  if (yAbs < 0) {
    return {
      nuevaSeccion: seccionesOrdenadas[0].id,
      coordenadasAjustadas: { y: 0 },
    };
  }

  const lastSection = seccionesOrdenadas[seccionesOrdenadas.length - 1];
  return {
    nuevaSeccion: lastSection.id,
    coordenadasAjustadas: { y: lastSection.altura - 50 },
  };
}

function esSeccionPantallaById(sectionId, sourceSections = sections) {
  return sourceSections.find((section) => section.id === sectionId)?.altoModo === "pantalla";
}

function applyNudge({
  objetos,
  selectedIds = ["selected"],
  deltaX = 0,
  deltaY = 0,
  seccionesOrdenadas = sections,
} = {}) {
  return applyKeyboardNudgeToCanvasSelection({
    objetos,
    selectedIds,
    seccionesOrdenadas,
    deltaX,
    deltaY,
    calcularOffsetY,
    determinarNuevaSeccion,
    convertirAbsARel,
    esSeccionPantallaById: (sectionId) =>
      esSeccionPantallaById(sectionId, seccionesOrdenadas),
    ALTURA_PANTALLA_EDITOR: 500,
  });
}

test("resolves one-pixel keyboard nudge intents only for an accepted canvas selection", () => {
  assert.deepEqual(
    resolveCanvasKeyboardNudgeIntent({ key: "ArrowLeft", canMoveSelection: true }),
    { deltaX: -1, deltaY: 0 }
  );
  assert.deepEqual(
    resolveCanvasKeyboardNudgeIntent({ key: "ArrowRight", canMoveSelection: true }),
    { deltaX: 1, deltaY: 0 }
  );
  assert.deepEqual(
    resolveCanvasKeyboardNudgeIntent({ key: "ArrowUp", canMoveSelection: true }),
    { deltaX: 0, deltaY: -1 }
  );
  assert.deepEqual(
    resolveCanvasKeyboardNudgeIntent({ key: "ArrowDown", canMoveSelection: true }),
    { deltaX: 0, deltaY: 1 }
  );

  assert.equal(
    resolveCanvasKeyboardNudgeIntent({ key: "ArrowDown", canMoveSelection: false }),
    null
  );
  assert.equal(
    resolveCanvasKeyboardNudgeIntent({
      key: "ArrowDown",
      canMoveSelection: true,
      isTyping: true,
    }),
    null
  );
  assert.equal(
    resolveCanvasKeyboardNudgeIntent({
      key: "ArrowDown",
      canMoveSelection: true,
      isEditing: true,
    }),
    null
  );
  assert.equal(
    resolveCanvasKeyboardNudgeIntent({
      key: "ArrowDown",
      canMoveSelection: true,
      defaultPrevented: true,
    }),
    null
  );
  assert.equal(
    resolveCanvasKeyboardNudgeIntent({ key: "PageDown", canMoveSelection: true }),
    null
  );
});

test("moves the single selected object in fixed-section local coordinates", () => {
  const objetos = [
    { id: "selected", tipo: "texto", seccionId: "fixed", x: 20, y: 30 },
    { id: "other", tipo: "imagen", seccionId: "fixed", x: 60, y: 70 },
  ];

  const right = applyNudge({ objetos, deltaX: 1 });
  assert.equal(right.changed, true);
  assert.equal(right.objetos[0].x, 21);
  assert.equal(right.objetos[0].y, 30);
  assert.strictEqual(right.objetos[1], objetos[1]);

  const up = applyNudge({ objetos: right.objetos, deltaY: -1 });
  assert.equal(up.objetos[0].x, 21);
  assert.equal(up.objetos[0].y, 29);
});

test("does not mutate or claim movement without exactly one selected root object", () => {
  const objetos = [
    { id: "selected", tipo: "texto", seccionId: "fixed", x: 20, y: 30 },
    { id: "other", tipo: "imagen", seccionId: "fixed", x: 60, y: 70 },
  ];

  const empty = applyNudge({ objetos, selectedIds: [], deltaY: 1 });
  assert.equal(empty.changed, false);
  assert.strictEqual(empty.objetos, objetos);

  const multiple = applyNudge({
    objetos,
    selectedIds: ["selected", "other"],
    deltaY: 1,
  });
  assert.equal(multiple.changed, false);
  assert.strictEqual(multiple.objetos, objetos);

  const nestedOrMissing = applyNudge({
    objetos,
    selectedIds: ["missing"],
    deltaY: 1,
  });
  assert.equal(nestedOrMissing.changed, false);
  assert.strictEqual(nestedOrMissing.objetos, objetos);
});

test("uses yNorm as the screen-section visual authority", () => {
  const objetos = [
    {
      id: "selected",
      tipo: "texto",
      seccionId: "screen",
      x: 20,
      y: 7,
      yNorm: 0.5,
    },
  ];

  const result = applyNudge({ objetos, deltaY: 1 });
  assert.equal(result.changed, true);
  assert.equal(result.objetos[0].yNorm, 0.502);
  assert.equal(result.objetos[0].y, 7);
});

test("reuses drag finalization when an arrow crosses a section boundary", () => {
  const objetos = [
    { id: "selected", tipo: "imagen", seccionId: "fixed", x: 20, y: 99 },
  ];

  const result = applyNudge({ objetos, deltaY: 1 });
  assert.equal(result.changed, true);
  assert.equal(result.objetos[0].seccionId, "screen");
  assert.equal(result.objetos[0].yNorm, 0);
});

test("does not move into a protected destination section", () => {
  const protectedSections = [
    sections[0],
    { ...sections[1], bloqueada: true },
  ];
  const objetos = [
    { id: "selected", tipo: "imagen", seccionId: "fixed", x: 20, y: 99 },
  ];

  const result = applyNudge({
    objetos,
    deltaY: 1,
    seccionesOrdenadas: protectedSections,
  });
  assert.equal(result.changed, false);
  assert.strictEqual(result.objetos, objetos);
});

test("keeps the shared drag canonicalizer stable after extraction", () => {
  const patch = canonicalizeFinalizedDragPatch({
    objOriginal: {
      id: "selected",
      tipo: "texto",
      seccionId: "screen",
      x: 20,
      y: 30,
      yNorm: 0.06,
    },
    dragPatch: { x: 25, y: 150, finalizoDrag: true },
    seccionesOrdenadas: sections,
    determinarNuevaSeccion,
    convertirAbsARel,
    esSeccionPantallaById: (sectionId) => esSeccionPantallaById(sectionId),
    ALTURA_PANTALLA_EDITOR: 500,
  });

  assert.deepEqual(patch, { x: 25, yNorm: 0.1 });
});
