import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const copyCallableSource = readFileSync(
  new URL("./src/index.ts", import.meta.url),
  "utf8"
);
const editorialServiceSource = readFileSync(
  new URL("./src/templates/editorialService.ts", import.meta.url),
  "utf8"
);

function readBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing block start: ${startMarker}`);
  assert.notEqual(end, -1, `Missing block end: ${endMarker}`);
  return source.slice(start, end);
}

test("copiarPlantilla carries the normalized cover identity into the new draft", () => {
  const block = readBlock(
    copyCallableSource,
    "export const copiarPlantilla = onCall(",
    "export const crearPlantilla = onCall("
  );

  assert.match(
    block,
    /const portadaSource =\s*plantillaNormalizada\.portadaSource/
  );
  assert.match(block, /portada: portadaNormalizada,\s*portadaSource,/);
});

test("template editor persistence and workspace flows retain portadaSource", () => {
  const editorDocumentBlock = readBlock(
    editorialServiceSource,
    "function buildTemplateEditorDocument(",
    "function buildTemplateResponse("
  );
  const draftPayloadBlock = readBlock(
    editorialServiceSource,
    "function buildTemplatePayloadFromDraft(",
    "function buildTemplatePayloadFromEditorDocument("
  );
  const editorPayloadBlock = readBlock(
    editorialServiceSource,
    "function buildTemplatePayloadFromEditorDocument(",
    "export const adminListTemplatesV1"
  );
  const workspaceBlock = readBlock(
    editorialServiceSource,
    "export const adminOpenTemplateWorkspaceV1",
    "export const adminCommitTemplateWorkspaceV1"
  );

  assert.match(
    editorDocumentBlock,
    /portadaSource: resolvePortadaSource\(template\)/
  );
  assert.match(
    draftPayloadBlock,
    /portadaSource: resolvePortadaSource\(overrides, draftData, currentTemplate\)/
  );
  assert.match(
    editorPayloadBlock,
    /portadaSource: resolvePortadaSource\(overrides, source, currentTemplate\)/
  );
  assert.match(
    workspaceBlock,
    /portadaSource: resolvePortadaSource\(loaded\.normalized\)/
  );
});
