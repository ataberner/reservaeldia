import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildGroupedSelectionState,
  buildUngroupedSelectionState,
} from "../editor/grouping.js";

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadMotionEffectsModule() {
  const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
  const transformedSource = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"@\/domain\/sections\/backgrounds";/,
    `
      function normalizeSectionBackgroundModel(section) {
        return {
          decoraciones: Array.isArray(section?.decoracionesFondo?.items)
            ? section.decoracionesFondo.items
            : [],
          parallax: section?.decoracionesFondo?.parallax || "none",
        };
      }
      function buildSectionDecorationsPayload(value) { return value; }
    `
  );

  assert.notEqual(transformedSource, source, "the backgrounds import must be stubbed");
  return import(toDataUrl(transformedSource));
}

const motionEffectsModulePromise = loadMotionEffectsModule();

const FIXED_SECTIONS = [
  { id: "hero", orden: 1, altoModo: "fijo", altura: 600 },
  { id: "details", orden: 2, altoModo: "fijo", altura: 600 },
];

test("global presets cover every current standalone render-object family", async () => {
  const { applyGlobalMotionPreset } = await motionEffectsModulePromise;
  const objetos = [
    { id: "text", tipo: "texto", seccionId: "details", fontSize: 24, width: 180 },
    { id: "image", tipo: "imagen", seccionId: "details", width: 120, height: 90 },
    { id: "icon", tipo: "icono", seccionId: "details", width: 48, height: 48 },
    {
      id: "line",
      tipo: "forma",
      figura: "line",
      seccionId: "details",
      points: [0, 0, 160, 0],
      strokeWidth: 2,
    },
    {
      id: "shape",
      tipo: "forma",
      figura: "star",
      seccionId: "details",
      width: 80,
      height: 80,
    },
    { id: "gallery", tipo: "galeria", seccionId: "details", width: 240, height: 160 },
    { id: "countdown", tipo: "countdown", seccionId: "details", width: 240, height: 96 },
    { id: "rsvp", tipo: "rsvp-boton", seccionId: "details", width: 220, height: 54 },
    { id: "gift", tipo: "regalo-boton", seccionId: "details", width: 220, height: 54 },
    { id: "map", tipo: "mapa-google", seccionId: "details", width: 361, height: 220 },
  ];

  const next = applyGlobalMotionPreset(objetos, {
    presetId: "soft_elegant",
    secciones: FIXED_SECTIONS,
  });
  const effectsById = Object.fromEntries(next.map((object) => [object.id, object.motionEffect]));

  assert.deepEqual(effectsById, {
    text: "reveal",
    image: "reveal",
    icon: "reveal",
    line: "draw",
    shape: "reveal",
    gallery: "reveal",
    countdown: "pulse",
    rsvp: "rsvp",
    gift: "rsvp",
    map: "reveal",
  });
});

