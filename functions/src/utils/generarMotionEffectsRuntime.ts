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
  }
</style>

<script>
(function(){
  var VALID_EFFECTS = { none: 1, reveal: 1, draw: 1, zoom: 1, hover: 1, pulse: 1 };
  var OBSERVED_EFFECTS = { reveal: 1, draw: 1, zoom: 1 };
  var STAGGER_SELECTOR = ".galeria-celda";
  var PREPARING_CLASS = "mefx-preparing";
  var RUNTIME_READY_EVENT = "invitation-runtime-ready";
  var RUNTIME_FAIL_EVENT = "invitation-runtime-failed";
  var LOADER_HIDDEN_EVENT = "invitation-loader-hidden";
  var LOADER_WAIT_TIMEOUT_MS = 2400;
  var READY_TIMEOUT_MS = 2600;
  var FONTS_TIMEOUT_MS = 1200;
  var bootStarted = false;

  function normalizeEffect(value){
    var normalized = String(value || "").trim().toLowerCase();
    return VALID_EFFECTS[normalized] ? normalized : "none";
  }

  function normalizeType(value){
    return String(value || "").trim().toLowerCase();
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
