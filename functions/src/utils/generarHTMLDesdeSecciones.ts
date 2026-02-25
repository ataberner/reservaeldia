import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";
import { CANVAS_BASE } from "../models/dimensionesBase";
import { generarModalRSVPHTML, type RSVPConfig as ModalConfig } from "./generarModalRSVP";
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

// ✅ Offsets SOLO para texto en secciones Pantalla: ON
// - Desktop: aplica cuando vw > 767px
// - Mobile: aplica cuando vw <= 767px
// (Estos valores se vuelcan a CSS variables en :root)
const PANTALLA_Y_OFFSET_DESKTOP_PX = -28;
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

  const fuentesUsadas = [
    ...new Set(
      objetos
        .filter((o) => (o.tipo === "texto" || o.tipo === "countdown") && o.fontFamily)
        .map((o) => o.fontFamily)
    ),
  ];

  const googleFontsLink = buildGoogleFontsLink(fuentesUsadas);

  const hayRSVPEnCanvas = objetos?.some((o) => o.tipo === "rsvp-boton");
  const botonRSVP = ""; // (si querés agregar un botón fijo fuera del canvas, hacelo acá)
  const modalRSVP = hayRSVPEnCanvas && rsvp?.enabled ? generarModalRSVPHTML(rsvp) : "";
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
  function pad(n){ n=Math.floor(Math.abs(n)); return n<10 ? "0"+n : ""+n; }
  function diffParts(target){
    const now = Date.now();
    let ms = Math.max(0, target.getTime() - now);
    const d = Math.floor(ms / 86400000); ms -= d*86400000;
    const h = Math.floor(ms / 3600000);  ms -= h*3600000;
    const m = Math.floor(ms / 60000);    ms -= m*60000;
    const s = Math.floor(ms / 1000);
    return { d, h, m, s };
  }
  function tickOne(root){
    const iso = root.getAttribute("data-target");
    if(!iso) return;
    const t = new Date(iso);
    if(isNaN(t.getTime())) return;
    const p = diffParts(t);
    const vals = root.querySelectorAll(".cd-val");
    if(vals && vals.length >= 4){
      vals[0].textContent = String(p.d).padStart(2,"0");
      vals[1].textContent = pad(p.h);
      vals[2].textContent = pad(p.m);
      vals[3].textContent = pad(p.s);
    }
  }
  function boot(){
    const roots = Array.from(document.querySelectorAll("[data-countdown]"));
    if(!roots.length) return;
    roots.forEach(tickOne);
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

  const seccionesOrdenadas = [...(secciones || [])].sort(
    (a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0)
  );


  const htmlSecciones = seccionesOrdenadas
    .map((seccion) => {
      const modo = String(seccion?.altoModo || "fijo").toLowerCase();
      const hbase = Number.isFinite(seccion?.altura) ? Number(seccion.altura) : 600;
      const fondoEsImagen = hasImageBackground(seccion);

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
<section class="sec" data-modo="${escapeAttr(modo)}" data-fondo="${fondoEsImagen ? "imagen" : "color"}" style="--hbase:${hbase}">
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
<html lang="es"${slug ? ` data-slug="${escapeAttr(slug)}"` : ""}>
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
      
        :root{ --text-zoom: 1; }
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

      /* ✅ Offset SOLO para texto en Pantalla: ON (desktop default) */
      --pantalla-y-offset: ${PANTALLA_Y_OFFSET_DESKTOP_PX}px;
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

    .objeto.is-interactive{ pointer-events: auto; }

    .cd-chip { backdrop-filter: saturate(1.1); }
  </style>
</head>

<body data-loader-ready="0" data-slug="${escapeAttr(slugPublica)}">
  ${invitationLoaderRuntime}
  <div class="inv">
    ${htmlSecciones}
  </div>

  ${botonRSVP}
  ${modalRSVP}
  ${modalGaleria}
  ${motionEffectsRuntime}

  ${scriptCountdown}

  <script>
    (function(){
      function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

      function compute(){
        var vw = document.documentElement.clientWidth;
        var BASE_W = 800; // = CANVAS_BASE.ANCHO

        // contentW (sin vw-32)
        var contentW = Math.min(BASE_W, vw);

        var sx = contentW / BASE_W;
        var bx = vw / BASE_W;

        document.documentElement.style.setProperty("--content-w", contentW + "px");
        document.documentElement.style.setProperty("--sx", String(sx));
        document.documentElement.style.setProperty("--bx", String(bx));

        var secs = Array.from(document.querySelectorAll(".sec"));
        var isMobile = vw <= 767;

        // viewport real (más estable en mobile)
        var vv = window.visualViewport;
        var viewportH = (vv && vv.height) ? vv.height : window.innerHeight;

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


        secs.forEach(function(sec){
          var modo = (sec.getAttribute("data-modo") || "fijo").toLowerCase();
          var fondoTipo = (sec.getAttribute("data-fondo") || "color").toLowerCase();

          // defaults
          var zoom = 1;
          var bgzoom = 1;

          // ✅ Por defecto, tamaños escalan por ancho (comportamiento actual)
          var sfinal = sx;
          var pantallaYCompact = 0;

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

              // ✅ Mobile pantalla: compacta distancia vertical para preservar la esencia
              // del diseño en dispositivos muy altos, manteniendo y=0.5 centrado.
              var vhLogicalPx = vhSafePx / Math.max(0.01, zoom || 1);
              var logicalAR = vhLogicalPx / Math.max(1, vw);
              var stretchRatio = (logicalAR / Math.max(0.01, designAR)) - 1;
              pantallaYCompact = clamp(stretchRatio * 0.12, 0, 0.45);
            }
          }

          sec.style.setProperty("--sfinal", String(sfinal));
          sec.style.setProperty("--zoom", String(zoom));
          sec.style.setProperty("--bgzoom", String(bgzoom));

          // ✅ Solo en mobile + pantalla: corregir el "vh" que después se escala con zoom
          if (isMobile && modo === "pantalla") {
            // --vh-logical = --vh-safe / --zoom
            sec.style.setProperty("--vh-logical", "calc(var(--vh-safe) / var(--zoom))");
          } else {
            // resto: se comporta como siempre
            sec.style.setProperty("--vh-logical", "var(--vh-safe)");
          }
          sec.style.setProperty("--pantalla-y-compact", String(pantallaYCompact));
        });


      }

      window.addEventListener("load", compute);
      window.addEventListener("resize", compute);

      if (window.visualViewport){
        window.visualViewport.addEventListener("resize", compute);
        window.visualViewport.addEventListener("scroll", compute);
      }

      window.addEventListener("orientationchange", function(){
        setTimeout(compute, 50);
        setTimeout(compute, 250);
      });

      compute();
    })();
  </script>

    


   ${scriptMobileSmart}
 
</body>
</html>
`;
}
