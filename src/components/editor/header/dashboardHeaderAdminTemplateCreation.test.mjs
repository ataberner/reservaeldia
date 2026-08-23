import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardHeaderSource = readFileSync(
  new URL("../../DashboardHeader.jsx", import.meta.url),
  "utf8"
);
const editorialBackendSource = readFileSync(
  new URL("../../../../functions/src/templates/editorialService.ts", import.meta.url),
  "utf8"
);
const templateAdminServiceSource = readFileSync(
  new URL("../../../domain/templates/adminService.js", import.meta.url),
  "utf8"
);

function readFunctionBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `No se encontro ${startMarker}`);
  assert.notEqual(end, -1, `No se encontro ${endMarker}`);
  return source.slice(start, end);
}

test("administrative read-only template creation uses the real draft preparation and copy callable", () => {
  const block = readFunctionBlock(
    dashboardHeaderSource,
    "const crearPlantillaDesdeBorradorAdministrativo",
    "const crearPlantillaDesdeHeader"
  );

  assert.match(block, /pedirNombreNuevaPlantilla\(\)/);
  assert.match(block, /capturarPreparacionPlantilla\(\{[\s\S]*?allowAuthoringRepair: false/);
  assert.match(block, /composeDraftTemplateCreationPayload\(\{/);
  assert.match(block, /createTemplateFromDraft\(\{[\s\S]*?draftSlug,[\s\S]*?templateId,/);
  assert.match(
    block,
    /onOpenTemplateSession\(\{[\s\S]*?editorDocument:[\s\S]*?creationResult\?\.editorDocument/
  );
  assert.doesNotMatch(block, /window\.confirm|convertDraftToTemplate|ensureEditorFlushBeforeAction/);
});

test("writable draft creation keeps its existing conversion and legacy menu route", () => {
  const saveBlock = readFunctionBlock(
    dashboardHeaderSource,
    "const guardarPlantilla",
    "const guardarNombreDocumento"
  );
  const menuDispatchBlock = readFunctionBlock(
    dashboardHeaderSource,
    "const crearPlantillaDesdeHeader",
    "const previewButtonLabel"
  );

  assert.match(saveBlock, /pedirNombreNuevaPlantilla\(\)/);
  assert.match(saveBlock, /ensureEditorFlushBeforeAction/);
  assert.match(saveBlock, /convertDraftToTemplate\(\{/);
  assert.match(
    menuDispatchBlock,
    /new CustomEvent\("dashboard-crear-plantilla"\)/
  );
});

test("the backend copy authority permits superadmin ownership override and never deletes the source draft", () => {
  const block = readFunctionBlock(
    editorialBackendSource,
    "export const adminCreateTemplateFromDraftV1",
    "return {\n      item: buildTemplateResponse"
  );

  assert.match(block, /draftOwnerUid !== uid && role !== "superadmin"/);
  assert.match(block, /assertTemplateRenderObjectIdsUnique\(currentPayload\)/);
  assert.match(block, /writeTemplateAndCatalog\(\{/);
  assert.doesNotMatch(block, /draftRef\.delete\(/);
  assert.match(
    templateAdminServiceSource,
    /createFromDraftCallable = httpsCallable\([\s\S]*?"adminCreateTemplateFromDraftV1"/
  );
  assert.doesNotMatch(
    readFunctionBlock(
      templateAdminServiceSource,
      "export async function createTemplateFromDraft",
      "\n}"
    ),
    /crearPlantilla|convertDraftToTemplateCallable/
  );
});

test("both draft-to-template backend paths reject duplicate render identities", () => {
  const convertBlock = readFunctionBlock(
    editorialBackendSource,
    "export const adminConvertDraftToTemplateV1",
    "export const adminOpenTemplateWorkspaceV1"
  );
  const copyBlock = readFunctionBlock(
    editorialBackendSource,
    "export const adminCreateTemplateFromDraftV1",
    "return {\n      item: buildTemplateResponse"
  );

  assert.match(convertBlock, /assertTemplateRenderObjectIdsUnique\(currentPayload\)/);
  assert.match(copyBlock, /assertTemplateRenderObjectIdsUnique\(currentPayload\)/);
  assert.match(
    editorialBackendSource,
    /function assertTemplateRenderObjectIdsUnique[\s\S]*?collectDuplicateRenderObjectIds/
  );
});
