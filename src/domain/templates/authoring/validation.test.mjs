import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAuthoringSchema } from "./model.js";
import {
  resolveAuthoringValidationObjects,
  validateAuthoringState,
} from "./validation.js";

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

test("persistence validation uses the atomic render patch before stale state objects", () => {
  const staleStateObjects = [{ id: "unrelated", tipo: "texto" }];
  const validationObjects = resolveAuthoringValidationObjects({
    state: { objetos: staleStateObjects },
    renderPatch: { objetos: groupedObjects },
  });
  const status = validateAuthoringState({
    fieldsSchema,
    defaults: { event_primary_person_name: "Sofia" },
    objetos: validationObjects,
  });

  assert.equal(validationObjects, groupedObjects);
  assert.equal(status.isReady, true);
  assert.deepEqual(status.issues, []);
  assert.equal(
    resolveAuthoringValidationObjects({ state: { objetos: staleStateObjects } }),
    staleStateObjects
  );
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

test("authoring schema repair preserves event date fields after removing a stale target", () => {
  const repaired = sanitizeAuthoringSchema({
    fieldsSchema: [
      {
        key: "event_ceremony_date",
        label: "Fecha de la ceremonia",
        type: "date",
        group: "Ceremonia",
        eventDetailsRole: "ceremony_date",
        applyTargets: [
          {
            scope: "objeto",
            id: "deleted-date-text",
            path: "texto",
          },
        ],
      },
    ],
    defaults: {
      event_ceremony_date: "2027-01-05",
    },
    objetos: [],
    dropOrphans: true,
  });

  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.removedFieldKeys, []);
  assert.equal(repaired.removedTargets[0].targetId, "deleted-date-text");
  assert.equal(repaired.fieldsSchema.length, 1);
  assert.deepEqual(repaired.fieldsSchema[0].applyTargets, []);
  assert.equal(repaired.defaults.event_ceremony_date, "2027-01-05");
  assert.equal(
    validateAuthoringState({
      fieldsSchema: repaired.fieldsSchema,
      defaults: repaired.defaults,
      objetos: [],
    }).isReady,
    true
  );
});

test("authoring validation and repair preserve generic data-only fields", () => {
  const dataOnlySchema = [
    {
      key: "story_text",
      label: "Historia",
      type: "textarea",
      group: "Datos principales",
      applyTargets: [],
    },
  ];
  const defaults = { story_text: "Sigue guardada" };

  const status = validateAuthoringState({
    fieldsSchema: dataOnlySchema,
    defaults,
    objetos: [],
  });
  const repaired = sanitizeAuthoringSchema({
    fieldsSchema: dataOnlySchema,
    defaults,
    objetos: [],
    dropOrphans: true,
  });

  assert.equal(status.isReady, true);
  assert.deepEqual(status.issues, []);
  assert.equal(repaired.changed, false);
  assert.deepEqual(repaired.removedFieldKeys, []);
  assert.equal(repaired.fieldsSchema[0].key, "story_text");
  assert.deepEqual(repaired.fieldsSchema[0].applyTargets, []);
  assert.deepEqual(repaired.defaults, defaults);
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
