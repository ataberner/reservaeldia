import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";
import { CANVAS_BASE } from "../models/dimensionesBase";
import { generarModalRSVPHTML } from "./generarModalRSVP";
import { type RSVPConfig as ModalConfig } from "../rsvp/config";
import { generarModalRegalosHTML } from "./generarModalRegalos";
import { type GiftsConfig } from "../gifts/config";
import { generarModalGaleriaHTML, hayGaleriaConImagenes } from "./generarModalGaleria";
import { buildMobileSmartSectionLayoutScript } from "./mobileSmartSectionLayout";
import { generarMotionEffectsRuntimeHTML } from "./generarMotionEffectsRuntime";
import { generarInvitationLoaderRuntimeHTML } from "./generarInvitationLoaderRuntime";

const ENABLE_MOBILE_SMART_LAYOUT = true; // ✅ empezamos apagado

const EXCLUDE_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "Arial",
  "Helvetica",
  "Times",
  "Times New Roman",
  "Georgia",
  "Courier New",
]);

const ALTURA_REFERENCIA_PANTALLA = 500;
const MOBILE_TEXT_ZOOM_CAP = 1.15;
const MOBILE_TEXT_ZOOM_MIN_VH = 760;
const MOBILE_TEXT_ZOOM_MAX_VH = 980;

// ✅ Offsets SOLO para texto en secciones Pantalla: ON
// - Desktop: aplica cuando vw > 767px
// - Mobile: aplica cuando vw <= 767px
// (Estos valores se vuelcan a CSS variables en :root)
const PANTALLA_Y_OFFSET_DESKTOP_PX = 0;
const PANTALLA_Y_OFFSET_MOBILE_PX = 0;

