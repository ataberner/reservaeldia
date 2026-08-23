import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAuthoringSchema } from "./model.js";
import { validateAuthoringState } from "./validation.js";

const groupedObjects = [
  {
    id: "group-hero",
    tipo: "grupo",
    children: [
      {
        id: "grouped-primary-name",
        tipo: "texto",
        texto: "Sofia",
      },
    ],
  },
];

const fieldsSchema = [
  {
    key: "event_primary_person_name",
    label: "Primera persona",
    type: "text",
    group: "Datos principales",
    applyTargets: [
      {
        scope: "objeto",
        id: "grouped-primary-name",
        path: "texto",
        mode: "set",
      },
    ],
  },
];

test("authoring validation accepts targets inside preserved groups", () => {
  const status = validateAuthoringState({
    fieldsSchema,
    defaults: {
      event_primary_person_name: "Sofia",
    },
    objetos: groupedObjects,
  });

  assert.equal(status.isReady, true);
  assert.deepEqual(status.issues, []);
});

test("authoring schema repair keeps grouped-child targets", () => {
  const repaired = sanitizeAuthoringSchema({
    fieldsSchema,
    defaults: {
      event_primary_person_name: "Sofia",
    },
    objetos: groupedObjects,
    dropOrphans: true,
  });

  assert.equal(repaired.changed, false);
  assert.equal(repaired.fieldsSchema[0].applyTargets[0].id, "grouped-primary-name");
});

test("authoring validation rejects duplicate identities before they can alias targets", () => {
  const status = validateAuthoringState({
    fieldsSchema: [],
    defaults: {},
    objetos: [
      { id: "shared-text", tipo: "texto", texto: "Ceremonia" },
      { id: "shared-text", tipo: "texto", texto: "Fiesta" },
    ],
  });

  assert.equal(status.isReady, false);
  assert.deepEqual(status.issues, [
    "Elemento 'shared-text': id duplicado en objetos actuales.",
  ]);
});
