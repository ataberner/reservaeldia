import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./src/countdownPresets/service.ts", import.meta.url),
  "utf8"
);

function between(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("duplicate has a distinct id, operation replay, transaction, and double-click protection", () => {
  const duplicate = between(
    "export const duplicateCountdownPreset",
    "export const listCountdownPresetVersionsAdmin"
  );
  assert.match(duplicate, /parseOperationId/);
  assert.match(duplicate, /operationData\.type === "duplicate"/);
  assert.match(duplicate, /resolveDocRef\(\s*null,/);
  assert.match(duplicate, /runTransaction/);
  assert.match(duplicate, /transaction\.create\(\s*targetRef/);
  assert.match(duplicate, /transaction\.create\(operationRef/);
  assert.match(duplicate, /currentTarget\.exists/);
});

test("countdown mutations use the firebase-admin v13 FieldValue entry point", () => {
  assert.match(
    source,
    /import \{ FieldValue \} from "firebase-admin\/firestore";/
  );
  assert.match(source, /FieldValue\.serverTimestamp\(\)/);
  assert.doesNotMatch(source, /admin\.firestore\.FieldValue/);
});

test("duplicate copies SVG or PNG and thumbnail to destination-owned staging and cleans every failed attempt", () => {
  const duplicate = between(
    "export const duplicateCountdownPreset",
    "export const listCountdownPresetVersionsAdmin"
  );
  assert.match(duplicate, /copyVersionedAsset/);
  assert.match(
    duplicate,
    /assets\/countdown\/staging\/\$\{presetId\}\/\$\{operationId\}/
  );
  assert.match(duplicate, /deleteStorageFiles\(uploadedPaths\)/);
  assert.match(duplicate, /sourceSvgRef\.storagePath/);
  assert.match(duplicate, /sourceSvgRef\.thumbnailPath/);
  assert.match(duplicate, /frame\.\$\{sourceFrameType\}/);
  assert.match(duplicate, /sourceSvgRef\.mimeType|resolveCountdownFrameMimeType/);
});

test("history is admin-only, read-only, and returns active plus immutable versions", () => {
  const history = between(
    "export const listCountdownPresetVersionsAdmin",
    "export const syncLegacyCountdownPresets"
  );
  assert.match(history, /requireAdmin/);
  assert.match(history, /collection\("versions"\)\.get\(\)/);
  assert.match(history, /activeVersion/);
  assert.doesNotMatch(history, /transaction\.|\.set\(|\.update\(|\.delete\(/);
});
