export const PREVIEW_FRAME_LAYOUT_MODES = Object.freeze({
  PARITY: "parity",
  LEGACY: "legacy",
});

export const PREVIEW_FRAME_SCROLL_AUTHORITIES = Object.freeze({
  DOCUMENT: "document",
  BODY: "body",
});

const PREVIEW_FRAME_HIDE_SCROLLBARS_STYLE_ID = "preview-frame-hide-scrollbars";

function normalizeViewport(value = "") {
  return String(value || "").trim().toLowerCase();
}

function resolveEnvFlagValue() {
  if (typeof process === "undefined" || !process?.env) return "";
  return String(process.env.NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE || "").trim();
}

export function resolvePreviewFrameLayoutMode(explicitMode = "") {
  const normalized = String(explicitMode || resolveEnvFlagValue())
    .trim()
    .toLowerCase();

  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === PREVIEW_FRAME_LAYOUT_MODES.LEGACY
  ) {
    return PREVIEW_FRAME_LAYOUT_MODES.LEGACY;
  }

  return PREVIEW_FRAME_LAYOUT_MODES.PARITY;
}

function injectDataAttribute(html, tagName, attrName, attrValue) {
  const source = String(html || "");
  const safeValue = String(attrValue || "").replace(/"/g, "&quot;");
  const tagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, "i");
  const attrPattern = new RegExp(`\\s${attrName}="[^"]*"`, "i");

  return source.replace(tagPattern, (match) => {
    if (attrPattern.test(match)) {
      return match.replace(attrPattern, ` ${attrName}="${safeValue}"`);
    }
    return match.replace(/>$/, ` ${attrName}="${safeValue}">`);
  });
}

function injectInlineStyle(html, tagName, declarations) {
  const source = String(html || "");
  const nextDeclarations = String(declarations || "").trim();
  if (!source || !nextDeclarations) return source;
  const tagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, "i");
  const stylePattern = /\sstyle="([^"]*)"/i;

  return source.replace(tagPattern, (match) => {
    if (stylePattern.test(match)) {
      return match.replace(stylePattern, (_style, currentValue) => {
        const separator = String(currentValue || "").trim().endsWith(";") ? "" : ";";
        return ` style="${currentValue}${separator}${nextDeclarations}"`;
      });
    }
    return match.replace(/>$/, ` style="${nextDeclarations}">`);
  });
}

