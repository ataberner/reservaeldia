import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("../ModalVistaPrevia.jsx", import.meta.url),
  "utf8"
);

test("mobile preview keeps the loaded iframe mounted after HTML becomes available", () => {
  assert.doesNotMatch(modalSource, /\biframeKey\b/);
  assert.doesNotMatch(modalSource, /\bfullscreenIframeKey\b/);
  assert.doesNotMatch(modalSource, /<iframe\s+key=/);
  assert.match(
    modalSource,
    /const srcDocResult = useMemo\(\(\) => \{[\s\S]*?buildPreviewFrameSrcDoc\(htmlContent,\s*\{/
  );
  assert.match(modalSource, /srcDoc=\{srcDocResult\.srcDoc\}/);
  assert.match(modalSource, /if \(!visible\) return null;/);
});

test("preview modal and mockups keep one stable heart loader around a single final iframe mount", () => {
  const removedLoaderCopy = ["Generando", "vista", "previa..."].join(" ");
  assert.equal(modalSource.includes(removedLoaderCopy), false);
  assert.doesNotMatch(modalSource, /PREVIEW_LOADING_DOCUMENT/);
  assert.doesNotMatch(modalSource, /htmlContent=\{htmlContent \|\|/);
  assert.match(
    modalSource,
    /PreviewLoadingPresentation/
  );
  assert.match(
    modalSource,
    /\{htmlContent \? \(\s*\/\/ The final srcDoc mounts once\.[\s\S]*?<PreviewIframeDocument/
  );
  assert.match(modalSource, /observePreviewFrameReadiness\(/);
  assert.match(modalSource, /observePreviewFrameTiming\(/);
  assert.match(modalSource, /setPreviewTimingExpectedSurfaces\(/);
  assert.match(modalSource, /recordKey: `iframe-mounted:\$\{surface\}`/);
  assert.match(modalSource, /!frameReady \? \(\s*<PreviewLoadingPresentation/);
});

test("only mobile-preview-focused requests body scroll authority", () => {
  const bodyAuthorityMatches = modalSource.match(
    /scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/g
  );
  assert.equal(bodyAuthorityMatches?.length, 1);
  assert.match(
    modalSource,
    /previewSurface="mobile-preview-focused"\s+scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/
  );
  assert.doesNotMatch(modalSource, /mobile-preview-paired[\s\S]{0,200}SCROLL_AUTHORITIES\.BODY/);
  assert.doesNotMatch(modalSource, /Copiar logs/);
  assert.doesNotMatch(modalSource, /previewScrollAB/);
  assert.doesNotMatch(modalSource, /setIframeKey/);
});
