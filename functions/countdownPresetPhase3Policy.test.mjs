import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildCountdownDuplicateDraftRoot,
  resolveCountdownDuplicateSource,
} = requireBuiltModule("lib/countdownPresets/phase3Policy.js");

function config() {
  return {
    layout: { visibleUnits: ["days", "hours"] },
    tipografia: { fontFamily: "Poppins" },
    colores: { frameColor: "#773dbe" },
    animaciones: { entry: "none" },
    unidad: { boxShadow: true },
    tamanoBase: 320,
  };
}

test("current and legacy-synchronized drafts are duplicated from their draft snapshot", () => {
  for (const root of [
    { draft: { nombre: "Actual" }, draftVersion: 4, activeVersion: 2 },
    {
      draft: { nombre: "Legacy sincronizado" },
      legacyPresetProps: { layout: "pills" },
      metadata: { migrationSource: "legacy-config-v1" },
    },
  ]) {
    const result = resolveCountdownDuplicateSource({ rootData: root });
    assert.equal(result.ok, true);
    assert.equal(result.sourceKind, "draft");
    assert.equal(result.sourcePayload.nombre, root.draft.nombre);
  }
});

test("published source without draft requires and uses the immutable active version", () => {
  assert.deepEqual(
    resolveCountdownDuplicateSource({
      rootData: { activeVersion: 3, estado: "archived" },
    }),
    { ok: false, reason: "active-version-missing" }
  );
  const result = resolveCountdownDuplicateSource({
    rootData: { activeVersion: 3, estado: "archived" },
    activeVersionData: { version: 3, nombre: "Histórico" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.sourceKind, "published");
  assert.equal(result.sourceVersion, 3);
});

test("duplicate is a new draft with copied compatible data and no publication or lifecycle state", () => {
  for (const svgRef of [
    {
      storagePath: "assets/countdown/staging/new/frame.svg",
      downloadUrl: "https://example.invalid/frame.svg",
      colorMode: "currentColor",
    },
    {
      storagePath: null,
      downloadUrl: null,
      colorMode: "fixed",
    },
  ]) {
    const root = buildCountdownDuplicateDraftRoot({
      presetId: "new-id",
      duplicateName: "Original — copia",
      category: { event: "boda", style: "minimal", label: "Boda / Minimal" },
      config: config(),
      svgRef,
      validationReport: { warnings: [], checks: {} },
      uid: "admin",
      sourcePresetId: "original",
      sourceKind: "draft",
      sourceVersion: null,
      schemaVersion: 2,
      renderContractVersion: 2,
      now: "clock",
    });
    assert.equal(root.id, "new-id");
    assert.equal(root.estado, "draft");
    assert.equal(root.draftVersion, 1);
    assert.equal(root.nombre, "Original — copia");
    assert.equal(root.svgRef.storagePath, svgRef.storagePath);
    assert.equal("activeVersion" in root, false);
    assert.equal("legacyPresetProps" in root, false);
    assert.equal("operations" in root, false);
    assert.equal("tombstonedAt" in root, false);
  }
});
