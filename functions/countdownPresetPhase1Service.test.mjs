import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTDOWN_FRAME_SCALE_LIMITS } from "../shared/countdownFrameGeometry.js";

const serviceSource = readFileSync(
  new URL("./src/countdownPresets/service.ts", import.meta.url),
  "utf8"
);
const frameValidationSource = readFileSync(
  new URL("./src/countdownPresets/frameAssetValidation.ts", import.meta.url),
  "utf8"
);

function between(start, end) {
  const startIndex = serviceSource.indexOf(start);
  const endIndex = serviceSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return serviceSource.slice(startIndex, endIndex);
}

test("public catalog reads activeVersion child documents and never reads draft content", () => {
  const catalogSource = between(
    "export const listCountdownPresetsPublic",
    "return { items };"
  );
  assert.match(
    catalogSource,
    /collection\("versions"\)\.doc\(String\(activeVersion\)\)\.get\(\)/
  );
  assert.doesNotMatch(catalogSource, /\.draft\b|draftVersion/);
  assert.match(catalogSource, /resolvePublicCatalogVersion/);
});

test("save and publish are transaction-wired with operation replay and staged assets", () => {
  const saveSource = between(
    "export const saveCountdownPresetDraft",
    "export const publishCountdownPresetDraft"
  );
  const publishSource = between(
    "export const publishCountdownPresetDraft",
    "export const syncLegacyCountdownPresets"
  );

  assert.match(saveSource, /assets\/countdown\/staging/);
  assert.match(saveSource, /runTransaction/);
  assert.match(saveSource, /transaction\.create\(operationRef/);
  assert.match(saveSource, /deleteStorageFiles\(uploadedPaths\)/);
  assert.match(publishSource, /runTransaction/);
  assert.match(publishSource, /transaction\.create\(versionRef/);
  assert.match(publishSource, /transaction\.create\(operationRef/);
  assert.match(publishSource, /assetOperationId/);
  assert.match(publishSource, /deleteStorageFiles\(stagedPaths\)/);
});

test("frame lifecycle accepts canonical SVG/PNG payloads and keeps immutable operation paths", () => {
  const saveSource = between(
    "export const saveCountdownPresetDraft",
    "export const publishCountdownPresetDraft"
  );
  const publishSource = between(
    "export const publishCountdownPresetDraft",
    "export const syncLegacyCountdownPresets"
  );
  assert.match(saveSource, /assets\.frameBase64/);
  assert.match(saveSource, /assets\.frameMimeType/);
  assert.match(saveSource, /inspectCountdownPngBuffer/);
  assert.match(saveSource, /frame\.\$\{frameType\}/);
  assert.match(saveSource, /assets\.svgBase64/);
  assert.match(publishSource, /frame\.\$\{frameAssetType\}/);
  assert.match(publishSource, /operations\/\$\{operationId\}\/\$\{attemptId\}/);
  assert.match(publishSource, /transaction\.create\(versionRef/);
  assert.match(frameValidationSource, /inspectCountdownPngBytes/);
  assert.match(frameValidationSource, /sharp\(buffer/);
  assert.match(frameValidationSource, /limitInputPixels/);
  assert.match(frameValidationSource, /metadata\.hasAlpha/);
});

test("frameScale is backward-compatible, range-validated, and materialized without schema v3", () => {
  assert.deepEqual(COUNTDOWN_FRAME_SCALE_LIMITS, {
    min: 0.5,
    max: 5,
    default: 1,
  });
  assert.match(serviceSource, /frameScale: number/);
  assert.match(serviceSource, /COUNTDOWN_FRAME_SCALE_LIMITS/);
  assert.match(
    serviceSource,
    /numberInRangeWithDefault\(\s*layoutRaw\.frameScale[\s\S]*COUNTDOWN_FRAME_SCALE_LIMITS\.default/
  );
  assert.match(serviceSource, /frameScale: config\.layout\.frameScale/);
  assert.doesNotMatch(serviceSource, /countdownSchemaVersion:\s*3/);
});

test("published deletion is wired to tombstone without version or published asset deletion", () => {
  const deletionSource = between(
    "export const deleteCountdownPreset",
    "export const listCountdownPresetsAdmin"
  );
  assert.match(deletionSource, /deletionPolicy === "tombstone"/);
  assert.match(deletionSource, /tombstonedAt/);
  assert.doesNotMatch(deletionSource, /deleteSubcollection\(ref, "versions"\)/);
  assert.doesNotMatch(
    deletionSource,
    /deleteStoragePrefix\(`assets\/countdown\/frames\/\$\{presetId\}\/`\)/
  );
});
