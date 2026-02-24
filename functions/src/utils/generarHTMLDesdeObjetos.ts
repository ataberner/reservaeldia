import { LINE_CONSTANTS } from "../models/lineConstants";

// ✅ Escapar strings para meterlos en atributos/HTML
function escHTML(str: any = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str: string = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getLinkProps(obj: any) {
  const raw = obj?.enlace;
  if (!raw) return null;

  if (typeof raw === "string") {
    const href = escapeAttr(raw);
    if (!href) return null;
    return { href, target: "_blank", rel: "noopener noreferrer" };
  }

  const href = escapeAttr(raw.href || "");
  if (!href) return null;

  const target = escapeAttr(raw.target || "_blank");
  const rel = escapeAttr(raw.rel || "noopener noreferrer");
  return { href, target, rel };
}

function envolverSiEnlace(htmlElemento: string, obj: any): string {
  if (obj?.tipo === "rsvp-boton") return htmlElemento;

  const link = getLinkProps(obj);
  if (!link) return htmlElemento;

  return `<a href="${link.href}" target="${link.target}" rel="${link.rel}" style="text-decoration:none;color:inherit;display:contents">${htmlElemento}</a>`;
}

export function escapeHTML(texto: string = ""): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generarHTMLDesdeObjetos(objetos: any[], _secciones: any[]): string {
  const altoModoPorSeccion = new Map(
    (_secciones || []).map((s: any) => [s.id, String(s.altoModo || "fijo").toLowerCase()])
  );

  function esSeccionPantalla(obj: any): boolean {
    const modo = altoModoPorSeccion.get(obj?.seccionId) || "fijo";
    return modo === "pantalla";
  }

  function isFullBleed(obj: any): boolean {
    return String(obj?.anclaje || "").toLowerCase() === "fullbleed";
  }

  /**
   * ✅ Escala uniforme del CONTENIDO:
   * - pantalla: var(--sfinal) (fit si hace falta)
   * - fijo: var(--sx)
   */
  function sContenidoVar(obj: any): string {
    return esSeccionPantalla(obj) ? "var(--sfinal)" : "var(--sx)";
  }

  /**
   * ✅ X scale:
   * - fullBleed: var(--bx) (NO fit)
   * - contenido: sContenidoVar (fit si pantalla)
   */
  function sX(obj: any): string {
    return isFullBleed(obj) ? "var(--bx)" : sContenidoVar(obj);
  }

  /**
   * ✅ Y scale:
   * - fullBleed: var(--sx) (NO fit)
   * - contenido: sContenidoVar (fit si pantalla)
   */
  function sY(obj: any): string {
    return isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);
  }

  function pxX(obj: any, px: number): string {
    const n = Number.isFinite(px) ? px : 0;
    return `calc(${sX(obj)} * ${n}px)`;
  }

  function pxY(obj: any, px: number): string {
    const n = Number.isFinite(px) ? px : 0;
    return `calc(${sY(obj)} * ${n}px)`;
  }

  // ===========================
  // ✅ PANTALLA: top por porcentaje
  // ===========================
  const ALTURA_EDITOR_PANTALLA = 500;

  // ✅ Offsets en secciones Pantalla: ON
  // ⚠️ IMPORTANTE: este archivo SOLO genera objetos.
  // El valor DESKTOP/MOBILE real se controla vía CSS global con:
  //   :root { --pantalla-y-offset: Xpx }
  //   @media (max-width: 640px) { :root { --pantalla-y-offset: Ypx } }
  //
  // Acá dejamos fallback (desktop) por si la variable CSS no existe.
  const PANTALLA_Y_OFFSET_DESKTOP_PX = -28;

  function clamp01(n: any): number | null {
    const x = Number(n);
    if (!Number.isFinite(x)) return null;
    return Math.max(0, Math.min(1, x));
  }

  function getYPxEditor(obj: any): number {
    // ✅ En Pantalla ON: yNorm es la fuente de verdad (0..1)
    const yn = clamp01(obj?.yNorm);
    if (yn != null) return yn * ALTURA_EDITOR_PANTALLA;

    // fallback: si no hay yNorm, usamos y como "editor px"
    const yPx = Number(obj?.y);
    if (Number.isFinite(yPx)) return yPx;

    return 0;
  }

  function topPantallaCSS(obj: any, ynRaw: any): string {
    const yn = clamp01(ynRaw) ?? 0;
    const ynCompactado = `calc(0.5 + ((${yn}) - 0.5) * (1 - var(--pantalla-y-compact, 0)))`;
    return `calc(
  (var(--vh-logical) * ${ynCompactado})
  + (${sContenidoVar(obj)} * var(--pantalla-y-offset, ${PANTALLA_Y_OFFSET_DESKTOP_PX}px))
)`;
  }

  /**
   * ✅ topCSS:
   * - Pantalla ON: usa var(--vh-logical) * yn
   * - Texto en Pantalla ON: suma offset (CSS var) escalado por sContenidoVar
   * - Fijo: pxY(obj, y)
   */
  function topCSS(obj: any): string {
    if (esSeccionPantalla(obj)) {
      const yPxEditor = getYPxEditor(obj);
      const yn = clamp01(yPxEditor / ALTURA_EDITOR_PANTALLA) ?? 0;
      return topPantallaCSS(obj, yn);
    }

    const y = Number(obj?.y || 0);
    return pxY(obj, y);
  }

  /**
   * ✅ Variante para cuando ya tenés yPx (en "px editor")
   */
  function topCSSFromYPx(obj: any, yPx: number): string {
    if (esSeccionPantalla(obj)) {
      const yn = clamp01(yPx / ALTURA_EDITOR_PANTALLA) ?? 0;
      return topPantallaCSS(obj, yn);
    }

    return pxY(obj, yPx);
  }

  function stylePosBase(obj: any): string {
    const x = Number(obj?.x || 0);

    const rot = obj?.rotation ?? 0;
    const scaleX = obj?.scaleX ?? 1;
    const scaleY = obj?.scaleY ?? 1;

    const zIndex = Number.isFinite(obj?.zIndex) ? obj.zIndex : undefined;

    return `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSS(obj)};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: top left;
${zIndex !== undefined ? `z-index:${zIndex};` : ""}
pointer-events: auto;
`.trim();
  }

  function styleSize(obj: any, w?: number, h?: number): string {
    const ww = Number.isFinite(w) ? (w as number) : undefined;
    const hh = Number.isFinite(h) ? (h as number) : undefined;

    const parts: string[] = [];
    if (ww !== undefined) parts.push(`width: ${pxX(obj, ww)};`);
    if (hh !== undefined) parts.push(`height: ${pxY(obj, hh)};`);
    return parts.join("\n");
  }

  function renderIconoSvgNuevoInline(obj: any) {
    const viewBox = obj.viewBox || "0 0 24 24";
    const color = obj.color || "#000";
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    if (!paths.length) return "";

    const w = Number.isFinite(obj?.width) ? obj.width : 24;
    const h = Number.isFinite(obj?.height) ? obj.height : 24;

    const rot = obj?.rotation ?? 0;
    const scaleX = obj?.scaleX ?? 1;
    const scaleY = obj?.scaleY ?? 1;

    const x = Number(obj?.x || 0);
    const yPx = getYPxEditor(obj);

    const pathsHtml = paths
      .map((p: any) => (p?.d ? `<path d="${escHTML(p.d)}" fill="${escHTML(color)}"></path>` : ""))
      .join("");

    const style = `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSSFromYPx(obj, yPx)};
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: top left;
pointer-events: auto;
`.trim();

    return `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="${escHTML(
      viewBox
    )}" style="${style}">${pathsHtml}</svg>`;
  }

  return objetos
    .map((obj) => {
      const tipo = obj?.tipo;

      // ---------------- TEXTO ----------------
      if (tipo === "texto") {
        const align = String(obj.align || obj.textAlign || "left").toLowerCase();
        const color = obj.colorTexto || obj.color || obj.fill || "#000";

        const baseLineHeight =
          typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
        const lineHeightFinal = baseLineHeight * 0.92;

        const safeTexto = escHTML(obj.texto || "");
        const baseStyle = stylePosBase(obj);

        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const fs = Number.isFinite(obj?.fontSize) ? obj.fontSize : 24;

        // ⚠️ texto fullBleed NO hace fit => escala con var(--sx)
        const sFont = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const rot = obj?.rotation ?? 0;
        const scaleX = obj?.scaleX ?? 1;
        const scaleY = obj?.scaleY ?? 1;

        const origin =
          align === "center" ? "top center" :
            (align === "right" ? "top right" : "top left");

        const style = `
${baseStyle}
/* ✅ mantener geometría estable y escalar tipografía por font-size (no por transform). */
transform-origin: ${origin};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
${w !== undefined ? `width: ${pxX(obj, w)};` : ""}
font-size: calc(${sFont} * ${fs}px * var(--text-zoom, 1));
font-family: ${obj.fontFamily || "sans-serif"};
font-weight: ${obj.fontWeight || "normal"};
font-style: ${obj.fontStyle || "normal"};
text-decoration: ${obj.textDecoration || "none"};
color: ${color};
text-align: ${align};
white-space: pre-wrap;
line-height: ${lineHeightFinal};
padding: 0;
margin: 0;
box-sizing: content-box;
${obj.stroke && obj.strokeWidth > 0
            ? `-webkit-text-stroke: ${obj.strokeWidth}px ${obj.stroke};`
            : ""
          }
${obj.shadowColor
            ? `text-shadow: ${obj.shadowOffsetX || 0}px ${obj.shadowOffsetY || 0}px ${obj.shadowBlur || 0}px ${obj.shadowColor};`
            : "text-shadow: none;"
          }
`.trim();

        return envolverSiEnlace(
          `<div class="objeto" data-debug-texto="1" style="${style}">${safeTexto}</div>`,
          obj
        );
      }


      // ---------------- IMAGEN ----------------
      if (tipo === "imagen") {
        const src = obj.src || obj.url || "";
        if (!src) return "";

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const h = Number.isFinite(obj?.height) ? obj.height : undefined;

        const style = `
${baseStyle}
${styleSize(obj, w, h)}
object-fit: contain;
display: block;
`.trim();

        return envolverSiEnlace(`<img class="objeto" src="${escapeAttr(src)}" style="${style}" />`, obj);
      }

      // ---------------- ICONO (nuevo) ----------------
      if (tipo === "icono") {
        if (obj.formato === "svg") {
          const svgHtml = renderIconoSvgNuevoInline(obj);
          if (!svgHtml) return "";
          return envolverSiEnlace(svgHtml, obj);
        }

        const src = obj.url || obj.src || "";
        if (!src) return "";

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const h = Number.isFinite(obj?.height) ? obj.height : undefined;

        const style = `
${baseStyle}
${styleSize(obj, w, h)}
object-fit: contain;
display: block;
`.trim();

        return envolverSiEnlace(`<img class="objeto" src="${escapeAttr(src)}" style="${style}" />`, obj);
      }

      // ---------------- ICONO LEGACY (icono-svg) ----------------
      if (tipo === "icono-svg" && obj.d) {
        const vb = obj.viewBox || "0 0 100 100";
        const fill = obj.color || "#000";

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : 100;
        const h = Number.isFinite(obj?.height) ? obj.height : 100;

        const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
fill: ${escapeAttr(fill)};
`.trim();

        const svg = `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(
          vb
        )}" style="${style}"><path d="${escHTML(obj.d)}" /></svg>`;

        return envolverSiEnlace(svg, obj);
      }

      // ---------------- COUNTDOWN ----------------
      if (tipo === "countdown") {
        const targetISO = obj.targetISO || obj.fechaObjetivo || obj.fechaISO || "";

        const textColor = obj.colorTexto ?? obj.color ?? "#111";
        const fontFamily = obj.fontFamily || "Inter, system-ui, sans-serif";

        const preset = obj.presetId || obj.layout || "pills";
        const isMinimal = String(preset).toLowerCase().includes("minimal");

        // ✅ ancho/alto del objeto (si existen)
        const wObj = Number.isFinite(obj?.width) ? Number(obj.width) : null;
        const hObj = Number.isFinite(obj?.height) ? Number(obj.height) : null;

        // ✅ gap: si viene de Konva, respetarlo
        const gap = Number.isFinite(obj.gap)
          ? Number(obj.gap)
          : Number.isFinite(obj.spacing)
            ? Number(obj.spacing)
            : 8;

        // ✅ Si tu Konva guarda chipWidth / paddingX, respetalos
        // chipWidth: ancho interno del texto (sin padding)
        const chipWidthProp = Number.isFinite(obj.chipWidth) ? Number(obj.chipWidth) : null;
        const paddingXProp = Number.isFinite(obj.paddingX) ? Number(obj.paddingX) : null;

        // ✅ Derivación raíz (cuando no hay props)
        const n = 4;

        // chipWTotal: ancho total de cada chip (incluye padding)
        let chipWTotal = 56; // fallback razonable
        if (wObj && wObj > 0) {
          chipWTotal = Math.max(40, (wObj - gap * (n - 1)) / n);
        }

        // paddingX derivado del chipWTotal (si no vino)
        const paddingX = paddingXProp ?? Math.max(6, Math.round(chipWTotal * 0.18)); // ~18%
        const paddingY = Math.max(5, Math.round(paddingX * 0.65));

        // chipWidth (texto) derivado si no vino
        const chipWidth = chipWidthProp ?? Math.max(10, Math.round(chipWTotal - paddingX * 2));

        // ✅ font sizes: si vienen, respetar; si no, derivar desde chipWTotal
        const valueSize =
          Number.isFinite(obj.fontSize) ? Number(obj.fontSize) : Math.max(14, Math.round(chipWTotal * 0.34));
        const labelSize =
          Number.isFinite(obj.labelSize) ? Number(obj.labelSize) : Math.max(9, Math.round(valueSize * 0.62));

        const labelColor = obj.labelColor ?? "#6b7280";
        const fontWeight = Number.isFinite(obj.fontWeight) ? obj.fontWeight : 700;
        const letterSpacing = Number.isFinite(obj.letterSpacing) ? obj.letterSpacing : 0;

        // ✅ estilos de chip
        const containerBgFinal = "transparent";
        const chipBgFinal = isMinimal ? "transparent" : obj.chipBackground ?? obj.boxBg ?? "rgba(255,255,255,.75)";
        const chipBorderColorFinal = isMinimal ? "transparent" : obj.chipBorder ?? obj.boxBorder ?? "rgba(0,0,0,.08)";

        const containerRadius = Number.isFinite(obj.boxRadius)
          ? obj.boxRadius
          : Number.isFinite(obj.radius)
            ? obj.radius
            : 10;

        const chipRadiusFinal = Number.isFinite(obj.chipRadius) ? obj.chipRadius : containerRadius;

        const baseStyle = stylePosBase(obj);

        // ✅ Escala correcta (respeta pantalla y bleed)
        const sChip = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const containerStyle = `
${baseStyle}
${wObj ? `width: ${pxX(obj, wObj)};` : ""}
${hObj ? `height: ${pxY(obj, hObj)};` : ""}
display: flex;
align-items: center;
justify-content: center;
gap: calc(${sChip} * ${gap}px);
font-family: ${fontFamily};
color: ${textColor};
background: ${containerBgFinal};
border-radius: calc(${sChip} * ${containerRadius}px);
letter-spacing: calc(${sChip} * ${letterSpacing}px);
`.trim();

        const chipStyle = `
width: calc(${sChip} * ${Math.round(chipWTotal)}px);
padding: calc(${sChip} * ${paddingY}px) calc(${sChip} * ${paddingX}px);
border: ${isMinimal ? "0" : `calc(${sChip} * 1px) solid ${chipBorderColorFinal}`};
border-radius: calc(${sChip} * ${chipRadiusFinal}px);
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
background: ${chipBgFinal};
box-sizing: border-box;
`.trim();

        const valueStyle = `
font-weight: ${fontWeight};
font-size: calc(${sChip} * ${valueSize}px);
line-height: 1;
`.trim();

        const labelStyle = `
font-size: calc(${sChip} * ${labelSize}px);
color: ${labelColor};
line-height: 1.05;
`.trim();

        const showLabels = obj.showLabels !== false;
        const labels = obj.labels ?? { dias: "Días", horas: "Horas", min: "Min", seg: "Seg" };

        return `
<div class="objeto"
  data-mobile-cluster="isolated"
  data-mobile-center="force"
  data-countdown
  data-target="${escapeAttr(targetISO)}"
  data-preset="${escapeAttr(
          preset
        )}" style="${containerStyle}">
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.dias)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.horas)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.min)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.seg)}</span>` : ""}
  </div>
</div>
`.trim();
      }


      // ---------------- GALERÍA ----------------
      if (tipo === "galeria") {
        const rows = Math.max(1, parseInt(obj.rows || 1, 10));
        const cols = Math.max(1, parseInt(obj.cols || 1, 10));
        const gapPx = Math.max(0, parseInt(obj.gap || 0, 10));
        const radiusPx = Math.max(0, parseInt(obj.radius || 0, 10));

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const h = Number.isFinite(obj?.height) ? obj.height : undefined;

        const sGrid = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const styleContenedor = `
${baseStyle}
${styleSize(obj, w, h)}
display: grid;
grid-template-columns: repeat(${cols}, 1fr);
grid-template-rows: repeat(${rows}, 1fr);
gap: calc(${sGrid} * ${gapPx}px);
box-sizing: border-box;
`.trim();

        const total = rows * cols;
        const cells = Array.from({ length: total }, (_, i) => {
          const c = (obj.cells && obj.cells[i]) || {};
          return {
            mediaUrl: c.mediaUrl || "",
            fit: c.fit === "contain" ? "contain" : "cover",
            bg: c.bg || "#f3f4f6",
          };
        });

        const htmlCeldas = cells
          .map((cell, idx) => {
            const safeSrc = escapeAttr(cell.mediaUrl || "");
            const celdaStyle = `
position: relative;
width: 100%;
height: 100%;
overflow: hidden;
border-radius: calc(${sGrid} * ${radiusPx}px);
background: ${cell.bg};
`.trim();

            if (!safeSrc) {
              return `<div class="galeria-celda" data-index="${idx}" style="${celdaStyle}"></div>`;
            }

            return `
<div class="galeria-celda galeria-celda--clickable"
     data-index="${idx}"
     data-gallery-image="1"
     role="button"
     tabindex="0"
     aria-label="Ver imagen en pantalla completa"
     style="${celdaStyle}">
  <img src="${safeSrc}" alt="" loading="lazy" decoding="async"
       style="width:100%;height:100%;object-fit:${cell.fit};display:block;" />
</div>
`.trim();
          })
          .join("");

        const htmlGaleria = `<div class="objeto galeria" style="${styleContenedor}">${htmlCeldas}</div>`;
        return envolverSiEnlace(htmlGaleria, obj);
      }

      // ---------------- RSVP BOTÓN ----------------
      if (tipo === "rsvp-boton") {
        const texto = escapeHTML(obj.texto || "Confirmar asistencia");
        const w = Number.isFinite(obj?.ancho) ? obj.ancho : 200;
        const h = Number.isFinite(obj?.alto) ? obj.alto : 50;

        const color = obj.color || "#773dbe";
        const colorTexto = obj.colorTexto || "#ffffff";
        const fontSize = Number.isFinite(obj?.fontSize) ? obj.fontSize : 18;
        const fontFamily = obj.fontFamily || "sans-serif";
        const fontWeight = obj.fontWeight || "bold";
        const fontStyle = obj.fontStyle || "normal";
        const textDecoration = obj.textDecoration || "none";
        const align = obj.align || "center";

        const baseStyle = stylePosBase(obj);

        // RSVP (contenido): si está en pantalla, fittea (sContenidoVar)
        const sBtn = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
background-color: ${color};
color: ${colorTexto};
font-size: calc(${sBtn} * ${fontSize}px);
font-family: ${fontFamily};
font-weight: ${fontWeight};
font-style: ${fontStyle};
text-decoration: ${textDecoration};
text-align: ${align};
display: flex;
align-items: center;
justify-content: center;
border-radius: calc(${sBtn} * 8px);
cursor: pointer;
`.trim();

        return `
<div class="objeto is-interactive rsvp-boton"
  id="abrirModalRSVP"
  data-accion="abrir-rsvp"
  data-rsvp-open
  role="button"
  tabindex="0"
  aria-label="Confirmar asistencia"
  style="${style}">
  ${texto}
</div>
`.trim();
      }

      // ---------------- FORMAS ----------------
      if (tipo === "forma") {
        const fill = obj.color || "#000";
        const figura = obj.figura;

        if (figura === "rect") {
          const w = Number.isFinite(obj?.width) ? obj.width : 100;
          const h = Number.isFinite(obj?.height) ? obj.height : 100;
          const cornerRadius = obj.cornerRadius || 0;

          const fontSize = obj.fontSize || 24;
          const fontFamily = obj.fontFamily || "sans-serif";
          const fontWeight = obj.fontWeight || "normal";
          const fontStyle = obj.fontStyle || "normal";
          const textDecoration = obj.textDecoration || "none";
          const align = obj.align || "center";
          const colorTexto = obj.colorTexto || "#000000";
          const texto = escHTML(obj.texto || "");

          const baseStyle = stylePosBase(obj);
          const sRectText = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

          const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
background: ${fill};
border-radius: calc(${sRectText} * ${cornerRadius}px);
display: flex;
align-items: center;
justify-content: ${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
            };
text-align: ${align};
padding: calc(${sRectText} * 4px);
box-sizing: border-box;
`.trim();

          const inner = `
<div style="
  width: 100%;
  font-size: calc(${sRectText} * ${fontSize}px);
  font-family: ${fontFamily};
  font-weight: ${fontWeight};
  font-style: ${fontStyle};
  text-decoration: ${textDecoration};
  color: ${colorTexto};
  line-height: 1.2;
  white-space: pre-wrap;
  word-break: break-word;
">${texto}</div>
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${style}">${inner}</div>`, obj);
        }

        if (figura === "circle") {
          const radius = Number.isFinite(obj?.radius) ? obj.radius : 50;
          const diameter = radius * 2;

          const x = Number(obj?.x || 0) - radius;
          const yPxCenter = getYPxEditor(obj);
          const yPxTopLeft = yPxCenter - radius;

          const rot = obj?.rotation ?? 0;
          const scaleX = obj?.scaleX ?? 1;
          const scaleY = obj?.scaleY ?? 1;

          const style = `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSSFromYPx(obj, yPxTopLeft)};
width: ${pxX(obj, diameter)};
height: ${pxY(obj, diameter)};
border-radius: 50%;
background: ${fill};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: center center;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${style}"></div>`, obj);
        }

        if (figura === "line") {
          const points = obj.points || [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0];
          const x1 = parseFloat(points[0]) || 0;
          const y1 = parseFloat(points[1]) || 0;
          const x2 = parseFloat(points[2]) || LINE_CONSTANTS.DEFAULT_LENGTH;
          const y2 = parseFloat(points[3]) || 0;

          const strokeWidth = obj.strokeWidth || LINE_CONSTANTS.STROKE_WIDTH;

          const deltaX = x2 - x1;
          const deltaY = y2 - y1;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

          const startX = Number(obj?.x || 0) + x1;

          const baseY = getYPxEditor(obj);
          const startY = baseY + y1;

          const totalRotation = angle + (obj.rotation || 0);
          const scaleX = obj?.scaleX ?? 1;
          const scaleY = obj?.scaleY ?? 1;

          // alto de línea: usamos escala Y del objeto (contenido: sfinal/sx, bleed: sx)
          const lineH = `calc(${sY(obj)} * ${strokeWidth}px)`;

          const style = `
position: absolute;
left: ${pxX(obj, startX)};
top: ${topCSSFromYPx(obj, startY)};
width: ${pxX(obj, length)};
height: ${lineH};
background: ${fill};
transform: rotate(${totalRotation}deg) scale(${scaleX}, ${scaleY});
transform-origin: 0 50%;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto linea" style="${style}"></div>`, obj);
        }

        if (figura === "triangle") {
          const radius = obj.radius || 60;

          const sin60 = Math.sqrt(3) / 2;
          const cos60 = 0.5;

          const triangleWidth = 2 * radius * sin60;
          const triangleHeight = radius * (1 + cos60);
          const centroidOffsetY = triangleHeight / 3;

          const baseY = getYPxEditor(obj);
          const topContainerPx = baseY - (triangleHeight - centroidOffsetY);
          const leftContainer = Number(obj?.x || 0) - triangleWidth / 2;

          const baseStyle = `
position: absolute;
left: ${pxX(obj, leftContainer)};
top: ${topCSSFromYPx(obj, topContainerPx)};
width: ${pxX(obj, triangleWidth)};
height: ${pxY(obj, triangleHeight)};
background: ${fill};
clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
transform: rotate(${obj.rotation ?? 0}deg) scale(${obj.scaleX ?? 1}, ${obj.scaleY ?? 1});
transform-origin: center center;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${baseStyle}"></div>`, obj);
        }

        return "";
      }

      return "";
    })
    .join("\n");
}
