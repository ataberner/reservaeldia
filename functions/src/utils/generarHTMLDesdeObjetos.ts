import { LINE_CONSTANTS } from '../models/lineConstants';
import { generarCountdownHTML } from "./generarCountdownHTML";
// ✅ Escapar strings para meterlos en atributos/HTML
function escHTML(str: any = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ✅ Medir el ancho de una caja de texto como lo hace tu canvas:
// - divide por \n
// - mide cada línea
// - toma la más larga
// - suma un margen (igual que tu +6px del canvas)
function medirAnchoTextoComoCanvas(obj: any): number | null {
  if (typeof document === "undefined") return null;

  const fontFamily = obj.fontFamily || "sans-serif";
  const fontSize = Number(obj.fontSize || 24);
  const fontWeight = obj.fontWeight || "normal";
  const fontStyle = obj.fontStyle || "normal";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.font = `${fontWeight} ${fontStyle} ${fontSize}px ${fontFamily}`;

  const lines = String(obj.texto || "").split(/\r?\n/);
  const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 20);

  // Igual que tu canvas: +6px
  return Math.ceil(maxLineWidth + 6);
}


// ✅ Render SVG nuevo (tipo:"icono", formato:"svg") a SVG inline
function renderIconoSvgNuevoInline(
  obj: any,
  style: string,
  left: number,
  top: number,
  width: string,
  height: string,
  rotacion: number,
  scaleX: number,
  scaleY: number
) {
  const viewBox = obj.viewBox || "0 0 24 24";
  const color = obj.color || "#000";
  const paths = Array.isArray(obj.paths) ? obj.paths : [];
  if (!paths.length) return "";

  const pathsHtml = paths
    .map((p: any) => (p?.d ? `<path d="${escHTML(p.d)}" fill="${escHTML(color)}"></path>` : ""))
    .join("");

  return `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="${escHTML(viewBox)}" style="
  top: ${top}%;
  left: ${left}%;
  width: ${width};
  height: ${height};
  transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
">
  ${pathsHtml}
</svg>`;
}



