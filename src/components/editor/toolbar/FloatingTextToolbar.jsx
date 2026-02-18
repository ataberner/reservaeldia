// src/components/editor/toolbar/FloatingTextToolbar.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import FontSelector from "@/components/FontSelector";

const FONT_SELECTOR_GAP = 12;
const FONT_SELECTOR_PADDING = 8;
const FONT_SELECTOR_FIXED_WIDTH = 300;
const FONT_SELECTOR_SIDEBAR_GAP = 4;

const clamp = (value, min, max) => {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  return Math.min(Math.max(value, safeMin), Math.max(safeMin, safeMax));
};

export default function FloatingTextToolbar({
  objetoSeleccionado,
  setObjetos,
  elementosSeleccionados,
  mostrarSelectorFuente,
  setMostrarSelectorFuente,
  mostrarSelectorTamano,
  setMostrarSelectorTamano,
  fontManager,
  tamaniosDisponibles = [],
  onCambiarAlineacion,
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [fontSelectorStyle, setFontSelectorStyle] = useState(null);
  const botonFuenteRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const normalizarFontSize = (value, fallback = 24) => {
    const next = Number(value);
    return Number.isFinite(next) && next > 0 ? next : fallback;
  };

  const medirAnchoTexto = (obj, fontFamilyOverride) => {
    if (!obj || obj.tipo !== "texto") return null;
    if (typeof document === "undefined") return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const fontSize = normalizarFontSize(obj.fontSize, 24);
    const fontStyle = obj.fontStyle || "normal";
    const fontWeight = obj.fontWeight || "normal";
    const fontFamily = String(fontFamilyOverride || obj.fontFamily || "sans-serif");
    const fontForCanvas = fontFamily.includes(",")
      ? fontFamily
      : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontForCanvas}`;

    const rawText = String(obj.texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");
    const lines = safeText.split(/\r?\n/);
    const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 20);

    return Number.isFinite(maxLineWidth) ? maxLineWidth : null;
  };

  const debeMantenerCentroEnCambioDeFuente = (obj) =>
    obj?.tipo === "texto" &&
    !obj?.__groupAlign &&
    !Number.isFinite(obj?.width) &&
    obj?.__autoWidth !== false;

  const esObjetivoTipografia = (item) => {
    if (!item) return false;
    if (item.tipo === "texto") return true;
    if (item.tipo === "forma" && item.figura === "rect" && typeof item.texto === "string") {
      return true;
    }
    return false;
  };

  const actualizarSeleccionados = (updater, { soloTipografia = false } = {}) => {
    setObjetos((prev) =>
      prev.map((o) => {
        if (!elementosSeleccionados.includes(o.id)) return o;
        if (soloTipografia && !esObjetivoTipografia(o)) return o;
        return updater(o);
      })
    );
  };

  const toolbarContainerClass =
    "fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center";

  const toolbarContainerStyle = {
    top: isMobile ? "calc(56px + env(safe-area-inset-top, 0px))" : "60px",
    left: "50%",
    transform: "translateX(-50%)",
    width: isMobile ? "calc(100vw - 16px)" : "auto",
    maxWidth: isMobile ? "calc(100vw - 16px)" : "800px",
    overflowX: isMobile ? "auto" : "visible",
    WebkitOverflowScrolling: isMobile ? "touch" : "auto",
    whiteSpace: isMobile ? "nowrap" : "normal",
  };

  const esTexto = objetoSeleccionado?.tipo === "texto";
  const esFormaConTexto =
    objetoSeleccionado?.tipo === "forma" &&
    objetoSeleccionado?.figura === "rect" &&
    typeof objetoSeleccionado?.texto === "string";
  const esRect = objetoSeleccionado?.figura === "rect";
  const mostrarControlesTipografia = esTexto || esFormaConTexto;

  const fontSizeActual = normalizarFontSize(objetoSeleccionado?.fontSize, 24);
  const fontWeightActual = String(objetoSeleccionado?.fontWeight || "normal").toLowerCase();
  const fontStyleActual = String(objetoSeleccionado?.fontStyle || "normal").toLowerCase();
  const textDecorationActual = String(objetoSeleccionado?.textDecoration || "none").toLowerCase();

  const negritaActiva =
    fontWeightActual === "bold" ||
    fontWeightActual === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(fontWeightActual);
  const cursivaActiva = fontStyleActual.includes("italic") || fontStyleActual.includes("oblique");
  const subrayadoActivo = textDecorationActual.includes("underline");

  const calcularEstiloSelectorFuente = useCallback(() => {
    if (typeof window === "undefined") return null;
    const botonFuente = botonFuenteRef.current;
    if (!botonFuente) return null;

    const viewportWidth = Math.max(320, window.innerWidth || 0);
    const viewportHeight = Math.max(320, window.innerHeight || 0);
    const triggerRect = botonFuente.getBoundingClientRect();
    const isDesktop = viewportWidth >= 768;
    if (!isDesktop) return null;

    const panelWidth = Math.min(
      FONT_SELECTOR_FIXED_WIDTH,
      viewportWidth - FONT_SELECTOR_PADDING * 2
    );
    const top = clamp(
      triggerRect.bottom + FONT_SELECTOR_GAP,
      FONT_SELECTOR_PADDING,
      viewportHeight - 160
    );

    const sidebar = document.querySelector("aside");
    const sidebarRect = sidebar?.getBoundingClientRect?.() || null;
    const sidebarPanel = document.getElementById("sidebar-panel");
    const sidebarPanelRect = sidebarPanel?.getBoundingClientRect?.() || null;

    let anchorRight = FONT_SELECTOR_PADDING;
    if (sidebarRect && sidebarRect.width > 0 && sidebarRect.height > 0) {
      anchorRight = sidebarRect.right;
    } else if (
      sidebarPanelRect &&
      sidebarPanelRect.width > 0 &&
      sidebarPanelRect.height > 0
    ) {
      anchorRight = sidebarPanelRect.right;
    }

    const maxLeft = viewportWidth - panelWidth - FONT_SELECTOR_PADDING;
    const left = clamp(
      anchorRight + FONT_SELECTOR_SIDEBAR_GAP,
      FONT_SELECTOR_PADDING,
      maxLeft
    );
    const availableHeight = viewportHeight - top - FONT_SELECTOR_PADDING;

    return {
      position: "fixed",
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(panelWidth)}px`,
      maxHeight: `${Math.round(Math.max(140, availableHeight))}px`,
      marginTop: "0px",
    };
  }, []);

  useEffect(() => {
    if (!mostrarSelectorFuente) {
      setFontSelectorStyle(null);
      return;
    }

    const updateStyle = () => {
      setFontSelectorStyle(calcularEstiloSelectorFuente());
    };

    updateStyle();
    window.addEventListener("resize", updateStyle);
    window.addEventListener("scroll", updateStyle, true);
    return () => {
      window.removeEventListener("resize", updateStyle);
      window.removeEventListener("scroll", updateStyle, true);
    };
  }, [mostrarSelectorFuente, calcularEstiloSelectorFuente]);

  if (!(objetoSeleccionado?.tipo === "texto" || objetoSeleccionado?.tipo === "forma" || objetoSeleccionado?.tipo === "icono")) {
    return null;
  }

  if (objetoSeleccionado?.tipo === "icono") {
    return (
      <div
        className={toolbarContainerClass}
        style={{ ...toolbarContainerStyle, maxWidth: isMobile ? toolbarContainerStyle.maxWidth : "220px" }}
      >
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Color</label>
          <input
            type="color"
            value={objetoSeleccionado.color || "#000000"}
            onChange={(e) => {
              const nuevoColor = e.target.value;
              actualizarSeleccionados((o) => ({ ...o, color: nuevoColor }));
            }}
            className="w-8 h-6 rounded cursor-pointer"
            title="Color del icono"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={toolbarContainerClass} style={toolbarContainerStyle}>
      {objetoSeleccionado?.tipo === "forma" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Fondo</label>
          <input
            type="color"
            value={objetoSeleccionado.color || "#ffffff"}
            onChange={(e) => {
              const nextColor = e.target.value;
              actualizarSeleccionados((o) => ({ ...o, color: nextColor }));
            }}
            className="w-8 h-6 rounded"
          />
        </div>
      )}

      {objetoSeleccionado?.tipo === "forma" && esRect && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Esquinas</label>
          <input
            type="range"
            min={0}
            max={100}
            value={objetoSeleccionado.cornerRadius || 0}
            onChange={(e) => {
              const nextRadius = parseInt(e.target.value, 10) || 0;
              actualizarSeleccionados((o) => ({ ...o, cornerRadius: nextRadius }));
            }}
          />
          <span className="text-xs text-gray-700">{objetoSeleccionado.cornerRadius || 0}</span>
        </div>
      )}

      {mostrarControlesTipografia && (
        <>
          <div
            ref={botonFuenteRef}
            className={`relative cursor-pointer px-3 py-1 rounded border text-sm transition-all truncate ${mostrarSelectorFuente ? "bg-gray-200" : "hover:bg-gray-100"}`}
            style={{
              fontFamily: objetoSeleccionado?.fontFamily || "sans-serif",
              width: "180px",
              textAlign: "left",
            }}
            title={objetoSeleccionado?.fontFamily || "sans-serif"}
            onClick={() => setMostrarSelectorFuente(!mostrarSelectorFuente)}
          >
            {objetoSeleccionado?.fontFamily || "sans-serif"}
          </div>

          <FontSelector
            currentFont={objetoSeleccionado?.fontFamily || "sans-serif"}
            onFontChange={async (nuevaFuente) => {
              await fontManager.loadFonts([nuevaFuente]);
              actualizarSeleccionados(
                (o) => {
                  const patch = { fontFamily: nuevaFuente };

                  if (!debeMantenerCentroEnCambioDeFuente(o)) {
                    return { ...o, ...patch };
                  }

                  const currentX = Number.isFinite(o.x) ? o.x : 0;
                  const previousWidth = medirAnchoTexto(o, o.fontFamily);
                  const nextWidth = medirAnchoTexto(o, nuevaFuente);

                  if (
                    Number.isFinite(previousWidth) &&
                    previousWidth > 0 &&
                    Number.isFinite(nextWidth) &&
                    nextWidth > 0
                  ) {
                    const centerX = currentX + (previousWidth / 2);
                    const nextX = centerX - (nextWidth / 2);
                    if (Number.isFinite(nextX) && Math.abs(nextX - currentX) > 0.01) {
                      patch.x = nextX;
                    }
                  }

                  return { ...o, ...patch };
                },
                { soloTipografia: true }
              );
            }}
            isOpen={mostrarSelectorFuente}
            panelStyle={fontSelectorStyle}
            onClose={() => setMostrarSelectorFuente(false)}
          />

          <div className="relative flex items-center bg-white border rounded-lg">
            <button
              className="px-2 py-1 hover:bg-gray-100 transition"
              onClick={(e) => {
                e.stopPropagation();
                actualizarSeleccionados(
                  (o) => {
                    const actual = normalizarFontSize(o.fontSize, 24);
                    return { ...o, fontSize: Math.max(6, actual - 2) };
                  },
                  { soloTipografia: true }
                );
              }}
            >
              -
            </button>

            <div
              className={`px-2 py-1 text-sm cursor-pointer transition-all ${mostrarSelectorTamano ? "bg-gray-200" : "hover:bg-gray-100"}`}
              onClick={() => setMostrarSelectorTamano(!mostrarSelectorTamano)}
            >
              {fontSizeActual}
              {mostrarSelectorTamano && (
                <div
                  className="absolute popup-fuente z-50 bg-white border rounded-2xl shadow-md p-2 w-24 max-h-[300px] overflow-auto"
                  style={{ top: "40px", left: "-10px" }}
                >
                  {tamaniosDisponibles.map((tam) => (
                    <div
                      key={tam}
                      className="px-2 py-1 text-sm hover:bg-gray-100 rounded cursor-pointer text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextSize = normalizarFontSize(tam, 24);
                        actualizarSeleccionados(
                          (o) => ({ ...o, fontSize: nextSize }),
                          { soloTipografia: true }
                        );
                        setMostrarSelectorTamano(false);
                      }}
                    >
                      {tam}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="px-2 py-1 hover:bg-gray-100 transition"
              onClick={(e) => {
                e.stopPropagation();
                actualizarSeleccionados(
                  (o) => {
                    const actual = normalizarFontSize(o.fontSize, 24);
                    return { ...o, fontSize: Math.min(120, actual + 2) };
                  },
                  { soloTipografia: true }
                );
              }}
            >
              +
            </button>
          </div>

          <input
            type="color"
            value={objetoSeleccionado?.colorTexto || "#000000"}
            onChange={(e) => {
              const nextColor = e.target.value;
              actualizarSeleccionados(
                (o) => ({ ...o, colorTexto: nextColor }),
                { soloTipografia: true }
              );
            }}
          />

          <button
            className={`px-2 py-1 rounded border text-sm font-bold transition ${negritaActiva ? "bg-gray-200" : "hover:bg-gray-100"}`}
            onClick={() =>
              actualizarSeleccionados(
                (o) => {
                  const currentWeight = String(o.fontWeight || "normal").toLowerCase();
                  const isBoldNow =
                    currentWeight === "bold" ||
                    currentWeight === "bolder" ||
                    ["500", "600", "700", "800", "900"].includes(currentWeight);
                  return { ...o, fontWeight: isBoldNow ? "normal" : "bold" };
                },
                { soloTipografia: true }
              )
            }
          >
            B
          </button>

          <button
            className={`px-2 py-1 rounded border text-sm italic transition ${cursivaActiva ? "bg-gray-200" : "hover:bg-gray-100"}`}
            onClick={() =>
              actualizarSeleccionados(
                (o) => {
                  const currentStyle = String(o.fontStyle || "normal").toLowerCase();
                  const isItalicNow =
                    currentStyle.includes("italic") || currentStyle.includes("oblique");
                  return { ...o, fontStyle: isItalicNow ? "normal" : "italic" };
                },
                { soloTipografia: true }
              )
            }
          >
            I
          </button>

          <button
            className={`px-2 py-1 rounded border text-sm transition ${subrayadoActivo ? "bg-gray-200 underline" : "hover:bg-gray-100"}`}
            onClick={() =>
              actualizarSeleccionados(
                (o) => {
                  const currentDecoration = String(o.textDecoration || "none")
                    .toLowerCase()
                    .trim();
                  const hasUnderline = currentDecoration.includes("underline");

                  if (hasUnderline) {
                    const withoutUnderline = currentDecoration
                      .split(/\s+/)
                      .filter((token) => token && token !== "underline")
                      .join(" ");
                    return { ...o, textDecoration: withoutUnderline || "none" };
                  }

                  const nextDecoration =
                    currentDecoration === "none" || currentDecoration === ""
                      ? "underline"
                      : `${currentDecoration} underline`;
                  return { ...o, textDecoration: nextDecoration.trim() };
                },
                { soloTipografia: true }
              )
            }
          >
            S
          </button>

          <button
            className="px-2 py-1 rounded border text-sm transition hover:bg-gray-100 flex items-center justify-center"
            onClick={onCambiarAlineacion}
            title={`Alineacion: ${objetoSeleccionado?.align || "izquierda"}`}
          >
            {(() => {
              const align = objetoSeleccionado?.align || "left";
              switch (align) {
                case "left":
                  return "<-";
                case "center":
                  return "<->";
                case "right":
                  return "->";
                case "justify":
                  return "||";
                default:
                  return "<-";
              }
            })()}
          </button>
        </>
      )}
    </div>
  );
}
