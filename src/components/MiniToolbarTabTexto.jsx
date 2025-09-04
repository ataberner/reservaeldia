// components/MiniToolbarTabTexto.jsx
import React from "react";
import { TEXT_PRESETS } from "@/config/textPresets";

// === Helpers copiados tal cual del archivo original ===
function normalizeTextProps(el) {
  const fontSize = Number(el.fontSize ?? el.size ?? 24);
  const align = (el.align || el.textAlign || el.alignment || el.alineacion || "left").toLowerCase();
  const color = el.color ?? el.fill ?? el.colorTexto ?? el.textColor ?? "#000000";

  const lineHeight =
    typeof el.lineHeight === "number" && el.lineHeight > 0
      ? el.lineHeight
      : typeof el.lineHeightPx === "number" && fontSize > 0
        ? el.lineHeightPx / fontSize
        : 1.2;

  const width = el.width ?? undefined;

  return {
    fontSize,
    fontFamily: el.fontFamily ?? el.font ?? "sans-serif",
    fontWeight: el.fontWeight ?? el.weight ?? "normal",
    fontStyle: el.fontStyle ?? el.style ?? "normal",
    textDecoration: el.textDecoration ?? el.decoration ?? "none",
    lineHeight,
    align,
    color,
    fill: color,
    colorTexto: color,
    width,
  };
}

// 🔎 Obtiene una sección destino robusta, usando fallbacks del Canvas
function getSeccionDestino(explicitId) {
  if (explicitId) return explicitId;
  if (typeof window === "undefined") return null;
  return (
    window._seccionActivaId ||
    (window.canvasEditor && window.canvasEditor.seccionActivaId) ||
    window._lastSeccionActivaId ||
    (Array.isArray(window._seccionesOrdenadas) && window._seccionesOrdenadas[0]?.id) ||
    null
  );
}

// ——— Helpers para medir texto en el DOM (offscreen) ———
let __measureCtx = null;
function getMeasureCtx() {
  if (typeof document === "undefined") return null;
  if (__measureCtx) return __measureCtx;
  const c = document.createElement("canvas");
  __measureCtx = c.getContext("2d");
  return __measureCtx;
}
function buildFontString({ fontStyle = "normal", fontWeight = "normal", fontSize = 24, fontFamily = "sans-serif" }) {
  const style = (fontStyle && fontStyle !== "normal") ? `${fontStyle} ` : "";
  const weight = (fontWeight && fontWeight !== "normal") ? `${fontWeight} ` : "";
  return `${style}${weight}${Number(fontSize)}px ${fontFamily}`;
}
function measureTextWidth(texto, fontDesc) {
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = buildFontString(fontDesc);
  return Math.ceil(ctx.measureText(String(texto ?? "")).width);
}

// Inserta una combinación prediseñada de textos (misma lógica original)
function insertarPresetTexto(preset, seccionActivaId) {
  const seccionId = getSeccionDestino(seccionActivaId);
  if (!seccionId) {
    alert("⚠️ No hay secciones aún. Creá una sección para insertar el preset.");
    return;
  }
  const centerX = Number.isFinite(preset.centerX) ? preset.centerX : (preset.baseX ?? 300);
  const baseY = preset.baseY ?? 120;
  const gapY = preset.gapY ?? 6;

  const items = preset.elements || preset.items || preset.objetos || [];
  if (!items.length) return;

  let cursorY = baseY;

  items.forEach((raw, idx) => {
    const el = raw || {};
    const norm = normalizeTextProps(el);

    const hasY = (el.y != null) || (el.dy != null);
    const y = hasY ? (baseY + Number(el.y ?? 0) + Number(el.dy ?? 0)) : cursorY;

    const w = measureTextWidth(el.texto ?? "", {
      fontStyle: norm.fontStyle,
      fontWeight: norm.fontWeight,
      fontSize: norm.fontSize,
      fontFamily: norm.fontFamily,
    });

    let x;
    if (el.x != null) {
      x = (preset.baseX ?? 0) + Number(el.x);
    } else {
      const dx = Number(el.dx ?? 0);
      x = Math.round((centerX - (w / 2)) + dx);
    }

    const detail = {
      id: `${el.tipo || "texto"}-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: el.tipo || "texto",
      texto: el.texto ?? "",
      x, y,
      fontSize: norm.fontSize,
      fontFamily: norm.fontFamily,
      fontWeight: norm.fontWeight,
      fontStyle: norm.fontStyle,
      textDecoration: norm.textDecoration,
      lineHeight: norm.lineHeight,
      color: norm.color,
      colorTexto: norm.color,
      fill: norm.fill,
      align: "left",
      width: undefined,
      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      seccionId,
    };

    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail }));

    if (!hasY) {
      const lineH = (typeof norm.lineHeight === "number" && norm.lineHeight > 0) ? norm.lineHeight : 1.2;
      const h = Math.ceil(norm.fontSize * lineH);
      cursorY = y + h + (gapY ?? 6);
    }
  });
}

export default function MiniToolbarTabTexto({
  onAgregarTitulo,
  onAgregarSubtitulo,
  onAgregarParrafo,
  seccionActivaId,
}) {
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <button
        onClick={onAgregarTitulo}
        className="w-full px-4 py-2 rounded-lg border border-zinc-300 
         bg-white text-zinc-800 font-semibold text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Añadir título
      </button>

      <button
        onClick={onAgregarSubtitulo}
        className="w-full px-4 py-2 rounded-lg border border-zinc-300 
         bg-white text-zinc-700 font-medium text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Añadir subtítulo
      </button>

      <button
        onClick={onAgregarParrafo}
        className="w-full px-4 py-2 rounded-lg border border-zinc-300 
         bg-white text-zinc-600 text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Añadir párrafo
      </button>

      {/* PRESETS */}
      <div className="mt-4 flex-1 min-h-0">
        <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => insertarPresetTexto(preset, seccionActivaId)}
              className="w-full p-2 rounded-lg border border-zinc-200 hover:border-purple-400 hover:shadow-md transition bg-zinc-100 flex items-center justify-center"
            >
              <div
                className="flex flex-col items-center justify-center text-center"
                style={{
                  transform: "scale(0.8)",
                  transformOrigin: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {(preset.objetos || preset.elements || preset.items || []).map((obj, i) => {
                  const norm = normalizeTextProps(obj);
                  return (
                    <div
                      key={i}
                      style={{
                        fontFamily: norm.fontFamily,
                        fontSize: norm.fontSize,
                        color: norm.color,
                        fontWeight: norm.fontWeight,
                        fontStyle: norm.fontStyle,
                        textDecoration: norm.textDecoration,
                        lineHeight: norm.lineHeight,
                      }}
                    >
                      {obj.texto}
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
