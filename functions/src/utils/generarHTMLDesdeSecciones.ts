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
import {
  resolveFunctionalCtaContract,
  type FunctionalCtaContract,
} from "./functionalCtaContract";
import { normalizeSectionBackgroundModel } from "./sectionBackground";
import {
  collectRenderObjectsDeep,
  hasRenderObjectDeep,
  normalizeRenderObjectType,
} from "./renderObjectTraversal";

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
  rsvpSource?: unknown;
  giftsSource?: unknown;
  functionalCtaContract?: FunctionalCtaContract | null;
};

function collectGoogleFontFamilies(objetos: any[]): string[] {
  return [
    ...new Set(
      collectRenderObjectsDeep(objetos)
        .filter((objeto) => {
          const tipo = normalizeRenderObjectType(objeto.tipo);
          return (
            (tipo === "texto" ||
              tipo === "countdown" ||
              tipo === "rsvp-boton" ||
              tipo === "regalo-boton") &&
            objeto.fontFamily
          );
        })
        .map((objeto) => String(objeto.fontFamily || "").trim())
        .filter(Boolean)
    ),
  ];
}

function escapeAttr(str: string = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeImageBackgroundUrl(url: string = ""): string {
  let imageUrl = String(url || "").trim();
  if (
    imageUrl &&
    imageUrl.includes("firebasestorage.googleapis.com") &&
    !imageUrl.includes("alt=media")
  ) {
    imageUrl = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "alt=media";
  }
  return imageUrl;
}

function buildFondoStyle(seccion: any, backgroundModel = normalizeSectionBackgroundModel(seccion)): string {
  const fondoValue = backgroundModel.base.fondo || "transparent";
  const esImagenFondo =
    backgroundModel.base.fondoTipo === "imagen" && backgroundModel.base.fondoImagen;

  let estilosFondo = "";

  if (esImagenFondo) {
    estilosFondo = `background: ${fondoValue};`;
  } else if (
    fondoValue.startsWith("http") ||
    fondoValue.startsWith("data:") ||
    fondoValue.startsWith("blob:")
  ) {
    const imageUrl = normalizeImageBackgroundUrl(
      fondoValue.replace("url(", "").replace(")", "")
    );

    estilosFondo = `background-image: url('${imageUrl}'); background-size: cover; background-position: center center; background-repeat: no-repeat;`;
  } else {
    estilosFondo = `background: ${fondoValue};`;
  }

  return estilosFondo.replace(/\s+/g, " ").trim();
}

function renderSectionBackgroundLayer(
  seccion: any,
  backgroundModel = normalizeSectionBackgroundModel(seccion)
): string {
  const fondoStyle = buildFondoStyle(seccion, backgroundModel);
  const hasBaseImage =
    backgroundModel.base.fondoTipo === "imagen" && backgroundModel.base.fondoImagen;

  if (!hasBaseImage) {
    return `<div class="sec-bg" style="${fondoStyle}"></div>`;
  }

  const imageUrl = normalizeImageBackgroundUrl(backgroundModel.base.fondoImagen);
  const offsetX = Number(backgroundModel.base.fondoImagenOffsetX) || 0;
  const offsetY = Number(backgroundModel.base.fondoImagenOffsetY) || 0;
  const imageScale = Math.max(1, Number(backgroundModel.base.fondoImagenScale) || 1);

  return `
<div class="sec-bg" data-bg-kind="image" data-bg-offset-x="${escapeAttr(String(offsetX))}" data-bg-offset-y="${escapeAttr(String(offsetY))}" data-bg-scale="${escapeAttr(String(imageScale))}" style="${fondoStyle}">
  <img class="sec-bg-image" data-bg-parallax-item="true" src="${escapeAttr(imageUrl)}" alt="" decoding="async" loading="eager" draggable="false" />
</div>
`.trim();
}

function hasImageBackground(seccion: any): boolean {
  const backgroundModel = normalizeSectionBackgroundModel(seccion);
  if (backgroundModel.base.fondoTipo === "imagen" && backgroundModel.base.fondoImagen) return true;

  const fondoValue =
    typeof backgroundModel.base.fondo === "string" ? backgroundModel.base.fondo.trim() : "";
  return (
    fondoValue.startsWith("http") ||
    fondoValue.startsWith("data:") ||
    fondoValue.startsWith("blob:")
  );
}

function buildSectionDecorationScaleVar(mode: string): string {
  return String(mode || "").toLowerCase() === "pantalla" ? "var(--sfinal)" : "var(--sx)";
}

function buildSectionDecorationTopCss(top: number, mode: string): string {
  const scaleVar = buildSectionDecorationScaleVar(mode);
  if (String(mode || "").toLowerCase() === "pantalla") {
    return `calc(var(--pantalla-y-base, 0px) + (${scaleVar} * ${top}px) + (${scaleVar} * var(--pantalla-y-offset, 0px)))`;
  }
  return `calc(${scaleVar} * ${top}px)`;
}

function buildSectionDecorationStyle(decoration: any, mode: string): string {
  const left = Number(decoration?.x) || 0;
  const top = Number(decoration?.y) || 0;
  const width = Math.max(1, Number(decoration?.width) || 1);
  const height = Math.max(1, Number(decoration?.height) || 1);
  const scaleVar = buildSectionDecorationScaleVar(mode);

  return [
    `left:calc(${scaleVar} * ${left}px)`,
    `top:${buildSectionDecorationTopCss(top, mode)}`,
    `width:calc(${scaleVar} * ${width}px)`,
    `height:calc(${scaleVar} * ${height}px)`,
  ].join(";");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeEdgeCssNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEdgeHeightModel(value: unknown): "intrinsic-clamp" | "ratio-band" {
  return String(value || "").trim().toLowerCase() === "ratio-band"
    ? "ratio-band"
    : "intrinsic-clamp";
}

function normalizePositiveEdgeCssNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(clampNumber(parsed, 1, 20000) * 100) / 100;
}

function buildSectionEdgeDecorationStyle(decoration: any): string {
  const heightDesktopRatio = clampNumber(
    normalizeEdgeCssNumber(decoration?.heightDesktopRatio, 0.36),
    0.08,
    0.55
  );
  const heightMobileRatio = clampNumber(
    normalizeEdgeCssNumber(decoration?.heightMobileRatio, 0.2),
    0.08,
    0.32
  );
  const offsetDesktopPx = clampNumber(
    normalizeEdgeCssNumber(decoration?.offsetDesktopPx, 0),
    -240,
    240
  );
  const offsetMobilePx = clampNumber(
    normalizeEdgeCssNumber(decoration?.offsetMobilePx, 0),
    -240,
    240
  );
  const minHeightDesktopPx = Math.round(
    clampNumber(normalizeEdgeCssNumber(decoration?.minHeightDesktopPx, 96), 24, 640)
  );
  const maxHeightDesktopPx = Math.round(
    clampNumber(normalizeEdgeCssNumber(decoration?.maxHeightDesktopPx, 280), 24, 640)
  );
  const minHeightMobilePx = Math.round(
    clampNumber(normalizeEdgeCssNumber(decoration?.minHeightMobilePx, 64), 24, 360)
  );
  const maxHeightMobilePx = Math.round(
    clampNumber(normalizeEdgeCssNumber(decoration?.maxHeightMobilePx, 150), 24, 360)
  );
  const maxSectionRatioDesktop = clampNumber(
    normalizeEdgeCssNumber(decoration?.maxSectionRatioDesktop, 0.3),
    0.08,
    0.55
  );
  const maxSectionRatioMobile = clampNumber(
    normalizeEdgeCssNumber(decoration?.maxSectionRatioMobile, 0.24),
    0.08,
    0.32
  );

  return [
    `--edge-height-desktop-ratio:${heightDesktopRatio}`,
    `--edge-height-mobile-ratio:${heightMobileRatio}`,
    `--edge-min-height-desktop:${minHeightDesktopPx}px`,
    `--edge-max-height-desktop:${Math.max(minHeightDesktopPx, maxHeightDesktopPx)}px`,
    `--edge-max-section-ratio-desktop:${maxSectionRatioDesktop}`,
    `--edge-min-height-mobile:${minHeightMobilePx}px`,
    `--edge-max-height-mobile:${Math.max(minHeightMobilePx, maxHeightMobilePx)}px`,
    `--edge-max-section-ratio-mobile:${maxSectionRatioMobile}`,
    `--edge-offset-desktop:${offsetDesktopPx}px`,
    `--edge-offset-mobile:${offsetMobilePx}px`,
  ].join(";");
}

function buildSectionEdgeDecorationsLayoutStyle(decoracionesBorde: any): string {
  const layout =
    decoracionesBorde && typeof decoracionesBorde === "object"
      ? decoracionesBorde.layout
      : null;
  const maxCombinedSectionRatioDesktop = clampNumber(
    normalizeEdgeCssNumber(layout?.maxCombinedSectionRatioDesktop, 0.58),
    0.16,
    0.75
  );
  const maxCombinedSectionRatioMobile = clampNumber(
    normalizeEdgeCssNumber(layout?.maxCombinedSectionRatioMobile, 0.4),
    0.16,
    0.6
  );

  return [
    `--edge-combined-ratio-desktop:${maxCombinedSectionRatioDesktop}`,
    `--edge-combined-ratio-mobile:${maxCombinedSectionRatioMobile}`,
  ].join(";");
}

function buildSectionDecorationInnerStyle(decoration: any): string {
  const rotation = Number(decoration?.rotation) || 0;
  return [`transform:rotate(${rotation}deg)`, "transform-origin:center center"].join(";");
}

function buildSectionDecorationDepth(index: number): string {
  const depth = Math.min(1.1, 0.65 + Math.max(0, index) * 0.15);
  return depth.toFixed(2);
}

function renderSectionDecorations(decorations: any[], mode: string): string {
  const items = (Array.isArray(decorations) ? decorations : [])
    .map((decoration, index) => {
      const src = escapeAttr(String(decoration?.src || "").trim());
      if (!src) return "";

      const itemStyle = escapeAttr(buildSectionDecorationStyle(decoration, mode));
      const innerStyle = escapeAttr(buildSectionDecorationInnerStyle(decoration));
      const depth = escapeAttr(buildSectionDecorationDepth(index));
      return `
        <div class="sec-decor-item" data-decor-depth="${depth}" style="${itemStyle}">
          <div class="sec-decor-item-inner" style="${innerStyle}">
            <img src="${src}" alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      `.trim();
    })
    .filter(Boolean);

  if (!items.length) return "";

  return `
    <div class="sec-decor-layer">
      <div class="sec-decor-content">
        ${items.join("\n")}
      </div>
    </div>
  `.trim();
}

function renderSectionEdgeDecorations(decoracionesBorde: any): string {
  const source =
    decoracionesBorde && typeof decoracionesBorde === "object"
      ? decoracionesBorde
      : {};
  const items = (["top", "bottom"] as const)
    .map((slot) => {
      const decoration = source[slot];
      if (!decoration || typeof decoration !== "object") return "";
      if (decoration.enabled === false) return "";

      const src = escapeAttr(normalizeImageBackgroundUrl(String(decoration.src || "").trim()));
      if (!src) return "";

      const slotClass = slot === "top" ? "sec-edge-decor--top" : "sec-edge-decor--bottom";
      const mode = decoration.mode === "contain-x" ? "contain-x" : "cover-x";
      const heightModel = normalizeEdgeHeightModel(decoration.heightModel);
      const intrinsicWidth = normalizePositiveEdgeCssNumber(decoration.intrinsicWidth);
      const intrinsicHeight = normalizePositiveEdgeCssNumber(decoration.intrinsicHeight);
      const style = buildSectionEdgeDecorationStyle(decoration);
      const intrinsicAttrs = [
        intrinsicWidth ? `data-edge-intrinsic-width="${escapeAttr(String(intrinsicWidth))}"` : "",
        intrinsicHeight ? `data-edge-intrinsic-height="${escapeAttr(String(intrinsicHeight))}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <div class="sec-edge-decor ${slotClass}" data-edge-slot="${slot}" data-edge-mode="${mode}" data-edge-height-model="${heightModel}" ${intrinsicAttrs} style="${style}">
          <img class="sec-edge-decor-img" src="${src}" alt="" loading="eager" decoding="async" draggable="false" />
        </div>
      `.trim();
    })
    .filter(Boolean);

  if (!items.length) return "";

  const layerStyle = escapeAttr(buildSectionEdgeDecorationsLayoutStyle(source));

  return `
    <div class="sec-edge-layer" aria-hidden="true" style="${layerStyle}">
      ${items.join("\n")}
    </div>
  `.trim();
}

export function generarHTMLDesdeSecciones(
  secciones: any[],
  objetos: any[],
  rsvp?: ModalConfig | null,
  opciones?: GenerarHTMLOpciones,
  opts?: { slug?: string }
): string {
  const slug = opciones?.slug ?? "";
  const slugPublica = opts?.slug ?? "";
  const isPreview = opciones?.isPreview === true;
  const hasExplicitRsvpSource = Boolean(
    opciones && Object.prototype.hasOwnProperty.call(opciones, "rsvpSource")
  );
  const hasExplicitGiftsSource = Boolean(
    opciones && Object.prototype.hasOwnProperty.call(opciones, "giftsSource")
  );
  // Compatibility seam: some callers still omit the resolved contract and rely on
  // generator-side recompute to keep CTA/output parity with stored root configs.
  const functionalCtaContract =
    opciones?.functionalCtaContract ??
    resolveFunctionalCtaContract({
      objetos,
      rsvpConfig: hasExplicitRsvpSource ? opciones?.rsvpSource : rsvp,
      giftsConfig: hasExplicitGiftsSource ? opciones?.giftsSource : opciones?.gifts,
    });

  const fuentesUsadas = collectGoogleFontFamilies(objetos);

  const googleFontsLink = buildGoogleFontsLink(fuentesUsadas);

  const botonRSVP = ""; // (si querés agregar un botón fijo fuera del canvas, hacelo acá)
  const modalRSVP =
    functionalCtaContract.rsvp.ready && functionalCtaContract.rsvp.config
      ? generarModalRSVPHTML(functionalCtaContract.rsvp.config, { previewMode: isPreview })
      : "";
  const modalRegalos =
    functionalCtaContract.gifts.ready && functionalCtaContract.gifts.config
      ? generarModalRegalosHTML(functionalCtaContract.gifts.config)
      : "";
  const modalGaleria = hayGaleriaConImagenes(objetos) ? generarModalGaleriaHTML() : "";
  const invitationLoaderRuntime = generarInvitationLoaderRuntimeHTML();
  const motionEffectsRuntime = generarMotionEffectsRuntimeHTML();

  function hayCountdown(objs: any[]) {
    return hasRenderObjectDeep(
      objs,
      (objeto) => normalizeRenderObjectType(objeto?.tipo) === "countdown"
    );
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

  function resolveCountdownContract(root){
    var explicitContract = String(root.getAttribute("data-countdown-contract") || "")
      .trim()
      .toLowerCase();
    if (explicitContract === "v2" || explicitContract === "v1") {
      return explicitContract;
    }
    if (root.getAttribute("data-countdown-v2") === "1") {
      return "v2";
    }
    return "v1";
  }

  function tickOne(root){
    const iso = root.getAttribute("data-target");
    if(!iso) return;
    const targetDate = new Date(iso);
    if(isNaN(targetDate.getTime())) return;
    const parts = diffParts(targetDate);

    if (resolveCountdownContract(root) === "v2") {
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

  var PREVIEW_SCROLL_PADDING_PX = 24;
  var PREVIEW_SCROLL_CENTER_RATIO = 0.3;
  var PREVIEW_SCROLL_LARGE_TARGET_THRESHOLD = 0.68;
  var PREVIEW_SCROLL_LARGE_TARGET_TOP_RATIO = 0.1;

  function normalizeScrollTargets(scrollTargets){
    var out = [];
    var seen = {};
    if (!Array.isArray(scrollTargets)) return out;

    for (var i = 0; i < scrollTargets.length; i += 1) {
      var target = scrollTargets[i];
      var scope = toText(target && target.scope).toLowerCase();
      var id = toText(target && target.id);
      if (!id) continue;
      if (scope !== "objeto" && scope !== "seccion") continue;

      var dedupeKey = scope + "|" + id;
      if (seen[dedupeKey]) continue;
      seen[dedupeKey] = true;
      out.push({
        scope: scope,
        id: id,
      });
    }

    return out;
  }

  function findPreviewTarget(target){
    if (!target || typeof target !== "object") return null;
    var scope = toText(target.scope).toLowerCase();
    if (scope === "objeto") return findObjectElementById(target.id);
    if (scope === "seccion") return findSectionElementById(target.id);
    return null;
  }

  function isPreviewTargetVisible(targetElement){
    if (!targetElement || typeof targetElement.getBoundingClientRect !== "function") return false;

    var rect = targetElement.getBoundingClientRect();
    var viewportWidth = Math.max(
      0,
      window.innerWidth || document.documentElement.clientWidth || 0
    );
    var viewportHeight = Math.max(
      0,
      window.innerHeight || document.documentElement.clientHeight || 0
    );
    if (!(viewportWidth > 0) || !(viewportHeight > 0)) return false;

    var padding = Math.min(
      PREVIEW_SCROLL_PADDING_PX,
      Math.max(8, Math.round(Math.min(viewportWidth, viewportHeight) * 0.04))
    );

    return (
      rect.bottom > padding &&
      rect.top < viewportHeight - padding &&
      rect.right > padding &&
      rect.left < viewportWidth - padding
    );
  }

  function scrollToPreviewElement(targetElement){
    if (!targetElement || typeof targetElement.getBoundingClientRect !== "function") return false;

    var scrollRoot =
      document.scrollingElement ||
      document.documentElement ||
      document.body ||
      null;
    if (!scrollRoot || typeof scrollRoot.scrollTo !== "function") return false;

    var rect = targetElement.getBoundingClientRect();
    var viewportHeight = Math.max(
      0,
      window.innerHeight || document.documentElement.clientHeight || 0
    );
    if (!(viewportHeight > 0)) return false;

    var currentScrollTop = Number(scrollRoot.scrollTop || window.pageYOffset || 0);
    var documentTop = currentScrollTop + rect.top;
    var documentCenter = documentTop + rect.height / 2;
    var targetTop = documentCenter - viewportHeight * PREVIEW_SCROLL_CENTER_RATIO;

    if (rect.height >= viewportHeight * PREVIEW_SCROLL_LARGE_TARGET_THRESHOLD) {
      targetTop = documentTop - viewportHeight * PREVIEW_SCROLL_LARGE_TARGET_TOP_RATIO;
    }

    var maxScrollTop = Math.max(
      0,
      (Number(scrollRoot.scrollHeight || 0) - Number(scrollRoot.clientHeight || viewportHeight))
    );
    var clampedTop = Math.max(0, Math.min(maxScrollTop, targetTop));

    if (Math.abs(clampedTop - currentScrollTop) < 2) return false;

    scrollRoot.scrollTo({
      top: Math.round(clampedTop),
      behavior: "smooth",
    });
    return true;
  }

  function applyPreviewScrollTargets(scrollTargets){
    var firstFoundTarget = null;

    for (var i = 0; i < scrollTargets.length; i += 1) {
      var targetElement = findPreviewTarget(scrollTargets[i]);
      if (!targetElement) continue;
      if (!firstFoundTarget) firstFoundTarget = targetElement;
      if (isPreviewTargetVisible(targetElement)) return false;
    }

    if (!firstFoundTarget) return false;
    return scrollToPreviewElement(firstFoundTarget);
  }

  function setImageSource(targetElement, nextUrl){
    var safeUrl = toText(nextUrl);
    if (!safeUrl || !targetElement) return false;
    var sectionBackgroundImage =
      targetElement.querySelector && targetElement.querySelector(".sec-bg-image");
    if (sectionBackgroundImage) {
      if (toText(sectionBackgroundImage.getAttribute("src")) === safeUrl) return false;
      sectionBackgroundImage.setAttribute("src", safeUrl);
      return true;
    }
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

  function renderDynamicGalleryCells(targetElement, urls, galleryLayout){
    if (!targetElement) return false;
    var galleryRoot = targetElement.classList && targetElement.classList.contains("galeria")
      ? targetElement
      : targetElement.querySelector(".galeria");
    if (!galleryRoot) return false;

    var safeUrls = toStringArray(urls);
    var rects = Array.isArray(galleryLayout && galleryLayout.rects)
      ? galleryLayout.rects
      : [];
    var totalHeight = Number(galleryLayout && galleryLayout.totalHeight);
    if (!isFinite(totalHeight) || totalHeight < 0) totalHeight = 0;
    var totalWidth = Number(galleryLayout && galleryLayout.totalWidth);
    if (!isFinite(totalWidth) || totalWidth < 0) totalWidth = 0;
    var frame = galleryLayout && typeof galleryLayout === "object"
      ? galleryLayout.frame
      : null;

    var existingCells = galleryRoot.querySelectorAll(".galeria-celda");
    var radius = 0;
    if (existingCells.length > 0) {
      var firstCellStyle = window.getComputedStyle
        ? window.getComputedStyle(existingCells[0])
        : null;
      radius = parsePixelValue(firstCellStyle && firstCellStyle.borderRadius) || 0;
    }

    galleryRoot.innerHTML = "";
    galleryRoot.classList.add("galeria--dynamic");
    galleryRoot.setAttribute("data-gallery-layout-mode", "dynamic_media");

    var layoutType = toText(galleryLayout && galleryLayout.galleryLayoutType);
    if (layoutType) {
      galleryRoot.setAttribute("data-gallery-layout-type", layoutType);
    }

    galleryRoot.style.display = "block";
    galleryRoot.style.gap = "0px";
    galleryRoot.style.gridTemplateColumns = "";
    galleryRoot.style.gridTemplateRows = "";
    if (frame && typeof frame === "object") {
      var frameX = Number(frame.x);
      var frameY = Number(frame.y);
      var frameWidth = Number(frame.width);
      var frameHeight = Number(frame.height);

      if (isFinite(frameX)) {
        galleryRoot.style.left = frameX + "px";
      }
      if (isFinite(frameY)) {
        galleryRoot.style.top = frameY + "px";
      }
      if (isFinite(frameWidth) && frameWidth >= 0) {
        galleryRoot.style.width = frameWidth + "px";
      } else if (totalWidth >= 0) {
        galleryRoot.style.width = totalWidth + "px";
      }
      if (isFinite(frameHeight) && frameHeight >= 0) {
        galleryRoot.style.height = frameHeight + "px";
      } else {
        galleryRoot.style.height = totalHeight + "px";
      }
    } else {
      if (totalWidth >= 0) {
        galleryRoot.style.width = totalWidth + "px";
      }
      galleryRoot.style.height = totalHeight + "px";
    }

    for (var i = 0; i < rects.length; i += 1) {
      var nextUrl = safeUrls[i];
      var rect = rects[i];
      if (!nextUrl || !rect) continue;

      var cell = document.createElement("div");
      cell.className = "galeria-celda galeria-celda--clickable";
      cell.setAttribute("data-index", String(i));
      cell.setAttribute("data-gallery-image", "1");
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", "Ver imagen en pantalla completa");
      cell.style.position = "absolute";
      cell.style.left = (Number(rect.x) || 0) + "px";
      cell.style.top = (Number(rect.y) || 0) + "px";
      cell.style.width = (Number(rect.width) || 0) + "px";
      cell.style.height = (Number(rect.height) || 0) + "px";
      cell.style.overflow = "hidden";
      cell.style.borderRadius = Math.max(0, radius) + "px";
      cell.style.background = "#f3f4f6";
      ensureGalleryCellImage(cell, nextUrl);
      galleryRoot.appendChild(cell);
    }

    return true;
  }

  function applyGalleryCells(targetElement, urls, galleryLayout){
    if (galleryLayout && typeof galleryLayout === "object") {
      return renderDynamicGalleryCells(targetElement, urls, galleryLayout);
    }
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
      return applyGalleryCells(targetElement, nextValue, operation.galleryLayout);
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
    var scrollTargets = normalizeScrollTargets(payload.scrollTargets);
    if (!operations.length && !scrollTargets.length) return;
    operations.forEach(function(operation){
      try {
        applyOperation(operation);
      } catch (_error) {
        // Ignorar errores de patch para no interrumpir la preview.
      }
    });

    if (!scrollTargets.length) return;

    var runPreviewScroll = function(){
      try {
        applyPreviewScrollTargets(scrollTargets);
      } catch (_error) {
        // Ignorar errores de scroll para no interrumpir la preview.
      }
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(runPreviewScroll);
      return;
    }

    runPreviewScroll();
  });
})();
</script>
`.trim();

  const seccionesOrdenadas = [...(secciones || [])].sort(
    (a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0)
  );


  const htmlSecciones = seccionesOrdenadas
    .map((seccion) => {
      const backgroundModel = normalizeSectionBackgroundModel(seccion);
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

      const fondoLayerHtml = renderSectionBackgroundLayer(seccion, backgroundModel);
      const htmlDecoracionesBorde = renderSectionEdgeDecorations(
        backgroundModel.decoracionesBorde
      );
      const htmlDecoraciones = renderSectionDecorations(backgroundModel.decoraciones, modo);
      const hasEdgeDecorations = Boolean(htmlDecoracionesBorde);
      const edgeDecorationsAttr = hasEdgeDecorations ? ' data-edge-decorations="1"' : "";

      const htmlBleed = generarHTMLDesdeObjetos(objsBleed, seccionesOrdenadas, {
        functionalCtaContract,
      });
      const htmlContenido = generarHTMLDesdeObjetos(objsContenido, seccionesOrdenadas, {
        functionalCtaContract,
      });


      return `
<section class="sec" data-seccion-id="${seccionId}" data-modo="${escapeAttr(modo)}" data-fondo="${fondoEsImagen ? "imagen" : "color"}" data-decor-parallax="${escapeAttr(backgroundModel.parallax)}"${edgeDecorationsAttr} style="--hbase:${hbase}">
  <div class="sec-zoom sec-zoom-backdrop">
    ${fondoLayerHtml}
  </div>
  ${htmlDecoracionesBorde}
  <div class="sec-zoom sec-zoom-decor">
    ${htmlDecoraciones}
  </div>
  <div class="sec-zoom sec-zoom-content">
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

  const previewMobileScrollRuntime = `
<script>
(function(){
  function detectEmbeddedContext(){
    try {
      return window.self !== window.top;
    } catch(_error) {
      return true;
    }
  }

  function isPreviewDocument(){
    var htmlPreview = "";
    var bodyPreview = "";
    try {
      htmlPreview = String(
        document && document.documentElement && document.documentElement.dataset
          ? document.documentElement.dataset.preview || ""
          : ""
      ).toLowerCase();
    } catch(_error1) {}
    try {
      bodyPreview = String(
        document && document.body && document.body.dataset
          ? document.body.dataset.preview || ""
          : ""
      ).toLowerCase();
    } catch(_error2) {}
    return (
      htmlPreview === "1" ||
      htmlPreview === "true" ||
      bodyPreview === "1" ||
      bodyPreview === "true"
    );
  }

  function getPreviewViewportKind(){
    var htmlViewport = "";
    var bodyViewport = "";
    var runtimeViewport = "";
    try {
      htmlViewport = String(
        document && document.documentElement && document.documentElement.dataset
          ? document.documentElement.dataset.previewViewport || ""
          : ""
      ).toLowerCase();
    } catch(_error1) {}
    try {
      bodyViewport = String(
        document && document.body && document.body.dataset
          ? document.body.dataset.previewViewport || ""
          : ""
      ).toLowerCase();
    } catch(_error2) {}
    try {
      runtimeViewport = String(window.__previewViewportKind || "").toLowerCase();
    } catch(_error3) {}
    return runtimeViewport || htmlViewport || bodyViewport;
  }

  function toPositiveNumber(value){
    var numeric = Number(value);
    return isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  var started = false;
  var normalizingScrollRoot = false;

  function shouldStart(){
    return isPreviewDocument() && detectEmbeddedContext() && getPreviewViewportKind() === "mobile";
  }

  function getRootScrollTop(){
    var docEl = document.documentElement;
    var scrollingElement = document.scrollingElement;
    return Math.max(
      toPositiveNumber(window.scrollY),
      toPositiveNumber(window.pageYOffset),
      toPositiveNumber(docEl && docEl.scrollTop),
      toPositiveNumber(scrollingElement && scrollingElement.scrollTop)
    );
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function getRootScrollingElement(){
    return document.scrollingElement || document.documentElement || document.body || null;
  }

  function getMaxRootScrollTop(){
    var docEl = document.documentElement;
    var body = document.body;
    var scrollingElement = getRootScrollingElement();
    var scrollHeight = Math.max(
      toPositiveNumber(scrollingElement && scrollingElement.scrollHeight),
      toPositiveNumber(docEl && docEl.scrollHeight),
      toPositiveNumber(body && body.scrollHeight)
    );
    var clientHeight = Math.max(
      toPositiveNumber(window.innerHeight),
      toPositiveNumber(docEl && docEl.clientHeight),
      toPositiveNumber(scrollingElement && scrollingElement.clientHeight)
    );
    return Math.max(0, scrollHeight - clientHeight);
  }

  function setRootScrollTop(nextTop){
    var targetTop = Math.max(0, toPositiveNumber(nextTop));
    var docEl = document.documentElement;
    var body = document.body;
    var scrollingElement = getRootScrollingElement();

    if (typeof window.scrollTo === "function") {
      window.scrollTo(0, targetTop);
    }
    if (scrollingElement && scrollingElement !== body) {
      scrollingElement.scrollTop = targetTop;
    }
    if (docEl) {
      docEl.scrollTop = targetTop;
    }
    if (body && body !== scrollingElement) {
      body.scrollTop = 0;
    }
    return targetTop;
  }

  function normalizeWheelDelta(delta, deltaMode){
    var value = Number(delta);
    if (!isFinite(value) || value === 0) return 0;
    if (Number(deltaMode) === 1) {
      return value * 16;
    }
    if (Number(deltaMode) === 2) {
      return value * Math.max(
        1,
        toPositiveNumber(window.innerHeight),
        toPositiveNumber(document.documentElement && document.documentElement.clientHeight)
      );
    }
    return value;
  }

  function canElementConsumeWheel(element, deltaY){
    if (!element) return false;
    if (
      element === document.body ||
      element === document.documentElement ||
      element === document.scrollingElement
    ) {
      return false;
    }

    var computedStyle = null;
    try {
      computedStyle = window.getComputedStyle ? window.getComputedStyle(element) : null;
    } catch(_error) {
      computedStyle = null;
    }

    var overflowY = String(computedStyle && computedStyle.overflowY || "").toLowerCase();
    if (!/(auto|scroll|overlay)/.test(overflowY)) return false;

    var scrollHeight = toPositiveNumber(element.scrollHeight);
    var clientHeight = toPositiveNumber(element.clientHeight);
    if (scrollHeight <= clientHeight + 1) return false;

    var scrollTop = toPositiveNumber(element.scrollTop);
    if (deltaY < 0) return scrollTop > 0.5;
    if (deltaY > 0) return scrollTop + clientHeight < scrollHeight - 0.5;
    return true;
  }

  function findWheelScrollableAncestor(target, deltaY){
    var current = target;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.nodeType === 1 && canElementConsumeWheel(current, deltaY)) {
        return current;
      }
      current = current.parentElement || current.parentNode || null;
    }
    return null;
  }

  function redirectWheelToRoot(nativeEvent){
    if (!shouldStart() || !nativeEvent || nativeEvent.defaultPrevented) return false;
    if (nativeEvent.ctrlKey || nativeEvent.metaKey) return false;

    var deltaY = normalizeWheelDelta(nativeEvent.deltaY, nativeEvent.deltaMode);
    var deltaX = normalizeWheelDelta(nativeEvent.deltaX, nativeEvent.deltaMode);
    if (Math.abs(deltaY) < 0.5 && Math.abs(deltaX) < 0.5) return false;

    if (findWheelScrollableAncestor(nativeEvent.target, deltaY)) {
      return false;
    }

    var rootBefore = getRootScrollTop();
    var rootTarget = clamp(rootBefore + deltaY, 0, getMaxRootScrollTop());
    if (Math.abs(rootTarget - rootBefore) < 0.5) return false;

    if (nativeEvent.cancelable) {
      nativeEvent.preventDefault();
    }
    setRootScrollTop(rootTarget);
    return true;
  }

  function normalizeBodyScrollToRoot(){
    if (!shouldStart() || normalizingScrollRoot) return false;

    var body = document.body;
    var docEl = document.documentElement;
    var scrollingElement = document.scrollingElement;
    if (!body || !docEl) return false;
    if (body === scrollingElement || body === docEl) return false;

    var bodyTop = toPositiveNumber(body.scrollTop);
    if (bodyTop <= 0.5) return false;

    var rootTop = getRootScrollTop();
    var targetTop = Math.max(rootTop, rootTop + bodyTop);

    normalizingScrollRoot = true;
    try {
      if (typeof window.scrollTo === "function") {
        window.scrollTo(0, targetTop);
      }
      if (scrollingElement && scrollingElement !== body) {
        scrollingElement.scrollTop = targetTop;
      }
      docEl.scrollTop = targetTop;
      body.scrollTop = 0;
    } catch(_error) {
      normalizingScrollRoot = false;
      return false;
    }

    var raf = window.requestAnimationFrame || function(cb){
      return window.setTimeout(cb, 16);
    };
    raf(function(){
      normalizingScrollRoot = false;
    });
    return true;
  }

  function boot(){
    if (started || !shouldStart()) return;
    started = true;

    document.addEventListener("wheel", function(nativeEvent){
      redirectWheelToRoot(nativeEvent);
    }, { passive: false, capture: true });

    document.addEventListener("scroll", function(){
      normalizeBodyScrollToRoot();
    }, { passive: true, capture: true });

    if (document.body && document.body.addEventListener) {
      document.body.addEventListener("scroll", function(){
        normalizeBodyScrollToRoot();
      }, { passive: true });
    }
  }

  window.addEventListener("preview:mobile-scroll:enable", boot);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function(){
      window.setTimeout(boot, 0);
    }, { once: true });
  } else {
    window.setTimeout(boot, 0);
  }
})();
</script>
`.trim();

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

    html[data-preview="1"]:not([data-preview-layout-mode="parity"]),
    body[data-preview="1"]:not([data-preview-layout-mode="parity"]){
      height: auto;
      min-height: 100%;
    }

    html[data-preview="1"]:not([data-preview-layout-mode="parity"]){
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }

    body[data-preview="1"]:not([data-preview-layout-mode="parity"]){
      overflow-y: visible;
    }

    ${
      isPreview
        ? `
    html[data-preview="1"][data-preview-layout-mode="parity"][data-preview-viewport="mobile"],
    body[data-preview="1"][data-preview-layout-mode="parity"][data-preview-viewport="mobile"]{
      height: auto;
      min-height: 100%;
    }

    html[data-preview="1"][data-preview-layout-mode="parity"][data-preview-viewport="mobile"]{
      overflow-y: auto;
      overscroll-behavior-y: contain;
      scroll-behavior: auto;
    }

    body[data-preview="1"][data-preview-layout-mode="parity"][data-preview-viewport="mobile"]{
      overflow-y: visible;
    }
    `
        : ""
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
      --edge-section-h: 100%;
      --edge-offset-scale: var(--sfinal, var(--sx, 1));
    }

    /* ✅ Wrapper que hace “zoom” centrado (evita corrimiento a la derecha) */
    .sec-zoom{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform-origin: top center;
      transform: scale(var(--zoom, 1));
    }

    .sec-zoom-backdrop{
      z-index: 0;
      pointer-events: none;
    }

    .sec-zoom-decor{
      z-index: 2;
      pointer-events: none;
    }

    .sec-zoom-content{
      z-index: 3;
      pointer-events: none;
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
      --edgezoom: 1;
      --pantalla-text-zoom: 1;
      --edge-section-h: var(--vh-safe);

      /* factor final para CONTENIDO (se setea por JS) */
      --sfinal: 1;
    }

    .sec[data-modo="fijo"]{
      /* altura fija escalada por ancho; JS setea --sfinal = sx */
      height: calc(var(--sfinal) * var(--hbase) * 1px);
      --zoom: 1;
      --bgzoom: 1;
      --edgezoom: 1;
      --edge-section-h: calc(var(--sfinal) * var(--hbase) * 1px);
    }

    /* Fondo */
    .sec-bg{
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .sec-bg-image{
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      width: auto;
      height: auto;
      max-width: none;
      max-height: none;
      object-fit: cover;
      transform-origin: top left;
      transform: translate3d(var(--bg-image-left, 0px), calc(var(--bg-image-top, 0px) + var(--bg-parallax-y, 0px)), 0);
      will-change: transform;
      pointer-events: none;
      user-select: none;
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

    .sec[data-modo="pantalla"] .sec-zoom-backdrop,
    .sec[data-modo="pantalla"] .sec-zoom-decor,
    .sec[data-modo="pantalla"] .sec-zoom-content{
      overflow: hidden;
    }

    .sec-edge-layer{
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      transform-origin: top center;
    }

    .sec[data-modo="pantalla"] .sec-edge-layer{
      transform: scale(var(--edgezoom, 1));
    }

    @media (min-width: 768px){
      .sec[data-edge-decorations="1"] .sec-edge-layer{
        overflow: visible;
      }

      .sec[data-modo="pantalla"][data-edge-decorations="1"]{
        overflow: visible;
      }
    }

    .sec-edge-decor{
      position: absolute;
      left: 50%;
      display: block;
      width: 100vw;
      height: var(--edge-used-height, min(var(--edge-max-height-desktop, 280px), calc(var(--edge-section-h, 100%) * var(--edge-max-section-ratio-desktop, 0.3))));
      max-width: none;
      max-height: none;
      transform: translateX(-50%);
      pointer-events: none;
      user-select: none;
      overflow: hidden;
    }

    .sec-edge-decor-img{
      display: block;
      width: 100%;
      height: auto;
      max-width: none;
      max-height: none;
      position: absolute;
      left: 0;
      pointer-events: none;
      user-select: none;
    }

    .sec-edge-decor[data-edge-mode="cover-x"] .sec-edge-decor-img{
      height: 100%;
      object-fit: cover;
    }

    .sec-edge-decor[data-edge-mode="contain-x"] .sec-edge-decor-img{
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .sec-edge-decor--top{
      top: calc(var(--edge-offset-scale, 1) * var(--edge-offset-desktop, 0px));
    }

    .sec-edge-decor--top .sec-edge-decor-img{
      top: 0;
      bottom: auto;
      object-position: center top;
    }

    .sec-edge-decor--bottom{
      bottom: calc(var(--edge-offset-scale, 1) * var(--edge-offset-desktop, 0px));
    }

    .sec-edge-decor--bottom .sec-edge-decor-img{
      top: auto;
      bottom: 0;
      object-position: center bottom;
    }

    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--top .sec-edge-decor-img{
      top: 0;
      bottom: auto;
      object-position: center top;
    }

    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--bottom .sec-edge-decor-img{
      top: auto;
      bottom: 0;
      object-position: center bottom;
    }

    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--top,
    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--bottom{
      overflow: visible;
    }

    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--top .sec-edge-decor-img,
    .sec-edge-decor[data-edge-mode="cover-x"].sec-edge-decor--bottom .sec-edge-decor-img{
      height: auto;
      object-fit: contain;
    }

    .sec-edge-decor[data-edge-height-model="ratio-band"]{
      height: calc(var(--edge-section-h, 100%) * var(--edge-height-desktop-ratio, 0.36));
    }

    @media (min-width: 768px){
      .sec-edge-decor[data-edge-height-model="ratio-band"][data-edge-mode="cover-x"]{
        overflow: visible;
      }

      .sec-edge-decor[data-edge-height-model="ratio-band"][data-edge-mode="cover-x"] .sec-edge-decor-img{
        position: absolute;
        left: 0;
        width: 100%;
        height: auto;
      }

      .sec-edge-decor[data-edge-height-model="ratio-band"][data-edge-mode="cover-x"].sec-edge-decor--top .sec-edge-decor-img{
        top: 0;
        bottom: auto;
        object-position: center top;
      }

      .sec-edge-decor[data-edge-height-model="ratio-band"][data-edge-mode="cover-x"].sec-edge-decor--bottom .sec-edge-decor-img{
        top: auto;
        bottom: 0;
        object-position: center bottom;
      }
    }

    @media (max-width: 767px){
      .sec-edge-decor{
        height: var(--edge-used-height, min(var(--edge-max-height-mobile, 150px), calc(var(--edge-section-h, 100%) * var(--edge-max-section-ratio-mobile, 0.24))));
      }

      .sec-edge-decor[data-edge-height-model="ratio-band"]{
        height: calc(var(--edge-section-h, 100%) * var(--edge-height-mobile-ratio, 0.2));
      }

      .sec-edge-decor--top{
        top: var(--edge-offset-mobile, 0px);
      }

      .sec-edge-decor--bottom{
        bottom: var(--edge-offset-mobile, 0px);
      }
    }

    .sec-bleed{
      position: absolute;
      inset: 0;
      z-index: 2;
      overflow: visible;
      pointer-events: none;
    }

    .sec-decor-layer{
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
    }

    .sec-decor-content{
      position: relative;
      z-index: 1;
      width: var(--content-w);
      height: 100%;
      margin: 0 auto;
      pointer-events: none;
    }

    .sec[data-modo="pantalla"] .sec-decor-content{
      width: var(--content-w-pantalla, var(--content-w));
    }

    .sec-decor-item{
      position: absolute;
      pointer-events: none;
      transform: translate3d(0, 0, 0);
      will-change: transform;
    }

    .sec-decor-item-inner{
      width: 100%;
      height: 100%;
      transform-origin: center center;
    }

    .sec-decor-item img{
      display: block;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
      user-select: none;
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

      .sec-decor-content{
        width: 100%;
        margin: 0;
        box-sizing: border-box;
        padding-left: var(--safe-left);
        padding-right: var(--safe-right);
      }
    }

    @media (prefers-reduced-motion: reduce){
      .sec-decor-item{
        transform: translate3d(0, 0, 0) !important;
      }
    }

    .objeto{
      position: absolute;
      transform-origin: top left;
      overflow: visible;
      pointer-events: auto;
    }

    .objeto.galeria.galeria--dynamic{
      display: block;
      height: calc(var(--gallery-scale, 1) * var(--gallery-height-desktop, 0) * 1px);
    }

    .objeto.galeria.galeria--dynamic .galeria-celda{
      position: absolute;
      left: calc(var(--gallery-scale, 1) * var(--cell-x-desktop, 0) * 1px);
      top: calc(var(--gallery-scale, 1) * var(--cell-y-desktop, 0) * 1px);
      width: calc(var(--gallery-scale, 1) * var(--cell-w-desktop, 0) * 1px);
      height: calc(var(--gallery-scale, 1) * var(--cell-h-desktop, 0) * 1px);
      overflow: hidden;
      border-radius: calc(var(--gallery-scale, 1) * var(--gallery-cell-radius, 0) * 1px);
      box-sizing: border-box;
    }

    .objeto.galeria.galeria--dynamic .galeria-celda img{
      width: 100%;
      height: 100%;
      display: block;
    }

    @media (max-width: 767px){
      .objeto.galeria.galeria--dynamic{
        height: calc(var(--gallery-scale, 1) * var(--gallery-height-mobile, var(--gallery-height-desktop, 0)) * 1px);
      }

      .objeto.galeria.galeria--dynamic .galeria-celda{
        left: calc(var(--gallery-scale, 1) * var(--cell-x-mobile, var(--cell-x-desktop, 0)) * 1px);
        top: calc(var(--gallery-scale, 1) * var(--cell-y-mobile, var(--cell-y-desktop, 0)) * 1px);
        width: calc(var(--gallery-scale, 1) * var(--cell-w-mobile, var(--cell-w-desktop, 0)) * 1px);
        height: calc(var(--gallery-scale, 1) * var(--cell-h-mobile, var(--cell-h-desktop, 0)) * 1px);
      }
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
    .objeto.is-functional-cta-unavailable{
      pointer-events: none;
      opacity: 0.74;
      filter: saturate(0.82);
      box-shadow: none !important;
      cursor: default !important;
    }

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
  ${previewMobileScrollRuntime}

  <script>
    (function(){
      function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
      function smoothstep01(t){ return t * t * (3 - 2 * t); }
      function detectEmbeddedContext(){
        try {
          return window.self !== window.top;
        } catch(_e) {
          return true;
        }
      }
      function isPreviewDocument(){
        var htmlPreview = "";
        var bodyPreview = "";
        try {
          htmlPreview = String(
            document && document.documentElement && document.documentElement.dataset
              ? document.documentElement.dataset.preview || ""
              : ""
          ).toLowerCase();
        } catch(_e1) {}
        try {
          bodyPreview = String(
            document && document.body && document.body.dataset
              ? document.body.dataset.preview || ""
              : ""
          ).toLowerCase();
        } catch(_e2) {}
        return (
          htmlPreview === "1" ||
          htmlPreview === "true" ||
          bodyPreview === "1" ||
          bodyPreview === "true"
        );
      }
      function readPreviewLayoutMode(){
        var htmlMode = "";
        var bodyMode = "";
        var windowMode = "";
        try {
          htmlMode = String(
            document && document.documentElement && document.documentElement.dataset
              ? document.documentElement.dataset.previewLayoutMode || ""
              : ""
          ).toLowerCase();
        } catch(_e1) {}
        try {
          bodyMode = String(
            document && document.body && document.body.dataset
              ? document.body.dataset.previewLayoutMode || ""
              : ""
          ).toLowerCase();
        } catch(_e2) {}
        try {
          windowMode = String(window.__previewLayoutMode || "").toLowerCase();
        } catch(_e3) {}
        return htmlMode || bodyMode || windowMode || "";
      }
      function shouldLimitVisualViewportScrollCompute(){
        if (isPreviewDocument() && readPreviewLayoutMode() === "parity") {
          return false;
        }
        return isPreviewDocument() || detectEmbeddedContext();
      }
      function updateVisualViewportSnapshot(){
        var vv = window.visualViewport;
        var nextWidth = Number(vv && vv.width) || 0;
        var nextHeight = Number(vv && vv.height) || 0;
        var changed =
          Math.abs(nextWidth - visualViewportSnapshot.width) > 0.5 ||
          Math.abs(nextHeight - visualViewportSnapshot.height) > 0.5;
        visualViewportSnapshot.width = nextWidth;
        visualViewportSnapshot.height = nextHeight;
        return changed;
      }

      function layoutSectionBackgroundImages(scheduleCompute){
        var nodes = Array.from(document.querySelectorAll(".sec-bg[data-bg-kind='image']"));
        nodes.forEach(function(bgNode){
          var imageNode = bgNode.querySelector(".sec-bg-image");
          if (!imageNode) return;

          var naturalWidth = Number(imageNode.naturalWidth || imageNode.width || 0);
          var naturalHeight = Number(imageNode.naturalHeight || imageNode.height || 0);
          if (!(naturalWidth > 0 && naturalHeight > 0)) {
            if (!imageNode.__bgLayoutBound) {
              imageNode.__bgLayoutBound = true;
              imageNode.addEventListener("load", function(){
                imageNode.__bgLayoutBound = false;
                scheduleCompute();
              }, { once: true });
            }
            return;
          }

          var containerWidth = Number(bgNode.clientWidth || bgNode.offsetWidth || 0);
          var containerHeight = Number(bgNode.clientHeight || bgNode.offsetHeight || 0);
          if (!(containerWidth > 0 && containerHeight > 0)) return;

          var coverScale = Math.max(
            containerWidth / naturalWidth,
            containerHeight / naturalHeight
          );
          var imageScale = Math.max(1, Number(bgNode.getAttribute("data-bg-scale")) || 1);
          var offsetX = Number(bgNode.getAttribute("data-bg-offset-x")) || 0;
          var offsetY = Number(bgNode.getAttribute("data-bg-offset-y")) || 0;
          var renderWidth = naturalWidth * coverScale * imageScale;
          var renderHeight = naturalHeight * coverScale * imageScale;
          var left = ((containerWidth - renderWidth) / 2) + offsetX;
          var top = ((containerHeight - renderHeight) / 2) + offsetY;

          imageNode.style.width = renderWidth + "px";
          imageNode.style.height = renderHeight + "px";
          imageNode.style.removeProperty("transform");
          imageNode.style.setProperty("--bg-image-left", left.toFixed(2) + "px");
          imageNode.style.setProperty("--bg-image-top", top.toFixed(2) + "px");
        });
      }

      function readCssNumber(node, propertyName, fallback){
        try {
          var parsed = parseFloat(getComputedStyle(node).getPropertyValue(propertyName));
          return isFinite(parsed) ? parsed : fallback;
        } catch(_e) {
          return fallback;
        }
      }

      function readPositiveDatasetNumber(node, name){
        var parsed = Number(node && node.dataset ? node.dataset[name] : 0);
        return (isFinite(parsed) && parsed > 0) ? parsed : 0;
      }

      function bindEdgeImageLoad(img, scheduleCompute){
        if (!img || img.__edgeLayoutBound || typeof scheduleCompute !== "function") return;
        var naturalWidth = Number(img.naturalWidth || 0);
        var naturalHeight = Number(img.naturalHeight || 0);
        if (naturalWidth > 0 && naturalHeight > 0) return;
        img.__edgeLayoutBound = true;
        var handleReady = function(){
          img.__edgeLayoutBound = false;
          scheduleCompute();
        };
        img.addEventListener("load", handleReady, { once: true });
        img.addEventListener("error", handleReady, { once: true });
      }

      function resolveEdgeAspectRatio(edgeNode, img, scheduleCompute){
        var intrinsicWidth = readPositiveDatasetNumber(edgeNode, "edgeIntrinsicWidth");
        var intrinsicHeight = readPositiveDatasetNumber(edgeNode, "edgeIntrinsicHeight");

        if (!(intrinsicWidth > 0 && intrinsicHeight > 0) && img) {
          intrinsicWidth = Number(img.naturalWidth || img.width || 0);
          intrinsicHeight = Number(img.naturalHeight || img.height || 0);
          bindEdgeImageLoad(img, scheduleCompute);
        }

        if (intrinsicWidth > 0 && intrinsicHeight > 0) {
          return intrinsicHeight / intrinsicWidth;
        }

        return 0.22;
      }

      function resolveEdgeSlotHeight(edgeNode, isMobile, viewportWidth, sectionHeightPx, scheduleCompute){
        var img = edgeNode.querySelector(".sec-edge-decor-img");
        var aspectRatio = resolveEdgeAspectRatio(edgeNode, img, scheduleCompute);
        var naturalHeight = Math.max(1, viewportWidth * aspectRatio);
        var minHeight = isMobile
          ? readCssNumber(edgeNode, "--edge-min-height-mobile", 64)
          : readCssNumber(edgeNode, "--edge-min-height-desktop", 96);
        var maxHeight = isMobile
          ? readCssNumber(edgeNode, "--edge-max-height-mobile", 150)
          : readCssNumber(edgeNode, "--edge-max-height-desktop", 280);
        var maxSectionRatio = isMobile
          ? readCssNumber(edgeNode, "--edge-max-section-ratio-mobile", 0.24)
          : readCssNumber(edgeNode, "--edge-max-section-ratio-desktop", 0.3);
        var slotMax = Math.max(1, Math.min(maxHeight, sectionHeightPx * maxSectionRatio));
        var usedHeight = Math.min(naturalHeight, slotMax);
        if (usedHeight < minHeight) {
          usedHeight = Math.min(minHeight, slotMax);
        }
        return Math.max(1, usedHeight);
      }

      function layoutSectionEdgeDecorations(sec, isMobile, viewportWidth, sectionHeightPx, scheduleCompute){
        var nodes = Array.from(sec.querySelectorAll(".sec-edge-decor"));
        if (!nodes.length) return;

        var layer = sec.querySelector(".sec-edge-layer");
        var resolved = [];

        nodes.forEach(function(edgeNode){
          var heightModel = String(edgeNode.getAttribute("data-edge-height-model") || "intrinsic-clamp");
          if (heightModel === "ratio-band") {
            edgeNode.style.removeProperty("--edge-used-height");
            return;
          }

          resolved.push({
            node: edgeNode,
            height: resolveEdgeSlotHeight(
              edgeNode,
              isMobile,
              viewportWidth,
              Math.max(1, sectionHeightPx),
              scheduleCompute
            ),
          });
        });

        if (!resolved.length) return;

        var combinedRatio = isMobile
          ? readCssNumber(layer || sec, "--edge-combined-ratio-mobile", 0.4)
          : readCssNumber(layer || sec, "--edge-combined-ratio-desktop", 0.58);
        var combinedMax = Math.max(1, sectionHeightPx * combinedRatio);
        var totalHeight = resolved.reduce(function(sum, item){
          return sum + item.height;
        }, 0);

        if (totalHeight > combinedMax) {
          var scale = combinedMax / totalHeight;
          resolved = resolved.map(function(item){
            return {
              node: item.node,
              height: Math.max(1, item.height * scale),
            };
          });
        }

        resolved.forEach(function(item){
          item.node.style.setProperty("--edge-used-height", item.height.toFixed(2) + "px");
        });
      }

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
          var edgezoom = 1;

          // ✅ Por defecto, tamaños escalan por ancho (comportamiento actual)
          var sfinal = sx;
          var pantallaYCompact = 0;
          var pantallaYBasePx = 0;
          var pantallaTextZoom = 1;
          var hbase = parseFloat(sec.style.getPropertyValue("--hbase")) || DESIGN_H;
          var edgeSectionHeightPx = sx * hbase;

          // limpiar custom width si no aplica
          sec.style.removeProperty("--content-w-pantalla");

          if (modo === "pantalla"){
            // vh-safe real en px
            var vhSafePx = Math.max(0, viewportH - safeTop - safeBottom);
            sec.style.setProperty("--vh-safe", vhSafePx + "px");
            edgeSectionHeightPx = vhSafePx;

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
          } else {
            edgeSectionHeightPx = sfinal * hbase;
          }

          sec.style.setProperty("--sfinal", String(sfinal));
          sec.style.setProperty("--zoom", String(zoom));
          sec.style.setProperty("--bgzoom", String(bgzoom));
          sec.style.setProperty("--edgezoom", String(edgezoom));
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
          layoutSectionEdgeDecorations(sec, isMobile, vw, edgeSectionHeightPx, scheduleCompute);
        });

        layoutSectionBackgroundImages(scheduleCompute);


      }

      var computeRafId = 0;
      var visualViewportSnapshot = { width: 0, height: 0 };
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
        updateVisualViewportSnapshot();
        window.visualViewport.addEventListener("resize", function(){
          updateVisualViewportSnapshot();
          scheduleCompute();
        });
        window.visualViewport.addEventListener("scroll", function(){
          if (!shouldLimitVisualViewportScrollCompute()) {
            scheduleCompute();
            return;
          }
          if (!updateVisualViewportSnapshot()) return;
          scheduleCompute();
        });
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
