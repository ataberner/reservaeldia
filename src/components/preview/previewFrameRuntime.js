export const PREVIEW_FRAME_LAYOUT_MODES = Object.freeze({
  PARITY: "parity",
  LEGACY: "legacy",
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

export function buildPreviewFrameSrcDoc(
  htmlContent,
  { previewViewport = "", layoutMode = "" } = {}
) {
  const source = String(htmlContent || "");
  if (!source) return source;

  const viewportValue = normalizeViewport(previewViewport);
  const modeValue = resolvePreviewFrameLayoutMode(layoutMode);
  let next = source;

  if (viewportValue) {
    next = injectDataAttribute(next, "html", "data-preview-viewport", viewportValue);
    next = injectDataAttribute(next, "body", "data-preview-viewport", viewportValue);
  }

  next = injectDataAttribute(next, "html", "data-preview-layout-mode", modeValue);
  next = injectDataAttribute(next, "body", "data-preview-layout-mode", modeValue);

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

function applyParityMobileScrollRootStyles(frameDocument) {
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
  const parityScrollRootCss = parityMobileScrollRoot
    ? `
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
  { layoutMode = "" } = {}
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

  frameDocument.documentElement?.setAttribute?.("data-preview-scale", scaleValue);
  frameDocument.body?.setAttribute?.("data-preview-scale", scaleValue);
  frameDocument.documentElement?.setAttribute?.("data-preview-layout-mode", resolvedLayoutMode);
  frameDocument.body?.setAttribute?.("data-preview-layout-mode", resolvedLayoutMode);

  if (viewportValue) {
    frameDocument.documentElement?.setAttribute?.("data-preview-viewport", viewportValue);
    frameDocument.body?.setAttribute?.("data-preview-viewport", viewportValue);
  }

  try {
    applyScrollbarChrome(frameDocument);
    if (legacyMobileLayout) {
      applyLegacyMobileLayoutStyles(frameDocument);
    } else if (parityMobileScrollRoot) {
      applyParityMobileScrollRootStyles(frameDocument);
    }
    ensurePreviewFrameStyle(frameDocument, { legacyMobileLayout, parityMobileScrollRoot });
  } catch (_error) {
    // noop
  }

  try {
    if (frameWindow) {
      frameWindow.__previewScale = safeScale;
      frameWindow.__previewViewportKind = viewportValue;
      frameWindow.__previewLayoutMode = resolvedLayoutMode;
      frameWindow.dispatchEvent(new frameWindow.Event("preview:mobile-scroll:enable"));
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
