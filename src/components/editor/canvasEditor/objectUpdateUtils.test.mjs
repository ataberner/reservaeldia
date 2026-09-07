import test from "node:test";
import assert from "node:assert/strict";

import { applyObjectUpdateById } from "./objectUpdateUtils.js";

test("applyObjectUpdateById updates a preserved group child by id", () => {
  const objetos = [
    {
      id: "group-hero",
      tipo: "grupo",
      children: [
        {
          id: "grouped-primary-name",
          tipo: "texto",
          texto: "Sofia",
        },
        {
          id: "grouped-secondary-name",
          tipo: "texto",
          texto: "Mateo",
        },
      ],
    },
  ];

  const next = applyObjectUpdateById(objetos, "grouped-primary-name", {
    texto: "Mara",
  });

  assert.notEqual(next, objetos);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "group-hero");
  assert.equal(next[0].children[0].texto, "Mara");
  assert.equal(next[0].children[1], objetos[0].children[1]);
});

test("root text and geometry updates preserve its standalone functional association", () => {
  const objetos = [
    {
      id: "ceremony-title",
      tipo: "texto",
      seccionId: "shared",
      x: 80,
      y: 40,
      texto: "Ceremonia",
      fontFamily: "Cormorant Garamond",
      functionalAssociation: "ceremony",
      applyTargets: [{ id: "ceremony-title", path: "texto" }],
    },
  ];

  const next = applyObjectUpdateById(objetos, "ceremony-title", {
    x: 140,
    texto: "Nuestra ceremonia",
    fontFamily: "Montserrat",
  });

  assert.equal(next[0].x, 140);
  assert.equal(next[0].texto, "Nuestra ceremonia");
  assert.equal(next[0].fontFamily, "Montserrat");
  assert.equal(next[0].functionalAssociation, "ceremony");
  assert.deepEqual(next[0].applyTargets, objetos[0].applyTargets);
});