function escapeAttr(str: string = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Acepta obj.enlace como string o { href, target, rel }.
 * Devuelve { href, target, rel } saneados.
 */
function getLinkProps(obj: any) {
  const raw = obj?.enlace;
  if (!raw) return null;

  if (typeof raw === "string") {
    return {
      href: escapeAttr(raw),
      target: "_blank",
      rel: "noopener noreferrer",
    };
  }

  // objeto
  const href = escapeAttr(raw.href || "");
  if (!href) return null;

  const target = escapeAttr(raw.target || "_blank");
  // forzamos noopener por seguridad
  const rel = escapeAttr(raw.rel || "noopener noreferrer");

  return { href, target, rel };
}

/**
 * Envuelve el HTML del elemento en <a> si el objeto tiene enlace.
 * NO altera estilos/posicionamiento del hijo gracias a display:contents.
 */
function envolverSiEnlace(htmlElemento: string, obj: any): string {
  // no envolver el botón de RSVP para que no interfiera con el modal
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

export function generarHTMLDesdeObjetos(
  objetos: any[],
  secciones: { id: string; altura: number }[]
): string {

  const mapaAltura = Object.fromEntries(secciones.map(s => [s.id, s.altura]));

  return objetos.map((obj) => {
    const left = (obj.x / 800) * 100;
    const alturaSeccion = mapaAltura[obj.seccionId];
    const top = (obj.y / mapaAltura[obj.seccionId]) * 100;


    const width = obj.width ? `${(obj.width / 800) * 100}%` : "auto";
    const height = obj.height ? `${(obj.height / alturaSeccion) * 100}%` : "auto";
    const fontSize = obj.fontSize ? `${(obj.fontSize)}px` : "inherit";


    const rotacion = obj.rotation ?? 0;
    const scaleX = obj.scaleX ?? 1;
    const scaleY = obj.scaleY ?? 1;

    if (obj.tipo === "texto") {
      // 1) Align real (por compatibilidad con tu DB: align o textAlign)
      const align = String(obj.align || obj.textAlign || "left").toLowerCase();

      // 2) Color (misma prioridad que venís usando)
      const color = obj.colorTexto || obj.color || obj.fill || "#000";

      // 3) Line-height: en tu canvas aplicás un factor 0.92 (ElementoCanvas)
      //    Si no existe obj.lineHeight, usamos 1.2 (igual que tu default)
      const baseLineHeight =
        typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
      const lineHeightFinal = baseLineHeight * 0.92;

      // 4) Ancho real de la caja (pixel perfect con canvas)
      //    - si obj.width existe, lo usamos
      //    - si no, lo medimos como hace el canvas (por \n)
      const widthPxReal =
        typeof obj.width === "number" && isFinite(obj.width) && obj.width > 0
          ? obj.width
          : (medirAnchoTextoComoCanvas(obj) ?? null);

      // 5) Convertir width px -> % del ancho base 800 (igual que el resto del HTML)
      const widthStyle =
        widthPxReal != null ? `width: ${(widthPxReal / 800) * 100}%;` : "";

      // 6) Escapar texto y preservar saltos de línea
      const safeTexto = escHTML(obj.texto || "");

      // 7) Transform igual que el resto (rotación + escala)
      const rot = obj.rotation ?? 0;
      const sx = obj.scaleX ?? 1;
      const sy = obj.scaleY ?? 1;

      // 8) Estilo: usamos left/top en % (como imagen/icono/forma)
      const style = `
    position: absolute;
    left: ${left}%;
    top: ${top}%;
    ${widthStyle}
    font-size: ${obj.fontSize ?? 24}px;
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
    transform: rotate(${rot}deg) scale(${sx}, ${sy});
    transform-origin: top left;
    ${obj.stroke && obj.strokeWidth > 0 ? `-webkit-text-stroke: ${obj.strokeWidth}px ${obj.stroke};` : ""}
    ${obj.shadowColor ? `text-shadow: ${obj.shadowOffsetX || 0}px ${obj.shadowOffsetY || 0}px ${obj.shadowBlur || 0}px ${obj.shadowColor};` : "text-shadow: none;"}
  `;

      return envolverSiEnlace(`<div class="objeto" style="${style}">${safeTexto}</div>`, obj);
    }





    // ✅ IMAGEN (solo imagen)
    if (obj.tipo === "imagen") {
      const src = obj.src || obj.url || "";
      if (!src) return "";

      return envolverSiEnlace(
        `<img class="objeto" src="${escapeAttr(src)}" style="
  top: ${top}%;
  left: ${left}%;
  width: ${width};
  height: ${height};
  transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
  object-fit: contain;
" />`,
        obj
      );
    }

    // ✅ ICONO (nuevo)
    if (obj.tipo === "icono") {
      // 1) SVG nuevo: inline desde paths/viewBox
      if (obj.formato === "svg") {
        const svgHtml = renderIconoSvgNuevoInline(
          obj,
          "",
          left,
          top,
          width,
          height,
          rotacion,
          scaleX,
          scaleY
        );
        if (!svgHtml) return "";
        return envolverSiEnlace(svgHtml, obj);
      }

      // 2) Raster: usar url o src (🔥 tu bug actual era usar solo src)
      const src = obj.url || obj.src || "";
      if (!src) return "";

      return envolverSiEnlace(
        `<img class="objeto" src="${escapeAttr(src)}" style="
  top: ${top}%;
  left: ${left}%;
  width: ${width};
  height: ${height};
  transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
  object-fit: contain;
" />`,
        obj
      );
    }

    // ✅ ICONO LEGACY (icono-svg)
    if (obj.tipo === "icono-svg" && obj.d) {
      const vb = obj.viewBox || "0 0 100 100";
      const fill = obj.color || "#000";

      return envolverSiEnlace(
        `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(vb)}" style="
  top: ${top}%;
  left: ${left}%;
  width: ${width};
  height: ${height};
  transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
  fill: ${escapeAttr(fill)};
">
  <path d="${escHTML(obj.d)}" />
</svg>`,
        obj
      );
    }



    if (obj.tipo === "countdown") {
      // --- DATOS ---
      const targetISO =
        obj.targetISO || obj.fechaObjetivo || obj.fechaISO || "";

      const textColor = obj.colorTexto ?? obj.color ?? "#111";
      const fontFamily = obj.fontFamily || "Inter, system-ui, sans-serif";
      const valueSize = Number.isFinite(obj.fontSize) ? obj.fontSize : 16;
      const labelSize = Number.isFinite(obj.labelSize) ? obj.labelSize : 10;
      const labelColor = obj.labelColor ?? "#6b7280";
      const fontWeight = Number.isFinite(obj.fontWeight) ? obj.fontWeight : 700;
      const letterSpacing = Number.isFinite(obj.letterSpacing) ? obj.letterSpacing : 0;

      const preset = obj.presetId || obj.layout || "pills";
      const isMinimal = String(preset).toLowerCase().includes("minimal");

      const gap = (Number.isFinite(obj.gap) ? obj.gap :
        (Number.isFinite(obj.spacing) ? obj.spacing : 8));
      const padding = Number.isFinite(obj.padding) ? obj.padding : 0;

      // Fondo SOLO en chips, no en contenedor
      const containerBgFinal = "transparent";

      const chipBgFinal =
        (isMinimal ? "transparent" : (obj.chipBackground ?? obj.boxBg ?? "transparent"));

      const chipBorderColorFinal =
        (isMinimal ? "transparent" : (obj.chipBorder ?? obj.boxBorder ?? "transparent"));

      const containerRadius =
        (Number.isFinite(obj.boxRadius) ? obj.boxRadius :
          (Number.isFinite(obj.radius) ? obj.radius : 8));

      const chipRadiusFinal =
        (Number.isFinite(obj.chipRadius) ? obj.chipRadius : containerRadius);

      const zIndex = Number.isFinite(obj.zIndex) ? obj.zIndex : undefined;

      // --- STYLES CONTENEDOR (transparente) ---
      const containerStyle = `
    position: absolute;
    left: ${left}%;
    top: ${top}%;
    width: ${width};
    height: ${height};
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: top left;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${gap}px;
    padding: ${padding}px;
    font-family: ${fontFamily};
    color: ${textColor};
    background: ${containerBgFinal};
    border-radius: ${containerRadius}px;
    letter-spacing: ${letterSpacing}px;
    ${zIndex !== undefined ? `z-index:${zIndex};` : ""}
  `.trim();

      // --- STYLES CHIP (aquí va el color) ---
      const chipStyle = `
    min-width: 46px;
    padding: 6px 8px;
    border: ${isMinimal ? "0" : `1px solid ${chipBorderColorFinal}`};
    border-radius: ${chipRadiusFinal}px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: ${chipBgFinal};
  `.trim();

      const valueStyle = `
    font-weight: ${fontWeight};
    font-size: ${valueSize}px;
    line-height: 1;
  `.trim();

      const labelStyle = `
    font-size: ${labelSize}px;
    color: ${labelColor};
    line-height: 1;
  `.trim();

      const showLabels = obj.showLabels !== false;
      const labels = obj.labels ?? { dias: "Días", horas: "Horas", min: "Min", seg: "Seg" };

      return `
    <div
      data-countdown
      data-target="${escapeAttr(targetISO)}"
      data-preset="${escapeAttr(preset)}"
      style="${containerStyle}"
    >
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
  `;
    }





    // --- GALERÍA -----------------------------------------------------------
    if (obj.tipo === "galeria") {
      // 1) Lectura segura de props
      const rows = Math.max(1, parseInt(obj.rows || 1, 10));
      const cols = Math.max(1, parseInt(obj.cols || 1, 10));
      const gapPx = Math.max(0, parseInt(obj.gap || 0, 10));
      const radiusPx = Math.max(0, parseInt(obj.radius || 0, 10));
      const ratio = obj.ratio || "1:1";

      // 2) Posición/tamaño absolutos en % (como imagen/icono)
      //    Estos vienen calculados arriba: left, top, width, height, rotacion, scaleX, scaleY
      const styleContenedor = `
        position: absolute;
        left: ${left}%;
        top: ${top}%;
        width: ${width};
        height: ${height};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: top left;
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        grid-template-rows: repeat(${rows}, 1fr);
        gap: ${gapPx}px;
        box-sizing: border-box;
      `;

      // 3) Normalizar celdas al tamaño rows*cols
      const total = rows * cols;
      const cells = Array.from({ length: total }, (_, i) => {
        const c = (obj.cells && obj.cells[i]) || {};
        return {
          mediaUrl: c.mediaUrl || "",
          fit: c.fit === "contain" ? "contain" : "cover",
          bg: c.bg || "#f3f4f6",
        };
      });

      // 4) Construir HTML de celdas
      const htmlCeldas = cells.map((cell, idx) => {
        const safeSrc = escapeAttr(cell.mediaUrl || "");
        const celdaStyle = `
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: ${radiusPx}px;
          background: ${cell.bg};
        `;

        // si no hay imagen, devuelvo solo el fondo
        if (!safeSrc) {
          return `<div class="galeria-celda" data-index="${idx}" style="${celdaStyle}"></div>`;
        }

        // con imagen
        return `
          <div class="galeria-celda" data-index="${idx}" style="${celdaStyle}">
            <img
              src="${safeSrc}"
              alt=""
              loading="lazy"
              decoding="async"
              style="
                width: 100%;
                height: 100%;
                object-fit: ${cell.fit};
                display: block;
              "
            />
          </div>
        `;
      }).join("");

      // 5) Envolver en contenedor y (opcional) en <a> si obj.enlace existe
      const htmlGaleria = `<div class="objeto galeria" style="${styleContenedor}">${htmlCeldas}</div>`;
      return envolverSiEnlace(htmlGaleria, obj);
    }





    if (obj.tipo === "rsvp-boton") {
      const texto = escapeHTML(obj.texto || "Confirmar asistencia");
      const ancho = (obj.ancho || 200) / 800 * 100;
      const alto = (obj.alto || 50) / mapaAltura[obj.seccionId] * 100;
      const color = obj.color || "#773dbe";
      const colorTexto = obj.colorTexto || "#ffffff";
      const fontSize = obj.fontSize || 18;
      const fontFamily = obj.fontFamily || "sans-serif";
      const fontWeight = obj.fontWeight || "bold";
      const fontStyle = obj.fontStyle || "normal";
      const textDecoration = obj.textDecoration || "none";
      const align = obj.align || "center";

      return `<div class="rsvp-boton" id="abrirModalRSVP" data-accion="abrir-rsvp" data-rsvp-open role="button" tabindex="0" aria-label="Confirmar asistencia" style="
    position: absolute;
    left: ${left}%;
    top: ${top}%;
    width: ${ancho}%;
    height: ${alto}%;
    background-color: ${color};
    color: ${colorTexto};
    font-size: ${fontSize}px;
    font-family: ${fontFamily};
    font-weight: ${fontWeight};
    font-style: ${fontStyle};
    text-decoration: ${textDecoration};
    text-align: ${align};
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: top left;
  ">
    ${texto}
  </div>`;
    }


    if (obj.tipo === "forma") {
      const fill = obj.color || "#000";
      const figura = obj.figura;

      switch (figura) {
        case "rect": {
          const w = `${(obj.width ?? 100) / 800 * 100}%`;
          const h = `${(obj.height ?? 100) / alturaSeccion * 100}%`;
          const cornerRadius = obj.cornerRadius || 0;
          const fontSize = obj.fontSize || 24;
          const fontFamily = obj.fontFamily || "sans-serif";
          const fontWeight = obj.fontWeight || "normal";
          const fontStyle = obj.fontStyle || "normal";
          const textDecoration = obj.textDecoration || "none";
          const align = obj.align || "center";
          const colorTexto = obj.colorTexto || "#000000";
          const texto = (obj.texto || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

          return envolverSiEnlace(`<div class="objeto" style="
    top: ${top}%;
    left: ${left}%;
    width: ${w};
    height: ${h};
    background: ${fill};
    border-radius: ${cornerRadius}px;
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    display: flex;
    align-items: center;
    justify-content: ${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};
    text-align: ${align};
    padding: 4px;
    box-sizing: border-box;
  ">
    <div style="
      width: 100%;
      font-size: ${fontSize}px;
      font-family: ${fontFamily};
      font-weight: ${fontWeight};
      font-style: ${fontStyle};
      text-decoration: ${textDecoration};
      color: ${colorTexto};
      line-height: 1.2;
      white-space: pre-wrap;
      word-break: break-word;
    ">${texto}</div>
  </div>`, obj);
        }


        case "circle": {
          const radius = obj.radius ?? 50;
          const diameter = radius * 2;
          const topCircle = ((obj.y - radius) / alturaSeccion) * 100;
          const leftCircle = ((obj.x - radius) / 800) * 100;
          const widthPct = `${(diameter / 800) * 100}%`;
          const heightPct = `${(diameter / alturaSeccion) * 100}%`;

          return envolverSiEnlace(`<div class="objeto" style="
              top: ${topCircle}%;
              left: ${leftCircle}%;
              width: ${widthPct};
              height: ${heightPct};
              border-radius: 50%;
              background: ${fill};
              transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
              transform-origin: center center;
            ">
            </div>`, obj);
        }


        case "line": {
          // Obtener puntos de la línea (formato Konva: [x1, y1, x2, y2])
          const points = obj.points || [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0];
          const x1 = parseFloat(points[0]) || 0;
          const y1 = parseFloat(points[1]) || 0;
          const x2 = parseFloat(points[2]) || LINE_CONSTANTS.DEFAULT_LENGTH;
          const y2 = parseFloat(points[3]) || 0;

          // 🔥 OBTENER GROSOR DE LÍNEA
          const strokeWidth = obj.strokeWidth || LINE_CONSTANTS.STROKE_WIDTH;

          // Calcular dimensiones de la línea
          const deltaX = x2 - x1;
          const deltaY = y2 - y1;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

          // Posición absoluta del punto inicial
          const startX = obj.x + x1;
          const startY = obj.y + y1;

          // Convertir a porcentajes
          const leftPercent = (startX / 800) * 100;
          const topPercent = (startY / alturaSeccion) * 100;
          const widthPercent = (length / 800) * 100;

          // Aplicar rotación adicional del objeto si existe
          const totalRotation = angle + (obj.rotation || 0);

          return envolverSiEnlace(`<div class="objeto linea" style="
    position: absolute;
    top: ${topPercent}%;
    left: ${leftPercent}%;
    width: ${widthPercent}%;
    height: ${strokeWidth}px;
    background: ${fill};
    transform: rotate(${totalRotation}deg) scale(${scaleX}, ${scaleY});
    transform-origin: 0 50%;
  "></div>`, obj);
        }



        case "triangle": {
          const radius = obj.radius || 60;

          // 🎯 CÁLCULO PRECISO: En Konva RegularPolygon con sides=3
          // Los vértices están en ángulos: 270°, 30°, 150° (empezando desde arriba)
          // Vértice superior: (0, -radius)
          // Vértices inferiores: (-radius*sin(60°), radius*cos(60°)) y (radius*sin(60°), radius*cos(60°))

          const sin60 = Math.sqrt(3) / 2; // ≈ 0.866
          const cos60 = 0.5;

          // Dimensiones reales del triángulo
          const triangleWidth = 2 * radius * sin60; // Ancho total
          const triangleHeight = radius * (1 + cos60); // Altura total (desde vértice superior hasta base)

          // El centro del triángulo está a 1/3 de la altura desde la base
          const centroidOffsetY = triangleHeight / 3;

          // En Konva, obj.y es el centro del triángulo
          // En HTML, necesitamos la esquina superior izquierda del contenedor
          const topContainer = obj.y - (triangleHeight - centroidOffsetY); // Desde centro hasta top del contenedor
          const leftContainer = obj.x - (triangleWidth / 2); // Desde centro hasta left del contenedor

          // Convertir a porcentajes
          const topTriangle = (topContainer / alturaSeccion) * 100;
          const leftTriangle = (leftContainer / 800) * 100;
          const widthPct = `${(triangleWidth / 800) * 100}%`;
          const heightPct = `${(triangleHeight / alturaSeccion) * 100}%`;

          return envolverSiEnlace(`<div class="objeto" style="
    top: ${topTriangle}%;
    left: ${leftTriangle}%;
    width: ${widthPct};
    height: ${heightPct};
    background: ${fill};
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: center center;
  "></div>`, obj);
        }





        default:
          return "";
      }
    }

    return "";
  }).join("\n");
}