function injectBeforeClosingHead(html, markup = "") {
  const source = String(html || "");
  const content = String(markup || "").trim();
  if (!source || !content) return source;

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${content}</head>`);
  }
  const headPattern = /<head(\s[^>]*)?>/i;
  if (headPattern.test(source)) {
    return source.replace(headPattern, (match) => `${match}${content}`);
  }

  const htmlPattern = /<html(\s[^>]*)?>/i;
  if (htmlPattern.test(source)) {
    return source.replace(htmlPattern, (match) => `${match}${content}`);
  }

  return `${content}${source}`;
}

function normalizeScrollAuthority(value = "") {
  return String(value || "").trim().toLowerCase() ===
    PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY
    ? PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY
    : PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT;
}

function adaptGeneratedPreviewScrollRoot(html) {
  return String(html || "")
    .replace(
      /window\.__previewMobileScrollAuthority\s*=\s*"document\.scrollingElement";/g,
      'window.__previewMobileScrollAuthority = "body";'
    )
    .replace(
      /var scrollRoot\s*=\s*document\.scrollingElement\s*\|\|\s*document\.documentElement\s*\|\|\s*document\.body\s*\|\|\s*null;/g,
      `var scrollRoot =
      (typeof window.__resolvePreviewScrollRoot === "function"
        ? window.__resolvePreviewScrollRoot()
        : null) ||
      document.scrollingElement ||
      document.documentElement ||
      document.body ||
      null;`
    );
}

function injectFocusedBodyScrollContract(html) {
  const contract = `
<style id="preview-focused-body-scroll-authority">
  html[data-preview-surface="mobile-preview-focused"][data-preview-scroll-authority="body"] {
    height: 100% !important;
    min-height: 0 !important;
    overflow-x: hidden !important;
    overflow-y: hidden !important;
    overscroll-behavior: none !important;
    overscroll-behavior-y: none !important;
    scroll-behavior: auto !important;
  }
  body[data-preview-surface="mobile-preview-focused"][data-preview-scroll-authority="body"] {
    height: 100%;
    min-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    overscroll-behavior-y: contain;
  }
  body[data-preview-surface="mobile-preview-focused"][data-preview-scroll-authority="body"]:has(#modal-rsvp[style*="display: flex"]) {
    overflow-y: hidden !important;
  }
</style>
<script data-preview-scroll-authority="body">
  window.__previewMobileScrollAuthority = "body";
  window.__resolvePreviewScrollRoot = function(){
    return document.body || null;
  };
</script>`;

  return injectBeforeClosingHead(adaptGeneratedPreviewScrollRoot(html), contract);
}

export function buildPreviewFrameSrcDoc(
  htmlContent,
  {
    previewViewport = "",
    layoutMode = "",
    previewSurface = "",
    scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  } = {}
) {
  const source = String(htmlContent || "");
  if (!source) return source;

  const viewportValue = normalizeViewport(previewViewport);
  const modeValue = resolvePreviewFrameLayoutMode(layoutMode);
  const surfaceValue = String(previewSurface || "").trim().toLowerCase();
  const authorityValue = normalizeScrollAuthority(scrollAuthority);
  let next = source;

  if (viewportValue) {
    next = injectDataAttribute(next, "html", "data-preview-viewport", viewportValue);
    next = injectDataAttribute(next, "body", "data-preview-viewport", viewportValue);
  }

  next = injectDataAttribute(next, "html", "data-preview-layout-mode", modeValue);
  next = injectDataAttribute(next, "body", "data-preview-layout-mode", modeValue);

  if (surfaceValue) {
    next = injectDataAttribute(next, "html", "data-preview-surface", surfaceValue);
    next = injectDataAttribute(next, "body", "data-preview-surface", surfaceValue);
  }

  const focusedBodyAuthority =
    viewportValue === "mobile" &&
    modeValue === PREVIEW_FRAME_LAYOUT_MODES.PARITY &&
    surfaceValue === "mobile-preview-focused" &&
    authorityValue === PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY;

  if (focusedBodyAuthority) {
    next = injectDataAttribute(next, "html", "data-preview-scroll-authority", "body");
    next = injectDataAttribute(next, "body", "data-preview-scroll-authority", "body");
    next = injectInlineStyle(
      next,
      "html",
      "height:100%;min-height:0;overflow-x:hidden;overflow-y:hidden;overscroll-behavior:none;scroll-behavior:auto"
    );
    next = injectInlineStyle(
      next,
      "body",
      "height:100%;min-height:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain"
    );
    next = injectFocusedBodyScrollContract(next);
  }

  return next;
}

function applyScrollbarChrome(frameDocument) {
  frameDocument.documentElement.style.scrollbarWidth = "none";
  frameDocument.documentElement.style.msOverflowStyle = "none";
  frameDocument.body.style.scrollbarWidth = "none";
  frameDocument.body.style.msOverflowStyle = "none";
}

function applyLegacyMobileLayoutStyles(frameDocument) {
  frameDocument.documentElement.style.height = "auto";
  frameDocument.documentElement.style.minHeight = "100%";
  frameDocument.documentElement.style.overflowX = "hidden";
  frameDocument.documentElement.style.overflowY = "auto";
  frameDocument.documentElement.style.overscrollBehavior = "contain";
  frameDocument.documentElement.style.overscrollBehaviorY = "contain";
  frameDocument.documentElement.style.scrollBehavior = "auto";
  frameDocument.body.style.height = "auto";
  frameDocument.body.style.minHeight = "100%";
  frameDocument.body.style.overflowX = "hidden";
  frameDocument.body.style.overflowY = "hidden";
  frameDocument.body.style.overscrollBehavior = "none";
  frameDocument.body.style.overscrollBehaviorY = "none";
}

function applyParityMobileScrollRootStyles(
  frameDocument,
  { scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT } = {}
) {
  const bodyRoot = normalizeScrollAuthority(scrollAuthority) ===
    PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY;

  if (bodyRoot) {
    frameDocument.documentElement.style.height = "100%";
    frameDocument.documentElement.style.minHeight = "0";
    frameDocument.documentElement.style.overflowX = "hidden";
    frameDocument.documentElement.style.overflowY = "hidden";
    frameDocument.documentElement.style.overscrollBehavior = "none";
    frameDocument.documentElement.style.overscrollBehaviorY = "none";
    frameDocument.documentElement.style.scrollBehavior = "auto";
    frameDocument.body.style.height = "100%";
    frameDocument.body.style.minHeight = "100%";
    frameDocument.body.style.overflowX = "hidden";
    frameDocument.body.style.overflowY = "auto";
    frameDocument.body.style.overscrollBehavior = "contain";
    frameDocument.body.style.overscrollBehaviorY = "contain";
    return;
  }

  frameDocument.documentElement.style.height = "auto";
  frameDocument.documentElement.style.minHeight = "100%";
  frameDocument.documentElement.style.overflowX = "hidden";
  frameDocument.documentElement.style.overflowY = "auto";
  frameDocument.documentElement.style.overscrollBehavior = "contain";
  frameDocument.documentElement.style.overscrollBehaviorY = "contain";
  frameDocument.documentElement.style.scrollBehavior = "auto";
  frameDocument.body.style.height = "auto";
  frameDocument.body.style.minHeight = "100%";
  frameDocument.body.style.overflowX = "hidden";
  frameDocument.body.style.overflowY = "visible";
}

function buildScrollbarStyleText({
  legacyMobileLayout = false,
  parityMobileScrollRoot = false,
  scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
} = {}) {
  const legacyLayoutCss = legacyMobileLayout
    ? `
        html[data-preview-viewport="mobile"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
          scroll-behavior: auto !important;
        }
        body[data-preview-viewport="mobile"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: hidden !important;
          overscroll-behavior: none !important;
          overscroll-behavior-y: none !important;
        }
      `
    : "";
  const bodyRoot = normalizeScrollAuthority(scrollAuthority) ===
    PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY;
  const parityScrollRootCss = parityMobileScrollRoot
    ? bodyRoot
      ? `
        html[data-preview-viewport="mobile"][data-preview-layout-mode="parity"][data-preview-scroll-authority="body"] {
          height: 100% !important;
          min-height: 0 !important;
          overflow-x: hidden !important;
          overflow-y: hidden !important;
          overscroll-behavior: none !important;
          overscroll-behavior-y: none !important;
          scroll-behavior: auto !important;
        }
        body[data-preview-viewport="mobile"][data-preview-layout-mode="parity"][data-preview-scroll-authority="body"] {
          height: 100%;
          min-height: 100%;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          overscroll-behavior-y: contain;
        }
        body[data-preview-surface="mobile-preview-focused"][data-preview-scroll-authority="body"]:has(#modal-rsvp[style*="display: flex"]) {
          overflow-y: hidden !important;
        }
      `
      : `
        html[data-preview-viewport="mobile"][data-preview-layout-mode="parity"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
          scroll-behavior: auto !important;
        }
        body[data-preview-viewport="mobile"][data-preview-layout-mode="parity"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: visible !important;
        }
      `
    : "";

  return `
        ${legacyLayoutCss}
        ${parityScrollRootCss}
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `;
}

function ensurePreviewFrameStyle(frameDocument, options = {}) {
  let styleNode = frameDocument.getElementById(PREVIEW_FRAME_HIDE_SCROLLBARS_STYLE_ID);
  if (!styleNode) {
    styleNode = frameDocument.createElement("style");
    styleNode.id = PREVIEW_FRAME_HIDE_SCROLLBARS_STYLE_ID;
    frameDocument.head?.appendChild(styleNode);
  }
  styleNode.textContent = buildScrollbarStyleText(options);
}

export function applyPreviewFrameScale(
  event,
  scale,
  previewViewport = "",
  {
    layoutMode = "",
    dispatchMobileScrollEvent = true,
    previewSurface = "",
    scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  } = {}
) {
  const safeScale = Number(scale);
  const frameDocument = event?.target?.contentDocument;
  const frameWindow = event?.target?.contentWindow;
  if (!frameDocument || !Number.isFinite(safeScale) || safeScale <= 0) return;

  const scaleValue = String(safeScale);
  const viewportValue = normalizeViewport(previewViewport);
  const resolvedLayoutMode = resolvePreviewFrameLayoutMode(layoutMode);
  const legacyMobileLayout =
    viewportValue === "mobile" &&
    resolvedLayoutMode === PREVIEW_FRAME_LAYOUT_MODES.LEGACY;
  const parityMobileScrollRoot =
    viewportValue === "mobile" &&
    resolvedLayoutMode === PREVIEW_FRAME_LAYOUT_MODES.PARITY;
  const resolvedScrollAuthority = normalizeScrollAuthority(scrollAuthority);
  const focusedBodyAuthority =
    parityMobileScrollRoot &&
    String(previewSurface || "").trim().toLowerCase() === "mobile-preview-focused" &&
    resolvedScrollAuthority === PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY;

  frameDocument.documentElement?.setAttribute?.("data-preview-scale", scaleValue);
  frameDocument.body?.setAttribute?.("data-preview-scale", scaleValue);
  frameDocument.documentElement?.setAttribute?.("data-preview-layout-mode", resolvedLayoutMode);
  frameDocument.body?.setAttribute?.("data-preview-layout-mode", resolvedLayoutMode);

  if (previewSurface) {
    frameDocument.documentElement?.setAttribute?.("data-preview-surface", previewSurface);
    frameDocument.body?.setAttribute?.("data-preview-surface", previewSurface);
  }
  if (focusedBodyAuthority) {
    frameDocument.documentElement?.setAttribute?.("data-preview-scroll-authority", "body");
    frameDocument.body?.setAttribute?.("data-preview-scroll-authority", "body");
  }

  if (viewportValue) {
    frameDocument.documentElement?.setAttribute?.("data-preview-viewport", viewportValue);
    frameDocument.body?.setAttribute?.("data-preview-viewport", viewportValue);
  }

  try {
    applyScrollbarChrome(frameDocument);
    if (legacyMobileLayout) {
      applyLegacyMobileLayoutStyles(frameDocument);
    } else if (parityMobileScrollRoot) {
      applyParityMobileScrollRootStyles(frameDocument, {
        scrollAuthority: focusedBodyAuthority
          ? PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY
          : PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
      });
    }
    ensurePreviewFrameStyle(frameDocument, {
      legacyMobileLayout,
      parityMobileScrollRoot,
      scrollAuthority: focusedBodyAuthority
        ? PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY
        : PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
    });
  } catch (_error) {
    // noop
  }

  try {
    if (frameWindow) {
      frameWindow.__previewScale = safeScale;
      frameWindow.__previewViewportKind = viewportValue;
      frameWindow.__previewLayoutMode = resolvedLayoutMode;
      if (focusedBodyAuthority) {
        frameWindow.__previewMobileScrollAuthority = "body";
        frameWindow.__resolvePreviewScrollRoot = () => frameDocument.body || null;
      }
      if (dispatchMobileScrollEvent !== false) {
        frameWindow.dispatchEvent(new frameWindow.Event("preview:mobile-scroll:enable"));
      }
      if (focusedBodyAuthority) {
        frameWindow.__previewMobileScrollAuthority = "body";
      }
    }
  } catch (_error) {
    // noop
  }

  if (!frameWindow?.requestAnimationFrame) return;
  frameWindow.requestAnimationFrame(() => {
    try {
      frameWindow.dispatchEvent(new frameWindow.Event("resize"));
    } catch (_error) {
      // noop
    }
  });
}
