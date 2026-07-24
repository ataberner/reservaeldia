import test from "node:test";
import assert from "node:assert/strict";
import contract from "./countdownPhase0Contract.cjs";

const {
  buildCountdownTelemetryEvent,
  buildCountdownTelemetrySummary,
  collectCountdownObjects,
  resolveCountdownFeatureFlags,
} = contract;

test("countdown modernization flags default off and resolve independently", () => {
  assert.deepEqual(resolveCountdownFeatureFlags({}), {
    renderer: false,
    lifecycle: false,
    catalog: false,
    temporal: false,
  });

  const environment = {
    COUNTDOWN_NEW_RENDERER_ENABLED: "1",
    COUNTDOWN_NEW_LIFECYCLE_ENABLED: "0",
    NEXT_PUBLIC_COUNTDOWN_NEW_CATALOG_ENABLED: "true",
    NEXT_PUBLIC_COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED: "false",
  };
  assert.deepEqual(resolveCountdownFeatureFlags(environment), {
    renderer: true,
    lifecycle: false,
    catalog: true,
    temporal: false,
  });

  assert.deepEqual(
    resolveCountdownFeatureFlags(environment, {
      renderer: false,
      lifecycle: true,
    }),
    {
      renderer: false,
      lifecycle: true,
      catalog: true,
      temporal: false,
    }
  );
});

test("countdown telemetry walks preserved group children and reports aliases", () => {
  const renderState = {
    objetos: [
      {
        id: "group-with-private-name",
        tipo: "grupo",
        children: [
          {
            id: "legacy-countdown-private-id",
            tipo: "countdown",
            targetISO: "2030-06-01T20:00:00.000Z",
            countdownSchemaVersion: 1,
            presetId: "legacy-preset-private-id",
            presetVersion: 3,
            migrationSource: "legacy-config-v1",
          },
        ],
      },
      {
        id: "modern-countdown-private-id",
        tipo: "countdown",
        fechaObjetivo: "2030-07-01T20:00:00.000Z",
        countdownSchemaVersion: 2,
        presetId: "modern-preset-private-id",
        presetVersion: 7,
        frameSvgUrl: "https://storage.example/private-frame.svg",
      },
    ],
  };

  assert.equal(collectCountdownObjects(renderState).length, 2);
  assert.deepEqual(
    buildCountdownTelemetrySummary(renderState, {
      renderer: "prepared-preview-html",
    }),
    {
      contractVersion: 1,
      renderer: "prepared-preview-html",
      countdownCount: 2,
      schemaVersionCounts: { 1: 1, 2: 1 },
      presetVersionCounts: { 3: 1, 7: 1 },
      legacyBranchCount: 1,
      aliasUsageCounts: { targetISO: 1 },
      migrationSourceCounts: { "legacy-config-v1": 1 },
      presetReferenceCount: 2,
      frameAssetCount: 1,
    }
  );
});

test("countdown telemetry event never includes ids, dates or asset URLs", () => {
  const event = buildCountdownTelemetryEvent({
    eventType: "render_complete",
    renderer: "published-html",
    renderState: {
      objetos: [
        {
          id: "private-object-id",
          tipo: "countdown",
          fechaObjetivo: "2030-07-01T20:00:00.000Z",
          presetId: "private-preset-id",
          presetVersion: 4,
          countdownSchemaVersion: 2,
          frameSvgUrl: "https://storage.example/private.svg",
        },
      ],
    },
  });
  const serialized = JSON.stringify(event);

  assert.equal(serialized.includes("private-object-id"), false);
  assert.equal(serialized.includes("private-preset-id"), false);
  assert.equal(serialized.includes("2030-07-01"), false);
  assert.equal(serialized.includes("storage.example"), false);
  assert.equal(event.countdownCount, 1);
  assert.equal(event.presetReferenceCount, 1);
});
