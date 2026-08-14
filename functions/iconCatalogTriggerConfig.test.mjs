import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const triggersSource = fs.readFileSync(
  path.resolve("functions/src/iconCatalog/triggers.ts"),
  "utf8"
);
const configSource = fs.readFileSync(
  path.resolve("functions/src/iconCatalog/config.ts"),
  "utf8"
);

test("daily icon catalog reconciliation keeps an explicit scheduler-aligned timeout", () => {
  const reconcileDefinition = triggersSource.match(
    /export const dailyIconCatalogReconcileV2 = onSchedule\(([\s\S]*?)\n\);/
  );

  assert.ok(reconcileDefinition, "dailyIconCatalogReconcileV2 must remain defined");
  assert.match(reconcileDefinition[1], /timeoutSeconds:\s*180/);
});

test("daily icon catalog reconciliation caps sequential reprocessing before calling the processor", () => {
  assert.match(
    configSource,
    /ICON_CATALOG_DAILY_RECONCILE_BATCH_LIMIT\s*=\s*100/
  );
  assert.match(
    triggersSource,
    /reprocessAttempted\s*>=\s*ICON_CATALOG_DAILY_RECONCILE_BATCH_LIMIT/
  );
  assert.match(
    triggersSource,
    /reprocessAttempted\s*\+=\s*1;[\s\S]*?loadProcessIconDocumentV2\(\)/
  );
  assert.match(triggersSource, /deferred\s*\+=\s*1;[\s\S]*?continue;/);
});
