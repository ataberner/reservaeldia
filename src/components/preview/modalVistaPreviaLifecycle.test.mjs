import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("../ModalVistaPrevia.jsx", import.meta.url),
  "utf8"
);
const loadingPresentationSource = readFileSync(
  new URL("./PreviewLoadingPresentation.jsx", import.meta.url),
  "utf8"
);
const invitationLoaderPresentationSource = readFileSync(
  new URL("../../../shared/invitationLoaderPresentation.cjs", import.meta.url),
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

test("the shared fixed heart loader is contained by its preview frame from the first loading render", () => {
  assert.match(
    invitationLoaderPresentationSource,
    /\.inv-loader\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/
  );
  assert.match(
    loadingPresentationSource,
    /className=\{`absolute inset-0 z-10 overflow-hidden/
  );
  assert.match(
    loadingPresentationSource,
    /style=\{\{\s*contain:\s*"layout paint"\s*\}\}/
  );
  assert.match(
    loadingPresentationSource,
    /data-preview-loading-authority="frame"/
  );
  assert.doesNotMatch(loadingPresentationSource, /transform:\s*["'`]scale/);
});

test("the overlapping mobile mockup stays above the isolated desktop loader layer", () => {
  assert.match(
    modalSource,
    /className="absolute left-0 top-0 isolate z-0">\s*\{desktopPreview\}/
  );
  assert.match(
    modalSource,
    /className="absolute isolate z-10"\s+style=\{\{ left: layout\.mobileLeft, top: layout\.mobileTop \}\}/
  );
});

test("scaled preview mockups use layout zoom without changing the logical viewport", () => {
  assert.match(modalSource, /zoom: scale/);
  assert.doesNotMatch(modalSource, /transform: `scale\(\$\{scale\}\)`/);
  assert.doesNotMatch(
    modalSource,
    /marginTop:\s*-\d|translateY\(-|outline:\s*["'`]\d|borderBottom/
  );
});

test("only embedded mobile mockups request body scroll authority", () => {
  const bodyAuthorityMatches = modalSource.match(
    /scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/g
  );
  assert.equal(bodyAuthorityMatches?.length, 2);
  assert.match(
    modalSource,
    /previewSurface="mobile-preview-paired"\s+scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/
  );
  assert.match(
    modalSource,
    /previewSurface="mobile-preview-focused"\s+scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/
  );
  assert.doesNotMatch(
    modalSource,
    /<DesktopPreviewShell[\s\S]{0,500}scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/
  );
  assert.doesNotMatch(
    modalSource,
    /previewSurface=\{`fullscreen-\$\{fullscreenViewport\}`\}[\s\S]{0,300}scrollAuthority=\{PREVIEW_FRAME_SCROLL_AUTHORITIES\.BODY\}/
  );
  assert.doesNotMatch(modalSource, /Copiar logs/);
  assert.doesNotMatch(modalSource, /previewScrollAB/);
  assert.doesNotMatch(modalSource, /setIframeKey/);
});

test("preview shell leaves gestures to the iframe and cleans lifecycle observers and RAF", () => {
  assert.doesNotMatch(
    modalSource,
    /addEventListener\(\s*["'](?:wheel|scroll|touchmove|pointermove)["']/
  );
  assert.doesNotMatch(
    modalSource,
    /(?:scrollTop\s*=|scrollTo\(|scrollBy\()/
  );
  assert.match(modalSource, /readinessCleanupRef\.current\?\.\(\)/);
  assert.match(modalSource, /timingCleanupRef\.current\?\.\(\)/);
  assert.match(modalSource, /observer\.disconnect\(\)/);
  assert.match(modalSource, /window\.cancelAnimationFrame\(frameId\)/);
  assert.match(modalSource, /window\.removeEventListener\("resize", onResize\)/);
});

test("draft preview diagnostics keep their authority label when publication actions are hidden", () => {
  assert.equal(
    (
      modalSource.match(
        /stage: previewTimingType === "draft-authoritative"/g
      ) || []
    ).length,
    2
  );
  assert.doesNotMatch(
    modalSource,
    /stage: showPublishActions\s*\? "draft-preview-/
  );
});

test("read-only preview still surfaces prepared validation and render errors", () => {
  assert.match(
    modalSource,
    /const showNoticeLayer =\s*showPublishActions \|\| publishNoticePresentation\.notices\.length > 0/
  );
  assert.match(
    modalSource,
    /\{showNoticeLayer \? \(\s*<PreviewPublishNoticeLayer/
  );
});
