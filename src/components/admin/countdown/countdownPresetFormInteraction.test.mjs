import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(name) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

const formSource = source("./CountdownPresetForm.jsx");
const pageSource = source("./CountdownPresetBuilderPage.jsx");
const hookSource = source("../../../hooks/useCountdownPresetBuilderState.js");
const confirmSource = source("./CountdownPresetConfirmDialog.jsx");
const sectionsSource = source("./CountdownPresetFormSections.jsx");
const previewSource = source("./CountdownPresetPreviewPanel.jsx");
const historySource = source("./CountdownPresetHistoryPanel.jsx");
const listSource = source("./CountdownPresetList.jsx");
const frameSource = source("./SvgUploadInspector.jsx");

test("dirty exit and selection changes use one controller and accessible confirmation", () => {
  assert.match(pageSource, /addEventListener\("beforeunload"/);
  assert.match(pageSource, /router\.beforePopState/);
  assert.match(pageSource, /routeChangeStart/);
  assert.match(pageSource, /requestRouteChange/);
  assert.match(hookSource, /selection\.epoch/);
  assert.match(hookSource, /AbortController/);
  assert.match(confirmSource, /role="alertdialog"/);
  assert.doesNotMatch(pageSource, /window\.confirm|alert\(/);
  assert.doesNotMatch(formSource, /window\.confirm|alert\(/);
});

test("builder introduction uses product language without schema internals", () => {
  assert.match(
    pageSource,
    /Editá el borrador, comprobá el diseño con la simulación y publicá\s+una nueva versión\./
  );
  assert.doesNotMatch(pageSource, /borradores schema 2/);
});

test("raw publish remains dirty-gated and save-and-publish stays explicit", () => {
  assert.match(formSource, /controls\.canPublishSaved/);
  assert.match(formSource, /controls\.publishBlockedByDirty/);
  assert.match(formSource, /Guardar y publicar/);
  assert.match(hookSource, /inFlightRef\.current/);
  assert.match(hookSource, /createCountdownOperationId/);
});

test("form is split by schema 2 responsibility and exposes actionable validation", () => {
  for (const section of [
    "Información",
    "Layout",
    "Tipografía",
    "Colores y unidades",
    "Frame",
    "Animaciones",
  ]) {
    assert.match(sectionsSource, new RegExp(section));
  }
  assert.match(formSource, /role="alert"/);
  assert.match(formSource, /focusFirstInvalid/);
  assert.match(sectionsSource, /aria-invalid/);
  assert.match(sectionsSource, /min-h-11/);
});

test("frame UI is compact, accepts SVG and PNG, and exposes accessible help and errors", () => {
  assert.match(frameSource, /accept="\.svg,\.png,image\/svg\+xml,image\/png"/);
  assert.match(frameSource, /¿Qué archivo conviene usar\?/);
  assert.match(frameSource, /al menos 1200 × 1200 px/);
  assert.match(frameSource, /role="alert"/);
  assert.match(frameSource, /El archivo anterior se conservó/);
  assert.match(frameSource, /object-contain/);
  assert.match(sectionsSource, /title="Frame"/);
  assert.doesNotMatch(sectionsSource, /title="Frame SVG"/);
});

test("frame upload uses an in-place real button and keeps focus without scrolling", () => {
  assert.match(frameSource, /ref=\{uploadButtonRef\}/);
  assert.match(frameSource, /type="button"/);
  assert.match(frameSource, /onClick=\{handleUploadClick\}/);
  assert.match(frameSource, /fileInputRef\.current\?\.click\(\)/);
  assert.match(frameSource, /ref=\{fileInputRef\}/);
  assert.match(frameSource, /type="file"/);
  assert.match(frameSource, /tabIndex=\{-1\}/);
  assert.match(frameSource, /aria-hidden="true"/);
  assert.match(frameSource, /absolute left-0 top-0 h-px w-px/);
  assert.match(frameSource, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(
    frameSource,
    /<label[^>]*>[\s\S]*?type="file"[\s\S]*?<\/label>/
  );
});

test("frame preview owns visual fitting and does not create a nested scroll area", () => {
  assert.match(previewSource, /min-w-0 overflow-hidden/);
  assert.doesNotMatch(previewSource, /ml-auto overflow-auto/);
});

test("preview supports desktop, mobile, frozen scenarios, contrast, and reduced motion", () => {
  assert.match(previewSource, /Escritorio/);
  assert.match(previewSource, /Móvil/);
  assert.match(previewSource, /COUNTDOWN_PREVIEW_SCENARIOS/);
  assert.match(previewSource, /nowMs=/);
  assert.match(previewSource, /reducedMotion=/);
  assert.match(previewSource, /Oscuro/);
  assert.match(previewSource, /lg:sticky/);
  assert.match(previewSource, /Seleccioná al menos una unidad/);
});

test("history is read-only and compares active or historical versions to the draft", () => {
  assert.match(historySource, /Historial publicado/);
  assert.match(historySource, /Las versiones son inmutables/);
  assert.match(historySource, /compareCountdownVersionToDraft/);
  assert.doesNotMatch(historySource, /activar|rollback|overwrite/i);
});

test("catalog administration supports search, filters, sort, mobile, and state badges", () => {
  assert.match(listSource, /type="search"/);
  assert.match(listSource, /Publicados/);
  assert.match(listSource, /Última modificación/);
  assert.match(listSource, /lg:hidden/);
  assert.match(listSource, /Legacy/);
  assert.match(listSource, /Protegido/);
  assert.match(listSource, /selectedDirty/);
});

test("builder layout neutralizes legacy section spacing and keeps a responsive workbench", () => {
  assert.match(pageSource, /grid min-w-0 items-start/);
  assert.match(formSource, /min-w-0 self-start p-0/);
  assert.match(
    formSource,
    /md:grid-cols-\[minmax\(0,2fr\)_minmax\(250px,0\.85fr\)\]/
  );
  assert.match(listSource, /lg:h-full/);
  assert.match(listSource, /lg:max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(listSource, /lg:flex-1/);
  assert.match(previewSource, /bg-white p-0 shadow-sm/);
  assert.match(previewSource, /hidden md:block/);
});

test("success and error messages expose the correct live-region roles", () => {
  assert.match(formSource, /notice\.type === "error" \? "alert" : "status"/);
  assert.match(confirmSource, /aria-modal="true"/);
  assert.match(confirmSource, /event\.key !== "Tab"/);
  assert.match(confirmSource, /focus-visible:ring/);
});
