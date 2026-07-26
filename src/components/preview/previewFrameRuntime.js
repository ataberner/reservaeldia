export const PREVIEW_FRAME_LAYOUT_MODES = Object.freeze({
  PARITY: "parity",
  LEGACY: "legacy",
});

export const PREVIEW_FRAME_SCROLL_AUTHORITIES = Object.freeze({
  DOCUMENT: "document",
  BODY: "body",
});

export const PREVIEW_FRAME_READY_EVENT = "invitation-loader-hidden";
export const PREVIEW_FRAME_TIMING_EVENT = "preview-timing-event";

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

function injectPreviewTimingCollector(html) {
  const collector = `
<script data-preview-timing-collector="1">
(function(){
  var root = document.documentElement;
  var sessionId = String(root && root.getAttribute("data-preview-timing-session") || "");
  if (!sessionId) return;
  var startedAt = performance.now();
  var queue = window.__previewTimingEvents = window.__previewTimingEvents || [];
  function emit(stage, durationMs, detail){
    var parentAt = null;
    try {
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.performance &&
        typeof window.parent.performance.now === "function"
      ) {
        parentAt = window.parent.performance.now();
      }
    } catch (_error) {
      parentAt = null;
    }
    var item = {
      sessionId: sessionId,
      stage: String(stage || "unknown"),
      durationMs: Math.max(0, Number(durationMs) || 0),
      at: performance.now(),
      parentAt: parentAt,
      viewport: String(root.getAttribute("data-preview-viewport") || ""),
      surface: String(root.getAttribute("data-preview-timing-surface") || ""),
      detail: detail && typeof detail === "object" ? detail : {}
    };
    queue.push(item);
    if (queue.length > 80) queue.splice(0, queue.length - 80);
    try {
      window.dispatchEvent(new CustomEvent("${PREVIEW_FRAME_TIMING_EVENT}", { detail: item }));
    } catch (_error) {
      // noop
    }
  }
  function readCriticalImageTiming(){
    try {
      var firstSection = document.querySelector(".sec");
      var backgroundNode = firstSection && firstSection.querySelector(".sec-bg");
      var imageNode = backgroundNode && backgroundNode.querySelector(".sec-bg-image");
      var source = String(imageNode && imageNode.getAttribute("src") || "");
      if (!source && backgroundNode) {
        var backgroundValue = String(
          backgroundNode.style.backgroundImage ||
          window.getComputedStyle(backgroundNode).backgroundImage ||
          ""
        );
        var start = backgroundValue.indexOf("url(");
        var end = backgroundValue.lastIndexOf(")");
        if (start >= 0 && end > start) {
          source = backgroundValue
            .slice(start + 4, end)
            .trim()
            .replace(/^['"]|['"]$/g, "");
        }
      }
      if (!source) return { durationMs: 0, measurement: "no-critical-image" };
      var absoluteSource = new URL(source, document.baseURI).href;
      var resources = performance.getEntriesByType("resource");
      var resource = resources.slice().reverse().find(function(entry){
        return String(entry && entry.name || "") === absoluteSource;
      });
      return {
        durationMs: Math.max(0, Number(resource && resource.duration) || 0),
        measurement: resource ? "resource-timing" : "runtime-ready-fallback"
      };
    } catch (_error) {
      return { durationMs: 0, measurement: "unavailable" };
    }
  }
  window.__recordPreviewTimingEvent = emit;
  emit("iframe-runtime-bootstrap", 0, { readyState: document.readyState });
  emit("runtime-initialization-start", 0);
  window.addEventListener("DOMContentLoaded", function(){
    emit("dom-content-loaded", performance.now() - startedAt);
  }, { once: true });
  window.addEventListener("load", function(){
    emit("critical-resources-loaded", performance.now() - startedAt);
  }, { once: true });
  window.addEventListener("invitation-runtime-ready", function(event){
    var criticalImage = readCriticalImageTiming();
    emit(
      "critical-image-ready",
      criticalImage.durationMs || performance.now() - startedAt,
      { measurement: criticalImage.measurement }
    );
    emit("runtime-initialized", performance.now() - startedAt);
    emit("invitation-runtime-ready", performance.now() - startedAt, {
      source: String(event && event.detail && event.detail.source || "")
    });
  }, { once: true });
  window.addEventListener("invitation-runtime-failed", function(event){
    emit("invitation-runtime-failed", performance.now() - startedAt, {
      reason: String(event && event.detail && event.detail.reason || "runtime-failed")
    });
  }, { once: true });
  window.addEventListener("invitation-loader-hidden", function(){
    emit("invitation-loader-hidden-emitted", performance.now() - startedAt);
  }, { once: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function(){
      emit("critical-fonts-ready", performance.now() - startedAt);
    }).catch(function(){
      emit("critical-fonts-error", performance.now() - startedAt);
    });
  }
})();
</script>`;

  return injectBeforeClosingHead(html, collector);
}