test("global presets assign effects to individual group children without adding root layout fields", async () => {
  const { applyGlobalMotionPreset, summarizeMotionEffectChanges } =
    await motionEffectsModulePromise;
  const objetos = [
    {
      id: "group-details",
      tipo: "grupo",
      seccionId: "details",
      anclaje: "content",
      x: 80,
      y: 120,
      width: 420,
      height: 240,
      children: [
        { id: "title", tipo: "texto", x: 0, y: 0, width: 220, fontSize: 32 },
        { id: "image", tipo: "imagen", x: 230, y: 0, width: 120, height: 90 },
        { id: "icon", tipo: "icono", x: 360, y: 0, width: 48, height: 48 },
        {
          id: "line",
          tipo: "forma",
          figura: "line",
          x: 0,
          y: 70,
          points: [0, 0, 160, 0],
          strokeWidth: 2,
        },
        { id: "star", tipo: "forma", figura: "star", x: 260, y: 0, width: 80, height: 80 },
        { id: "gallery", tipo: "galeria", x: 0, y: 100, width: 240, height: 120 },
        { id: "countdown", tipo: "countdown", x: 250, y: 100, width: 240, height: 96 },
        { id: "cta", tipo: "rsvp-boton", x: 0, y: 120, width: 220, height: 54 },
        { id: "gift", tipo: "regalo-boton", x: 0, y: 180, width: 220, height: 54 },
        { id: "map", tipo: "mapa-google", x: 240, y: 100, width: 180, height: 140 },
      ],
    },
  ];

  const next = applyGlobalMotionPreset(objetos, {
    presetId: "soft_elegant",
    secciones: FIXED_SECTIONS,
  });
  const group = next[0];

  assert.equal(group.tipo, "grupo");
  assert.equal(group.motionEffect, "none");
  assert.deepEqual(
    group.children.map((child) => [child.id, child.motionEffect]),
    [
      ["title", "reveal"],
      ["image", "reveal"],
      ["icon", "reveal"],
      ["line", "draw"],
      ["star", "reveal"],
      ["gallery", "reveal"],
      ["countdown", "pulse"],
      ["cta", "rsvp"],
      ["gift", "rsvp"],
      ["map", "reveal"],
    ]
  );
  group.children.forEach((child) => {
    assert.equal("seccionId" in child, false);
    assert.equal("anclaje" in child, false);
    assert.equal("yNorm" in child, false);
  });
  assert.deepEqual(summarizeMotionEffectChanges(objetos, next), {
    total: 10,
    changed: 10,
  });
});

test("clear-all clears group children and reports individual changes", async () => {
  const { clearAllMotionEffects, summarizeMotionEffectChanges } =
    await motionEffectsModulePromise;
  const objetos = [
    {
      id: "group",
      tipo: "grupo",
      seccionId: "details",
      motionEffect: "zoom",
      children: [
        { id: "image", tipo: "imagen", x: 0, y: 0, motionEffect: "zoom" },
        { id: "caption", tipo: "texto", x: 0, y: 80, motionEffect: "reveal" },
      ],
    },
    { id: "standalone", tipo: "icono", seccionId: "details", motionEffect: "hover" },
  ];

  const next = clearAllMotionEffects(objetos);

  assert.equal(next[0].motionEffect, "none");
  assert.deepEqual(next[0].children.map((child) => child.motionEffect), ["none", "none"]);
  assert.equal(next[1].motionEffect, "none");
  assert.deepEqual(summarizeMotionEffectChanges(objetos, next), {
    total: 3,
    changed: 3,
  });
});

test("grouping and ungrouping preserve each element motion effect", () => {
  const grouped = buildGroupedSelectionState({
    objetos: [
      {
        id: "image",
        tipo: "imagen",
        seccionId: "details",
        x: 40,
        y: 80,
        width: 180,
        height: 120,
        motionEffect: "zoom",
      },
      {
        id: "caption",
        tipo: "texto",
        seccionId: "details",
        x: 48,
        y: 220,
        width: 220,
        height: 32,
        motionEffect: "reveal",
      },
    ],
    secciones: FIXED_SECTIONS,
    selectedIds: ["image", "caption"],
    selectionFrame: { x: 40, y: 680, width: 228, height: 172 },
    groupId: "group-motion",
  });

  assert.equal(grouped.ok, true);
  assert.deepEqual(
    grouped.group.children.map((child) => [child.id, child.motionEffect]),
    [
      ["image", "zoom"],
      ["caption", "reveal"],
    ]
  );

  const ungrouped = buildUngroupedSelectionState({
    objetos: grouped.nextObjetos,
    secciones: FIXED_SECTIONS,
    selectedIds: ["group-motion"],
  });

  assert.equal(ungrouped.ok, true);
  assert.deepEqual(
    ungrouped.restoredChildren.map((child) => [child.id, child.motionEffect]),
    [
      ["image", "zoom"],
      ["caption", "reveal"],
    ]
  );
});
