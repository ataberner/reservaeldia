import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroupedSelectionState,
  resolveMultiSelectionMenuCandidate,
  buildUngroupedSelectionState,
  resolveGroupingSelectionCandidate,
  resolveUngroupSelectionCandidate,
} from "./grouping.js";

function createPantallaSection(id = "hero") {
  return {
    id,
    orden: 0,
    altura: 500,
    altoModo: "pantalla",
  };
}

function createFixedSection(id = "details") {
  return {
    id,
    orden: 0,
    altura: 600,
    altoModo: "fijo",
  };
}

test("builds a preserved pantalla group from 5 selected root objects in root order", () => {
  const result = buildGroupedSelectionState({
    objetos: [
      {
        id: "star",
        tipo: "forma",
        figura: "star",
        seccionId: "hero",
        anclaje: "content",
        x: 100,
        y: 80,
        yNorm: 0.16,
        width: 120,
        height: 120,
        color: "#f0d36a",
      },
      {
        id: "copy",
        tipo: "texto",
        seccionId: "hero",
        anclaje: "content",
        x: 128,
        y: 118,
        yNorm: 0.236,
        width: 220,
        texto: "Celebremos juntos",
        fontSize: 30,
      },
      {
        id: "photo",
        tipo: "imagen",
        seccionId: "hero",
        anclaje: "content",
        x: 260,
        y: 120,
        yNorm: 0.24,
        width: 110,
        height: 82,
        src: "https://cdn.example.com/photo.jpg",
      },
      {
        id: "icon",
        tipo: "icono",
        seccionId: "hero",
        anclaje: "content",
        x: 72,
        y: 224,
        yNorm: 0.448,
        width: 36,
        height: 36,
        formato: "svg",
        paths: [{ d: "M0 0L10 0L5 10Z" }],
      },
      {
        id: "linea",
        tipo: "forma",
        figura: "line",
        seccionId: "hero",
        anclaje: "content",
        x: 96,
        y: 276,
        yNorm: 0.552,
        points: [0, 0, 180, 0],
        strokeWidth: 4,
        color: "#000000",
      },
    ],
    secciones: [createPantallaSection()],
    selectedIds: ["photo", "linea", "star", "icon", "copy"],
    selectionFrame: {
      x: 72,
      y: 80,
      width: 298,
      height: 200,
    },
    alturaPantalla: 500,
    groupId: "group-hero",
  });

  assert.equal(result.ok, true);
  assert.equal(result.group.id, "group-hero");
  assert.equal(result.group.tipo, "grupo");
  assert.equal(result.group.seccionId, "hero");
  assert.equal(result.group.anclaje, "content");
  assert.equal(result.group.x, 72);
  assert.equal(result.group.y, 80);
  assert.equal(result.group.yNorm, 0.16);
  assert.equal(result.group.children.length, 5);
  assert.deepEqual(
    result.group.children.map((entry) => entry.id),
    ["star", "copy", "photo", "icon", "linea"]
  );
  assert.equal(result.group.children[0].x, 28);
  assert.equal(result.group.children[0].y, 0);
  assert.equal(result.group.children[1].x, 56);
  assert.equal(result.group.children[1].y, 38);
  assert.equal(result.group.children[2].x, 188);
  assert.equal(result.group.children[2].y, 40);
  assert.equal(result.group.children[3].x, 0);
  assert.equal(result.group.children[3].y, 144);
  assert.equal(result.group.children[4].x, 24);
  assert.equal(result.group.children[4].y, 196);
  assert.equal("seccionId" in result.group.children[0], false);
  assert.equal("anclaje" in result.group.children[1], false);
  assert.equal("yNorm" in result.group.children[4], false);
  assert.deepEqual(result.selectedIds, ["group-hero"]);
});