export function buildPreviewFrameSrcDoc(
  htmlContent,
  {
    previewViewport = "",
    layoutMode = "",
    previewSurface = "",
    scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
    previewTiming = null,
  } = {}
) {
  const source = String(htmlContent || "");
  if (!source) return source;

  const viewportValue = normalizeViewport(previewViewport);
  const modeValue = resolvePreviewFrameLayoutMode(layoutMode);
  const surfaceValue = String(previewSurface || "").trim().toLowerCase();
  const authorityValue = normalizeScrollAuthority(scrollAuthority);
  const timingSessionId = String(previewTiming?.sessionId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 96);
  const timingSurface = String(previewTiming?.surface || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 80);
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

  if (timingSessionId) {
    next = injectDataAttribute(
      next,
      "html",
      "data-preview-timing-session",
      timingSessionId
    );
    next = injectDataAttribute(
      next,
      "body",
      "data-preview-timing-session",
      timingSessionId
    );
    if (timingSurface) {
      next = injectDataAttribute(
        next,
        "html",
        "data-preview-timing-surface",
        timingSurface
      );
      next = injectDataAttribute(
        next,
        "body",
        "data-preview-timing-surface",
        timingSurface
      );
    }
    next = injectPreviewTimingCollector(next);
  }

  return next;
}

export function observePreviewFrameTiming(iframe, onTiming) {
  const frameWindow = iframe?.contentWindow || null;
  if (!frameWindow || typeof onTiming !== "function") {
    return () => {};
  }

  let active = true;
  const forward = (item) => {
    if (!active || !item || typeof item !== "object") return;
    onTiming(item);
  };
  const handleTiming = (event) => {
    forward(event?.detail);
  };

  frameWindow.addEventListener?.(PREVIEW_FRAME_TIMING_EVENT, handleTiming);
  const queuedEvents = Array.isArray(frameWindow.__previewTimingEvents)
    ? frameWindow.__previewTimingEvents.slice()
    : [];
  queuedEvents.forEach(forward);

  return () => {
    active = false;
    frameWindow.removeEventListener?.(
      PREVIEW_FRAME_TIMING_EVENT,
      handleTiming
    );
  };
}

export function observePreviewFrameReadiness(iframe, onReady) {
  const frameDocument = iframe?.contentDocument || null;
  const frameWindow = iframe?.contentWindow || null;
  if (!frameDocument || !frameWindow || typeof onReady !== "function") {
    return () => {};
  }

  let settled = false;
  let bodyObserver = null;

  const isCurrentDocument = () => iframe?.contentDocument === frameDocument;
  const readRuntimeState = () => {
    const body = frameDocument.body || null;
    const loader = frameDocument.getElementById?.("inv-loader") || null;
    const loaderState = body?.getAttribute?.("data-loader-ready");
    const hasLoaderProtocol =
      Boolean(loader) || loaderState === "0" || loaderState === "1";

    return {
      body,
      loader,
      loaderState,
      hasLoaderProtocol,
      ready:
        !hasLoaderProtocol ||
        (loaderState === "1" && !loader),
    };
  };

  const cleanup = () => {
    frameWindow.removeEventListener?.(
      PREVIEW_FRAME_READY_EVENT,
      handleLoaderHidden
    );
    bodyObserver?.disconnect?.();
    bodyObserver = null;
  };

  const finish = (reason) => {
    if (settled || !isCurrentDocument()) return;
    settled = true;
    cleanup();
    onReady({
      document: frameDocument,
      reason,
    });
  };

  function handleLoaderHidden() {
    const runtimeState = readRuntimeState();
    if (runtimeState.loaderState === "1" && !runtimeState.loader) {
      finish("loader-hidden-event");
    }
  }

  frameWindow.addEventListener?.(
    PREVIEW_FRAME_READY_EVENT,
    handleLoaderHidden,
    { once: true }
  );

  const initialState = readRuntimeState();
  if (initialState.ready) {
    finish(
      initialState.hasLoaderProtocol
        ? "loader-already-hidden"
        : "frame-load"
    );
    return cleanup;
  }

  const MutationObserverConstructor = frameWindow.MutationObserver;
  if (
    initialState.body &&
    typeof MutationObserverConstructor === "function"
  ) {
    bodyObserver = new MutationObserverConstructor(() => {
      const runtimeState = readRuntimeState();
      if (runtimeState.ready) {
        finish("loader-removed");
      }
    });
    bodyObserver.observe(initialState.body, {
      childList: true,
    });
  }

  return cleanup;
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
