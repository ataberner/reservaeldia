import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { validateAuthoringState } from "../src/domain/templates/authoring/validation.js";

const require = createRequire(import.meta.url);
const { buildLumiereRepairPlan } = require("./repairLumiereTemplateIdentity.cjs");

function createFixture() {
  const fieldsSchema = [
    {
      key: "event_ceremony_start_time",
      label: "Hora inicio de la ceremonia",
      type: "time",
      group: "Ceremonia",
      optional: false,
      eventDetailsRole: "ceremony_start_time",
      applyTargets: [
        {
          scope: "objeto",
          id: "texto-msqoeg6v-1-07e3",
          path: "texto",
          mode: "set",
        },
      ],
    },
    {
      key: "event_party_start_time",
      label: "Hora inicio de la fiesta",
      type: "time",
      group: "Fiesta",
      optional: false,
      eventDetailsRole: "party_start_time",
    },
  ];
  return {
    nombre: "Lumière · Fotográfica elegante",
    objetos: [
      {
        id: "texto-msqoeg6v-0-81xc",
        tipo: "texto",
        texto: "Fiesta",
        x: 180.084,
        y: 153.723,
        seccionId: "seccion-1786574530834",
      },
      {
        id: "texto-msqoeg6v-2-4pd0",
        tipo: "texto",
        texto: "Salón Gran Bouvelard\nAv. Corrientes 2134",
        x: 438.509,
        y: 244.849,
        seccionId: "seccion-1786574530834",
      },
      {
        id: "texto-msqoeg6v-0-81xc",
        tipo: "texto",
        texto: "Iglesia",
        x: 145.823,
        y: 162.419,
        seccionId: "seccion-1786574530834",
      },
      {
        id: "texto-msqoeg6v-2-4pd0",
        tipo: "texto",
        texto: "Salón Gran Bouvelard\nAv. Corrientes 2134",
        x: 111.917,
        y: 244.481,
        seccionId: "seccion-1786574530834",
      },
    ],
    fieldsSchema,
    templateAuthoringDraft: {
      version: 1,
      fieldsSchema,
      defaults: {
        event_ceremony_start_time: "20:30",
        event_party_start_time: "18:00",
      },
      status: {
        isReady: false,
        issues: ["target inexistente"],
      },
    },
  };
}

test("Lumière repair restores unique text identities and independent time targets", () => {
  const plan = buildLumiereRepairPlan(createFixture(), { validateAuthoringState });
  const ids = plan.objetos.map((object) => object.id);
  const ceremonyTime = plan.objetos.find(
    (object) => object.id === "texto-msqoeg6v-1-07e3"
  );
  const partyTime = plan.objetos.find(
    (object) => object.id === "texto-lumiere-party-start-time-1787411703"
  );

  assert.equal(plan.changed, true);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ceremonyTime.texto, "20:30");
  assert.equal(ceremonyTime.x, 196);
  assert.equal(partyTime.texto, "18:00");
  assert.equal(partyTime.x, 529);
  assert.equal(
    plan.fieldsSchema.find((field) => field.key === "event_ceremony_start_time")
      .applyTargets[0].id,
    ceremonyTime.id
  );
  assert.equal(
    plan.fieldsSchema.find((field) => field.key === "event_party_start_time")
      .applyTargets[0].id,
    partyTime.id
  );
  assert.equal(plan.templateAuthoringDraft.status.isReady, true);
  assert.deepEqual(plan.templateAuthoringDraft.status.issues, []);
});

test("Lumière repair is idempotent after the first plan is applied", () => {
  const first = buildLumiereRepairPlan(createFixture(), { validateAuthoringState });
  const second = buildLumiereRepairPlan(
    {
      ...createFixture(),
      objetos: first.objetos,
      fieldsSchema: first.fieldsSchema,
      templateAuthoringDraft: first.templateAuthoringDraft,
    },
    { validateAuthoringState }
  );

  assert.equal(second.changed, false);
});