test("groups a sparse fixed-section multiselection by removing only selected roots and inserting once at the first selected index", () => {
  const result = buildGroupedSelectionState({
    objetos: [
      {
        id: "headline",
        tipo: "texto",
        seccionId: "details",
        x: 40,
        y: 24,
        width: 180,
        texto: "Antes",
      },
      {
        id: "image",
        tipo: "imagen",
        seccionId: "details",
        x: 80,
        y: 140,
        width: 120,
        height: 90,
        src: "https://cdn.example.com/photo.jpg",
      },
      {
        id: "note",
        tipo: "texto",
        seccionId: "details",
        x: 260,
        y: 156,
        width: 140,
        texto: "Intercalado",
      },
      {
        id: "icon",
        tipo: "icono",
        seccionId: "details",
        x: 96,
        y: 252,
        width: 32,
        height: 32,
        formato: "svg",
        paths: [{ d: "M0 0L10 0L5 10Z" }],
      },
      {
        id: "caption",
        tipo: "texto",
        seccionId: "details",
        x: 92,
        y: 246,
        width: 200,
        texto: "Ceremonia al aire libre",
      },
      {
        id: "after",
        tipo: "texto",
        seccionId: "details",
        x: 40,
        y: 320,
        width: 180,
        texto: "Despues",
      },
    ],
    secciones: [createFixedSection()],
    selectedIds: ["caption", "image", "icon"],
    selectionFrame: {
      x: 80,
      y: 140,
      width: 212,
      height: 144,
    },
    groupId: "group-details",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.nextObjetos.map((entry) => entry.id),
    ["headline", "group-details", "note", "after"]
  );
  assert.equal("yNorm" in result.group, false);
  assert.deepEqual(
    result.group.children.map((entry) => entry.id),
    ["image", "icon", "caption"]
  );
  assert.equal(result.group.children[0].x, 0);
  assert.equal(result.group.children[0].y, 0);
  assert.equal(result.group.children[1].x, 16);
  assert.equal(result.group.children[1].y, 112);
  assert.equal(result.group.children[2].x, 12);
  assert.equal(result.group.children[2].y, 106);
  assert.equal(
    result.nextObjetos.some((entry) => ["image", "icon", "caption"].includes(entry.id)),
    false
  );
  assert.deepEqual(result.selectedIds, ["group-details"]);
});

test("groups countdown and gallery objects with other supported roots using the same preserved-group contract", () => {
  const result = buildGroupedSelectionState({
    objetos: [
      {
        id: "headline",
        tipo: "texto",
        seccionId: "details",
        anclaje: "content",
        x: 36,
        y: 40,
        width: 180,
        texto: "Faltan",
        fontSize: 28,
      },
      {
        id: "timer",
        tipo: "countdown",
        seccionId: "details",
        anclaje: "content",
        x: 180,
        y: 32,
        width: 240,
        height: 96,
        fechaObjetivo: "2026-08-15T20:00:00.000Z",
        countdownSchemaVersion: 2,
        visibleUnits: ["days", "hours", "minutes"],
        frameSvgUrl: "https://cdn.example.com/frame.svg",
      },
      {
        id: "gallery",
        tipo: "galeria",
        seccionId: "details",
        anclaje: "content",
        x: 68,
        y: 164,
        width: 220,
        height: 132,
        rows: 1,
        cols: 2,
        gap: 8,
        cells: [
          { mediaUrl: "https://cdn.example.com/gallery-1.jpg" },
          { mediaUrl: "https://cdn.example.com/gallery-2.jpg" },
        ],
      },
    ],
    secciones: [createFixedSection()],
    selectedIds: ["gallery", "headline", "timer"],
    selectionFrame: {
      x: 36,
      y: 32,
      width: 384,
      height: 264,
    },
    groupId: "group-rich-media",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.nextObjetos.map((entry) => entry.id), ["group-rich-media"]);
  assert.deepEqual(
    result.group.children.map((entry) => entry.id),
    ["headline", "timer", "gallery"]
  );
  assert.equal(result.group.children[1].tipo, "countdown");
  assert.equal(result.group.children[2].tipo, "galeria");
  assert.equal(result.group.children[1].x, 144);
  assert.equal(result.group.children[1].y, 0);
  assert.equal(result.group.children[2].x, 32);
  assert.equal(result.group.children[2].y, 132);
  assert.equal(result.group.children[1].countdownSchemaVersion, 2);
  assert.equal(Array.isArray(result.group.children[2].cells), true);
  assert.equal("seccionId" in result.group.children[1], false);
  assert.equal("anclaje" in result.group.children[2], false);
  assert.deepEqual(result.selectedIds, ["group-rich-media"]);
});

test("preserves child ordering by root objetos order instead of selected id order", () => {
  const selection = resolveGroupingSelectionCandidate({
    objetos: [
      { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
      { id: "b", tipo: "imagen", seccionId: "sec-1", x: 0, y: 0, width: 100, height: 80, src: "https://cdn.example.com/b.jpg" },
      { id: "c", tipo: "icono", seccionId: "sec-1", x: 0, y: 0, width: 24, height: 24, formato: "svg", paths: [{ d: "M0 0L10 0L5 10Z" }] },
      { id: "d", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "D" },
    ],
    selectedIds: ["d", "b", "a"],
  });

  assert.equal(selection.eligible, true);
  assert.deepEqual(
    selection.selectedObjects.map((entry) => entry.id),
    ["a", "b", "d"]
  );
  assert.deepEqual(selection.selectedIndices, [0, 1, 3]);
});

test("multi-selection menu stays eligible for a root group mixed with another root object even when grouping is not", () => {
  const objetos = [
    {
      id: "group-a",
      tipo: "grupo",
      seccionId: "sec-1",
      anclaje: "content",
      x: 40,
      y: 60,
      width: 120,
      height: 80,
      children: [
        { id: "child-a", tipo: "texto", x: 0, y: 0, width: 100, texto: "Hola" },
      ],
    },
    {
      id: "icon-b",
      tipo: "icono",
      seccionId: "sec-1",
      anclaje: "content",
      x: 220,
      y: 88,
      width: 28,
      height: 28,
      formato: "svg",
      paths: [{ d: "M0 0L10 0L5 10Z" }],
    },
  ];

  const menuSelection = resolveMultiSelectionMenuCandidate({
    objetos,
    selectedIds: ["icon-b", "group-a"],
  });
  const groupingSelection = resolveGroupingSelectionCandidate({
    objetos,
    selectedIds: ["icon-b", "group-a"],
  });

  assert.equal(menuSelection.eligible, true);
  assert.deepEqual(
    menuSelection.selectedObjects.map((entry) => entry.id),
    ["group-a", "icon-b"]
  );
  assert.equal(groupingSelection.eligible, false);
  assert.equal(groupingSelection.reason, "unsupported-object-family");
});

test("keeps negative local child coordinates when the live group frame starts after an authored child origin", () => {
  const result = buildGroupedSelectionState({
    objetos: [
      {
        id: "copy",
        tipo: "texto",
        seccionId: "hero",
        anclaje: "content",
        x: 100,
        y: 90,
        yNorm: 0.18,
        width: 180,
        texto: "Texto centrado",
      },
      {
        id: "ornament",
        tipo: "icono",
        seccionId: "hero",
        anclaje: "content",
        x: 152,
        y: 120,
        yNorm: 0.24,
        width: 28,
        height: 28,
        formato: "svg",
        paths: [{ d: "M0 0L10 0L5 10Z" }],
      },
    ],
    secciones: [createPantallaSection()],
    selectedIds: ["copy", "ornament"],
    selectionFrame: {
      x: 110,
      y: 96,
      width: 120,
      height: 60,
    },
    alturaPantalla: 500,
    groupId: "group-negative-offsets",
  });

  assert.equal(result.ok, true);
  assert.equal(result.group.children[0].x, -10);
  assert.equal(result.group.children[0].y, -6);
  assert.equal(result.group.children[1].x, 42);
  assert.equal(result.group.children[1].y, 24);
});

test("groups pantalla objects using yNorm as the visual Y authority when raw y is stale", () => {
  const result = buildGroupedSelectionState({
    objetos: [
      {
        id: "title",
        tipo: "texto",
        seccionId: "hero",
        anclaje: "content",
        x: 40,
        y: 100,
        yNorm: 0.4,
        width: 180,
        texto: "Titulo",
      },
      {
        id: "subtitle",
        tipo: "texto",
        seccionId: "hero",
        anclaje: "content",
        x: 52,
        y: 132,
        yNorm: 0.52,
        width: 200,
        texto: "Subtitulo",
      },
    ],
    secciones: [createPantallaSection()],
    selectedIds: ["subtitle", "title"],
    selectionFrame: {
      x: 40,
      y: 200,
      width: 212,
      height: 120,
    },
    alturaPantalla: 500,
    groupId: "group-pantalla-authority",
  });

  assert.equal(result.ok, true);
  assert.equal(result.group.y, 200);
  assert.equal(result.group.yNorm, 0.4);
  assert.deepEqual(
    result.group.children.map((entry) => ({ id: entry.id, y: entry.y })),
    [
      { id: "title", y: 0 },
      { id: "subtitle", y: 60 },
    ]
  );
});

test("ungroups a fixed-section preserved group back into root objects at the original index", () => {
  const result = buildUngroupedSelectionState({
    objetos: [
      {
        id: "before",
        tipo: "texto",
        seccionId: "details",
        x: 24,
        y: 20,
        width: 120,
        texto: "Antes",
      },
      {
        id: "group-details",
        tipo: "grupo",
        seccionId: "details",
        anclaje: "content",
        x: 80,
        y: 140,
        width: 212,
        height: 144,
        children: [
          {
            id: "image",
            tipo: "imagen",
            x: 0,
            y: 0,
            width: 120,
            height: 90,
            src: "https://cdn.example.com/photo.jpg",
          },
          {
            id: "icon",
            tipo: "icono",
            x: 16,
            y: 112,
            width: 32,
            height: 32,
            formato: "svg",
            paths: [{ d: "M0 0L10 0L5 10Z" }],
          },
          {
            id: "caption",
            tipo: "texto",
            x: 12,
            y: 106,
            width: 200,
            texto: "Ceremonia al aire libre",
          },
        ],
      },
      {
        id: "after",
        tipo: "texto",
        seccionId: "details",
        x: 40,
        y: 320,
        width: 180,
        texto: "Despues",
      },
    ],
    secciones: [createFixedSection()],
    selectedIds: ["group-details"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.nextObjetos.map((entry) => entry.id),
    ["before", "image", "icon", "caption", "after"]
  );
  assert.equal(result.nextObjetos[1].x, 80);
  assert.equal(result.nextObjetos[1].y, 140);
  assert.equal(result.nextObjetos[2].x, 96);
  assert.equal(result.nextObjetos[2].y, 252);
  assert.equal(result.nextObjetos[3].x, 92);
  assert.equal(result.nextObjetos[3].y, 246);
  assert.equal(result.nextObjetos[1].seccionId, "details");
  assert.equal(result.nextObjetos[2].anclaje, "content");
  assert.equal("yNorm" in result.nextObjetos[1], false);
  assert.deepEqual(result.selectedIds, ["image", "icon", "caption"]);
});

test("ungroups a pantalla preserved group and restores root yNorm from local child offsets", () => {
  const result = buildUngroupedSelectionState({
    objetos: [
      {
        id: "group-hero",
        tipo: "grupo",
        seccionId: "hero",
        anclaje: "content",
        x: 96,
        y: 180,
        yNorm: 0.36,
        width: 320,
        height: 128,
        children: [
          {
            id: "hero-copy-star",
            tipo: "forma",
            figura: "star",
            x: 0,
            y: 0,
            width: 120,
            height: 120,
            color: "#f0d36a",
          },
          {
            id: "hero-copy",
            tipo: "texto",
            x: 48,
            y: 40,
            width: 220,
            texto: "Celebremos juntos",
            fontSize: 30,
          },
        ],
      },
      {
        id: "below",
        tipo: "texto",
        seccionId: "hero",
        anclaje: "content",
        x: 120,
        y: 360,
        yNorm: 0.72,
        width: 160,
        texto: "Nos vemos",
      },
    ],
    secciones: [createPantallaSection()],
    selectedIds: ["group-hero"],
    alturaPantalla: 500,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.nextObjetos.map((entry) => entry.id),
    ["hero-copy-star", "hero-copy", "below"]
  );
  assert.equal(result.nextObjetos[0].x, 96);
  assert.equal(result.nextObjetos[0].y, 180);
  assert.equal(result.nextObjetos[0].yNorm, 0.36);
  assert.equal(result.nextObjetos[1].x, 144);
  assert.equal(result.nextObjetos[1].y, 220);
  assert.equal(result.nextObjetos[1].yNorm, 0.44);
  assert.equal(result.nextObjetos[1].seccionId, "hero");
  assert.equal(result.nextObjetos[1].anclaje, "content");
  assert.deepEqual(result.selectedIds, ["hero-copy-star", "hero-copy"]);
});

test("ungroups a pantalla group using root yNorm as the visual Y authority when raw y is stale", () => {
  const result = buildUngroupedSelectionState({
    objetos: [
      {
        id: "group-stale-y",
        tipo: "grupo",
        seccionId: "hero",
        anclaje: "content",
        x: 96,
        y: 120,
        yNorm: 0.36,
        width: 240,
        height: 120,
        children: [
          {
            id: "hero-title",
            tipo: "texto",
            x: 0,
            y: 0,
            width: 180,
            texto: "Hola",
          },
          {
            id: "hero-subtitle",
            tipo: "texto",
            x: 12,
            y: 40,
            width: 200,
            texto: "Nos vemos pronto",
          },
        ],
      },
    ],
    secciones: [createPantallaSection()],
    selectedIds: ["group-stale-y"],
    alturaPantalla: 500,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.nextObjetos.map((entry) => ({ id: entry.id, y: entry.y, yNorm: entry.yNorm })),
    [
      { id: "hero-title", y: 180, yNorm: 0.36 },
      { id: "hero-subtitle", y: 220, yNorm: 0.44 },
    ]
  );
});

test("rejects ungrouping malformed or unsupported root groups", () => {
  assert.equal(
    resolveUngroupSelectionCandidate({
      objetos: [
        {
          id: "group-link",
          tipo: "grupo",
          seccionId: "sec-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          enlace: { href: "https://example.com" },
          children: [{ id: "a", tipo: "texto", x: 0, y: 0, texto: "A" }],
        },
      ],
      secciones: [createFixedSection("sec-1")],
      selectedIds: ["group-link"],
    }).reason,
    "group-root-link-unsupported"
  );
  assert.equal(
    resolveUngroupSelectionCandidate({
      objetos: [
        {
          id: "group-nested",
          tipo: "grupo",
          seccionId: "sec-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [{ id: "nested", tipo: "grupo", x: 0, y: 0, width: 10, height: 10, children: [] }],
        },
      ],
      secciones: [createFixedSection("sec-1")],
      selectedIds: ["group-nested"],
    }).reason,
    "group-contract-invalid"
  );
  assert.equal(
    resolveUngroupSelectionCandidate({
      objetos: [
        {
          id: "group-empty",
          tipo: "grupo",
          seccionId: "sec-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [],
        },
      ],
      secciones: [createFixedSection("sec-1")],
      selectedIds: ["group-empty"],
    }).reason,
    "group-children-missing"
  );
  assert.equal(
    resolveUngroupSelectionCandidate({
      objetos: [
        {
          id: "group-child-root-fields",
          tipo: "grupo",
          seccionId: "sec-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [
            {
              id: "child-a",
              tipo: "texto",
              x: 0,
              y: 0,
              seccionId: "sec-1",
              texto: "A",
            },
          ],
        },
      ],
      secciones: [createFixedSection("sec-1")],
      selectedIds: ["group-child-root-fields"],
    }).reason,
    "group-contract-invalid"
  );
});

test("rejects mixed-section, mixed-anchor, missing-root, grouped, and unsupported selections", () => {
  assert.equal(
    resolveGroupingSelectionCandidate({
      objetos: [
        { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
        { id: "b", tipo: "texto", seccionId: "sec-2", x: 0, y: 0, width: 100, texto: "B" },
      ],
      selectedIds: ["a", "b"],
    }).reason,
    "selection-mixed-section"
  );
  assert.equal(
    resolveGroupingSelectionCandidate({
      objetos: [
        { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
        { id: "b", tipo: "texto", seccionId: "sec-1", anclaje: "fullbleed", x: 0, y: 0, width: 100, texto: "B" },
      ],
      selectedIds: ["a", "b"],
    }).reason,
    "selection-mixed-anchor"
  );
  assert.equal(
    resolveGroupingSelectionCandidate({
      objetos: [
        { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
      ],
      selectedIds: ["a", "missing"],
    }).reason,
    "selection-missing-root-object"
  );
  assert.equal(
    resolveGroupingSelectionCandidate({
      objetos: [
        { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
        {
          id: "b",
          tipo: "galeria",
          seccionId: "sec-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rows: 1,
          cols: 1,
          cells: [{ mediaUrl: "https://cdn.example.com/gallery.jpg" }],
        },
      ],
      selectedIds: ["a", "b"],
    }).eligible,
    true
  );
  assert.equal(
    resolveGroupingSelectionCandidate({
      objetos: [
        { id: "a", tipo: "texto", seccionId: "sec-1", x: 0, y: 0, width: 100, texto: "A" },
        { id: "b", tipo: "grupo", seccionId: "sec-1", x: 0, y: 0, width: 100, height: 100, children: [] },
      ],
      selectedIds: ["a", "b"],
    }).reason,
    "unsupported-object-family"
  );
});
