import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modalSource = readFileSync(
  new URL("./TemplatePreviewModal.jsx", import.meta.url),
  "utf8"
);

test("template preview keeps one stable loading authority and mounts only final html", () => {
  assert.doesNotMatch(modalSource, /Cargando vista previa/);
  assert.doesNotMatch(modalSource, /TEMPLATE_PREVIEW_LOADING_DOCUMENT/);
  assert.match(
    modalSource,
    /previewRuntime\.shouldShowLoadingState \|\| shouldShowGeneratedPreview/
  );
  assert.match(
    modalSource,
    /srcDoc=\{shouldShowGeneratedPreview \? previewHtml : null\}/
  );
  assert.match(modalSource, /observePreviewFrameReadiness\(/);
  assert.match(modalSource, /!frameReady \? <PreviewLoadingPresentation \/> : null/);
  assert.match(modalSource, /\{sourceIdentity \? \(\s*<iframe/);
  assert.equal(
    (modalSource.match(/<TemplatePreviewViewport\b/g) || []).length,
    1
  );
});

test("template preview scales the iframe during layout instead of resampling a transformed surface", () => {
  assert.match(modalSource, /zoom: scale/);
  assert.doesNotMatch(modalSource, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(modalSource, /applyPreviewFrameScale\(/);
});

test("template preview does not mediate iframe gestures and cleans its measurements", () => {
  assert.doesNotMatch(
    modalSource,
    /addEventListener\(\s*["'](?:wheel|scroll|touchmove|pointermove)["']/
  );
  assert.doesNotMatch(
    modalSource,
    /(?:scrollTop\s*=|scrollTo\(|scrollBy\()/
  );
  assert.match(modalSource, /observer\.disconnect\(\)/);
  assert.match(modalSource, /window\.removeEventListener\("resize", measure\)/);
});
