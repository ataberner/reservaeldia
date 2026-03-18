export function generarMotionEffectsRuntimeHTML(): string {
  return `
<style>
  .mefx-preparing .mefx-reveal-init,
  .mefx-preparing .mefx-zoom-init,
  .mefx-preparing .mefx-draw-init,
  .mefx-preparing .mefx-stagger-item {
    transition: none !important;
  }

  .mefx-reveal-init {
    opacity: 0;
    translate: 0 14px;
    will-change: opacity, translate;
    transition:
      opacity 640ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 640ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .mefx-reveal-on {
    opacity: 1;
    translate: 0 0;
  }

  .mefx-zoom-init {
    opacity: 0;
    scale: 0.98;
    transform-origin: center center;
    will-change: opacity, scale;
    transition:
      opacity 620ms cubic-bezier(0.22, 1, 0.36, 1),
      scale 760ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .mefx-zoom-on {
    opacity: 1;
    scale: 1;
  }

  .mefx-draw-init {
    opacity: 0.95;
    scale: 0 1;
    transform-origin: left center;
    will-change: scale;
    transition:
      opacity 520ms ease,
      scale 800ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .mefx-draw-on {
    opacity: 1;
    scale: 1 1;
  }

  .mefx-hover {
    cursor: pointer;
    transform-origin: center center;
    will-change: scale, opacity;
    transition:
      scale 230ms ease,
      opacity 230ms ease;
  }

  .mefx-hover:hover {
    scale: 1.01;
  }

  .mefx-hover:active {
    scale: 0.99;
  }

  .mefx-hover:focus-visible {
    outline: 2px solid rgba(119, 61, 190, 0.34);
    outline-offset: 2px;
  }

  @keyframes mefxPulse {
    0%, 100% {
      opacity: 1;
      filter: none;
    }
    50% {
      opacity: 0.9;
      filter: saturate(1.03);
    }
  }

  @keyframes mefxPulseCountdownChip {
    0%, 100% {
      transform: translateY(0) scale(1);
      box-shadow: 0 0 0 rgba(17, 24, 39, 0);
    }
    50% {
      transform: translateY(-1px) scale(1.018);
      box-shadow: 0 8px 16px rgba(17, 24, 39, 0.14);
    }
  }

  .mefx-pulse {
    animation: mefxPulse 2.6s ease-in-out infinite;
  }

  .objeto[data-type="countdown"].mefx-pulse .cd-chip {
    animation: mefxPulseCountdownChip 2.6s ease-in-out infinite;
    transform-origin: center center;
    will-change: transform, box-shadow;
  }

  .objeto[data-type="countdown"].mefx-pulse .cd-chip:nth-child(1) {
    animation-delay: 0ms;
  }

  .objeto[data-type="countdown"].mefx-pulse .cd-chip:nth-child(2) {
    animation-delay: 90ms;
  }

  .objeto[data-type="countdown"].mefx-pulse .cd-chip:nth-child(3) {
    animation-delay: 180ms;
  }

  .objeto[data-type="countdown"].mefx-pulse .cd-chip:nth-child(4) {
    animation-delay: 270ms;
  }

  @keyframes mefxRsvp {
    0%, 100% {
      scale: 1;
      opacity: 1;
      filter: saturate(1) brightness(1);
    }
    50% {
      scale: 1.018;
      opacity: 0.99;
      filter: saturate(1.08) brightness(1.02);
    }
  }

  .objeto[data-type="rsvp"].mefx-rsvp {
    animation: mefxRsvp 2.2s ease-in-out infinite;
    transform-origin: center center;
    will-change: scale, opacity, filter;
  }

  .mefx-stagger-item {
    opacity: 0;
    translate: 0 10px;
    will-change: translate, opacity;
    transition:
      opacity 620ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 620ms cubic-bezier(0.22, 1, 0.36, 1);
    transition-delay: var(--mefx-stagger-delay, 0ms);
  }

  .mefx-stagger-item.mefx-stagger-on {
    opacity: 1;
    translate: 0 0;
  }

  @keyframes mefxRevealMobileIn {
    from {
      opacity: 0;
      translate: 0 10px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }

  @keyframes mefxZoomMobileIn {
    from {
      opacity: 0;
      scale: 0.99;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  @keyframes mefxDrawMobileIn {
    from {
      opacity: 0.95;
      scale: 0 1;
    }
    to {
      opacity: 1;
      scale: 1 1;
    }
  }

  @media (max-width: 767px) {
    .mefx-reveal-init {
      translate: 0 10px;
      transition-duration: 540ms;
    }

    .mefx-zoom-init {
      scale: 0.99;
      transition-duration: 580ms;
    }

    .mefx-draw-init {
      transition-duration: 640ms;
    }

    .mefx-stagger-item {
      transition-duration: 540ms;
    }

    /* Fallback robusto mobile: cuando se agrega "on", forzamos keyframes */
    .mefx-reveal-on {
      animation: mefxRevealMobileIn 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .mefx-zoom-on {
      animation: mefxZoomMobileIn 580ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .mefx-draw-on {
      animation: mefxDrawMobileIn 640ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .mefx-stagger-item.mefx-stagger-on {
      animation: mefxRevealMobileIn 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: var(--mefx-stagger-delay, 0ms);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mefx-reveal-init,
    .mefx-zoom-init,
    .mefx-draw-init,
    .mefx-stagger-item {
      opacity: 1 !important;
      translate: 0 0 !important;
      scale: 1 !important;
      transition: none !important;
    }

    .mefx-pulse {
      animation: none !important;
    }

    .objeto[data-type="countdown"].mefx-pulse .cd-chip {
      animation: none !important;
      transform: none !important;
      box-shadow: none !important;
    }

    .objeto[data-type="rsvp"].mefx-rsvp {
      animation: none !important;
      scale: 1 !important;
      opacity: 1 !important;
      filter: none !important;
    }
  }
</style>

<script>
(function(){
  var VALID_EFFECTS = { none: 1, reveal: 1, draw: 1, zoom: 1, hover: 1, pulse: 1, rsvp: 1 };
  var OBSERVED_EFFECTS = { reveal: 1, draw: 1, zoom: 1 };
  var STAGGER_SELECTOR = ".galeria-celda";
  var PREPARING_CLASS = "mefx-preparing";
  var RUNTIME_READY_EVENT = "invitation-runtime-ready";
  var RUNTIME_FAIL_EVENT = "invitation-runtime-failed";
  var LOADER_HIDDEN_EVENT = "invitation-loader-hidden";
  var LOADER_WAIT_TIMEOUT_MS = 2400;
  var READY_TIMEOUT_MS = 2600;
  var FONTS_TIMEOUT_MS = 1200;
  var DECOR_PARALLAX_MODES = { none: 1, soft: 1, dynamic: 1 };
  var DECOR_PARALLAX_DISTANCE = {
    soft: { mobile: 10, desktop: 14 },
    dynamic: { mobile: 14, desktop: 22 }
  };
  var bootStarted = false;
  var decorParallaxEntries = [];
  var decorParallaxFrame = 0;
  var decorParallaxStarted = false;
  var decorParallaxScrollWatchTimer = 0;
  var decorParallaxLastScrollTop = -1;
  var decorParallaxLastScheduleSource = "boot";
  var decorParallaxLastDebugLogAt = 0;
  var decorParallaxNativeScrollSeen = false;

  function normalizeEffect(value){
    var normalized = String(value || "").trim().toLowerCase();
    return VALID_EFFECTS[normalized] ? normalized : "none";
  }

  function normalizeType(value){
    return String(value || "").trim().toLowerCase();
  }

  function normalizeDecorParallax(value){
    var normalized = String(value || "").trim().toLowerCase();
    return DECOR_PARALLAX_MODES[normalized] ? normalized : "none";
  }

  function clampNumber(value, min, max){
    var numeric = Number(value);
    if (!isFinite(numeric)) return min;
    return Math.min(Math.max(numeric, min), max);
  }

  function toPositiveNumber(value){
    var numeric = Number(value);
    return isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function minPositive(values, fallback){
    var valid = (Array.isArray(values) ? values : []).filter(function(value){
      return isFinite(value) && value > 0;
    });
    if (!valid.length) return fallback;
    return Math.min.apply(null, valid);
  }

  function detectEmbeddedContext(){
    try {
      return window.self !== window.top;
    } catch (_error) {
      return true;
    }
  }

  function getViewportWidth(){
    var docEl = document.documentElement;
    var embeddedContext = detectEmbeddedContext();
    var docWidth = toPositiveNumber(docEl && docEl.clientWidth);
    var innerWidthValue = toPositiveNumber(window.innerWidth);
    var visualViewportWidth = 0;

    try {
      visualViewportWidth = toPositiveNumber(window.visualViewport && window.visualViewport.width);
    } catch (_error) {
      visualViewportWidth = 0;
    }

    if (embeddedContext) {
      return minPositive(
        [docWidth, innerWidthValue, visualViewportWidth],
        docWidth || innerWidthValue || visualViewportWidth || 0
      );
    }

    return docWidth || innerWidthValue || visualViewportWidth || 0;
  }

  function getViewportHeight(){
    var docEl = document.documentElement;
    var embeddedContext = detectEmbeddedContext();
    var docHeight = toPositiveNumber(docEl && docEl.clientHeight);
    var innerHeightValue = toPositiveNumber(window.innerHeight);
    var visualViewportHeight = 0;

    try {
      visualViewportHeight = toPositiveNumber(window.visualViewport && window.visualViewport.height);
    } catch (_error) {
      visualViewportHeight = 0;
    }

    if (embeddedContext) {
      return minPositive(
        [docHeight, innerHeightValue, visualViewportHeight],
        innerHeightValue || docHeight || visualViewportHeight || 0
      );
    }

    return visualViewportHeight || innerHeightValue || docHeight || 0;
  }

  function isMobileViewport(){
    var viewportWidth = getViewportWidth();
    return viewportWidth <= 767;
  }

  function pickDecorParallaxDistance(mode){
    var config = DECOR_PARALLAX_DISTANCE[normalizeDecorParallax(mode)];
    if (!config) return 0;
    return isMobileViewport() ? config.mobile : config.desktop;
  }

  function getDecorParallaxPreviewScale(){
    if (!isDecorParallaxPreviewDocument()) return 1;

    var previewRoot = document.documentElement;
    var previewBody = document.body;
    return clampNumber(
      String(previewRoot && previewRoot.getAttribute && previewRoot.getAttribute("data-preview-scale") || "").trim() ||
        String(previewBody && previewBody.getAttribute && previewBody.getAttribute("data-preview-scale") || "").trim() ||
        1,
      0.32,
      1
    );
  }

  function getDecorParallaxDistanceMultiplier(){
    if (!isDecorParallaxPreviewDocument()) return 1;
    var previewScale = getDecorParallaxPreviewScale();
    var scaleCompensation = 1 / previewScale;
    var perceptualBoost = previewScale < 0.5 ? 1.55 : 1;
    return clampNumber(scaleCompensation * perceptualBoost, 1, 5);
  }

  function setPreparingState(active){
    if (!document.body || !document.body.classList) return;
    if (active) {
      document.body.classList.add(PREPARING_CLASS);
      return;
    }
    document.body.classList.remove(PREPARING_CLASS);
  }

  function dispatchRuntimeEvent(name, detail){
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_error) {
      // noop
    }
  }

  function isReducedMotion(){
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function waitForWindowLoad(maxWaitMs){
    return new Promise(function(resolve){
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      var finished = false;
      var onLoad = function(){
        if (finished) return;
        finished = true;
        resolve();
      };

      window.addEventListener("load", onLoad, { once: true });
      window.setTimeout(function(){
        if (finished) return;
        finished = true;
        resolve();
      }, maxWaitMs);
    });
  }

  function waitForFonts(maxWaitMs){
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }

    return Promise.race([
      document.fonts.ready.catch(function(){ return null; }),
      new Promise(function(resolve){
        window.setTimeout(resolve, maxWaitMs);
      })
    ]).then(function(){ return null; });
  }

  function waitForRuntimeReady(){
    return Promise.all([
      waitForWindowLoad(READY_TIMEOUT_MS),
      waitForFonts(FONTS_TIMEOUT_MS)
    ]).then(function(){ return null; });
  }

  function extractFirstUrl(value){
    var raw = String(value || "");
    if (!raw || raw === "none") return "";
    var match = raw.match(/url\((['"]?)(.*?)\\1\)/i);
    if (!match || !match[2]) return "";
    return match[2].trim();
  }

  function getFirstSectionBackgroundUrl(){
    var firstSection = document.querySelector(".sec");
    if (!firstSection) return "";
    var bgNode = firstSection.querySelector(".sec-bg");
    if (!bgNode) return "";

    var inlineUrl = extractFirstUrl(bgNode.getAttribute("style"));
    if (inlineUrl) return inlineUrl;

    try {
      var computedUrl = extractFirstUrl(window.getComputedStyle(bgNode).backgroundImage);
      return computedUrl;
    } catch (_error) {
      return "";
    }
  }

  function loadImage(url){
    return new Promise(function(resolve){
      if (!url) {
        resolve(true);
        return;
      }

      var img = new Image();
      img.decoding = "async";
      img.loading = "eager";

      img.onload = function(){
        resolve(true);
      };

      img.onerror = function(){
        resolve(false);
      };

      img.src = url;

      if (img.complete && img.naturalWidth > 0) {
        resolve(true);
      }
    });
  }

  function waitForFirstSectionBackground(){
    var backgroundUrl = getFirstSectionBackgroundUrl();
    return loadImage(backgroundUrl);
  }

  function waitForLoaderHidden(){
    return new Promise(function(resolve){
      var loaderNode = document.getElementById("inv-loader");
      if (!loaderNode) {
        resolve();
        return;
      }

      var finished = false;
      function done(){
        if (finished) return;
        finished = true;
        resolve();
      }

      window.addEventListener(LOADER_HIDDEN_EVENT, done, { once: true });
      window.setTimeout(done, LOADER_WAIT_TIMEOUT_MS);
    });
  }

  function collectDecorParallaxSections(){
    return Array.from(document.querySelectorAll(".sec[data-decor-parallax]"))
      .map(function(section){
        var mode = normalizeDecorParallax(section.getAttribute("data-decor-parallax"));
        if (mode === "none") return null;

        var items = Array.from(section.querySelectorAll(".sec-decor-item[data-decor-depth]"))
          .map(function(item){
            return {
              node: item,
              depth: clampNumber(item.getAttribute("data-decor-depth"), 0.1, 1.1)
            };
          })
          .filter(function(entry){
            return !!entry.node;
          });

        if (!items.length) return null;

        return {
          node: section,
          mode: mode,
          items: items
        };
      })
      .filter(Boolean);
  }

  function updateDecorParallax(){
    decorParallaxFrame = 0;
    if (!decorParallaxEntries.length) return;

    var viewportHeight = getViewportHeight() || 1;
    var viewportCenter = viewportHeight / 2;
    var previewScale = getDecorParallaxPreviewScale();
    var distanceMultiplier = getDecorParallaxDistanceMultiplier();
    var debugEnabled = isDecorParallaxDebugEnabled();
    var debugSections = debugEnabled ? [] : null;

    decorParallaxEntries.forEach(function(entry){
      if (!entry || !entry.node) return;

      var baseDistance = pickDecorParallaxDistance(entry.mode);
      var distance = baseDistance * distanceMultiplier;
      if (!distance) return;

      var rect = entry.node.getBoundingClientRect();
      var sectionCenter = rect.top + (rect.height / 2);
      var progress = clampNumber((viewportCenter - sectionCenter) / viewportHeight, -1, 1);
      var debugItems = debugEnabled ? [] : null;

      entry.items.forEach(function(itemEntry, itemIndex){
        if (!itemEntry || !itemEntry.node) return;
        var translateY = progress * distance * itemEntry.depth;
        itemEntry.node.style.transform = "translate3d(0, " + translateY.toFixed(2) + "px, 0)";

        if (debugEnabled && itemIndex < 3) {
          debugItems.push({
            depth: Number(itemEntry.depth.toFixed(2)),
            translateY: Number(translateY.toFixed(2))
          });
        }
      });

      if (debugEnabled) {
        debugSections.push({
          mode: entry.mode,
          baseDistance: baseDistance,
          distance: Number(distance.toFixed(2)),
          sectionTop: Number(rect.top.toFixed(2)),
          sectionHeight: Number(rect.height.toFixed(2)),
          progress: Number(progress.toFixed(4)),
          itemCount: entry.items.length,
          items: debugItems
        });
      }
    });

    if (debugEnabled) {
      var primarySection = debugSections[0] || null;
      var primaryItem = primarySection && primarySection.items && primarySection.items[0]
        ? primarySection.items[0]
        : null;
      var debugPayload = {
        source: decorParallaxLastScheduleSource,
        preview: isDecorParallaxPreviewDocument(),
        embedded: detectEmbeddedContext(),
        previewScale: Number(previewScale.toFixed(3)),
        distanceMultiplier: Number(distanceMultiplier.toFixed(3)),
        viewportHeight: Number(viewportHeight.toFixed(2)),
        scrollY: Number(toPositiveNumber(window.scrollY).toFixed(2)),
        pageYOffset: Number(toPositiveNumber(window.pageYOffset).toFixed(2)),
        docScrollTop: Number(toPositiveNumber(document.documentElement && document.documentElement.scrollTop).toFixed(2)),
        bodyScrollTop: Number(toPositiveNumber(document.body && document.body.scrollTop).toFixed(2)),
        scrollingElementScrollTop: Number(toPositiveNumber(document.scrollingElement && document.scrollingElement.scrollTop).toFixed(2)),
        primaryMode: primarySection ? primarySection.mode : null,
        primaryProgress: primarySection ? primarySection.progress : null,
        primaryDistance: primarySection ? primarySection.distance : null,
        primaryBaseDistance: primarySection ? primarySection.baseDistance : null,
        primaryDepth: primaryItem ? primaryItem.depth : null,
        primaryTranslateY: primaryItem ? primaryItem.translateY : null,
        primaryVisibleTranslateY: primaryItem
          ? Number((primaryItem.translateY * previewScale).toFixed(2))
          : null,
        sections: debugSections
      };

      storeDecorParallaxDebugState(debugPayload);
      maybeLogDecorParallaxUpdate(debugPayload);
    }
  }

  function scheduleDecorParallax(source){
    if (source) {
      decorParallaxLastScheduleSource = source;
      if (isDecorParallaxNativeScrollSource(source)) {
        decorParallaxNativeScrollSeen = true;
        stopDecorParallaxScrollWatch();
      }
    }
    if (decorParallaxFrame) return;
    decorParallaxFrame = requestAnimationFrame(updateDecorParallax);
  }

  function getDecorParallaxScrollTop(){
    return Math.max(
      toPositiveNumber(window.scrollY),
      toPositiveNumber(window.pageYOffset),
      toPositiveNumber(document.documentElement && document.documentElement.scrollTop),
      toPositiveNumber(document.body && document.body.scrollTop),
      toPositiveNumber(document.scrollingElement && document.scrollingElement.scrollTop)
    );
  }

  function isDecorParallaxPreviewDocument(){
    var previewRoot = document.documentElement;
    var previewBody = document.body;

    return (
      String(previewRoot && previewRoot.getAttribute && previewRoot.getAttribute("data-preview") || "").trim() === "1" ||
      String(previewBody && previewBody.getAttribute && previewBody.getAttribute("data-preview") || "").trim() === "1"
    );
  }

  function shouldWatchDecorParallaxScroll(){
    return detectEmbeddedContext() || isDecorParallaxPreviewDocument();
  }

  function stopDecorParallaxScrollWatch(){
    if (!decorParallaxScrollWatchTimer) return;
    window.clearInterval(decorParallaxScrollWatchTimer);
    decorParallaxScrollWatchTimer = 0;
  }

  function isDecorParallaxNativeScrollSource(source){
    var normalized = String(source || "").trim().toLowerCase();
    return (
      normalized === "window-scroll" ||
      normalized === "document-scroll" ||
      normalized === "document-element-scroll" ||
      normalized === "body-scroll" ||
      normalized === "scrolling-element-scroll" ||
      normalized === "visual-viewport-scroll"
    );
  }

  function isDecorParallaxDebugEnabled(){
    try {
      return window.__decorParallaxDebugEnabled === true;
    } catch (_error) {
      return false;
    }
  }

  function storeDecorParallaxDebugState(detail){
    try {
      window.__decorParallaxDebug = detail || null;
    } catch (_error) {
      // noop
    }
  }

  function logDecorParallaxDebug(eventName, detail){
    if (!isDecorParallaxDebugEnabled()) return;
    try {
      console.info("[decor-parallax]", eventName, detail || {});
    } catch (_error) {
      // noop
    }
    try {
      if (window.parent && window.parent !== window && window.parent.postMessage) {
        window.parent.postMessage({
          type: "preview:decor-parallax-debug",
          eventName: eventName,
          detail: detail || {}
        }, "*");
      }
    } catch (_error) {
      // noop
    }
  }

  function maybeLogDecorParallaxUpdate(detail){
    if (!isDecorParallaxDebugEnabled()) return;
    var now = Date.now();
    if ((now - decorParallaxLastDebugLogAt) < 180) return;
    decorParallaxLastDebugLogAt = now;
    logDecorParallaxDebug("update", detail);
  }

  function startDecorParallaxScrollWatch(){
    if (decorParallaxScrollWatchTimer || !shouldWatchDecorParallaxScroll()) return;

    decorParallaxLastScrollTop = getDecorParallaxScrollTop();
    decorParallaxScrollWatchTimer = window.setInterval(function(){
      if (decorParallaxNativeScrollSeen) {
        stopDecorParallaxScrollWatch();
        return;
      }
      var nextScrollTop = getDecorParallaxScrollTop();
      if (nextScrollTop === decorParallaxLastScrollTop) return;
      decorParallaxLastScrollTop = nextScrollTop;
      scheduleDecorParallax("scroll-watch");
    }, 90);
  }

  function attachDecorParallaxScrollSource(target, source){
    if (!target || !target.addEventListener) return;
    target.addEventListener("scroll", function(){
      scheduleDecorParallax(source || "scroll");
    }, { passive: true });
  }

  function bootDecorParallax(){
    if (decorParallaxStarted) return;
    decorParallaxStarted = true;
    decorParallaxNativeScrollSeen = false;

    if (isReducedMotion()) return;

    decorParallaxEntries = collectDecorParallaxSections();
    if (!decorParallaxEntries.length) return;

    logDecorParallaxDebug("boot", {
      preview: isDecorParallaxPreviewDocument(),
      embedded: detectEmbeddedContext(),
      sectionCount: decorParallaxEntries.length,
      previewScale: Number(getDecorParallaxPreviewScale().toFixed(3)),
      distanceMultiplier: Number(getDecorParallaxDistanceMultiplier().toFixed(3)),
      viewportWidth: Number(getViewportWidth().toFixed(2)),
      viewportHeight: Number(getViewportHeight().toFixed(2))
    });

    attachDecorParallaxScrollSource(window, "window-scroll");
    window.addEventListener("resize", function(){
      scheduleDecorParallax("window-resize");
    }, { passive: true });
    document.addEventListener("scroll", function(){
      scheduleDecorParallax("document-scroll");
    }, { passive: true, capture: true });
    attachDecorParallaxScrollSource(document.documentElement, "document-element-scroll");
    attachDecorParallaxScrollSource(document.body, "body-scroll");
    attachDecorParallaxScrollSource(document.scrollingElement, "scrolling-element-scroll");

    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener("scroll", function(){
        scheduleDecorParallax("visual-viewport-scroll");
      }, { passive: true });
      window.visualViewport.addEventListener("resize", function(){
        scheduleDecorParallax("visual-viewport-resize");
      }, { passive: true });
    }

    scheduleDecorParallax("boot");
    window.setTimeout(function(){
      scheduleDecorParallax("boot-timeout");
    }, 180);
    startDecorParallaxScrollWatch();
  }

  function prepareGalleryStagger(element){
    var cells = Array.from(element.querySelectorAll(STAGGER_SELECTOR));
    if (!cells.length) return [];

    cells.forEach(function(cell, index){
      var delayMs = Math.min(index, 11) * 70;
      cell.style.setProperty("--mefx-stagger-delay", delayMs + "ms");
      cell.classList.add("mefx-stagger-item");
    });

    return cells;
  }

  function prepareElement(element){
    var effect = normalizeEffect(element.getAttribute("data-motion"));
    var type = normalizeType(element.getAttribute("data-type"));
    element.setAttribute("data-motion", effect);

    if (effect === "hover") {
      element.classList.add("mefx-hover");
    }

    if (effect === "pulse" && (type === "countdown" || type === "rsvp")) {
      element.classList.add("mefx-pulse");
    }

    if (effect === "rsvp" && type === "rsvp") {
      element.classList.add("mefx-rsvp");
    }

    if (effect === "reveal") element.classList.add("mefx-reveal-init");
    if (effect === "zoom") element.classList.add("mefx-zoom-init");
    if (effect === "draw") element.classList.add("mefx-draw-init");

    if (type === "gallery" && effect === "reveal") {
      prepareGalleryStagger(element);
    }
  }

  function activateElement(element){
    var effect = normalizeEffect(element.getAttribute("data-motion"));
    var type = normalizeType(element.getAttribute("data-type"));

    if (effect === "reveal") element.classList.add("mefx-reveal-on");
    if (effect === "zoom") element.classList.add("mefx-zoom-on");
    if (effect === "draw") element.classList.add("mefx-draw-on");

    if (type === "gallery" && effect === "reveal") {
      var staggerItems = Array.from(element.querySelectorAll(STAGGER_SELECTOR + ".mefx-stagger-item"));
      staggerItems.forEach(function(cell){
        cell.classList.add("mefx-stagger-on");
      });
    }
  }

  function boot(elements){
    var list = Array.isArray(elements) ? elements : [];
    if (!list.length) {
      list = Array.from(document.querySelectorAll(".objeto[data-motion]"));
    }

    var elementsToAnimate = list;
    if (!elementsToAnimate.length) return;

    var reducedMotion = isReducedMotion();
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      setPreparingState(false);
      elementsToAnimate.forEach(activateElement);
      return;
    }

    // En mobile algunos navegadores colapsan "quitar preparing + activar on" en el mismo layout.
    // Damos un frame para reactivar transiciones antes de observar/activar.
    setPreparingState(false);
    requestAnimationFrame(function(){
      var queuedById = Object.create(null);
      var queuedElements = [];
      var activationReady = false;

      function enqueueActivation(element){
        if (!element || !element.getAttribute) return;
        var key = element.getAttribute("data-motion-id") || element.id || "";
        if (!key) key = "idx-" + queuedElements.length;
        if (queuedById[key]) return;
        queuedById[key] = true;
        queuedElements.push(element);
      }

      function activateOrQueue(element){
        if (activationReady) {
          activateElement(element);
          return;
        }
        enqueueActivation(element);
      }

      var observer = new IntersectionObserver(
        function(entries){
          entries.forEach(function(entry){
            if (!entry.isIntersecting) return;
            activateOrQueue(entry.target);
            observer.unobserve(entry.target);
          });
        },
        {
          root: null,
          threshold: 0.16,
          rootMargin: "0px 0px -8% 0px"
        }
      );

      elementsToAnimate.forEach(function(element){
        var effect = normalizeEffect(element.getAttribute("data-motion"));
        if (OBSERVED_EFFECTS[effect]) {
          observer.observe(element);
          return;
        }
        activateOrQueue(element);
      });

      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          activationReady = true;
          queuedElements.forEach(activateElement);
          queuedElements = [];
        });
      });
    });
  }

  function prepareAllElements(){
    var elements = Array.from(document.querySelectorAll(".objeto[data-motion]"));
    if (!elements.length) return;

    setPreparingState(true);
    elements.forEach(prepareElement);
    return elements;
  }

  function startBoot(){
    if (bootStarted) return;
    bootStarted = true;

    waitForRuntimeReady().then(function(){
      waitForFirstSectionBackground().then(function(backgroundReady){
        if (!backgroundReady) {
          dispatchRuntimeEvent(RUNTIME_FAIL_EVENT, { reason: "first-background-failed" });
          return;
        }

        var preparedElements = prepareAllElements() || [];
        dispatchRuntimeEvent(RUNTIME_READY_EVENT, { source: "motion-effects-runtime" });
        waitForLoaderHidden().then(function(){
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){
              boot(preparedElements);
              bootDecorParallax();
            });
          });
        });
      });
    });
  }

  startBoot();
})();
</script>
`.trim();
}
