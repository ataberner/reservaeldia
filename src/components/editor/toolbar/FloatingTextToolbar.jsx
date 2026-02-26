// src/components/editor/toolbar/FloatingTextToolbar.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FontSelector from "@/components/FontSelector";
import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";
import Konva from "konva";
import {
  createRsvpButtonGradientPatch,
  createRsvpButtonSolidPatch,
  resolveRsvpButtonVisual,
} from "@/domain/rsvp/buttonStyles";
import { parseLinearGradientColors } from "@/domain/colors/presets";

const FONT_SELECTOR_GAP = 12;
const FONT_SELECTOR_PADDING = 8;
const FONT_SELECTOR_FIXED_WIDTH = 300;
const FONT_SELECTOR_SIDEBAR_GAP = 4;
const MOBILE_FONT_STRIP_GAP = 6;
const MOBILE_FONT_WARM_COUNT = 12;
const CANVAS_WIDTH = 800;
const SECTION_CENTER_X = CANVAS_WIDTH / 2;
const SECTION_CENTER_EPSILON = 2;
const TOOLBAR_TOP_OFFSET = "calc(var(--dashboard-header-height, 52px) + 8px)";

const clamp = (value, min, max) => {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  return Math.min(Math.max(value, safeMin), Math.max(safeMin, safeMax));
};

const isBoldFontWeight = (weight) => {
  const normalized = String(weight || "normal").toLowerCase();
  return (
    normalized === "bold" ||
    normalized === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(normalized)
  );
};

