import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
const templateServiceSource = readFileSync(
  new URL("./src/templates/editorialService.ts", import.meta.url),
  "utf8"
);

test("private draft and template preview functions keep one warm one-CPU instance", () => {
  assert.match(
    indexSource,
    /export const prepareDraftPreviewRender = onCall\(\s*\{[\s\S]*?cpu:\s*1,[\s\S]*?minInstances:\s*1,[\s\S]*?\}/
  );
  assert.match(
    templateServiceSource,
    /const PRIVATE_TEMPLATE_PREVIEW_OPTIONS = \{[\s\S]*?cpu:\s*1 as const,[\s\S]*?minInstances:\s*1,[\s\S]*?\}/
  );
  assert.match(
    templateServiceSource,
    /export const adminGetTemplateEditorDocumentV1 = onCall\(\s*PRIVATE_TEMPLATE_PREVIEW_OPTIONS,/
  );
});
