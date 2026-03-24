import test from "node:test";
import assert from "node:assert/strict";

import {
  RENDER_CONTRACT_IDS,
  RENDER_CONTRACT_STATUSES,
  classifyRenderObjectContract,
  collectLegacyRenderContracts,
  resolveCountdownContract,
  resolveCountdownTargetIso,
} from "./renderContractPolicy.js";

test("classifies countdown schema v1 as legacy frozen compat", () => {
  const classification = resolveCountdownContract({
    tipo: "countdown",
    fechaObjetivo: "2026-05-01T20:00:00.000Z",
  });

  assert.equal(classification.contractId, RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V1);
  assert.equal(
    classification.status,
    RENDER_CONTRACT_STATUSES.LEGACY_FROZEN_COMPAT
  );
  assert.equal(classification.allowedForNewAuthoring, false);
  assert.equal(classification.contractVersion, "v1");
});

test("classifies countdown schema v2 as modern supported", () => {
  const classification = resolveCountdownContract({
    tipo: "countdown",
    countdownSchemaVersion: 2,
    fechaObjetivo: "2026-05-01T20:00:00.000Z",
  });

  assert.equal(classification.contractId, RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V2);
  assert.equal(
    classification.status,
    RENDER_CONTRACT_STATUSES.MODERN_SUPPORTED
  );
  assert.equal(classification.allowedForNewAuthoring, true);
  assert.equal(classification.contractVersion, "v2");
});

test("classifies legacy icono-svg as frozen compatibility", () => {
  const classification = classifyRenderObjectContract({
    tipo: "icono-svg",
    d: "M0 0 L10 10",
  });

  assert.equal(classification.contractId, RENDER_CONTRACT_IDS.ICONO_SVG_LEGACY);
  assert.equal(
    classification.status,
    RENDER_CONTRACT_STATUSES.LEGACY_FROZEN_COMPAT
  );
  assert.equal(classification.allowedForNewAuthoring, false);
});

test("does not misclassify modern icono objects", () => {
  const svgClassification = classifyRenderObjectContract({
    tipo: "icono",
    formato: "svg",
    paths: [{ d: "M0 0 L10 10" }],
  });
  const rasterClassification = classifyRenderObjectContract({
    tipo: "icono",
    formato: "png",
    src: "https://cdn.example.com/icon.png",
  });

  assert.equal(svgClassification.contractId, RENDER_CONTRACT_IDS.ICONO_MODERN);
  assert.equal(rasterClassification.contractId, RENDER_CONTRACT_IDS.ICONO_MODERN);
  assert.equal(svgClassification.isLegacyFrozenCompat, false);
  assert.equal(rasterClassification.isLegacyFrozenCompat, false);
});

test("resolves countdown target preferring fechaObjetivo while keeping alias support", () => {
  const primary = resolveCountdownTargetIso({
    fechaObjetivo: "2026-06-01T20:00:00.000Z",
    targetISO: "2026-07-01T20:00:00.000Z",
    fechaISO: "2026-08-01T20:00:00.000Z",
  });
  const targetAlias = resolveCountdownTargetIso({
    targetISO: "2026-07-01T20:00:00.000Z",
  });
  const fechaAlias = resolveCountdownTargetIso({
    fechaISO: "2026-08-01T20:00:00.000Z",
  });

  assert.equal(primary.targetISO, "2026-06-01T20:00:00.000Z");
  assert.equal(primary.sourceField, "fechaObjetivo");
  assert.equal(primary.usesCompatibilityAlias, false);

  assert.equal(targetAlias.targetISO, "2026-07-01T20:00:00.000Z");
  assert.equal(targetAlias.sourceField, "targetISO");
  assert.equal(targetAlias.usesCompatibilityAlias, true);

  assert.equal(fechaAlias.targetISO, "2026-08-01T20:00:00.000Z");
  assert.equal(fechaAlias.sourceField, "fechaISO");
  assert.equal(fechaAlias.usesCompatibilityAlias, true);
});

test("collects unique legacy render contracts from render state", () => {
  const legacyContracts = collectLegacyRenderContracts({
    objetos: [
      { id: "count-1", tipo: "countdown" },
      { id: "count-2", tipo: "countdown", countdownSchemaVersion: 2 },
      { id: "icon-1", tipo: "icono-svg", d: "M0 0 L10 10" },
      { id: "icon-2", tipo: "icono", formato: "svg", paths: [{ d: "M0 0 L10 10" }] },
    ],
  });

  assert.deepEqual(
    legacyContracts.map((entry) => [entry.contractId, entry.count]),
    [
      [RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V1, 1],
      [RENDER_CONTRACT_IDS.ICONO_SVG_LEGACY, 1],
    ]
  );
});
