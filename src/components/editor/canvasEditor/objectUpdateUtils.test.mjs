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