function buildGoogleFontsLink(fonts: string[]): string {
  const familias = fonts
    .map((f) => f.replace(/['"]/g, "").split(",")[0].trim())
    .filter((n) => n && !EXCLUDE_FONTS.has(n))
    .map((n) => `family=${n.replace(/ /g, "+")}`)
    .join("&");

  if (!familias) return "";

  return `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${familias}&display=swap" rel="stylesheet">`.trim();
}

type GenerarHTMLOpciones = {
  slug?: string;
  isPreview?: boolean;
  gifts?: GiftsConfig | null;
};

function escapeAttr(str: string = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildFondoStyle(seccion: any): string {
  const fondoValue = seccion?.fondo || "transparent";
  const esImagenFondo = seccion?.fondoTipo === "imagen" && seccion?.fondoImagen;

  let estilosFondo = "";

  if (esImagenFondo) {
    let imageUrl = seccion.fondoImagen;

    if (
      imageUrl &&
      imageUrl.includes("firebasestorage.googleapis.com") &&
      !imageUrl.includes("alt=media")
    ) {
      imageUrl = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "alt=media";
    }

    let backgroundPosition = "center center";

    if (
      seccion.fondoImagenOffsetX !== undefined ||
      seccion.fondoImagenOffsetY !== undefined
    ) {
      const offsetX = seccion.fondoImagenOffsetX || 0;
      const offsetY = seccion.fondoImagenOffsetY || 0;

      const offsetXPercent = offsetX !== 0 ? `calc(50% - ${-offsetX}px)` : "50%";
      const offsetYPercent = offsetY !== 0 ? `calc(50% - ${-offsetY}px)` : "50%";

      backgroundPosition = `${offsetXPercent} ${offsetYPercent}`;
    }

    estilosFondo = `background-image: url('${imageUrl}'); background-size: cover; background-position: ${backgroundPosition}; background-repeat: no-repeat;`;
  } else if (
    fondoValue.startsWith("http") ||
    fondoValue.startsWith("data:") ||
    fondoValue.startsWith("blob:")
  ) {
    let imageUrl = fondoValue.replace("url(", "").replace(")", "");

    if (
      imageUrl.includes("firebasestorage.googleapis.com") &&
      !imageUrl.includes("alt=media")
    ) {
      imageUrl = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "alt=media";
    }

    estilosFondo = `background-image: url('${imageUrl}'); background-size: cover; background-position: center center; background-repeat: no-repeat;`;
  } else {
    estilosFondo = `background: ${fondoValue};`;
  }

  return estilosFondo.replace(/\s+/g, " ").trim();
}

function hasImageBackground(seccion: any): boolean {
  if (seccion?.fondoTipo === "imagen" && seccion?.fondoImagen) return true;

  const fondoValue = typeof seccion?.fondo === "string" ? seccion.fondo.trim() : "";
  return (
    fondoValue.startsWith("http") ||
    fondoValue.startsWith("data:") ||
    fondoValue.startsWith("blob:")
  );
}

export function generarHTMLDesdeSecciones(
  secciones: any[],
  objetos: any[],
  rsvp?: ModalConfig,
  opciones?: GenerarHTMLOpciones,
  opts?: { slug?: string }
): string {
  const slug = opciones?.slug ?? "";
  const slugPublica = opts?.slug ?? "";
  const isPreview = opciones?.isPreview === true;

  const fuentesUsadas = [
    ...new Set(
      objetos
        .filter((o) =>
          (o.tipo === "texto" ||
            o.tipo === "countdown" ||
            o.tipo === "rsvp-boton" ||
            o.tipo === "regalo-boton") &&
          o.fontFamily
        )
        .map((o) => o.fontFamily)
    ),
  ];

  const googleFontsLink = buildGoogleFontsLink(fuentesUsadas);

  const hayRSVPEnCanvas = objetos?.some((o) => o.tipo === "rsvp-boton");
  const hayRegalosEnCanvas = objetos?.some((o) => o.tipo === "regalo-boton");
  const botonRSVP = ""; // (si querés agregar un botón fijo fuera del canvas, hacelo acá)
  const modalRSVP =
    hayRSVPEnCanvas && rsvp?.enabled
      ? generarModalRSVPHTML(rsvp, { previewMode: isPreview })
      : "";
  const modalRegalos = hayRegalosEnCanvas
    ? generarModalRegalosHTML(opciones?.gifts as GiftsConfig)
    : "";
  const modalGaleria = hayGaleriaConImagenes(objetos) ? generarModalGaleriaHTML() : "";
  const invitationLoaderRuntime = generarInvitationLoaderRuntimeHTML();
  const motionEffectsRuntime = generarMotionEffectsRuntimeHTML();

  function hayCountdown(objs: any[]) {
    return Array.isArray(objs) && objs.some((o) => o?.tipo === "countdown");
  }

  const scriptCountdown = hayCountdown(objetos)
    ? `
<script>
(function(){
  var UNIT_ORDER = ["days", "hours", "minutes", "seconds"];

  function pad(n){ n=Math.floor(Math.abs(n)); return n<10 ? "0"+n : ""+n; }
  function canAnimate(){
    var runtimeEnabled = window.__COUNTDOWN_ANIMATIONS_ENABLED !== false;
    var reduced = false;
    try {
      reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      reduced = false;
    }
    return runtimeEnabled && !reduced;
  }
  function diffParts(target){
    const now = Date.now();
    let ms = Math.max(0, target.getTime() - now);
    const d = Math.floor(ms / 86400000); ms -= d*86400000;
    const h = Math.floor(ms / 3600000);  ms -= h*3600000;
    const m = Math.floor(ms / 60000);    ms -= m*60000;
    const s = Math.floor(ms / 1000);
    return { days: d, hours: h, minutes: m, seconds: s };
  }

  function normalizeUnits(root){
    var raw = String(root.getAttribute("data-units") || "");
    if (!raw) return UNIT_ORDER.slice();
    var units = raw
      .split(",")
      .map(function(item){ return String(item || "").trim().toLowerCase(); })
      .filter(function(item){ return UNIT_ORDER.indexOf(item) >= 0; })
      .filter(function(item, index, list){ return list.indexOf(item) === index; });
    return units.length ? units : UNIT_ORDER.slice();
  }

  function formatUnitValue(parts, unit){
    var value = Number(parts[unit] || 0);
    if (unit === "days") return String(value).padStart(2, "0");
    return pad(value);
  }

  function triggerTickAnimation(node, tickAnim){
    if (!node || !canAnimate()) return;
    var anim = String(tickAnim || "none").toLowerCase();
    var className = "";
    if (anim === "flipsoft") className = "cdv2-tick-flip";
    if (anim === "pulse") className = "cdv2-tick-pulse";
    if (!className) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function applyFrameAnimation(root){
    if (!root || !canAnimate()) return;
    var frameAnim = String(root.getAttribute("data-frame-anim") || "none").toLowerCase();
    var frameClass = frameAnim === "rotateslow"
      ? "cdv2-frame-rotate"
      : frameAnim === "shimmer"
      ? "cdv2-frame-shimmer"
      : "";
    if (!frameClass) return;
    root.querySelectorAll(".cdv2-frame").forEach(function(frameNode){
      frameNode.classList.add(frameClass);
    });
  }

  function applyEntryAnimation(root){
    if (!root || !canAnimate()) return;
    var entryAnim = String(root.getAttribute("data-entry-anim") || "none").toLowerCase();
    var className = entryAnim === "fadeup"
      ? "cdv2-entry-up"
      : entryAnim === "fadein"
      ? "cdv2-entry-fade"
      : entryAnim === "scalein"
      ? "cdv2-entry-scale"
      : "";
    if (!className) return;
    root.classList.add(className);
  }

  function tickOneLegacy(root, parts){
    const vals = root.querySelectorAll(".cd-val");
    if (!vals || vals.length < 4) return;
    vals[0].textContent = String(parts.days).padStart(2, "0");
    vals[1].textContent = pad(parts.hours);
    vals[2].textContent = pad(parts.minutes);
    vals[3].textContent = pad(parts.seconds);
  }

  function tickOneV2(root, parts){
    var units = normalizeUnits(root);
    var tickAnim = root.getAttribute("data-tick-anim") || "none";
    var unitNodes = root.querySelectorAll("[data-unit]");
    if (!unitNodes || !unitNodes.length) return;
    unitNodes.forEach(function(node){
      var unit = String(node.getAttribute("data-unit") || "").trim().toLowerCase();
      if (units.indexOf(unit) < 0) return;
      var valueNode = node.querySelector(".cdv2-val, .cd-val");
      if (!valueNode) return;
      var nextValue = formatUnitValue(parts, unit);
      if (valueNode.textContent !== nextValue) {
        valueNode.textContent = nextValue;
        triggerTickAnimation(valueNode, tickAnim);
      }
    });
  }

  function tickOne(root){
    const iso = root.getAttribute("data-target");
    if(!iso) return;
    const targetDate = new Date(iso);
    if(isNaN(targetDate.getTime())) return;
    const parts = diffParts(targetDate);

    if (root.getAttribute("data-countdown-v2") === "1") {
      tickOneV2(root, parts);
      return;
    }
    tickOneLegacy(root, parts);
  }
  function boot(){
    const roots = Array.from(document.querySelectorAll("[data-countdown]"));
    if(!roots.length) return;
    roots.forEach(function(root){
      applyEntryAnimation(root);
      applyFrameAnimation(root);
      tickOne(root);
    });
    setInterval(() => roots.forEach(tickOne), 1000);
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>
`.trim()
    : "";

  const scriptTemplatePreviewPatch = `
<script>
(function(){
  function toText(value){
    return String(value == null ? "" : value).trim();
  }

  function toStringArray(value){
    if (!Array.isArray(value)) return [];
    return value
      .map(function(item){ return toText(item); })
      .filter(Boolean);
  }

  function replaceInText(source, findText, replaceText){
    var base = String(source == null ? "" : source);
    var find = String(findText == null ? "" : findText);
    var replace = String(replaceText == null ? "" : replaceText);
    if (!find) return base;
    if (base.indexOf(find) < 0) return base;
    return base.split(find).join(replace);
  }

  function parsePixelValue(value){
    var numeric = Number.parseFloat(String(value == null ? "" : value));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function isAutoWidthTextElement(targetElement){
    if (!targetElement) return false;
    var isTextNode =
      toText(targetElement.getAttribute("data-debug-texto")) === "1" ||
      toText(targetElement.getAttribute("data-type")).toLowerCase() === "text";
    if (!isTextNode) return false;
    return !toText(targetElement.style.width);
  }

  function getTextTransformMatrix(targetElement){
    var computedStyle = window.getComputedStyle ? window.getComputedStyle(targetElement) : null;
    var rawTransform = String(
      (computedStyle && computedStyle.transform) || targetElement?.style?.transform || ""
    ).trim();

    if (!rawTransform || rawTransform === "none") {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    try {
      if (typeof DOMMatrix === "function") {
        var domMatrix = new DOMMatrix(rawTransform);
        return {
          a: domMatrix.a,
          b: domMatrix.b,
          c: domMatrix.c,
          d: domMatrix.d,
          e: domMatrix.e,
          f: domMatrix.f,
        };
      }
      if (typeof WebKitCSSMatrix === "function") {
        var webkitMatrix = new WebKitCSSMatrix(rawTransform);
        return {
          a: webkitMatrix.a,
          b: webkitMatrix.b,
          c: webkitMatrix.c,
          d: webkitMatrix.d,
          e: webkitMatrix.e,
          f: webkitMatrix.f,
        };
      }
    } catch (_error) {
      // Fallback manual debajo.
    }

    var match = rawTransform.match(/^matrix\(([^)]+)\)$/i);
    if (!match) {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    var parts = match[1]
      .split(",")
      .map(function(entry){
        return Number.parseFloat(String(entry || "").trim());
      });

    if (parts.length < 6 || parts.some(function(value){ return !Number.isFinite(value); })) {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    return {
      a: parts[0],
      b: parts[1],
      c: parts[2],
      d: parts[3],
      e: parts[4],
      f: parts[5],
    };
  }

  function getTextBoxSize(targetElement){
    if (!targetElement) return { width: null, height: null };

    var width = Number(
      targetElement.scrollWidth ||
      targetElement.offsetWidth ||
      targetElement.clientWidth ||
      0
    );
    var height = Number(
      targetElement.scrollHeight ||
      targetElement.offsetHeight ||
      targetElement.clientHeight ||
      0
    );

    if ((!Number.isFinite(width) || width <= 0) || (!Number.isFinite(height) || height <= 0)) {
      var rect = targetElement.getBoundingClientRect ? targetElement.getBoundingClientRect() : null;
      if (rect) {
        if (!Number.isFinite(width) || width <= 0) width = Number(rect.width || 0);
        if (!Number.isFinite(height) || height <= 0) height = Number(rect.height || 0);
      }
    }

    return {
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    };
  }

  function getLocalElementPosition(targetElement){
    if (!targetElement) return { left: null, top: null };

    var offsetLeft = Number(targetElement.offsetLeft);
    var offsetTop = Number(targetElement.offsetTop);
    if (Number.isFinite(offsetLeft) && Number.isFinite(offsetTop)) {
      return {
        left: offsetLeft,
        top: offsetTop,
      };
    }

    var inlineLeft = parsePixelValue(targetElement.style && targetElement.style.left);
    var inlineTop = parsePixelValue(targetElement.style && targetElement.style.top);
    if (Number.isFinite(inlineLeft) && Number.isFinite(inlineTop)) {
      return {
        left: inlineLeft,
        top: inlineTop,
      };
    }

    var computedStyle = window.getComputedStyle ? window.getComputedStyle(targetElement) : null;
    return {
      left: parsePixelValue(computedStyle && computedStyle.left),
      top: parsePixelValue(computedStyle && computedStyle.top),
    };
  }

  function getTextCenterOffset(matrix, width, height){
    var halfWidth = Number(width) / 2;
    var halfHeight = Number(height) / 2;
    return {
      x: matrix.a * halfWidth + matrix.c * halfHeight + matrix.e,
      y: matrix.b * halfWidth + matrix.d * halfHeight + matrix.f,
    };
  }

  function captureTextElementCenter(targetElement){
    if (!isAutoWidthTextElement(targetElement)) return null;

    var position = getLocalElementPosition(targetElement);
    var leftPx = position.left;
    var topPx = position.top;
    var size = getTextBoxSize(targetElement);

    if (
      !Number.isFinite(leftPx) ||
      !Number.isFinite(topPx) ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    ) {
      return null;
    }

    var matrix = getTextTransformMatrix(targetElement);
    var offset = getTextCenterOffset(matrix, size.width, size.height);

    return {
      centerX: leftPx + offset.x,
      centerY: topPx + offset.y,
    };
  }

  function setTextContentPreservingCenter(targetElement, nextText){
    if (!targetElement) return false;

    var resolvedNextText = String(nextText == null ? "" : nextText);
    var currentText = String(targetElement.textContent || "");
    if (currentText === resolvedNextText) return false;

    var lockedCenter = captureTextElementCenter(targetElement);
    targetElement.textContent = resolvedNextText;

    if (
      !lockedCenter ||
      !Number.isFinite(lockedCenter.centerX) ||
      !Number.isFinite(lockedCenter.centerY)
    ) {
      return true;
    }

    var size = getTextBoxSize(targetElement);
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
      return true;
    }

    var matrix = getTextTransformMatrix(targetElement);
    var offset = getTextCenterOffset(matrix, size.width, size.height);
    var nextLeftPx = Number(lockedCenter.centerX) - offset.x;
    var nextTopPx = Number(lockedCenter.centerY) - offset.y;

    if (Number.isFinite(nextLeftPx)) {
      targetElement.style.left = nextLeftPx + "px";
    }
    if (Number.isFinite(nextTopPx)) {
      targetElement.style.top = nextTopPx + "px";
    }

    return true;
  }

  function findObjectElementById(id){
    var safeId = toText(id);
    if (!safeId) return null;
    var nodes = document.querySelectorAll("[data-obj-id]");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (toText(node.getAttribute("data-obj-id")) === safeId) return node;
    }
    return null;
  }

  function findSectionElementById(id){
    var safeId = toText(id);
    if (!safeId) return null;
    var nodes = document.querySelectorAll("[data-seccion-id]");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (toText(node.getAttribute("data-seccion-id")) === safeId) return node;
    }
    return null;
  }

  function setImageSource(targetElement, nextUrl){
    var safeUrl = toText(nextUrl);
    if (!safeUrl || !targetElement) return false;
    var imageNode = targetElement.tagName && targetElement.tagName.toLowerCase() === "img"
      ? targetElement
      : targetElement.querySelector("img");
    if (!imageNode) {
      targetElement.style.backgroundImage = "url('" + safeUrl.replace(/'/g, "%27") + "')";
      return true;
    }
    if (toText(imageNode.getAttribute("src")) === safeUrl) return false;
    imageNode.setAttribute("src", safeUrl);
    return true;
  }

  function ensureGalleryCellImage(cell, url){
    var existingImg = cell.querySelector("img");
    if (!existingImg) {
      existingImg = document.createElement("img");
      existingImg.setAttribute("alt", "");
      existingImg.setAttribute("loading", "lazy");
      existingImg.setAttribute("decoding", "async");
      existingImg.style.width = "100%";
      existingImg.style.height = "100%";
      existingImg.style.display = "block";
      existingImg.style.objectFit = "cover";
      cell.appendChild(existingImg);
    }
    existingImg.setAttribute("src", url);
  }

  function applyGalleryCells(targetElement, urls){
    if (!targetElement) return false;
    var safeUrls = toStringArray(urls);
    if (!safeUrls.length) return false;
    var galleryRoot = targetElement.classList && targetElement.classList.contains("galeria")
      ? targetElement
      : targetElement.querySelector(".galeria");
    if (!galleryRoot) return false;

    var cells = galleryRoot.querySelectorAll(".galeria-celda");
    if (!cells.length) return false;

    var applied = 0;
    for (var i = 0; i < cells.length; i += 1) {
      var nextUrl = safeUrls[i];
      if (!nextUrl) continue;
      var cell = cells[i];
      ensureGalleryCellImage(cell, nextUrl);
      cell.classList.add("galeria-celda--clickable");
      cell.setAttribute("data-gallery-image", "1");
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", "Ver imagen en pantalla completa");
      applied += 1;
    }

    return applied > 0;
  }

  function applyElementOperation(targetElement, operation){
    if (!targetElement || !operation) return false;
    var path = toText(operation.path).toLowerCase();
    if (!path) return false;

    var mode = toText(operation.mode).toLowerCase() === "replace" ? "replace" : "set";
    var nextValue = operation.value;
    var defaultValue = operation.defaultValue;

    if (path === "cells") {
      return applyGalleryCells(targetElement, nextValue);
    }

    if (path === "fechaobjetivo") {
      var nextIso = toText(nextValue);
      var currentIso = toText(targetElement.getAttribute("data-target"));
      if (currentIso === nextIso) return false;
      if (nextIso) {
        targetElement.setAttribute("data-target", nextIso);
      } else {
        targetElement.removeAttribute("data-target");
      }
      tickOne(targetElement);
      return true;
    }

    if (path === "texto" || path === "text" || path === "title" || path === "label") {
      var currentText = String(targetElement.textContent || "");
      var nextText = String(nextValue == null ? "" : nextValue);
      if (mode === "replace") {
        var replacedText = replaceInText(currentText, String(defaultValue == null ? "" : defaultValue), nextText);
        if (replacedText === currentText && toText(defaultValue) === "" && nextText) {
          replacedText = nextText;
        }
        if (replacedText === currentText) return false;
        return setTextContentPreservingCenter(targetElement, replacedText);
      }
      if (currentText === nextText) return false;
      return setTextContentPreservingCenter(targetElement, nextText);
    }

    if (path === "src" || path === "url" || path === "mediaurl" || path === "fondoimagen") {
      return setImageSource(targetElement, nextValue);
    }

    return false;
  }

  function applyGlobalReplaceText(operation){
    var findText = String(operation.find == null ? "" : operation.find);
    var replaceText = String(operation.replace == null ? "" : operation.replace);
    if (!findText) return false;

    var textNodes = document.querySelectorAll('.objeto[data-type="text"], .objeto[data-debug-texto="1"]');
    if (!textNodes.length) {
      textNodes = document.querySelectorAll(".objeto");
    }

    var changed = 0;
    for (var i = 0; i < textNodes.length; i += 1) {
      var node = textNodes[i];
      var currentText = String(node.textContent || "");
      var nextText = replaceInText(currentText, findText, replaceText);
      if (nextText === currentText) continue;
      if (setTextContentPreservingCenter(node, nextText)) {
        changed += 1;
      }
    }

    return changed > 0;
  }

  function applyGlobalOperation(operation){
    var mode = toText(operation.mode).toLowerCase();
    if (mode === "replacetextglobal") {
      return applyGlobalReplaceText(operation);
    }
    if (mode === "setfirstgallerycells") {
      var firstGallery = document.querySelector(".objeto.galeria, .objeto[data-type='gallery']");
      if (!firstGallery) return false;
      return applyGalleryCells(firstGallery, operation.value);
    }
    return false;
  }

  function applyOperation(operation){
    if (!operation || typeof operation !== "object") return false;
    var scope = toText(operation.scope).toLowerCase();

    if (scope === "global") {
      return applyGlobalOperation(operation);
    }

    if (scope === "objeto") {
      var objectElement = findObjectElementById(operation.id);
      if (!objectElement) return false;
      return applyElementOperation(objectElement, operation);
    }

    if (scope === "seccion") {
      var sectionElement = findSectionElementById(operation.id);
      if (!sectionElement) return false;
      return applyElementOperation(sectionElement, operation);
    }

    return false;
  }

  window.addEventListener("message", function(event){
    var payload = event && event.data;
    if (!payload || payload.type !== "template-preview:apply") return;
    var operations = Array.isArray(payload.operations) ? payload.operations : [];
    if (!operations.length) return;
    operations.forEach(function(operation){
      try {
        applyOperation(operation);
      } catch (_error) {
        // Ignorar errores de patch para no interrumpir la preview.
      }
    });
  });
})();
</script>
`.trim();

  const seccionesOrdenadas = [...(secciones || [])].sort(
    (a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0)
  );


  const htmlSecciones = seccionesOrdenadas
    .map((seccion) => {
      const modo = String(seccion?.altoModo || "fijo").toLowerCase();
      const hbase = Number.isFinite(seccion?.altura) ? Number(seccion.altura) : 600;
      const fondoEsImagen = hasImageBackground(seccion);
      const seccionId = escapeAttr(String(seccion?.id || "").trim());

      const objsDeSeccion = objetos.filter((o) => o.seccionId === seccion.id);

      const objsBleed = objsDeSeccion.filter(
        (o) => String(o?.anclaje || "").toLowerCase() === "fullbleed"
      );
      const objsContenido = objsDeSeccion.filter(
        (o) => String(o?.anclaje || "").toLowerCase() !== "fullbleed"
      );

      const fondoStyle = buildFondoStyle(seccion);

      const htmlBleed = generarHTMLDesdeObjetos(objsBleed, seccionesOrdenadas);
      const htmlContenido = generarHTMLDesdeObjetos(objsContenido, seccionesOrdenadas);


      return `
<section class="sec" data-seccion-id="${seccionId}" data-modo="${escapeAttr(modo)}" data-fondo="${fondoEsImagen ? "imagen" : "color"}" style="--hbase:${hbase}">
  <div class="sec-zoom">
    <div class="sec-bg" style="${fondoStyle}"></div>
    <div class="sec-bleed">${htmlBleed}</div>
    <div class="sec-content">${htmlContenido}</div>
  </div>
</section>
`.trim();
    })
    .join("\n");

  const scriptMobileSmart = buildMobileSmartSectionLayoutScript({
    enabled: ENABLE_MOBILE_SMART_LAYOUT,
    minGapPx: 1,
    paddingTopPx: 0,
    paddingBottomPx: 2,
    onlyFixedSections: true,
    minPerColumn2: 1,
    fitMinScale: 0.88,
    fitMaxScale: 1.16,
    fitTargetWidthRatio: 0.94,
    fitMinFillRatio: 0.9,
  });

  return `
<!DOCTYPE html>
<html lang="es"${slug ? ` data-slug="${escapeAttr(slug)}"` : ""}${isPreview ? ' data-preview="1"' : ""}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Invitación</title>
  ${googleFontsLink}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      background: white;
      overflow-x: hidden;
      font-family: sans-serif;
    }

    /* ✅ SOLO MOBILE: evita “auto-resize / font boosting” del texto */
    @media (max-width: 767px){
      html{
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
    }

    :root{
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-right: env(safe-area-inset-right, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --safe-left: env(safe-area-inset-left, 0px);
      --bp-mobile: 767px;
      


      /* Global scales */
      --content-w: ${CANVAS_BASE.ANCHO}px;
      --sx: 1;   /* contentW/800 */
      --bx: 1;   /* viewportW/800 */

      /* vh lógico por defecto */
      --vh-safe: 100vh;
      --vh-logical: var(--vh-safe);
      --pantalla-y-compact: 0;
      --pantalla-y-base: 0px;

      /* ✅ Offset SOLO para texto en Pantalla: ON (desktop default) */
      --pantalla-y-offset: ${PANTALLA_Y_OFFSET_DESKTOP_PX}px;
      --text-scale-max: ${MOBILE_TEXT_ZOOM_CAP};
    }

    /* ✅ Mobile: offset distinto SOLO para texto en Pantalla: ON */
    @media (max-width: 767px){
      :root{
        --pantalla-y-offset: ${PANTALLA_Y_OFFSET_MOBILE_PX}px;
      }
    }

    .inv{ width: 100%; background: white; }

    .sec{
      position: relative;
      width: 100vw;
      left: 50%;
      transform: translateX(-50%);
      overflow: visible; /* bleed puede salirse */
    }

    /* ✅ Wrapper que hace “zoom” centrado (evita corrimiento a la derecha) */
    .sec-zoom{
      position: relative;
      width: 100%;
      height: 100%;
      transform-origin: top center;
      transform: scale(var(--zoom, 1));
    }

    /* ✅ Pantalla ON: recorte para que el zoom no desborde */
    .sec[data-modo="pantalla"]{
      overflow: hidden;
      height: 100dvh;
      height: 100vh;
      padding-top: var(--safe-top);
      padding-bottom: var(--safe-bottom);

      /* fallback CSS (JS lo pisa en mobile con px reales) */
      --vh-safe: calc(100dvh - var(--safe-top) - var(--safe-bottom));

      /* el zoom extra va por --zoom (NO por sfinal) */
      --zoom: 1;
      --bgzoom: 1;
      --pantalla-text-zoom: 1;

      /* factor final para CONTENIDO (se setea por JS) */
      --sfinal: 1;
    }

    .sec[data-modo="fijo"]{
      /* altura fija escalada por ancho; JS setea --sfinal = sx */
      height: calc(var(--sfinal) * var(--hbase) * 1px);
      --zoom: 1;
      --bgzoom: 1;
    }

    /* Fondo */
    .sec-bg{
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    /* ✅ Fondo agrandable solo en pantalla (acompaña el zoom hero) */
    .sec[data-modo="pantalla"] .sec-bg{
      transform: scale(var(--bgzoom, 1));
      transform-origin: center;
    }

    /* ✅ En fondos de imagen, compensamos desde el mismo origen que el wrapper */
    .sec[data-modo="pantalla"][data-fondo="imagen"] .sec-bg{
      transform-origin: top center;
    }

    .sec-bleed{
      position: absolute;
      inset: 0;
      z-index: 2;
      overflow: visible;
      pointer-events: none;
    }

    .sec-content{
      position: relative;
      z-index: 3;
      width: var(--content-w);
      margin: 0 auto;
      height: 100%;
      pointer-events: none;
    }

    /* ✅ Pantalla ON: el ancho del “content” puede crecer con la escala vertical */
    .sec[data-modo="pantalla"] .sec-content{
      width: var(--content-w-pantalla, var(--content-w));
    }

    @media (max-width: 767px){
      .sec-content{
        width: 100%;
        margin: 0;
        box-sizing: border-box;
        padding-left: var(--safe-left);
        padding-right: var(--safe-right);
      }
    }

    .objeto{
      position: absolute;
      transform-origin: top left;
      overflow: visible;
      pointer-events: auto;
    }

    .objeto[data-debug-texto="1"]{
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .sec[data-modo="pantalla"] .objeto[data-debug-texto="1"]{
      --text-scale-effective: var(--pantalla-text-zoom, 1);
    }

    .sec[data-modo="pantalla"] .objeto[data-debug-texto="1"][data-text-scale-mode="lock"]{
      --text-scale-effective: 1;
    }

    .sec[data-modo="pantalla"] .objeto[data-debug-texto="1"][data-text-scale-mode="custom"]{
      --text-scale-effective: min(var(--pantalla-text-zoom, 1), var(--text-scale-max, ${MOBILE_TEXT_ZOOM_CAP}));
    }

    .objeto.is-interactive{ pointer-events: auto; }

    .cd-chip { backdrop-filter: saturate(1.1); }

    .countdown-v2 .cdv2-grid {
      width: 100%;
      box-sizing: border-box;
    }

    .countdown-v2 .cdv2-unit {
      backdrop-filter: saturate(1.04);
    }

    .countdown-v2 .cdv2-unit--hero {
      min-height: calc(var(--sfinal, var(--sx)) * 82px);
    }

    .countdown-v2 .cdv2-frame img {
      width: 100%;
      height: 100%;
      object-fit: fill;
      display: block;
      transform-origin: 50% 50%;
    }

    .cdv2-entry-up { animation: cdv2EntryUp 420ms ease both; }
    .cdv2-entry-fade { animation: cdv2EntryFade 380ms ease both; }
    .cdv2-entry-scale { animation: cdv2EntryScale 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    .cdv2-tick-flip { animation: cdv2TickFlip 320ms ease; transform-origin: center; }
    .cdv2-tick-pulse { animation: cdv2TickPulse 280ms ease; }
    .cdv2-frame-rotate img { animation: cdv2FrameRotate 12s linear infinite; }
    .cdv2-frame-shimmer img { animation: cdv2FrameShimmer 2.4s ease-in-out infinite; }

    @keyframes cdv2EntryUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes cdv2EntryFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes cdv2EntryScale {
      from { opacity: 0; transform: scale(0.985); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes cdv2TickFlip {
      0% { transform: rotateX(0deg); opacity: 0.84; }
      50% { transform: rotateX(62deg); opacity: 0.95; }
      100% { transform: rotateX(0deg); opacity: 1; }
    }

    @keyframes cdv2TickPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.06); }
      100% { transform: scale(1); }
    }

    @keyframes cdv2FrameRotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes cdv2FrameShimmer {
      0%, 100% { opacity: 0.82; filter: brightness(1); }
      50% { opacity: 1; filter: brightness(1.08); }
    }

    @media (prefers-reduced-motion: reduce) {
      .cdv2-entry-up,
      .cdv2-entry-fade,
      .cdv2-entry-scale,
      .cdv2-tick-flip,
      .cdv2-tick-pulse {
        animation: none !important;
      }

      .cdv2-frame-rotate img,
      .cdv2-frame-shimmer img {
        animation: none !important;
      }
    }
  </style>
</head>

<body data-loader-ready="0" data-slug="${escapeAttr(slugPublica)}"${isPreview ? ' data-preview="1"' : ""}>
  ${invitationLoaderRuntime}
  <div class="inv">
    ${htmlSecciones}
  </div>

  ${botonRSVP}
  ${modalRSVP}
  ${modalRegalos}
  ${modalGaleria}
  ${motionEffectsRuntime}

  ${scriptCountdown}
  ${scriptTemplatePreviewPatch}

  <script>
    (function(){
      function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
      function smoothstep01(t){ return t * t * (3 - 2 * t); }

      function compute(){
        var docEl = document.documentElement;
        var vv = window.visualViewport;

        function toPositiveNumber(value){
          var n = Number(value);
          return (isFinite(n) && n > 0) ? n : 0;
        }

        function minPositive(values, fallback){
          var valid = (values || []).filter(function(v){
            return isFinite(v) && v > 0;
          });
          if (!valid.length) return fallback;
          return Math.min.apply(null, valid);
        }

        function detectEmbeddedContext(){
          try {
            return window.self !== window.top;
          } catch(_e) {
            return true;
          }
        }

        function getScreenShortSide(){
          var screenW = toPositiveNumber(window.screen && window.screen.width);
          var screenH = toPositiveNumber(window.screen && window.screen.height);
          return minPositive([screenW, screenH], screenW || screenH || 0);
        }

        function getScreenLongSide(){
          var screenW = toPositiveNumber(window.screen && window.screen.width);
          var screenH = toPositiveNumber(window.screen && window.screen.height);
          if (screenW > 0 && screenH > 0) return Math.max(screenW, screenH);
          return screenW || screenH || 0;
        }

        function readMobileSignals(){
          var ua = String((navigator && navigator.userAgent) || "");
          var mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
          var touchPoints = Number((navigator && navigator.maxTouchPoints) || 0);
          var coarsePointer = false;
          try {
            coarsePointer = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
          } catch(_e) {
            coarsePointer = false;
          }
          return {
            mobileUA: mobileUA,
            touchPoints: touchPoints,
            coarsePointer: coarsePointer,
            isLikelyMobile: mobileUA || (touchPoints > 0 && coarsePointer),
          };
        }

        var embeddedContext = detectEmbeddedContext();
        var mobileSignals = readMobileSignals();
        var docW = toPositiveNumber(docEl.clientWidth);
        var innerW = toPositiveNumber(window.innerWidth);
        var vvW = toPositiveNumber(vv && vv.width);
        var docH = toPositiveNumber(docEl.clientHeight);
        var innerH = toPositiveNumber(window.innerHeight);
        var vvH = toPositiveNumber(vv && vv.height);
        var screenShortSide = getScreenShortSide();
        var screenLongSide = getScreenLongSide();

        // En iframe/srcDoc mobile algunos navegadores reportan visualViewport externo.
        // En ese contexto usamos la menor dimension valida para evitar secciones sobredimensionadas.
        var vw = embeddedContext
          ? minPositive([docW, innerW, vvW], docW || innerW || vvW || 0)
          : (docW || innerW || vvW || 0);

        // Fallback robusto para iframe en mobile: algunos navegadores exponen
        // viewport "desktop-like" y desactivan el reflow mobile por error.
        if ((!isFinite(vw) || vw <= 0) && screenShortSide > 0) {
          vw = screenShortSide;
        }
        if (
          embeddedContext &&
          mobileSignals.isLikelyMobile &&
          screenShortSide > 0 &&
          vw > 767 &&
          screenShortSide < vw
        ) {
          vw = screenShortSide;
        }

        var BASE_W = 800; // = CANVAS_BASE.ANCHO
        if (!isFinite(vw) || vw <= 0) vw = BASE_W;

        // contentW (sin vw-32)
        var contentW = Math.min(BASE_W, vw);

        var sx = contentW / BASE_W;
        var bx = vw / BASE_W;

        document.documentElement.style.setProperty("--content-w", contentW + "px");
        document.documentElement.style.setProperty("--sx", String(sx));
        document.documentElement.style.setProperty("--bx", String(bx));

        var secs = Array.from(document.querySelectorAll(".sec"));
        var isMobile =
          vw <= 767 ||
          (mobileSignals.isLikelyMobile && screenShortSide > 0 && screenShortSide <= 767);

        // viewport real (más estable en mobile)
        var viewportH = embeddedContext
          ? minPositive([docH, innerH, vvH], innerH || docH || vvH || 0)
          : (vvH || innerH || docH || 0);
        if (!isFinite(viewportH) || viewportH <= 0) {
          viewportH = innerH || docH || 0;
        }
        if (
          embeddedContext &&
          mobileSignals.isLikelyMobile &&
          screenLongSide > 0 &&
          viewportH > screenLongSide
        ) {
          viewportH = screenLongSide;
        }

        // safe areas (css env)
        var safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0;
        var safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0;

        // diseño base del modo "pantalla" (800 x 500)
        var DESIGN_W = BASE_W;
        var DESIGN_H = ${ALTURA_REFERENCIA_PANTALLA}; // = ALTURA_REFERENCIA_PANTALLA
        var designAR = DESIGN_H / DESIGN_W; // 0.625
        var deviceAR = viewportH / vw;

        // zoom extra (solo si el device es más vertical que el diseño)
        var zoomExtra = 1;
        if (isMobile && deviceAR > designAR){
          var k = deviceAR / designAR;
          zoomExtra = clamp(1 + (k - 1) * 0.18, 1, 1.35);
        }

        // 🔧 Ajuste fino: cuánto mantiene el zoom visual del fondo en mobile/pantalla.
        // 0   => el fondo se compensa para verse similar a desktop.
        // 1   => comportamiento anterior (fondo acompaña completo el zoom del hero).
        // 0.3 => compensación parcial.
        var BG_ZOOM_FACTOR = 0;

        // 🔧 Ajuste fino: cuánto acompaña el CONTENIDO (texto/objetos) al zoom hero
        // 0   => comportamiento actual
        // 0.3 => recomendado
        // 1   => texto escala igual que el hero (no aconsejado)
        var TEXT_ZOOM_FACTOR = 0;
        var TEXT_ZOOM_CAP = ${MOBILE_TEXT_ZOOM_CAP};
        var TEXT_ZOOM_MIN_VH = ${MOBILE_TEXT_ZOOM_MIN_VH};
        var TEXT_ZOOM_MAX_VH = ${MOBILE_TEXT_ZOOM_MAX_VH};
        var TEXT_ZOOM_RANGE = Math.max(1, TEXT_ZOOM_MAX_VH - TEXT_ZOOM_MIN_VH);


        secs.forEach(function(sec){
          var modo = (sec.getAttribute("data-modo") || "fijo").toLowerCase();
          var fondoTipo = (sec.getAttribute("data-fondo") || "color").toLowerCase();

          // defaults
          var zoom = 1;
          var bgzoom = 1;

          // ✅ Por defecto, tamaños escalan por ancho (comportamiento actual)
          var sfinal = sx;
          var pantallaYCompact = 0;
          var pantallaYBasePx = 0;
          var pantallaTextZoom = 1;

          // limpiar custom width si no aplica
          sec.style.removeProperty("--content-w-pantalla");

          if (modo === "pantalla"){
            // vh-safe real en px
            var vhSafePx = Math.max(0, viewportH - safeTop - safeBottom);
            sec.style.setProperty("--vh-safe", vhSafePx + "px");

            // 🔥 Desktop: escalar el contenido por ALTURA (vhSafe/500)
            // Esto alinea el HTML publicado con lo que ves en preview
            if (!isMobile){
              var sh = vhSafePx / DESIGN_H;
              sfinal = sh;

              // para que el "content" quede centrado y coherente con la nueva escala vertical
              sec.style.setProperty("--content-w-pantalla", (DESIGN_W * sh) + "px");
            }

            // ✅ Mobile: mantenemos tu comportamiento actual (zoom hero suave)
            if (isMobile){
              zoom = zoomExtra;
              var bgVisualZoom = 1 + (zoomExtra - 1) * BG_ZOOM_FACTOR;
              if (fondoTipo === "imagen") {
                bgzoom = bgVisualZoom / Math.max(0.01, zoom);
              } else {
                bgzoom = bgVisualZoom;
              }

              // 🔥 NUEVO: el contenido acompaña parcialmente el zoom
              sfinal = sx * (1 + (zoomExtra - 1) * TEXT_ZOOM_FACTOR);

              var zoomProgress = clamp((vhSafePx - TEXT_ZOOM_MIN_VH) / TEXT_ZOOM_RANGE, 0, 1);
              var zoomProgressEased = smoothstep01(zoomProgress);
              pantallaTextZoom = 1 + (TEXT_ZOOM_CAP - 1) * zoomProgressEased;

              // ✅ Fidelity de diseño en Pantalla:ON:
              // no compactamos distancias verticales para respetar posiciones
              // intencionales (incluyendo textos encimados o muy cercanos).
              pantallaYCompact = 0;

              // ✅ Ajuste de posición vertical global (uniforme):
              // desplazamos TODO el bloque por igual para no alterar posiciones relativas.
              var vhLogicalPx = vhSafePx / Math.max(0.01, zoom || 1);
              var designScaledHPx = sfinal * DESIGN_H;
              var spareVerticalPx = Math.max(0, vhLogicalPx - designScaledHPx);
              pantallaYBasePx = spareVerticalPx * 0.36;
            }
          }

          sec.style.setProperty("--sfinal", String(sfinal));
          sec.style.setProperty("--zoom", String(zoom));
          sec.style.setProperty("--bgzoom", String(bgzoom));
          sec.style.setProperty("--pantalla-text-zoom", String(pantallaTextZoom));

          // ✅ Solo en mobile + pantalla: corregir el "vh" que después se escala con zoom
          if (isMobile && modo === "pantalla") {
            // --vh-logical = --vh-safe / --zoom
            sec.style.setProperty("--vh-logical", "calc(var(--vh-safe) / var(--zoom))");
          } else {
            // resto: se comporta como siempre
            sec.style.setProperty("--vh-logical", "var(--vh-safe)");
          }
          sec.style.setProperty("--pantalla-y-compact", String(pantallaYCompact));
          sec.style.setProperty("--pantalla-y-base", pantallaYBasePx + "px");
        });


      }

      var computeRafId = 0;
      function scheduleCompute(){
        if (computeRafId) return;
        computeRafId = window.requestAnimationFrame(function(){
          computeRafId = 0;
          compute();
        });
      }

      window.addEventListener("load", scheduleCompute);
      window.addEventListener("resize", scheduleCompute);

      if (window.visualViewport){
        window.visualViewport.addEventListener("resize", scheduleCompute);
        window.visualViewport.addEventListener("scroll", scheduleCompute);
      }

      window.addEventListener("orientationchange", function(){
        scheduleCompute();
        setTimeout(scheduleCompute, 50);
        setTimeout(scheduleCompute, 250);
      });

      scheduleCompute();
    })();
  </script>

    


   ${scriptMobileSmart}
 
</body>
</html>
`;
}
