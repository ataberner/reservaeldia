import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  collectDuplicateRenderObjectIds,
  updateRenderObjectById,
} from "../src/domain/editor/renderObjectTree.js";
import { validateAuthoringState } from "../src/domain/templates/authoring/validation.js";
import { buildTemplateAuthoringTargetPatches } from "../src/domain/templates/authoring/targetApplication.js";

const require = createRequire(import.meta.url);
const { buildMagnoliaRepairPlan } = require("./repairMagnoliaTemplateIdentity.cjs");

const dependencies = {
  collectDuplicateRenderObjectIds,
  updateRenderObjectById,
  validateAuthoringState,
  buildTemplateAuthoringTargetPatches,
};

const PAIRS = [
  ["texto-ms70lmrs-0-lek7", "Ceremonia", 215, 56],
  ["texto-ms70lmrs-1-ylbw", "18.00 hs", 119, 146],
  ["texto-ms70lmrs-2-4i8p", "Basilica Buenos Aires", 119, 188],
  ["texto-ms70lmrs-3-q01k", "Av. Gaona 3434", 119, 219],
  ["texto-ms70lmrs-0-lek7", "Celebración", 465, 107],
  ["texto-ms70lmrs-1-ylbw", "20.00 hs", 469, 146],
  ["texto-ms70lmrs-2-4i8p", "Salón Cid Campeador", 468, 188],
  ["texto-ms70lmrs-3-q01k", "Av. San Martín 4534", 469, 222],
];

const FIELDS = [
  ["event_ceremony_start_time", "time", false, "ceremony_start_time"],
  ["event_party_start_time", "time", false, "party_start_time"],
  ["event_ceremony_venue_name", "text", true, "ceremony_venue_name"],
  ["event_party_venue_name", "text", true, "party_venue_name"],
  ["event_ceremony_venue_address", "location", false, "ceremony_venue_address"],
  ["event_party_venue_address", "location", false, "party_venue_address"],
];

function createFixture() {
  const fieldsSchema = FIELDS.map(([key, type, optional, eventDetailsRole]) => ({
    key,
    label: key,
    type,
    group: "Detalles",
    optional,
    eventDetailsRole,
  }));
  const defaults = {
    event_ceremony_start_time: "15:00",
    event_party_start_time: "19:00",
    event_ceremony_venue_name: "Basílica Nuestra Señora de la Piedad",
    event_party_venue_name: "Salón Palermo",
    event_ceremony_venue_address: "Bartolomé Mitre 1523, CABA",
    event_party_venue_address: "Av. Sarmiento 2704, CABA",
  };

  return {
    nombre: "Magnolia · Botánica elegante",
    eventDetails: { mode: "ceremony_party" },
    secciones: [
      {
        id: "seccion-1775407672285",
        altura: 309,
      },
    ],
    objetos: PAIRS.map(([id, texto, x, y]) => ({
      id,
      tipo: "texto",
      texto,
      x,
      y,
      fontSize: texto.startsWith("Av.") ? 18 : 20,
      seccionId: "seccion-1775407672285",
    })),
    fieldsSchema,
    templateAuthoringDraft: {
      version: 1,
      fieldsSchema,
      defaults,
      status: {
        isReady: false,
        issues: ["ids duplicados"],
      },
    },
  };
}

function targetId(plan, fieldKey) {
  return plan.fieldsSchema
    .find((field) => field.key === fieldKey)
    .applyTargets.find((target) => target.path === "texto").id;
}

test("Magnolia repair restores independent identities and explicit ceremony/party targets", () => {
  const plan = buildMagnoliaRepairPlan(createFixture(), dependencies);

  assert.equal(plan.changed, true);
  assert.deepEqual(Array.from(collectDuplicateRenderObjectIds(plan.objetos)), []);
  assert.equal(targetId(plan, "event_ceremony_start_time"), "texto-ms70lmrs-1-ylbw");
  assert.equal(
    targetId(plan, "event_party_start_time"),
    "texto-magnolia-party-start-time-repair-v1"
  );
  assert.equal(targetId(plan, "event_ceremony_venue_name"), "texto-ms70lmrs-2-4i8p");
  assert.equal(
    targetId(plan, "event_party_venue_name"),
    "texto-magnolia-party-venue-name-repair-v1"
  );
  assert.equal(targetId(plan, "event_ceremony_venue_address"), "texto-ms70lmrs-3-q01k");
  assert.equal(
    targetId(plan, "event_party_venue_address"),
    "texto-magnolia-party-venue-address-repair-v1"
  );

  const ceremonyTime = plan.objetos.find(
    (object) => object.id === "texto-ms70lmrs-1-ylbw"
  );
  const partyTime = plan.objetos.find(
    (object) => object.id === "texto-magnolia-party-start-time-repair-v1"
  );
  const ceremonyAddress = plan.objetos.find(
    (object) => object.id === "texto-ms70lmrs-3-q01k"
  );
  const partyAddress = plan.objetos.find(
    (object) => object.id === "texto-magnolia-party-venue-address-repair-v1"
  );

  assert.equal(ceremonyTime.texto, "15:00");
  assert.ok(ceremonyTime.x < 350);
  assert.equal(partyTime.texto, "19:00");
  assert.ok(partyTime.x > 400);
  assert.notEqual(ceremonyTime.x, partyTime.x);
  assert.equal(ceremonyAddress.texto, "Bartolomé Mitre 1523, CABA");
  assert.equal(ceremonyAddress.width, 360);
  assert.equal(ceremonyAddress.__autoWidth, false);
  assert.equal(ceremonyAddress.textWrapMode, "word");
  assert.equal(partyAddress.texto, "Av. Sarmiento 2704, CABA");
  assert.equal(partyAddress.width, 360);
  assert.equal(plan.templateAuthoringDraft.status.isReady, true);
  assert.deepEqual(plan.templateAuthoringDraft.status.issues, []);
});

test("Magnolia repair is idempotent after the first plan is applied", () => {
  const fixture = createFixture();
  const first = buildMagnoliaRepairPlan(fixture, dependencies);
  const second = buildMagnoliaRepairPlan(
    {
      ...fixture,
      objetos: first.objetos,
      fieldsSchema: first.fieldsSchema,
      templateAuthoringDraft: first.templateAuthoringDraft,
    },
    dependencies
  );

  assert.equal(second.changed, false);
});

test("Magnolia repair reports the exact audited document selected by the caller", () => {
  const templateId = "eterno-fotografica-natural-1785377814714-template-1787252092900";
  const plan = buildMagnoliaRepairPlan(createFixture(), {
    ...dependencies,
    templateId,
  });

  assert.equal(plan.summary.templateId, templateId);
});
