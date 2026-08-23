import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneRenderObjectWithFreshIdentity,
  collectDuplicateRenderObjectIds,
  collectRenderObjectIds,
  findRenderObjectById,
  updateRenderObjectById,
} from "./renderObjectTree.js";

test("render object tree helpers include preserved group children", () => {
  const objetos = [
    { id: "root-title", tipo: "texto", texto: "Root" },
    {
      id: "group-hero",
      tipo: "grupo",
      children: [
        { id: "child-primary", tipo: "texto", texto: "Sofia" },
        { id: "child-secondary", tipo: "texto", texto: "Mateo" },
      ],
    },
  ];

  assert.equal(findRenderObjectById(objetos, "child-secondary")?.texto, "Mateo");
  assert.deepEqual(Array.from(collectRenderObjectIds(objetos)).sort(), [
    "child-primary",
    "child-secondary",
    "group-hero",
    "root-title",
  ]);
});

test("updateRenderObjectById patches a grouped child without ungrouping it", () => {
  const objetos = [
    {
      id: "group-hero",
      tipo: "grupo",
      x: 80,
      y: 120,
      children: [
        { id: "child-primary", tipo: "texto", texto: "Sofia", x: 4, y: 8 },
        { id: "child-secondary", tipo: "texto", texto: "Mateo", x: 64, y: 8 },
      ],
    },
  ];

  const result = updateRenderObjectById(objetos, "child-primary", (object) => ({
    ...object,
    texto: "Mara",
  }));

  assert.equal(result.changed, true);
  assert.equal(result.objetos.length, 1);
  assert.equal(result.objetos[0].id, "group-hero");
  assert.equal(result.objetos[0].children[0].texto, "Mara");
  assert.equal(result.objetos[0].children[1], objetos[0].children[1]);
});

test("cloning a preserved group assigns fresh identities to the root and every child", () => {
  const identities = ["group-copy", "child-primary-copy", "child-secondary-copy"];
  const original = {
    id: "group-original",
    tipo: "grupo",
    x: 80,
    y: 120,
    children: [
      { id: "child-primary", tipo: "texto", texto: "Ceremonia", x: 4, y: 8 },
      { id: "child-secondary", tipo: "texto", texto: "Fiesta", x: 64, y: 8 },
    ],
  };

  const cloned = cloneRenderObjectWithFreshIdentity(original, {
    createIdentity: () => identities.shift(),
  });

  assert.equal(cloned.id, "group-copy");
  assert.deepEqual(
    cloned.children.map((child) => child.id),
    ["child-primary-copy", "child-secondary-copy"]
  );
  assert.deepEqual(
    cloned.children.map((child) => child.texto),
    ["Ceremonia", "Fiesta"]
  );
  assert.equal(original.id, "group-original");
  assert.deepEqual(
    original.children.map((child) => child.id),
    ["child-primary", "child-secondary"]
  );
});

test("duplicate render identities are detected across roots and preserved-group children", () => {
  const duplicateIds = collectDuplicateRenderObjectIds([
    { id: "shared-title", tipo: "texto", texto: "Ceremonia" },
    {
      id: "group-details",
      tipo: "grupo",
      children: [
        { id: "shared-title", tipo: "texto", texto: "Fiesta" },
        { id: "shared-address", tipo: "texto", texto: "Direccion A" },
        { id: "shared-address", tipo: "texto", texto: "Direccion B" },
      ],
    },
  ]);

  assert.deepEqual(Array.from(duplicateIds).sort(), ["shared-address", "shared-title"]);
});