const resolveKonvaFontStyle = (fontStyle, fontWeight) => {
  const style = String(fontStyle || "normal").toLowerCase();
  const isItalic = style.includes("italic") || style.includes("oblique");
  const isBold = style.includes("bold") || isBoldFontWeight(fontWeight);

  if (isBold && isItalic) return "bold italic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
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
  ALL_FONTS = [],
  tamaniosDisponibles = [],
  onCambiarAlineacion,
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [fontSelectorStyle, setFontSelectorStyle] = useState(null);
  const [mobileFontStripTop, setMobileFontStripTop] = useState(null);
  const toolbarRef = useRef(null);
  const botonFuenteRef = useRef(null);
  const latestFontChangeRef = useRef(0);
  const latestFontSizeChangeRef = useRef(0);
  const lastTypographyTargetsRef = useRef([]);

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
  const normalizarFontSizeEntero = (value, fallback = 24) =>
    Math.max(6, Math.round(normalizarFontSize(value, fallback)));

  const normalizarEscalaX = (value) => {
    const next = Number(value);
    return Number.isFinite(next) && Math.abs(next) > 0 ? next : 1;
  };

  const medirAnchoTexto = (obj, overrides = {}) => {
    if (!obj || obj.tipo !== "texto") return null;

    const options =
      typeof overrides === "string"
        ? { fontFamilyOverride: overrides }
        : (overrides || {});
    const { fontFamilyOverride, fontSizeOverride } = options;

    const fontSize = normalizarFontSize(fontSizeOverride ?? obj.fontSize, 24);
    const fontWeight = obj.fontWeight || "normal";
    const fontStyle = obj.fontStyle || "normal";
    const fontFamily = String(fontFamilyOverride || obj.fontFamily || "sans-serif");
    const baseLineHeight =
      Number.isFinite(obj.lineHeight) && obj.lineHeight > 0
        ? obj.lineHeight
        : 1.2;
    const rawText = String(obj.texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");

    try {
      const probe = new Konva.Text({
        text: safeText,
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle: resolveKonvaFontStyle(fontStyle, fontWeight),
        lineHeight: baseLineHeight * 0.92,
        padding: 0,
        wrap: "none",
      });
      const width = Number(probe.getTextWidth?.() || 0);
      probe.destroy();
      if (Number.isFinite(width) && width > 0) return width;
    } catch {
      // fallback a canvas
    }

    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const fontForCanvas = fontFamily.includes(",")
      ? fontFamily
      : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontForCanvas}`;
    const lines = safeText.split(/\r?\n/);
    const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 20);
    return Number.isFinite(maxLineWidth) ? maxLineWidth : null;
  };

  const obtenerCentroVisualXDesdeNodo = (id) => {
    if (typeof window === "undefined") return null;
    const refs = window._elementRefs || null;
    const node = refs?.[id];
    if (!node || typeof node.getClientRect !== "function") return null;

    try {
      const rect = node.getClientRect({
        skipTransform: false,
        skipShadow: true,
        skipStroke: true,
      });
      if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.width)) {
        return null;
      }
      return rect.x + rect.width / 2;
    } catch {
      return null;
    }
  };

  const obtenerCentroFallbackDesdeObjeto = (obj, fontFamilyOverride) => {
    if (!obj || obj.tipo !== "texto") return null;
    const width = medirAnchoTexto(obj, fontFamilyOverride);
    if (!Number.isFinite(width) || width <= 0) return null;

    const currentX = Number.isFinite(obj.x) ? obj.x : 0;
    const scaleX = normalizarEscalaX(obj.scaleX);
    return currentX + (width * scaleX) / 2;
  };

  const resolverCentroObjetivoCambioFuente = (obj) => {
    if (!obj || obj.tipo !== "texto") return null;

    const centerDesdeNodo = obtenerCentroVisualXDesdeNodo(obj.id);
    const centerFallback = obtenerCentroFallbackDesdeObjeto(obj, obj.fontFamily);
    const centerActual = Number.isFinite(centerDesdeNodo)
      ? centerDesdeNodo
      : centerFallback;

    if (!Number.isFinite(centerActual)) return null;

    // Si ya está centrado en la sección, anclamos al centro exacto de sección.
    if (Math.abs(centerActual - SECTION_CENTER_X) <= SECTION_CENTER_EPSILON) {
      return SECTION_CENTER_X;
    }

    return centerActual;
  };

  const debeMantenerCentroEnCambioDeFuente = (obj) =>
    obj?.tipo === "texto" &&
    !obj?.__groupAlign;
  const debeAjustarCentroPredictivo = (obj) =>
    obj?.tipo === "texto" &&
    !obj?.__groupAlign &&
    !Number.isFinite(obj?.width) &&
    obj?.__autoWidth !== false;
  const debeAnclarCentroTexto = (obj) =>
    obj?.tipo === "texto" &&
    !obj?.__groupAlign;

  const esObjetivoTipografia = (item) => {
    if (!item) return false;
    if (item.tipo === "texto") return true;
    if (item.tipo === "rsvp-boton") return true;
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

  const toolbarContainerClass = `fixed z-50 bg-white border rounded shadow p-2 flex ${
    isMobile
      ? "flex-nowrap items-center justify-start gap-1"
      : "gap-2 items-center"
  }`;

  const toolbarContainerStyle = {
    top: TOOLBAR_TOP_OFFSET,
    left: "50%",
    transform: "translateX(-50%)",
    width: isMobile ? "calc(100vw - 8px)" : "auto",
    maxWidth: isMobile ? "calc(100vw - 8px)" : "800px",
    overflowX: isMobile ? "auto" : "visible",
    overflowY: "hidden",
    WebkitOverflowScrolling: isMobile ? "touch" : "auto",
    whiteSpace: isMobile ? "nowrap" : "normal",
  };

  const esTexto = objetoSeleccionado?.tipo === "texto";
  const esRsvp = objetoSeleccionado?.tipo === "rsvp-boton";
  const esFormaConTexto =
    objetoSeleccionado?.tipo === "forma" &&
    objetoSeleccionado?.figura === "rect" &&
    typeof objetoSeleccionado?.texto === "string";
  const esRect = objetoSeleccionado?.figura === "rect" || esRsvp;
  const mostrarControlesTipografia = esTexto || esFormaConTexto || esRsvp;
  const mostrarControlesFondo = objetoSeleccionado?.tipo === "forma" || esRsvp;
  const colorFondoDefault = esRsvp ? "#773dbe" : "#ffffff";
  const colorTextoDefault = esRsvp ? "#ffffff" : "#000000";
  const rsvpVisualActual = esRsvp
    ? resolveRsvpButtonVisual(objetoSeleccionado || {})
    : null;
  const fondoPickerValue = esRsvp
    ? (
        rsvpVisualActual?.hasGradient
          ? `linear-gradient(135deg, ${rsvpVisualActual.gradientFrom} 0%, ${rsvpVisualActual.gradientTo} 100%)`
          : (rsvpVisualActual?.fillColor || colorFondoDefault)
      )
    : (objetoSeleccionado?.color || colorFondoDefault);
  const permiteGradienteFondo = esRsvp || objetoSeleccionado?.figura !== "line";
  const mobileFontStripVisible =
    isMobile && mostrarControlesTipografia && mostrarSelectorFuente;
  const mobileSizeStripVisible =
    isMobile && mostrarControlesTipografia && mostrarSelectorTamano;
  const mobileBottomStripVisible = mobileFontStripVisible || mobileSizeStripVisible;

  const fontSizeActual = normalizarFontSizeEntero(objetoSeleccionado?.fontSize, 24);
  const fontWeightActual = String(objetoSeleccionado?.fontWeight || "normal").toLowerCase();
  const fontStyleActual = String(objetoSeleccionado?.fontStyle || "normal").toLowerCase();
  const textDecorationActual = String(objetoSeleccionado?.textDecoration || "none").toLowerCase();

  const negritaActiva =
    fontWeightActual === "bold" ||
    fontWeightActual === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(fontWeightActual);
  const cursivaActiva = fontStyleActual.includes("italic") || fontStyleActual.includes("oblique");
  const subrayadoActivo = textDecorationActual.includes("underline");
  const fuentesDisponiblesMobile = useMemo(() => {
    if (!Array.isArray(ALL_FONTS)) return [];

    const seen = new Set();
    const normalized = [];
    for (const fuente of ALL_FONTS) {
      if (!fuente || typeof fuente !== "object") continue;
      const valor = typeof fuente.valor === "string" ? fuente.valor.trim() : "";
      if (!valor || seen.has(valor)) continue;
      seen.add(valor);
      normalized.push({
        valor,
        nombre:
          typeof fuente.nombre === "string" && fuente.nombre.trim()
            ? fuente.nombre.trim()
            : valor,
      });
    }
    return normalized;
  }, [ALL_FONTS]);

  const fuentesWarmupMobile = useMemo(() => {
    if (!mobileFontStripVisible) return [];

    const fuentes = [];
    const fuenteActual =
      typeof objetoSeleccionado?.fontFamily === "string"
        ? objetoSeleccionado.fontFamily.trim()
        : "";

    if (fuenteActual) {
      fuentes.push(fuenteActual);
    }

    for (const fuente of fuentesDisponiblesMobile) {
      const valor = typeof fuente?.valor === "string" ? fuente.valor.trim() : "";
      if (!valor || fuentes.includes(valor)) continue;
      fuentes.push(valor);
      if (fuentes.length >= MOBILE_FONT_WARM_COUNT) break;
    }

    return fuentes;
  }, [fuentesDisponiblesMobile, mobileFontStripVisible, objetoSeleccionado?.fontFamily]);

  useEffect(() => {
    const idsFromSelection = Array.isArray(elementosSeleccionados)
      ? elementosSeleccionados.filter((id) => id !== null && typeof id !== "undefined")
      : [];

    const nextIds = idsFromSelection.length
      ? idsFromSelection
      : (objetoSeleccionado?.id ? [objetoSeleccionado.id] : []);

    if (!nextIds.length) return;
    lastTypographyTargetsRef.current = nextIds;
  }, [elementosSeleccionados, objetoSeleccionado?.id]);

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

  useEffect(() => {
    if (!mobileBottomStripVisible) {
      setMobileFontStripTop(null);
      return;
    }

    const updatePosition = () => {
      const toolbarEl = toolbarRef.current;
      if (!toolbarEl) return;
      const rect = toolbarEl.getBoundingClientRect();
      if (!Number.isFinite(rect.bottom)) return;
      setMobileFontStripTop(Math.round(rect.bottom + MOBILE_FONT_STRIP_GAP));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mobileBottomStripVisible]);

  useEffect(() => {
    if (!fuentesWarmupMobile.length) return;
    void fontManager.loadFonts(fuentesWarmupMobile);
  }, [fontManager, fuentesWarmupMobile]);

  const aplicarTamanoFuenteSeleccionado = useCallback(
    (resolverTamano) => {
      const requestId = latestFontSizeChangeRef.current + 1;
      latestFontSizeChangeRef.current = requestId;

      const idsSeleccionados =
        Array.isArray(elementosSeleccionados) && elementosSeleccionados.length
          ? elementosSeleccionados
          : lastTypographyTargetsRef.current;
      const targetIds = new Set(
        (idsSeleccionados || []).filter(
          (id) => id !== null && typeof id !== "undefined"
        )
      );

      if (!targetIds.size && objetoSeleccionado?.id) {
        targetIds.add(objetoSeleccionado.id);
      }
      if (!targetIds.size) return;

      const getObjById =
        typeof window !== "undefined" && typeof window.__getObjById === "function"
          ? window.__getObjById
          : null;
      const centerTargetById = new Map();

      targetIds.forEach((id) => {
        const targetObj =
          getObjById?.(id) || (objetoSeleccionado?.id === id ? objetoSeleccionado : null);
        if (!targetObj) return;
        if (!debeAnclarCentroTexto(targetObj)) return;

        const centerObjetivo = resolverCentroObjetivoCambioFuente(targetObj);
        if (Number.isFinite(centerObjetivo)) {
          centerTargetById.set(id, centerObjetivo);
        }
      });

      const expectedFontSizeById = new Map();
      setObjetos((prev) =>
        prev.map((o) => {
          if (!targetIds.has(o.id)) return o;
          if (!esObjetivoTipografia(o)) return o;

          const currentSize = normalizarFontSizeEntero(o.fontSize, 24);
          const nextSizeRaw =
            typeof resolverTamano === "function"
              ? resolverTamano(o, currentSize)
              : resolverTamano;
          const nextSize = normalizarFontSizeEntero(nextSizeRaw, currentSize);
          if (!Number.isFinite(nextSize)) return o;
          if (Math.abs(nextSize - currentSize) <= 0) return o;

          expectedFontSizeById.set(o.id, nextSize);
          const patch = { fontSize: nextSize };

          if (debeAnclarCentroTexto(o)) {
            const centerObjetivo = centerTargetById.get(o.id);
            const debeAjustarPredictivo =
              !Number.isFinite(o.width) &&
              o.__autoWidth !== false;
            if (Number.isFinite(centerObjetivo) && debeAjustarPredictivo) {
              const nextWidth = medirAnchoTexto(o, { fontSizeOverride: nextSize });
              const scaleX = normalizarEscalaX(o.scaleX);
              if (Number.isFinite(nextWidth) && nextWidth > 0) {
                const currentX = Number.isFinite(o.x) ? o.x : 0;
                const nextX = centerObjetivo - (nextWidth * scaleX) / 2;
                if (Number.isFinite(nextX) && Math.abs(nextX - currentX) > 0.25) {
                  patch.x = nextX;
                }
              }
            }
          }

          return { ...o, ...patch };
        })
      );

      if (!centerTargetById.size) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (latestFontSizeChangeRef.current !== requestId) return;

          const deltaById = new Map();
          centerTargetById.forEach((centerObjetivo, id) => {
            if (!expectedFontSizeById.has(id)) return;
            const centerActual = obtenerCentroVisualXDesdeNodo(id);
            if (!Number.isFinite(centerActual)) return;

            const delta = centerObjetivo - centerActual;
            if (Number.isFinite(delta) && Math.abs(delta) > 0.25) {
              deltaById.set(id, delta);
            }
          });

          if (!deltaById.size) return;

          setObjetos((prev) =>
            prev.map((o) => {
              const delta = deltaById.get(o.id);
              if (!Number.isFinite(delta)) return o;
              if (!esObjetivoTipografia(o)) return o;

              const expectedSize = expectedFontSizeById.get(o.id);
              const currentSize = normalizarFontSizeEntero(o.fontSize, 24);
              if (Number.isFinite(expectedSize) && Math.abs(currentSize - expectedSize) > 0.01) {
                return o;
              }

              const currentX = Number.isFinite(o.x) ? o.x : 0;
              const nextX = currentX + delta;
              if (!Number.isFinite(nextX) || Math.abs(nextX - currentX) <= 0.25) {
                return o;
              }

              return { ...o, x: nextX };
            })
          );
        });
      });
    },
    [
      elementosSeleccionados,
      objetoSeleccionado?.id,
      objetoSeleccionado,
      setObjetos,
      esObjetivoTipografia,
      debeMantenerCentroEnCambioDeFuente,
      debeAnclarCentroTexto,
      resolverCentroObjetivoCambioFuente,
      medirAnchoTexto,
      normalizarEscalaX,
      obtenerCentroVisualXDesdeNodo,
      normalizarFontSizeEntero,
    ]
  );

  const aplicarFuenteSeleccionada = useCallback(
    (nuevaFuente) => {
      const fuenteObjetivo =
        typeof nuevaFuente === "string" ? nuevaFuente.trim() : "";
      if (!fuenteObjetivo) return;

      const requestId = latestFontChangeRef.current + 1;
      latestFontChangeRef.current = requestId;
      const idsSeleccionados =
        Array.isArray(elementosSeleccionados) && elementosSeleccionados.length
          ? elementosSeleccionados
          : lastTypographyTargetsRef.current;
      const targetIds = new Set(
        (idsSeleccionados || []).filter(
          (id) => id !== null && typeof id !== "undefined"
        )
      );
      if (!targetIds.size && objetoSeleccionado?.id) {
        targetIds.add(objetoSeleccionado.id);
      }
      if (!targetIds.size) return;

      const centerTargetById = new Map();
      const getObjById =
        typeof window !== "undefined" && typeof window.__getObjById === "function"
          ? window.__getObjById
          : null;

      targetIds.forEach((id) => {
        const targetObj =
          getObjById?.(id) || (objetoSeleccionado?.id === id ? objetoSeleccionado : null);
        if (!targetObj) return;
        if (!debeMantenerCentroEnCambioDeFuente(targetObj)) return;

        const centerObjetivo = resolverCentroObjetivoCambioFuente(targetObj);
        if (Number.isFinite(centerObjetivo)) {
          centerTargetById.set(id, centerObjetivo);
        }
      });

      const fuenteYaDisponible =
        typeof fontManager?.isFontAvailable === "function"
          ? fontManager.isFontAvailable(fuenteObjetivo)
          : false;

      const aplicarFuenteConCentro = () => {
        setObjetos((prev) =>
          prev.map((o) => {
            if (!targetIds.has(o.id)) return o;
            if (!esObjetivoTipografia(o)) return o;

            const patch = { fontFamily: fuenteObjetivo };

            if (debeAjustarCentroPredictivo(o)) {
              const centerObjetivo = centerTargetById.get(o.id);
              if (Number.isFinite(centerObjetivo)) {
                const nextWidth = medirAnchoTexto(o, fuenteObjetivo);
                const scaleX = normalizarEscalaX(o.scaleX);

                if (Number.isFinite(nextWidth) && nextWidth > 0) {
                  const currentX = Number.isFinite(o.x) ? o.x : 0;
                  const nextX = centerObjetivo - (nextWidth * scaleX) / 2;
                  if (Number.isFinite(nextX) && Math.abs(nextX - currentX) > 0.25) {
                    patch.x = nextX;
                  }
                }
              }
            }

            return { ...o, ...patch };
          })
        );
      };

      const aplicarCorreccionCentro = () => {
        if (!centerTargetById.size) return;

        const deltaById = new Map();
        centerTargetById.forEach((centerObjetivo, id) => {
          if (!Number.isFinite(centerObjetivo)) return;
          const centerActual = obtenerCentroVisualXDesdeNodo(id);
          if (!Number.isFinite(centerActual)) return;

          const delta = centerObjetivo - centerActual;
          if (Number.isFinite(delta) && Math.abs(delta) > 1) {
            deltaById.set(id, delta);
          }
        });

        if (!deltaById.size) return;

        setObjetos((prev) =>
          prev.map((o) => {
            const delta = deltaById.get(o.id);
            if (!Number.isFinite(delta)) return o;
            if (!esObjetivoTipografia(o)) return o;
            if (String(o.fontFamily || "").trim() !== fuenteObjetivo) return o;

            const currentX = Number.isFinite(o.x) ? o.x : 0;
            const nextX = currentX + delta;
            if (!Number.isFinite(nextX) || Math.abs(nextX - currentX) <= 1) {
              return o;
            }

            return { ...o, x: nextX };
          })
        );
      };

      const programarCorreccionCentro = () => {
        if (typeof window === "undefined") return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (latestFontChangeRef.current !== requestId) return;
            aplicarCorreccionCentro();
          });
        });
      };

      if (fuenteYaDisponible) {
        aplicarFuenteConCentro();
        return;
      }

      void Promise.resolve(fontManager.loadFonts([fuenteObjetivo]))
        .catch(() => null)
        .finally(() => {
          if (latestFontChangeRef.current !== requestId) return;
          aplicarFuenteConCentro();
          programarCorreccionCentro();
        });
    },
    [
      elementosSeleccionados,
      objetoSeleccionado?.id,
      objetoSeleccionado,
      fontManager,
      setObjetos,
      esObjetivoTipografia,
      debeMantenerCentroEnCambioDeFuente,
      debeAjustarCentroPredictivo,
      resolverCentroObjetivoCambioFuente,
      normalizarEscalaX,
      obtenerCentroVisualXDesdeNodo,
      medirAnchoTexto,
    ]
  );

  if (
    !(
      objetoSeleccionado?.tipo === "texto" ||
      objetoSeleccionado?.tipo === "forma" ||
      objetoSeleccionado?.tipo === "icono" ||
      objetoSeleccionado?.tipo === "rsvp-boton"
    )
  ) {
    return null;
  }

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  if (objetoSeleccionado?.tipo === "icono") {
    return createPortal(
      <div
        ref={toolbarRef}
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
      </div>,
      portalTarget
    );
  }

  return createPortal(
    <>
      <div ref={toolbarRef} className={toolbarContainerClass} style={toolbarContainerStyle}>
        {mostrarControlesFondo && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Fondo</label>
            <UnifiedColorPicker
              value={fondoPickerValue}
              showGradients={permiteGradienteFondo}
              title="Cambiar fondo"
              panelWidth={272}
              triggerClassName="h-6 w-6 rounded border border-gray-300"
              onChange={(nextColor) => {
                actualizarSeleccionados((o) => {
                  if (o.tipo === "rsvp-boton") {
                    const parsedGradient = parseLinearGradientColors(nextColor);
                    if (parsedGradient) {
                      return {
                        ...o,
                        ...createRsvpButtonGradientPatch(
                          parsedGradient.from,
                          parsedGradient.to,
                          String(o.colorTexto || colorTextoDefault)
                        ),
                      };
                    }

                    return {
                      ...o,
                      ...createRsvpButtonSolidPatch(
                        nextColor,
                        String(o.colorTexto || colorTextoDefault)
                      ),
                    };
                  }

                  return { ...o, color: nextColor };
                });
              }}
            />
          </div>
        )}

        {esRect && (
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
              className={`relative cursor-pointer rounded border transition-all truncate ${
                isMobile ? "px-2 py-1 text-[11px]" : "px-3 py-1 text-sm"
              } ${mostrarSelectorFuente ? "bg-gray-200" : "hover:bg-gray-100"}`}
              style={{
                fontFamily: objetoSeleccionado?.fontFamily || "sans-serif",
                width: isMobile ? "102px" : "180px",
                textAlign: "left",
              }}
              title={objetoSeleccionado?.fontFamily || "sans-serif"}
              onClick={() => {
                const nextOpen = !mostrarSelectorFuente;
                setMostrarSelectorFuente(nextOpen);
                if (nextOpen && isMobile) {
                  setMostrarSelectorTamano(false);
                }
              }}
            >
              {objetoSeleccionado?.fontFamily || "sans-serif"}
            </div>

            {!isMobile && (
              <FontSelector
                currentFont={objetoSeleccionado?.fontFamily || "sans-serif"}
                onFontChange={aplicarFuenteSeleccionada}
                isOpen={mostrarSelectorFuente}
                panelStyle={fontSelectorStyle}
                onClose={() => setMostrarSelectorFuente(false)}
              />
            )}

            {isMobile ? (
              <button
                type="button"
                className={`rounded border transition ${
                  isMobile ? "h-7 px-2 text-[11px]" : "px-2 py-1 text-sm"
                } ${mostrarSelectorTamano ? "bg-gray-200" : "hover:bg-gray-100"}`}
                onClick={() => {
                  const nextOpen = !mostrarSelectorTamano;
                  setMostrarSelectorTamano(nextOpen);
                  if (nextOpen) {
                    setMostrarSelectorFuente(false);
                  }
                }}
              >
                Tamano {fontSizeActual}
              </button>
            ) : (
              <div className="relative flex items-center bg-white border rounded-lg">
                <button
                  className={`hover:bg-gray-100 transition ${
                    isMobile ? "h-7 min-w-7 px-1.5 text-xs" : "px-2 py-1"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    aplicarTamanoFuenteSeleccionado((o, actual) => Math.max(6, actual - 2));
                  }}
                >
                  -
                </button>

                <div
                  className={`cursor-pointer transition-all ${
                    isMobile ? "h-7 px-1.5 text-[11px] flex items-center" : "px-2 py-1 text-sm"
                  } ${mostrarSelectorTamano ? "bg-gray-200" : "hover:bg-gray-100"}`}
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
                            const nextSize = normalizarFontSizeEntero(tam, 24);
                            aplicarTamanoFuenteSeleccionado(nextSize);
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
                  className={`hover:bg-gray-100 transition ${
                    isMobile ? "h-7 min-w-7 px-1.5 text-xs" : "px-2 py-1"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    aplicarTamanoFuenteSeleccionado((o, actual) => Math.min(260, actual + 2));
                  }}
                >
                  +
                </button>
              </div>
            )}

            <input
              type="color"
              value={objetoSeleccionado?.colorTexto || colorTextoDefault}
              onChange={(e) => {
                const nextColor = e.target.value;
                actualizarSeleccionados(
                  (o) => ({ ...o, colorTexto: nextColor }),
                  { soloTipografia: true }
                );
              }}
              className={isMobile ? "h-7 w-7 rounded border border-gray-300 p-0.5" : undefined}
            />

            <button
              className={`rounded border font-bold transition ${
                isMobile ? "h-7 min-w-7 px-1.5 text-[11px]" : "px-2 py-1 text-sm"
              } ${negritaActiva ? "bg-gray-200" : "hover:bg-gray-100"}`}
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
              className={`rounded border italic transition ${
                isMobile ? "h-7 min-w-7 px-1.5 text-[11px]" : "px-2 py-1 text-sm"
              } ${cursivaActiva ? "bg-gray-200" : "hover:bg-gray-100"}`}
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
              className={`rounded border transition ${
                isMobile ? "h-7 min-w-7 px-1.5 text-[11px]" : "px-2 py-1 text-sm"
              } ${subrayadoActivo ? "bg-gray-200 underline" : "hover:bg-gray-100"}`}
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
              className={`rounded border transition hover:bg-gray-100 flex items-center justify-center ${
                isMobile ? "h-7 min-w-7 px-1.5 text-[11px]" : "px-2 py-1 text-sm"
              }`}
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

      {mobileFontStripVisible && (
        <div
          className="popup-fuente fixed z-50 bg-white border rounded shadow px-1.5 py-1 flex items-center gap-1 overflow-x-auto"
          style={{
            top: `${mobileFontStripTop ?? 106}px`,
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100vw - 8px)",
            maxWidth: "calc(100vw - 8px)",
            WebkitOverflowScrolling: "touch",
            whiteSpace: "nowrap",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {fuentesDisponiblesMobile.map((fuente) => {
            const isActive = (objetoSeleccionado?.fontFamily || "sans-serif") === fuente.valor;
            return (
              <button
                key={fuente.valor}
                type="button"
                className={`h-7 px-2 rounded border text-[11px] leading-none shrink-0 ${
                  isActive
                    ? "bg-gray-200 border-gray-400 text-gray-900"
                    : "bg-white border-gray-300 text-gray-700"
                }`}
                style={{ fontFamily: fuente.valor }}
                title={fuente.valor}
                onClick={() => {
                  void aplicarFuenteSeleccionada(fuente.valor);
                }}
              >
                {fuente.nombre}
              </button>
            );
          })}
        </div>
      )}

      {mobileSizeStripVisible && (
        <div
          className="popup-fuente fixed z-50 bg-white border rounded shadow px-2 py-1.5 flex items-center gap-2"
          style={{
            top: `${mobileFontStripTop ?? 106}px`,
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100vw - 8px)",
            maxWidth: "calc(100vw - 8px)",
            WebkitOverflowScrolling: "touch",
            whiteSpace: "nowrap",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="h-7 min-w-7 px-1.5 text-xs rounded border hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              aplicarTamanoFuenteSeleccionado((o, actual) => Math.max(6, actual - 2));
            }}
          >
            -
          </button>

          <div className="h-7 min-w-10 px-2 text-xs rounded border bg-gray-100 flex items-center justify-center">
            {fontSizeActual}
          </div>

          <button
            type="button"
            className="h-7 min-w-7 px-1.5 text-xs rounded border hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              aplicarTamanoFuenteSeleccionado((o, actual) => Math.min(260, actual + 2));
            }}
          >
            +
          </button>

          <input
            type="range"
            min={6}
            max={260}
            step={1}
            value={fontSizeActual}
            className="flex-1 min-w-0 accent-gray-700"
            onChange={(e) => {
              const nextSize = normalizarFontSizeEntero(e.target.value, fontSizeActual);
              aplicarTamanoFuenteSeleccionado(nextSize);
            }}
          />
        </div>
      )}
    </>,
    portalTarget
  );
}
