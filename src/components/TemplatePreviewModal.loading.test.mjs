import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modalSource = readFileSync(
  new URL("./TemplatePreviewModal.jsx", import.meta.url),
  "utf8"
);

test("template preview keeps one iframe-mounted loading presentation", () => {
  assert.doesNotMatch(modalSource, /Cargando vista previa/);
  assert.match(
    modalSource,
    /buildInvitationLoaderLoadingDocumentHTML\(\)/
  );
  assert.match(
    modalSource,
    /previewRuntime\.shouldShowLoadingState \|\| shouldShowGeneratedPreview/
  );
  assert.match(
    modalSource,
    /shouldShowGeneratedPreview\s*\? previewHtml\s*: TEMPLATE_PREVIEW_LOADING_DOCUMENT/
  );
  assert.equal(
    (modalSource.match(/<TemplatePreviewViewport\b/g) || []).length,
    1
  );
});
