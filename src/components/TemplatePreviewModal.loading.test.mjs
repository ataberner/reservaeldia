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
  assert.match(modalSource, /!frameReady \? \([\s\S]*?<PreviewLoadingPresentation/);
  assert.match(modalSource, /error=\{Boolean\(frameError\)\}/);
  assert.match(modalSource, /setReloadAttempt\(\(current\) => current \+ 1\)/);
  assert.match(modalSource, /\{sourceIdentity \? \(\s*<iframe/);
  assert.equal(
    (modalSource.match(/<TemplatePreviewViewport\b/g) || []).length,
    1
  );
});

test("template preview scales the iframe during layout instead of resampling a transformed surface", () => {
  assert.match(modalSource, /resolveTemplatePreviewViewportLayout\(/);
  assert.match(modalSource, /hostViewportWidth/);
  assert.match(modalSource, /layoutViewportHeight/);
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

test("template preview locks background scroll roots without disabling iframe gestures", () => {
  assert.match(
    modalSource,
    /data-dashboard-scroll-root="true"/
  );
  assert.match(modalSource, /root\.style\.overflow = "hidden"/);
  assert.match(modalSource, /root\.style\.overscrollBehavior = "none"/);
  assert.match(modalSource, /root\.style\.overscrollBehaviorY = "none"/);
  assert.match(modalSource, /root\.style\.overflow = overflow/);
  assert.match(
    modalSource,
    /root\.style\.overscrollBehavior = overscrollBehavior/
  );
  assert.match(
    modalSource,
    /root\.style\.overscrollBehaviorY = overscrollBehaviorY/
  );
  assert.doesNotMatch(modalSource, /body\.style\.touchAction = "none"/);
  assert.match(modalSource, /scrolling="yes"/);
});

test("template preview loader is clipped by the branded mobile dialog boundary", () => {
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /closeButtonRef\.current\?\.focus/);
  assert.match(modalSource, /border-\[#692B9A\]/);
  assert.match(modalSource, /outline-none/);
  assert.match(
    modalSource,
    /max-sm:\[-webkit-mask-image:-webkit-radial-gradient\(white,black\)\]/
  );
  assert.match(modalSource, /overflow-hidden/);
});

test("template preview only offers application refresh for a classified stale chunk", () => {
  assert.match(
    modalSource,
    /previewStatus\?\.recoveryAction === CHUNK_LOAD_RECOVERY_ACTION/
  );
  assert.match(modalSource, /onClick=\{onRecoverStaleChunks\}/);
  assert.match(modalSource, /Actualizar aplicación/);
});
