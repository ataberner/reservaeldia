// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
import { Stage, Line, Rect, Text, Image as KonvaImage, Group, Circle } from "react-konva";
import ElementoCanvas from "./ElementoCanvas";
import LineControls from "./LineControls";
import ReactDOMServer from "react-dom/server";
import { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } from "@/utils/layout";
import { crearSeccion } from "@/models/estructuraInicial";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { useImperativeObjects } from '@/hooks/useImperativeObjects';
import SelectionBounds from './SelectionBounds';
import HoverIndicator from './HoverIndicator';
import LineToolbar from "./LineToolbar";
import useImage from "use-image";
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';
import { fontManager } from '../utils/fontManager';
import useInlineEditor from "@/hooks/useInlineEditor";
import ShapeToolbar from './ShapeToolbar';
import useEditorHandlers from '@/hooks/useEditorHandlers';
import InlineTextEditor from "./InlineTextEditor";
import FontSelector from './FontSelector';
import { reemplazarFondoSeccion as reemplazarFondo } from "@/utils/accionesFondo";
import { desanclarImagenDeFondo as desanclarFondo } from "@/utils/accionesFondo";
import { borrarSeccion as borrarSeccionExternal } from "@/utils/editorSecciones";
import { moverSeccion as moverSeccionExternal } from "@/utils/editorSecciones";
import { validarPuntosLinea, detectarInterseccionLinea } from "./editor/selection/selectionUtils";
import { guardarSeccionComoPlantilla } from "@/utils/plantillas";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import FondoSeccion from './editor/FondoSeccion';
import MenuOpcionesElemento from "./MenuOpcionesElemento";
import { calcGalleryLayout } from "@/utils/calcGrid";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import useGuiasCentrado from '@/hooks/useGuiasCentrado';
import FloatingTextToolbar from "@/components/editor/toolbar/FloatingTextToolbar";
import SelectorColorSeccion from "./SelectorColorSeccion";
import Konva from "konva";
import { ALL_FONTS } from '../config/fonts';
import { useAuthClaims } from "@/hooks/useAuthClaims";
import {
  Check,
  RotateCcw,
  Copy,
  Trash2,
  Layers,
  ArrowDown,
  ArrowUp,
  MoveUp,
  MoveDown,
  PlusCircle,
  ClipboardPaste,
} from "lucide-react";
import useBorradorSync from "./editor/persistence/useBorradorSync";
import useSectionsManager from "./editor/sections/useSectionsManager";
import useEditorEvents from "./editor/events/useEditorEvents";
import useEditorWindowBridge from "./editor/window/useEditorWindowBridge";
import useHistoryManager from "./editor/history/useHistoryManager";
import useViewportScale from "@/hooks/useViewportScale";
import CanvasElementsLayer from "@/components/canvas/CanvasElementsLayer";
import DividersOverlayStage from "@/components/canvas/DividersOverlayStage";



Konva.dragDistance = 24;

const ALTURA_REFERENCIA_PANTALLA = 500;
const ALTURA_PANTALLA_EDITOR = 500;

function normalizarAltoModo(modo) {
  const m = String(modo || "fijo").toLowerCase();
  return (m === "pantalla") ? "pantalla" : "fijo";
}

// 🛠️ FUNCIÓN HELPER PARA LIMPIAR UNDEFINED
const limpiarObjetoUndefined = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(limpiarObjetoUndefined);
  }

  if (obj !== null && typeof obj === 'object') {
    const objLimpio = {};
    Object.keys(obj).forEach(key => {
      const valor = obj[key];
      if (valor !== undefined) {
        objLimpio[key] = limpiarObjetoUndefined(valor);
      }
    });
    return objLimpio;
  }

  return obj;
};

const iconoRotacion = ReactDOMServer.renderToStaticMarkup(<RotateCcw color="black" />);
const urlData = "data:image/svg+xml;base64," + btoa(iconoRotacion);


// Utils de cursor global (arriba del componente)
function setGlobalCursor(cursor = '', stageRef = null) {
  try {
    document.body.style.cursor = cursor || '';
    // 💡 limpiamos también el contenedor del Stage si existe
    const stage = stageRef?.current?.container?.() || null;
    if (stage) stage.style.cursor = cursor || '';
    // fallback: canvas principal
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.parentElement) canvas.parentElement.style.cursor = cursor || '';
  } catch { }
}

function clearGlobalCursor(stageRef = null) {
  setGlobalCursor('', stageRef);
}

function isInlineDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_DEBUG !== false;
}

function formatInlineLogPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

function inlineDebugLog(event, payload = {}) {
  if (!isInlineDebugEnabled()) return;
  const essentialEvents = new Set([
    "start-inline-edit",
    "linebreak-model-sync",
    "linebreak-transformer",
  ]);
  if (!essentialEvents.has(event)) return;
  const ts = new Date().toISOString();
  const body = formatInlineLogPayload(payload);
  console.log(`[INLINE][${ts}] ${event}\n${body}`);
}

function nextInlineFrameMeta() {
  if (typeof window === "undefined") {
    return { frame: null, perfMs: null };
  }
  const prev = Number(window.__INLINE_FRAME_SEQ || 0);
  const next = prev + 1;
  window.__INLINE_FRAME_SEQ = next;
  const perfMs =
    typeof window.performance?.now === "function"
      ? Number(window.performance.now().toFixed(3))
      : null;
  return { frame: next, perfMs };
}

function getInlineLineStats(value) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  const trailing = normalized.match(/\n+$/)?.[0];
  return {
    normalized,
    length: normalized.length,
    lineCount: normalized === "" ? 1 : normalized.split("\n").length,
    trailingNewlines: trailing ? trailing.length : 0,
  };
}

function normalizeInlineDebugAB(rawConfig) {
  const raw = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  const visibilitySource =
    raw.visibilitySource === "window" ? "window" : "reactive";

  const finishMode =
    raw.finishMode === "immediate" ||
    raw.finishMode === "raf" ||
    raw.finishMode === "timeout100"
      ? raw.finishMode
      : "raf";

  const overlayWidthMode =
    raw.overlayWidthMode === "fit-content" ? "fit-content" : "measured";

  return {
    visibilitySource,
    finishMode,
    overlayWidthMode,
  };
}


export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange, userId }) {
  const [objetos, setObjetos] = useState([]);
  const [celdaGaleriaActiva, setCeldaGaleriaActiva] = useState(null);
  const [secciones, setSecciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
  const [elementosSeleccionados, setElementosSeleccionados] = useState([]);
  const [cargado, setCargado] = useState(false);
  const stageRef = useRef(null);
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);
  const imperativeObjects = useImperativeObjects();
  const [animandoSeccion, setAnimandoSeccion] = useState(null);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [seleccionActiva, setSeleccionActiva] = useState(false);
  const [inicioSeleccion, setInicioSeleccion] = useState(null);
  const [areaSeleccion, setAreaSeleccion] = useState(null);
  const [elementosPreSeleccionados, setElementosPreSeleccionados] = useState([]);
  const guiaLayerRef = useRef(null);
  const [hoverId, setHoverId] = useState(null);
  const altoCanvas = secciones.reduce((acc, s) => acc + s.altura, 0) || 800;
  const [seccionesAnimando, setSeccionesAnimando] = useState([]);
  const { refrescar: refrescarPlantillasDeSeccion } = usePlantillasDeSeccion();
  const [elementoCopiado, setElementoCopiado] = useState(null);
  const elementRefs = useRef({});
  const inlineEditPreviewRef = useRef({ id: null, centerX: null });
  const inlineCommitDebugRef = useRef({ id: null });
  const prevEditingIdRef = useRef(null);
  const inlineRenderValueRef = useRef({ id: null, value: "" });
  const [inlineOverlayMountedId, setInlineOverlayMountedId] = useState(null);
  const contenedorRef = useRef(null);
  const ignoreNextUpdateRef = useRef(0);
  const [anchoStage, setAnchoStage] = useState(800);
  const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
  const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
  const fuentesDisponibles = ALL_FONTS;
  const { esAdmin, loadingClaims } = useAuthClaims();
  const [isDragging, setIsDragging] = useState(false);




  useBorradorSync({
    slug,
    userId,

    objetos,
    secciones,
    cargado,

    setObjetos,
    setSecciones,
    setCargado,
    setSeccionActivaId,

    ignoreNextUpdateRef,
    stageRef,

    normalizarAltoModo,
    validarPuntosLinea,

    ALTURA_PANTALLA_EDITOR,
  });
  const {
    controlandoAltura,
    iniciarControlAltura,
    finalizarControlAltura,
    togglePantallaCompletaSeccion,
    handleCrearSeccion,
  } = useSectionsManager({
    slug,
    secciones,
    setSecciones,
    objetos,
    setObjetos,
    seccionActivaId,
    setSeccionActivaId,

    crearSeccion,
    normalizarAltoModo,
    limpiarObjetoUndefined,

    ALTURA_REFERENCIA_PANTALLA,

    stageRef,
    setGlobalCursor,
    clearGlobalCursor,
  });
  const nuevoTextoRef = useRef(null);
  useEditorEvents({
    celdaGaleriaActiva,
    setCeldaGaleriaActiva,
    setObjetos,

    secciones,
    seccionActivaId,

    setElementosSeleccionados,

    normalizarAltoModo,
    ALTURA_PANTALLA_EDITOR,

    nuevoTextoRef,
  });

  const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);

  const {
    editing,      // { id, value }
    startEdit,    // (id, initial)
    updateEdit,   // (nuevoValor)
    finishEdit    // () => void
  } = useInlineEditor();

  const obtenerMetricasNodoInline = useCallback((node) => {
    if (!node) return null;
    try {
      const className = node.getClassName?.() || null;
      const x = typeof node.x === "function" ? node.x() : null;
      const y = typeof node.y === "function" ? node.y() : null;
      const textWidth =
        className === "Text" && typeof node.getTextWidth === "function"
          ? Math.ceil(node.getTextWidth() || 0)
          : null;
      const rect =
        typeof node.getClientRect === "function"
          ? node.getClientRect({
              skipTransform: false,
              skipShadow: true,
              skipStroke: true,
            })
          : null;
      return {
        className,
        x,
        y,
        textWidth,
        rect: rect
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }
          : null,
      };
    } catch (error) {
      return { error: String(error) };
    }
  }, []);

  const cerrarMenusFlotantes = useCallback(() => {
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
    setMostrarSelectorFuente(false);
    setMostrarSelectorTamaño(false);
    setHoverId(null);
  }, []);


  const touchGestureRef = useRef({
    startX: 0,
    startY: 0,
    moved: false,
    // guardamos el id de sección tocada (si aplica)
    tappedSectionId: null,
    clickedOnStage: false,
  });

  const TOUCH_MOVE_PX = 10;




  // 🆕 Elemento actualmente seleccionado (o null)
  const objetoSeleccionado =
    elementosSeleccionados.length === 1
      ? objetos.find(o => o.id === elementosSeleccionados[0])
      : null;

  const [mostrarSelectorTamaño, setMostrarSelectorTamaño] = useState(false);
  const tamaniosDisponibles = Array.from({ length: (120 - 6) / 2 + 1 }, (_, i) => 6 + i * 2);
  const [icono] = useImage(urlData);
  const botonOpcionesRef = useRef(null);

  const _refEventQueued = useRef(new Set());

  const registerRef = useCallback((id, node) => {
    if (!node) {
      delete elementRefs.current[id];
      imperativeObjects.registerObject(id, null);
      return;
    }

    elementRefs.current[id] = node;
    imperativeObjects.registerObject(id, node);

    // ✅ Debounce por frame para evitar ráfagas de re-attach del Transformer
    if (_refEventQueued.current.has(id)) return;
    _refEventQueued.current.add(id);

    requestAnimationFrame(() => {
      _refEventQueued.current.delete(id);
      try {
        window.dispatchEvent(
          new CustomEvent("element-ref-registrado", { detail: { id } })
        );
      } catch { }
    });
  }, [imperativeObjects]);





  const [fontsReady, setFontsReady] = useState(false);


  const {
    isMobile,
    isMobilePortrait,
    scale,
    anchoContenedor,
    escalaActiva,
    escalaVisual,
    wrapperBaseWidth,
    escalaFitMobilePortrait,
  } = useViewportScale({
    contenedorRef,
    zoom,

    // respeta tu lógica actual
    baseDesktop: 800,
    baseMobilePortrait: 1000,

    wrapperBaseWidthZoom1: 1000,
    wrapperBaseWidthZoom08: 1220,

    fitBoost: 1.2,
    zoomVisualBoost: 1.15,

    // logs (ponelo en true solo cuando estés debuggeando)
    debug: false,
  });

  const inlineDebugAB = useMemo(() => {
    if (typeof window === "undefined") {
      return normalizeInlineDebugAB(null);
    }
    return normalizeInlineDebugAB(window.__INLINE_AB);
  }, [editing.id, editing.value]);

  const handleInlineOverlayMountChange = useCallback((id, mounted) => {
    const safeId = id || null;
    if (!safeId) return;

    setInlineOverlayMountedId((previous) => {
      const next = mounted ? safeId : (previous === safeId ? null : previous);
      inlineDebugLog("overlay-mounted-state", {
        id: safeId,
        mounted,
        previousOverlayMountedId: previous,
        nextOverlayMountedId: next,
      });
      return next;
    });
  }, []);

  const captureInlineSnapshot = useCallback((eventName, extra = {}) => {
    if (typeof window === "undefined") return;
    if (!isInlineDebugEnabled()) return;
    if (window.__INLINE_SNAPSHOT !== true) return;

    const snapshotAllowlist = new Set([
      "enter: pre-start",
      "enter: after-start-sync",
      "finish: blur",
      "finish: after-finishEdit",
      "exit: immediate",
    ]);
    if (!snapshotAllowlist.has(eventName)) return;

    const frameMeta = nextInlineFrameMeta();
    const snapshotId =
      extra.id ||
      editing.id ||
      inlineCommitDebugRef.current?.id ||
      prevEditingIdRef.current ||
      null;

    const node = snapshotId ? elementRefs.current[snapshotId] : null;
    const nodeMetrics = obtenerMetricasNodoInline(node);
    const objMetrics = snapshotId
      ? (() => {
          const obj = objetos.find((o) => o.id === snapshotId);
          if (!obj) return null;
          return {
            id: obj.id,
            tipo: obj.tipo || null,
            x: Number.isFinite(obj.x) ? obj.x : null,
            y: Number.isFinite(obj.y) ? obj.y : null,
            textoLength: String(obj.texto ?? "").length,
            fontSize: Number.isFinite(obj.fontSize) ? obj.fontSize : null,
            lineHeight:
              Number.isFinite(obj.lineHeight) && obj.lineHeight > 0
                ? obj.lineHeight
                : null,
          };
        })()
      : null;

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    let stageRect = null;
    try {
      const r = stage?.container?.()?.getBoundingClientRect?.();
      if (r) {
        stageRect = {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      }
    } catch {
      stageRect = null;
    }

    let inlineRect = null;
    let inlineStyle = null;
    let inlineContentRect = null;
    let inlineContentMetrics = null;
    if (snapshotId) {
      const safeId = String(snapshotId).replace(/"/g, '\\"');
      const overlayEl = document.querySelector(`[data-inline-editor-id="${safeId}"]`);
      if (overlayEl) {
        const r = overlayEl.getBoundingClientRect();
        inlineRect = {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
        inlineStyle = {
          left: overlayEl.style.left,
          top: overlayEl.style.top,
          minWidth: overlayEl.style.minWidth,
          maxWidth: overlayEl.style.maxWidth,
          width: overlayEl.style.width,
        };

        const contentEl = overlayEl.querySelector('[contenteditable="true"]');
        const contentRect = contentEl?.getBoundingClientRect?.();
        if (contentRect) {
          inlineContentRect = {
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: contentRect.height,
          };
        }
        inlineContentMetrics = contentEl
          ? {
              scrollWidth: contentEl.scrollWidth,
              clientWidth: contentEl.clientWidth,
              isFocused: document.activeElement === contentEl,
            }
          : null;
      }
    }

    let transformerRect = null;
    try {
      const transformer = stage?.findOne?.("Transformer");
      if (transformer) {
        const trRect = transformer.getClientRect({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
        const nodes = transformer.nodes?.() || [];
        transformerRect = trRect
          ? {
              x: trRect.x,
              y: trRect.y,
              width: trRect.width,
              height: trRect.height,
              nodesCount: nodes.length,
              includesSnapshotNode: !!(node && nodes.includes(node)),
            }
          : null;
      }
    } catch {
      transformerRect = null;
    }

    inlineDebugLog(`snapshot-${eventName}`, {
      ...frameMeta,
      ...extra,
      id: snapshotId,
      eventName,
      editingId: editing.id ?? null,
      currentEditingId: window._currentEditingId ?? null,
      overlayMountedId: inlineOverlayMountedId ?? null,
      inlineAB: inlineDebugAB,
      escalaVisual,
      stageRect,
      nodeMetrics,
      objMetrics,
      transformerRect,
      inlineRect,
      inlineStyle,
      inlineContentRect,
      inlineContentMetrics,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    });
  }, [editing.id, escalaVisual, inlineDebugAB, inlineOverlayMountedId, objetos, obtenerMetricasNodoInline]);

  useEffect(() => {
    const currentId = editing.id || null;
    const currentValue = String(editing.value ?? "");
    const prev = inlineRenderValueRef.current;

    if (currentId && prev.id === currentId && prev.value !== currentValue) {
      const prevStats = getInlineLineStats(prev.value);
      const nextStats = getInlineLineStats(currentValue);
      const linebreakChanged =
        prevStats.lineCount !== nextStats.lineCount ||
        prevStats.trailingNewlines !== nextStats.trailingNewlines;

      if (linebreakChanged) {
        const frameMeta = nextInlineFrameMeta();
        const node = elementRefs.current[currentId] || null;
        const nodeMetrics = obtenerMetricasNodoInline(node);

        const stage = stageRef.current?.getStage?.() || stageRef.current || null;
        let transformerRect = null;
        try {
          const transformer = stage?.findOne?.("Transformer");
          if (transformer) {
            const trRect = transformer.getClientRect({
              skipTransform: false,
              skipShadow: true,
              skipStroke: true,
            });
            const nodes = transformer.nodes?.() || [];
            transformerRect = trRect
              ? {
                  x: trRect.x,
                  y: trRect.y,
                  width: trRect.width,
                  height: trRect.height,
                  nodesCount: nodes.length,
                  includesEditingNode: !!(node && nodes.includes(node)),
                }
              : null;
          }
        } catch {
          transformerRect = null;
        }

        let overlayRect = null;
        let contentRect = null;
        const safeId = String(currentId).replace(/"/g, '\\"');
        const overlayEl = document.querySelector(`[data-inline-editor-id="${safeId}"]`);
        if (overlayEl) {
          const r = overlayEl.getBoundingClientRect();
          overlayRect = {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
          const contentEl = overlayEl.querySelector('[contenteditable="true"]');
          const cr = contentEl?.getBoundingClientRect?.();
          if (cr) {
            contentRect = {
              x: cr.x,
              y: cr.y,
              width: cr.width,
              height: cr.height,
            };
          }
        }

        inlineDebugLog("linebreak-transformer", {
          ...frameMeta,
          id: currentId,
          prevLength: prevStats.length,
          nextLength: nextStats.length,
          prevLineCount: prevStats.lineCount,
          nextLineCount: nextStats.lineCount,
          prevTrailingNewlines: prevStats.trailingNewlines,
          nextTrailingNewlines: nextStats.trailingNewlines,
          overlayMountedId: inlineOverlayMountedId ?? null,
          overlayRect,
          contentRect,
          nodeMetrics,
          transformerRect,
        });
      }

      captureInlineSnapshot("input: after-render", {
        id: currentId,
        previousLength: prev.value.length,
        valueLength: currentValue.length,
      });
    }

    inlineRenderValueRef.current = {
      id: currentId,
      value: currentValue,
    };
  }, [
    editing.id,
    editing.value,
    captureInlineSnapshot,
    inlineOverlayMountedId,
    obtenerMetricasNodoInline,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__INLINE_DEBUG === undefined) {
      window.__INLINE_DEBUG = true;
    }
    if (window.__INLINE_FRAME_SEQ === undefined) {
      window.__INLINE_FRAME_SEQ = 0;
    }
    const normalizedAB = normalizeInlineDebugAB(window.__INLINE_AB);
    window.__INLINE_AB = { ...normalizedAB };
    inlineDebugLog("debug-enabled", {
      enabled: window.__INLINE_DEBUG,
      inlineAB: window.__INLINE_AB,
      frameSeq: window.__INLINE_FRAME_SEQ,
    });
  }, []);

  useEffect(() => {
    const currentId = editing.id || null;
    const previousId = prevEditingIdRef.current;

    if (currentId && currentId !== previousId) {
      requestAnimationFrame(() => {
        captureInlineSnapshot("enter: raf1", { id: currentId, previousId });
        requestAnimationFrame(() => {
          captureInlineSnapshot("enter: raf2", { id: currentId, previousId });
        });
      });
    }

    if (!currentId && previousId) {
      captureInlineSnapshot("exit: immediate", { id: previousId });
      requestAnimationFrame(() => {
        captureInlineSnapshot("exit: raf1", { id: previousId });
        requestAnimationFrame(() => {
          captureInlineSnapshot("exit: raf2", { id: previousId });
        });
      });
    }

    prevEditingIdRef.current = currentId;
  }, [editing.id, captureInlineSnapshot]);

  const fuentesNecesarias = useMemo(() => {
    // fuentes usadas en textos + countdown (si aplica) + formas con texto (rect)
    const fonts = (objetos || [])
      .filter(o => (o.tipo === "texto" || o.tipo === "countdown" || (o.tipo === "forma" && o.figura === "rect")) && o.fontFamily)
      .map(o => String(o.fontFamily).replace(/['"]/g, "").split(",")[0].trim())
      .filter(Boolean);

    return [...new Set(fonts)];
  }, [objetos]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    window.editing = editing;
  }, [editing.id, editing.value]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousCurrentEditingId = window._currentEditingId ?? null;
    window._currentEditingId = editing?.id || null;

    inlineDebugLog("sync-global-editing", {
      editingId: editing?.id || null,
      valueLength: String(editing?.value ?? "").length,
      previousCurrentEditingId,
      nextCurrentEditingId: window._currentEditingId,
    });

    return () => {
      inlineDebugLog("sync-global-editing-cleanup", {
        editingId: editing?.id || null,
        currentEditingId: window._currentEditingId ?? null,
      });
      if (window.editing && window.editing.id === editing.id) {
        delete window.editing;
      }
      if (window._currentEditingId === editing.id) {
        window._currentEditingId = null;
      }
    };
  }, [editing.id]);


  // 🎨 Función para actualizar offsets de imagen de fondo (SIN UNDEFINED)
  const actualizarOffsetFondo = useCallback((seccionId, nuevosOffsets, esPreview = false) => {
    setSecciones(prev =>
      prev.map(s => {
        if (s.id !== seccionId) return s;

        // 🔥 CREAR OBJETO LIMPIO
        const seccionActualizada = { ...s };

        // 🔥 SOLO AGREGAR CAMPOS SI TIENEN VALORES VÁLIDOS
        if (nuevosOffsets.offsetX !== undefined && nuevosOffsets.offsetX !== null) {
          seccionActualizada.fondoImagenOffsetX = nuevosOffsets.offsetX;
        }
        if (nuevosOffsets.offsetY !== undefined && nuevosOffsets.offsetY !== null) {
          seccionActualizada.fondoImagenOffsetY = nuevosOffsets.offsetY;
        }

        return seccionActualizada;
      })
    );
  }, [setSecciones]);

  // Asigna una imagen (por URL) a la celda activa
  function asignarImagenAGaleria(url) {
    setObjetos((prev) => {
      if (!celdaGaleriaActiva) return prev;
      const { objId, index } = celdaGaleriaActiva;
      const i = prev.findIndex(o => o.id === objId && o.tipo === "galeria");
      if (i === -1) return prev;

      const copia = structuredClone(prev);
      const g = copia[i];
      // Seguridad: que exista y que haya cells[index]
      if (!g?.cells || !g.cells[index]) return prev;

      g.cells[index] = {
        ...(g.cells[index] ?? {}),
        mediaUrl: url,
        fit: g.cells[index]?.fit ?? "cover",
        bg: g.cells[index]?.bg ?? "#eee",
      };
      return copia;
    });
  }



  useEffect(() => {
    // Limpiar flag de resize al montar el componente
    window._resizeData = null;
  }, []);

  const [mostrarPanelZ, setMostrarPanelZ] = useState(false);

  const moverElemento = (accion) => {
    const index = objetos.findIndex((o) => o.id === elementosSeleccionados[0]);
    if (index === -1) return;

    const nuevos = [...objetos];
    const [elemento] = nuevos.splice(index, 1);

    if (accion === "al-frente") {
      nuevos.push(elemento);
    } else if (accion === "al-fondo") {
      nuevos.unshift(elemento);
    } else if (accion === "subir" && index < objetos.length - 1) {
      nuevos.splice(index + 1, 0, elemento);
    } else if (accion === "bajar" && index > 0) {
      nuevos.splice(index - 1, 0, elemento);
    } else {
      nuevos.splice(index, 0, elemento); // sin cambios
    }

    setObjetos(nuevos);
    setMostrarPanelZ(false);
  };




  const {
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onCopiar,
    onPegar,
    onCambiarAlineacion
  } = useEditorHandlers({
    objetos,
    setObjetos,
    elementosSeleccionados,
    setElementosSeleccionados,
    historial,
    setHistorial,
    futuros,
    setFuturos,
    setSecciones,
    ignoreNextUpdateRef,
    setMostrarPanelZ
  });


  useHistoryManager({
    cargado,
    objetos,
    secciones,
    setHistorial,
    setFuturos,
    ignoreNextUpdateRef,
  });

  useEffect(() => {
    const stage = stageRef.current?.getStage?.();
    if (!stage) return;

    const content = stage.content;
    if (!content) return;

    // ✅ Estado base: scroll vertical permitido sobre canvas vacío
    const setScrollMode = () => {
      content.style.touchAction = "pan-y";
    };

    // ✅ Durante drag: bloquear scroll para editar fino
    const setEditMode = () => {
      content.style.touchAction = "none";
    };

    // ✅ NUEVO: estado React confiable para UI (Transformer/hover/etc.)
    const onDragStart = () => {
      setIsDragging(true);
    };

    const onDragEnd = () => {
      setIsDragging(false);
    };

    // ✅ Failsafe: por si termina “raro” (touch cancel, pointer up, etc.)
    const stopDragging = () => {
      setIsDragging(false);
      setScrollMode();
    };

    // Inicial
    setScrollMode();
    setIsDragging(false); // 🔒 por las dudas, al montar
    content.style.WebkitUserSelect = "none";
    content.style.WebkitTouchCallout = "none";

    // Konva events
    stage.on("dragstart", setEditMode);
    stage.on("dragend", setScrollMode);

    // ✅ NUEVO (UI state)
    stage.on("dragstart", onDragStart);
    stage.on("dragend", onDragEnd);

    // Failsafes (si el drag termina raro)
    stage.on("touchend", stopDragging);
    stage.on("pointerup", stopDragging);
    stage.on("mouseup", stopDragging);
    stage.on("touchcancel", stopDragging);

    return () => {
      stage.off("dragstart", setEditMode);
      stage.off("dragend", setScrollMode);

      stage.off("dragstart", onDragStart);
      stage.off("dragend", onDragEnd);

      stage.off("touchend", stopDragging);
      stage.off("pointerup", stopDragging);
      stage.off("mouseup", stopDragging);
      stage.off("touchcancel", stopDragging);
    };
  }, [setIsDragging]);




  // Recordar última sección activa
  useEffect(() => {
    if (seccionActivaId) window._lastSeccionActivaId = seccionActivaId;
  }, [seccionActivaId]);



  useEffect(() => {
    if (!nuevoTextoRef.current) return;

    const obj = objetos.find((o) => o.id === nuevoTextoRef.current);
    if (obj) {
      setElementosSeleccionados([obj.id]);
      // NO iniciar edición automáticamente - solo seleccionar
      nuevoTextoRef.current = null;
    }
  }, [objetos]);




  useEffect(() => {
    const handleClickFuera = (e) => {
      if (!e.target.closest(".popup-fuente")) {
        setMostrarSelectorFuente(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);




  useEffect(() => {
    if (onHistorialChange) {

      onHistorialChange(historial);
    }
  }, [historial, onHistorialChange]);

  useEffect(() => {
    if (onFuturosChange) {

      onFuturosChange(futuros);
    }
  }, [futuros, onFuturosChange]);




  useEffect(() => {
    // Pre-cargar fuentes populares al iniciar
    fontManager.preloadPopularFonts();

    // Escuchar evento de fuentes cargadas para redibujar
    const handleFontsLoaded = () => {
      if (stageRef.current) {
        stageRef.current.batchDraw();
      }
    };

    window.addEventListener('fonts-loaded', handleFontsLoaded);

    return () => {
      window.removeEventListener('fonts-loaded', handleFontsLoaded);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function precargar() {
      // Si no hay fuentes custom, listo
      if (!fuentesNecesarias.length) {
        if (alive) setFontsReady(true);
        return;
      }

      setFontsReady(false);

      try {
        // ✅ Ideal: que fontManager.loadFonts devuelva Promise
        // Si hoy no devuelve, igual lo resolvemos con document.fonts más abajo.
        const maybePromise = fontManager.loadFonts?.(fuentesNecesarias);

        // Si devuelve promise, esperamos
        if (maybePromise && typeof maybePromise.then === "function") {
          await maybePromise;
        }

        // ✅ Segundo seguro: esperar a que el browser confirme
        // (esto garantiza que no haya fallback)
        if (document?.fonts?.load) {
          await Promise.all(
            fuentesNecesarias.map(f =>
              document.fonts.load(`16px "${f}"`)
            )
          );
        }

        if (alive) setFontsReady(true);

        // Redraw por si acaso
        requestAnimationFrame(() => {
          stageRef.current?.batchDraw?.();
        });
      } catch (e) {
        console.warn("⚠️ Error precargando fuentes:", e);
        // Si falla, igual liberamos para no “bloquear” infinito.
        // (Si querés, podés dejarlo bloqueado con botón “Reintentar”.)
        if (alive) setFontsReady(true);
      }
    }

    // Solo precargar cuando ya cargaste el borrador (para evitar overlay raro)
    if (cargado) precargar();

    return () => { alive = false; };
  }, [cargado, fuentesNecesarias]);





  useEffect(() => {

  }, [seleccionActiva, areaSeleccion, inicioSeleccion]);







  const actualizarObjeto = (index, nuevo) => {
    const nuevos = [...objetos];
    const { fromTransform, ...cleanNuevo } = nuevo;

    // Preservar datos específicos según el tipo de objeto
    if (nuevos[index].tipo === 'forma' && nuevos[index].figura === 'line') {
      // Para líneas, asegurar que los puntos se preserven
      nuevos[index] = {
        ...nuevos[index],
        ...cleanNuevo,
        points: cleanNuevo.points || nuevos[index].points || [0, 0, 100, 0]
      };
    } else {
      nuevos[index] = { ...nuevos[index], ...cleanNuevo };
    }

    setObjetos(nuevos);
  };


  const actualizarObjetoPorId = (id, cambios) => {
    const index = objetos.findIndex((o) => o.id === id);
    if (index === -1) return console.warn("❌ No se encontró el objeto con ID:", id);
    actualizarObjeto(index, cambios);
  };




  const actualizarLinea = (lineId, nuevaData) => {
    const index = objetos.findIndex(obj => obj.id === lineId);

    if (index === -1) {
      return;
    }

    if (nuevaData.isPreview) {
      // Preview: Solo actualización visual sin historial
      setObjetos(prev => {
        const nuevos = [...prev];
        const { isPreview, ...cleanData } = nuevaData;

        // Asegurar que los puntos siempre sean un array válido
        if (cleanData.points) {
          cleanData.points = cleanData.points.map(p => parseFloat(p) || 0);
        }

        // 🔥 PRESERVAR strokeWidth si existe
        if (cleanData.strokeWidth !== undefined) {
          cleanData.strokeWidth = parseInt(cleanData.strokeWidth) || 2;
        }

        nuevos[index] = { ...nuevos[index], ...cleanData };
        return nuevos;
      });
    } else if (nuevaData.isFinal) {
      // Final: Guardar en historial
      setObjetos(prev => {
        const nuevos = [...prev];
        const { isFinal, ...cleanData } = nuevaData;

        // Asegurar que los puntos siempre sean un array válido
        if (cleanData.points) {
          cleanData.points = cleanData.points.map(p => parseFloat(p) || 0);
        }

        // 🔥 PRESERVAR strokeWidth si existe
        if (cleanData.strokeWidth !== undefined) {
          cleanData.strokeWidth = parseInt(cleanData.strokeWidth) || 2;
        }

        nuevos[index] = { ...nuevos[index], ...cleanData };
        return nuevos;
      });
    }
  };





  // 🔥 Métricas de texto consistentes con el render de ElementoCanvas
  const obtenerMetricasTexto = (texto, {
    fontSize = 24,
    fontFamily = "sans-serif",
    fontWeight = "normal",
    fontStyle = "normal",
    lineHeight = 1.2,
  } = {}) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const fallbackSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
      return { width: Math.max(20, String(texto ?? "").length * (fallbackSize * 0.55)), height: fallbackSize * lineHeight };
    }

    const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
    const safeLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1.2;
    const safeFamily = String(fontFamily || "sans-serif");
    const fontForCanvas = safeFamily.includes(",")
      ? safeFamily
      : (/\s/.test(safeFamily) ? `"${safeFamily}"` : safeFamily);

    ctx.font = `${fontStyle || "normal"} ${fontWeight || "normal"} ${safeFontSize}px ${fontForCanvas}`;

    const rawText = String(texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");
    const lines = safeText.split(/\r?\n/);
    const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 20);

    return {
      width: maxLineWidth,
      height: safeFontSize * safeLineHeight * Math.max(lines.length, 1),
    };
  };

  const medirAnchoTextoKonva = useCallback((objTexto, textoObjetivo) => {
    if (!objTexto || typeof window === "undefined") return null;

    try {
      const safeText = String(textoObjetivo ?? "").replace(/[ \t]+$/gm, "");
      const safeFontFamily = fontManager.isFontAvailable(objTexto.fontFamily)
        ? objTexto.fontFamily
        : "sans-serif";
      const safeFontSize =
        Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0
          ? objTexto.fontSize
          : 24;
      const baseLineHeight =
        Number.isFinite(objTexto.lineHeight) && objTexto.lineHeight > 0
          ? objTexto.lineHeight
          : 1.2;

      const probe = new Konva.Text({
        text: safeText,
        fontSize: safeFontSize,
        fontFamily: safeFontFamily,
        fontWeight: objTexto.fontWeight || "normal",
        fontStyle: objTexto.fontStyle || "normal",
        lineHeight: baseLineHeight * 0.92,
        padding: 0,
        wrap: "none",
      });

      const width = Number(probe.getTextWidth?.() || 0);
      probe.destroy();

      return Number.isFinite(width) && width > 0 ? width : null;
    } catch {
      return null;
    }
  }, []);

  const calcularXTextoCentrado = useCallback((objTexto, textoObjetivo) => {
    if (!objTexto || objTexto.tipo !== "texto") return Number.isFinite(objTexto?.x) ? objTexto.x : 0;

    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;

    const previousMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
    });

    const nextMetrics = obtenerMetricasTexto(textoObjetivo, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
    });

    const previousWidthFromKonva = medirAnchoTextoKonva(objTexto, objTexto.texto);
    const nextWidthFromKonva = medirAnchoTextoKonva(objTexto, textoObjetivo);

    const previousWidth =
      Number.isFinite(previousWidthFromKonva) && previousWidthFromKonva > 0
        ? previousWidthFromKonva
        : previousMetrics.width;
    const nextWidth =
      Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
        ? nextWidthFromKonva
        : nextMetrics.width;

    const currentX = Number.isFinite(objTexto.x) ? objTexto.x : 0;
    const centerX = currentX + (previousWidth / 2);
    return centerX - (nextWidth / 2);
  }, [obtenerMetricasTexto, medirAnchoTextoKonva]);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".menu-z-index")) {
        setMostrarPanelZ(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



  const actualizarFondoSeccion = (id, nuevoFondo) => {
    setSecciones((prev) =>
      prev.map((s) => s.id === id ? { ...s, fondo: nuevoFondo } : s)
    );
  };

  useKeyboardShortcuts({
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onDeseleccionar: () => {
      if (elementosSeleccionados.length > 0) {
        setElementosSeleccionados([]);
        setMostrarPanelZ(false);
        setMostrarSubmenuCapa(false);
        setMostrarSelectorFuente(false);
        setMostrarSelectorTamaño(false);
        setHoverId(null);
      }
    },
    onCopiar,
    onPegar,
    onCambiarAlineacion,
    isEditing: !!editing.id,
    tieneSeleccion: elementosSeleccionados.length > 0
  });


  const cambiarColorFondoSeccion = useCallback((seccionId, nuevoColor) => {

    setSecciones(prev =>
      prev.map(s => {
        if (s.id !== seccionId) return s;
        return { ...s, fondo: nuevoColor };
      })
    );
  }, [setSecciones]);


  useEditorWindowBridge({
    seccionesOrdenadas,
    secciones,
    seccionActivaId,
    objetos,
    altoCanvas,
    calcularOffsetY,

    cambiarColorFondoSeccion,

    onDeshacer,
    onRehacer,
    historialLength: historial.length,
    futurosLength: futuros.length,

    stageRef,
  });


  const esSeccionPantallaById = useCallback((seccionId) => {
    const s = seccionesOrdenadas.find(x => x.id === seccionId);
    return s && normalizarAltoModo(s.altoModo) === "pantalla";
  }, [seccionesOrdenadas]);


  const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;


  // 3) Cada vez que el usuario selecciona una sección, actualizamos global y notificamos
  const onSelectSeccion = (id) => {
    try {
      // si ya tenés un setSeccionActivaId, llamalo acá:
      setSeccionActivaId(id);

      window._seccionActivaId = id;
      window.dispatchEvent(new CustomEvent("seccion-activa", { detail: { id } }));
    } catch (e) {
      console.warn("No pude emitir seccion-activa:", e);
    }
  };

  // Ejemplo de uso: en el handler de click de la sección
  // <Rect onClick={() => onSelectSeccion(seccion.id)} ... />





  // 🆕 NUEVO HOOK PARA GUÍAS
  const {
    guiaLineas,
    mostrarGuias,
    limpiarGuias,
    configurarDragEnd
  } = useGuiasCentrado({
    anchoCanvas: 800,
    altoCanvas: altoCanvasDinamico,
    // UX: guía de sección solo al centrar, con imán sutil.
    margenSensibilidad: 8,
    magnetRadius: 10,
    sectionMagnetRadius: 6,
    snapStrength: 0.8,
    sectionSnapStrength: 1,
    sectionLineTolerance: 0.75,
    snapToEdges: true,
    snapToCenters: true,
    seccionesOrdenadas
  });

  // 🚀 Función para actualizar posición del botón SIN re-render
  const actualizarPosicionBotonOpciones = useCallback(() => {
    if (!botonOpcionesRef.current || elementosSeleccionados.length !== 1) return;

    const nodeRef = elementRefs.current[elementosSeleccionados[0]];
    const stage = stageRef.current;
    const contenedor = contenedorRef.current;

    if (!nodeRef || !stage || !contenedor) return;

    try {
      // 🔥 OBTENER POSICIÓN REAL DEL ELEMENTO EN EL STAGE (coordenadas locales)
      const box = nodeRef.getClientRect();

      // 🔥 OBTENER POSICIÓN DEL STAGE EN EL VIEWPORT
      const stageContainer = stage.container();
      const stageRect = stageContainer.getBoundingClientRect();

      // 🔥 OBTENER SCROLL Y OFFSET DEL CONTENEDOR PRINCIPAL
      const contenedorRect = contenedor.getBoundingClientRect();
      const scrollTop = contenedor.scrollTop || 0;
      const scrollLeft = contenedor.scrollLeft || 0;

      // 🎯 CÁLCULO CORRECTO: Posición absoluta en viewport
      const elementoX = stageRect.left + (box.x * escalaVisual);
      const elementoY = stageRect.top + (box.y * escalaVisual);
      const anchoElemento = box.width * escalaVisual;

      // 🔥 POSICIÓN FINAL: Esquina superior derecha del elemento
      const botonX = elementoX + anchoElemento; // -12px (mitad del botón)
      const botonY = elementoY - 24; // -12px (mitad del botón)

      // 🔥 VALIDACIÓN: Solo mostrar si está dentro del viewport visible
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (botonX >= 0 && botonX <= viewportWidth && botonY >= 0 && botonY <= viewportHeight) {
        botonOpcionesRef.current.style.left = `${botonX}px`;
        botonOpcionesRef.current.style.top = `${botonY}px`;
        botonOpcionesRef.current.style.display = 'flex';
      } else {
        // Ocultar si está fuera del viewport
        botonOpcionesRef.current.style.display = 'none';
      }

    } catch (error) {
      console.warn("Error actualizando posición del botón:", error);
      // En caso de error, ocultar el botón
      if (botonOpcionesRef.current) {
        botonOpcionesRef.current.style.display = 'none';
      }
    }
  }, [elementosSeleccionados, escalaVisual, elementRefs]);


  // 🔄 Actualizar posición del botón cuando cambia la selección o escala
  useEffect(() => {
    if (elementosSeleccionados.length === 1) {
      // Pequeño delay para que el elemento esté renderizado
      setTimeout(() => {
        actualizarPosicionBotonOpciones();
      }, 50);
    }
  }, [elementosSeleccionados, escalaActiva, actualizarPosicionBotonOpciones]);

  // 🔄 Actualizar posición en scroll/resize
  useEffect(() => {
    const handleScrollResize = () => {
      if (elementosSeleccionados.length === 1) {
        actualizarPosicionBotonOpciones();
      }
    };

    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);

    return () => {
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [elementosSeleccionados, actualizarPosicionBotonOpciones]);



  useEffect(() => {
    const onDragStartGlobal = () => {
      // limpiar hover inmediatamente para que no quede “pegado”
      setHoverId(null);
    };
    const onDragEndGlobal = () => {
      // nada por ahora; si quisieras, podrías recalcular algo acá
    };

    window.addEventListener("dragging-start", onDragStartGlobal);
    window.addEventListener("dragging-end", onDragEndGlobal);
    return () => {
      window.removeEventListener("dragging-start", onDragStartGlobal);
      window.removeEventListener("dragging-end", onDragEndGlobal);
    };
  }, []);





  // 🔥 OPTIMIZACIÓN: Limpiar cache de intersección al cambiar selección
  useEffect(() => {
    // Limpiar cache cuando cambia la selección
    if (window._lineIntersectionCache) {
      window._lineIntersectionCache = {};
    }
  }, [elementosSeleccionados.length]);

  // 🔥 OPTIMIZACIÓN: Forzar actualización de líneas después de drag grupal
  useEffect(() => {
    if (!window._grupoLider && elementosSeleccionados.length > 0) {
      // Verificar si hay líneas seleccionadas
      const hayLineas = objetos.some(obj =>
        elementosSeleccionados.includes(obj.id) &&
        obj.tipo === 'forma' &&
        obj.figura === 'line'
      );

      if (hayLineas) {
        // Forzar re-render de las líneas
        const timer = setTimeout(() => {
          elementosSeleccionados.forEach(id => {
            const node = elementRefs.current[id];
            if (node && node.getLayer) {
              node.getLayer()?.batchDraw();
            }
          });
        }, 50);

        return () => clearTimeout(timer);
      }
    }
  }, [window._grupoLider, elementosSeleccionados, objetos]);


  const detectarInterseccionLinea = useMemo(() => {
    return (lineObj, area, stage) => {
      try {
        if (!lineObj || !area || !lineObj.points) return false;

        let points = lineObj.points;
        if (!Array.isArray(points) || points.length < 4) {
          points = [0, 0, 100, 0];
        }

        const puntosLimpios = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0
        ];

        // 🔥 USAR LA POSICIÓN DEL NODO REAL EN EL STAGE
        const node = window._elementRefs?.[lineObj.id];
        const lineX = node ? node.x() : (lineObj.x || 0);
        const lineY = node ? node.y() : (lineObj.y || 0);

        // Coordenadas absolutas de los puntos
        const startX = lineX + puntosLimpios[0];
        const startY = lineY + puntosLimpios[1];
        const endX = lineX + puntosLimpios[2];
        const endY = lineY + puntosLimpios[3];



        // 🔥 MÉTODO 1: Verificar si algún punto está dentro del área
        const startDentro = (
          startX >= area.x && startX <= area.x + area.width &&
          startY >= area.y && startY <= area.y + area.height
        );

        const endDentro = (
          endX >= area.x && endX <= area.x + area.width &&
          endY >= area.y && endY <= area.y + area.height
        );


        if (startDentro || endDentro) {
          return true;
        }

        // 🔥 MÉTODO 2: Verificar intersección línea-rectángulo
        const intersecta = lineIntersectsRect(
          startX, startY, endX, endY,
          area.x, area.y, area.x + area.width, area.y + area.height
        );


        if (intersecta) {
          return true;
        }

        return false;

      } catch (error) {
        return false;
      }
    };
  }, []);

  // Función auxiliar para verificar intersección línea-rectángulo
  function lineIntersectsRect(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectBottom) {
    // Verificar si la línea intersecta con alguno de los 4 lados del rectángulo
    return (
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectTop) || // Top
      lineIntersectsLine(x1, y1, x2, y2, rectRight, rectTop, rectRight, rectBottom) || // Right
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectBottom, rectRight, rectBottom) || // Bottom
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectLeft, rectBottom) // Left
    );
  }

  // Función auxiliar para verificar intersección línea-línea
  function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }


  // 🔄 Ajustar el transformer cuando cambia el texto inline
  useEffect(() => {
    if (!editing.id || !elementRefs.current[editing.id]) return;

    const node = elementRefs.current[editing.id];
    const objetoEnEdicion = objetos.find((o) => o.id === editing.id);
    if (!objetoEnEdicion) return;
    const nodeClass = node.getClassName?.();
    const beforeMetrics = obtenerMetricasNodoInline(node);
    const editingValue = String(editing.value ?? "");

    const shouldKeepCenterPreview =
      objetoEnEdicion.tipo === "texto" &&
      !objetoEnEdicion.__groupAlign &&
      !Number.isFinite(objetoEnEdicion.width) &&
      objetoEnEdicion.__autoWidth !== false;

    const expectedX = shouldKeepCenterPreview
      ? calcularXTextoCentrado(objetoEnEdicion, editingValue)
      : (Number.isFinite(objetoEnEdicion.x) ? objetoEnEdicion.x : null);

    inlineDebugLog("preview-effect-start", {
      id: editing.id,
      valueLength: editingValue.length,
      nodeClass,
      objX: objetoEnEdicion.x ?? null,
      objY: objetoEnEdicion.y ?? null,
      shouldKeepCenterPreview,
      expectedX,
      beforeMetrics,
    });

    // 🔁 Actualizar el transformer si está presente
    const transformer = node.getStage()?.findOne('Transformer');
    if (transformer && transformer.nodes && transformer.nodes().includes(node)) {
      transformer.forceUpdate(); // Actualiza manualmente el transformer
      transformer.getLayer()?.batchDraw(); // Redibuja

      let transformerRect = null;
      try {
        transformerRect = transformer.getClientRect({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
      } catch {
        transformerRect = null;
      }

      inlineDebugLog("preview-transformer-updated", {
        id: editing.id,
        transformerRect: transformerRect
          ? {
              x: transformerRect.x,
              y: transformerRect.y,
              width: transformerRect.width,
              height: transformerRect.height,
            }
          : null,
      });
    }

    const afterMetrics = obtenerMetricasNodoInline(node);
    const afterX =
      typeof node.x === "function" ? node.x() : afterMetrics?.x ?? null;
    inlineDebugLog("preview-props-sync", {
      id: editing.id,
      valueLength: editingValue.length,
      expectedX,
      afterX,
      deltaX:
        Number.isFinite(afterX) && Number.isFinite(expectedX)
          ? afterX - expectedX
          : null,
      beforeMetrics,
      afterMetrics,
    });
  }, [editing.id, editing.value, objetos, obtenerMetricasNodoInline, calcularXTextoCentrado]);

  useEffect(() => {
    const pending = inlineCommitDebugRef.current;
    if (!pending?.id) return;
    if (editing.id) return;

    const finalObj = objetos.find((o) => o.id === pending.id);
    const finalNode = elementRefs.current[pending.id];
    const finalNodeMetrics = obtenerMetricasNodoInline(finalNode);
    const finalX = Number.isFinite(finalObj?.x) ? finalObj.x : null;
    const deltaFinalVsExpected =
      Number.isFinite(finalX) && Number.isFinite(pending.expectedX)
        ? finalX - pending.expectedX
        : null;

    inlineDebugLog("finish-post-commit", {
      ...pending,
      finalX,
      deltaFinalVsExpected,
      finalNodeMetrics,
    });

    inlineCommitDebugRef.current = { id: null };
  }, [editing.id, objetos, obtenerMetricasNodoInline]);




  useEffect(() => {
    window._elementosSeleccionados = elementosSeleccionados;
    window._objetosActuales = objetos;
    // 🔥 NUEVO: Exponer elementRefs para actualización directa
    window._elementRefs = elementRefs.current;

    // 🔥 NUEVO: Exponer secciones y altura total
    window._seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);
    window._altoCanvas = altoCanvas;
  }, [elementosSeleccionados, objetos, secciones, altoCanvas]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.setHoverIdGlobal = setHoverId;
    return () => {
      if (window.setHoverIdGlobal === setHoverId) {
        delete window.setHoverIdGlobal;
      }
    };
  }, []);

  useEffect(() => {
    if (!hoverId) return;
    const exists = objetos.some((o) => o.id === hoverId);
    if (!exists) setHoverId(null);
  }, [hoverId, objetos]);



  // Cleanup del sistema imperativo
  useEffect(() => {
    return () => {
      imperativeObjects.cleanup();
    };
  }, []);


  const esTouch = (evt) => {
    const t = evt?.evt;
    return !!(t && (t.type?.includes("touch") || t.pointerType === "touch"));
  };



  return (
    <div
      className="flex justify-center"
      style={{
        // ✅ Dejamos que el scroll lo maneje el <main> del DashboardLayout (un solo scroll)
        marginTop: 0,
        overflowX: "hidden",

        // ✅ UX mobile: permitir scroll vertical natural alrededor del canvas
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",

        // ✅ espacio para que no “choque” con header / barras
        paddingTop: 12,
        paddingBottom: 96,
      }}
    >


      <div
        ref={contenedorRef}
        style={{
          width: "100%",
          maxWidth: "1200px",
          backgroundColor: "#f5f5f5",
          display: "flex",
          justifyContent: "center",
          paddingTop: "20px", // ✅ MENOS PADDING INTERNO
          paddingBottom: "40px", // ✅ ESPACIO INFERIOR
        }}
      >

        <div
          style={{
            transform: `scale(${escalaVisual})`,
            transformOrigin: 'top center',
            width: zoom === 0.8 ? "1220px" : "1000px", // ✅ 920px canvas + 150px cada lado
            position: "relative",
          }}
        >

          <div
            className="relative"
            style={{
              width: zoom === 0.8 ? "1220px" : "1000px", // ✅ AJUSTAR SEGÚN ZOOM
              display: "flex",
              justifyContent: "center",
            }}
          >

            {/* Botones de orden de sección */}
            {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
              if (seccion.id !== seccionActivaId) return null;

              const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
              const esPrimera = index === 0;
              const esUltima = index === seccionesOrdenadas.length - 1;
              const estaAnimando = seccionesAnimando.includes(seccion.id);

              return (
                <div
                  key={`orden-${seccion.id}`}
                  className="absolute flex flex-col gap-2"
                  style={{
                    top: offsetY + 20,
                    right: -150,
                    zIndex: 25,
                  }}
                >
                  {/* Botón Subir */}
                  <button
                    onClick={() =>
                      moverSeccionExternal({
                        seccionId: seccion.id,
                        direccion: "subir",
                        secciones,
                        slug,
                        setSecciones,
                        setSeccionesAnimando,
                      })
                    }
                    disabled={esPrimera || estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${esPrimera || estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title={esPrimera ? 'Ya es la primera sección' : 'Subir sección'}
                  >
                    ↑ Subir sección
                  </button>

                  {/* Botón Guardar como plantilla */}
                  {!loadingClaims && esAdmin && (
                    <button
                      onClick={() =>
                        guardarSeccionComoPlantilla({
                          seccionId: seccion.id,
                          secciones,
                          objetos,
                          refrescarPlantillasDeSeccion,
                        })
                      }
                      disabled={estaAnimando}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${estaAnimando
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-md hover:shadow-lg'
                        } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                      title="Guardar esta sección como plantilla"
                    >
                      💾 Plantilla
                    </button>
                  )}


                  {(() => {
                    const modoSeccion = normalizarAltoModo(seccion.altoModo);
                    const esPantalla = modoSeccion === "pantalla";

                    return (
                      <div className="flex items-center gap-2">
                        {/* Botón Desanclar fondo */}
                        {seccion.fondoTipo === "imagen" && (
                          <button
                            onClick={() =>
                              desanclarFondo({
                                seccionId: seccion.id,
                                secciones,
                                objetos,
                                setSecciones,
                                setObjetos,
                                setElementosSeleccionados,
                              })
                            }
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                            title="Desanclar imagen de fondo"
                          >
                            🔄 Desanclar fondo
                          </button>
                        )}

                        {/* Toggle Pantalla completa */}
                        <button
                          onClick={() => togglePantallaCompletaSeccion(seccion.id)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${esPantalla
                            ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md"
                            : "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 shadow-sm"
                            }`}
                          title="Hace que esta sección sea de pantalla completa (100vh) al publicar"
                        >
                          {esPantalla ? "📺 Pantalla: ON" : "📺 Pantalla: OFF"}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Botón Borrar sección */}
                  <button
                    onClick={() =>
                      borrarSeccionExternal({
                        seccionId: seccion.id,
                        secciones,
                        objetos,
                        slug,
                        seccionActivaId,
                        setSecciones,
                        setObjetos,
                        setSeccionActivaId,
                      })
                    }
                    disabled={estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title="Borrar esta sección y todos sus elementos"
                  >
                    🗑️ Borrar sección
                  </button>


                  {/* Botón Bajar */}
                  <button
                    onClick={() =>
                      moverSeccionExternal({
                        seccionId: seccion.id,
                        direccion: "bajar",
                        secciones,
                        slug,
                        setSecciones,
                        setSeccionesAnimando,
                      })
                    }
                    disabled={esUltima || estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${esUltima || estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title={esUltima ? 'Ya es la última sección' : 'Bajar sección'}
                  >
                    ↓ Bajar sección
                  </button>

                  {/* Botón Añadir sección */}
                  <button
                    onClick={handleCrearSeccion}
                    disabled={estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200
    ${estaAnimando
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed animate-pulse shadow-xl'
                        : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      }`}
                    title="Añadir una nueva sección debajo"
                  >
                    Añadir sección
                  </button>


                </div>
              );
            })}


            <div
              style={{
                position: "relative",
                width: 800,
                height: altoCanvasDinamico,
              }}
            >

              <Stage
                ref={stageRef}
                width={800}
                height={altoCanvasDinamico}
                perfectDrawEnabled={false}
                listening={true}
                imageSmoothingEnabled={false}
                preventDefault={false}
                hitGraphEnabled={true}
                style={{
                  background: "white",
                  overflow: "visible",
                  position: "relative",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}


                onMouseDown={(e) => {
                  const stage = e.target.getStage();
                  if (!stage) return;

                  // ⛔️ NO usar comparaciones directas contra e.target
                  // const clickEnElemento = Object.values(elementRefs.current).some(node => node === e.target);

                  // ✅ Usar findAncestor: ¿el target pertenece a algún "nodo raíz" registrado?
                  const roots = Object.values(elementRefs.current || {});
                  const rootHit = e.target.findAncestor((n) => roots.includes(n), true); // includeSelf=true

                  if (rootHit) {
                    // Clic adentro de un elemento: NO inicies selección por lazo
                    // Dejá que el drag del elemento maneje el movimiento
                    return;
                  }



                  const clickedOnStage = e.target === stage;

                  // Salir de modo mover fondo si no clickeaste una imagen de fondo
                  if (!clickedOnStage && e.target.getClassName() !== "Image") {
                    window.dispatchEvent(new Event("salir-modo-mover-fondo"));
                  }

                  const esStage = clickedOnStage;
                  const esSeccion = e.target.attrs?.id && secciones.some(s => s.id === e.target.attrs?.id);

                  dragStartPos.current = stage.getPointerPosition();
                  hasDragged.current = false;

                  // Ignorar Transformer/anchors
                  const esTransformer = e.target.getClassName?.() === 'Transformer' ||
                    e.target.parent?.getClassName?.() === 'Transformer' ||
                    e.target.attrs?.name?.includes('_anchor');
                  if (esTransformer) return;

                  // Si clic en un elemento registrado, no arrancar selección
                  const clickEnElemento = Object.values(elementRefs.current).some(node => node === e.target);
                  if (clickEnElemento) return;

                  const esImagenFondo = e.target.getClassName() === "Image";

                  if (esStage || esSeccion || esImagenFondo) {
                    setElementosSeleccionados([]);
                    setMostrarPanelZ(false);
                    setMostrarSubmenuCapa(false);
                    setMostrarSelectorFuente(false);   // 👈 extra
                    setMostrarSelectorTamaño(false);   // 👈 extra
                    setHoverId(null);                  // 👈 extra

                    if (esStage) {
                      setSeccionActivaId(null);
                    } else {
                      const idSeccion = e.target.attrs?.id
                        || secciones.find(s => s.id === e.target.parent?.attrs?.id)?.id
                        || secciones[0]?.id;
                      if (idSeccion) setSeccionActivaId(idSeccion);
                    }

                    const pos = stage.getPointerPosition();
                    setInicioSeleccion({ x: pos.x, y: pos.y });
                    setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
                    setSeleccionActiva(true);
                  }
                }}


                onTouchStart={(e) => {
                  const stage = e.target.getStage();
                  if (!stage) return;

                  const pos = stage.getPointerPosition();
                  if (!pos) return;

                  const roots = Object.values(elementRefs.current || {});
                  const rootHit = e.target.findAncestor((n) => roots.includes(n), true);

                  touchGestureRef.current = {
                    startX: pos.x,
                    startY: pos.y,
                    moved: false,
                    tappedSectionId,
                    clickedOnStage,
                    startedOnElement: !!rootHit,   // ✅ NUEVO
                  };

                  if (rootHit) {
                    // ✅ Si tocaste un elemento, NO hagas lógica de sección.
                    // Dejamos que ElementoCanvas / GaleriaKonva / Countdown manejen selección/drag.
                    return;
                  }


                  const clickedOnStage = e.target === stage;

                  // ¿tocaste una sección?
                  const tappedSectionId =
                    e.target.attrs?.id && secciones.some((s) => s.id === e.target.attrs?.id)
                      ? e.target.attrs.id
                      : (secciones.find((s) => s.id === e.target.parent?.attrs?.id)?.id || null);

                  // Guardar gesto (NO seleccionar todavía)
                  touchGestureRef.current = {
                    startX: pos.x,
                    startY: pos.y,
                    moved: false,
                    tappedSectionId,
                    clickedOnStage,
                  };
                }}

                onTouchMove={(e) => {
                  const stage = e.target.getStage();
                  if (!stage) return;

                  const pos = stage.getPointerPosition();
                  if (!pos) return;

                  const dx = Math.abs(pos.x - touchGestureRef.current.startX);
                  const dy = Math.abs(pos.y - touchGestureRef.current.startY);

                  // Si se movió, es scroll (o pan), NO seleccionar sección
                  if (dx > TOUCH_MOVE_PX || dy > TOUCH_MOVE_PX) {
                    touchGestureRef.current.moved = true;
                  }
                }}

                onTouchEnd={() => {
                  const g = touchGestureRef.current;

                  // Scroll: no hacer nada
                  if (g.moved) return;

                  // ✅ Si el gesto arrancó sobre un elemento, NO limpies selección.
                  // Ese tap lo tiene que procesar el propio elemento (onClick/onTap en ElementoCanvas).
                  if (g.startedOnElement) return;

                  // Tap en vacío: acá sí aplicamos la lógica “canvas”
                  setElementosSeleccionados([]);
                  cerrarMenusFlotantes?.();

                  if (g.clickedOnStage) {
                    setSeccionActivaId(null);
                    return;
                  }

                  if (g.tappedSectionId) {
                    setSeccionActivaId(g.tappedSectionId);
                  }
                }}


                onMouseMove={(e) => {


                  // 🔥 RESTO DE LA LÓGICA (selección de área)
                  if (!seleccionActiva || !inicioSeleccion) return;

                  if (window._mouseMoveThrottle) return;
                  window._mouseMoveThrottle = true;

                  requestAnimationFrame(() => {
                    window._mouseMoveThrottle = false;

                    const stage = e.target.getStage();
                    const pos = stage.getPointerPosition();
                    if (!pos) return;

                    const area = {
                      x: Math.min(inicioSeleccion.x, pos.x),
                      y: Math.min(inicioSeleccion.y, pos.y),
                      width: Math.abs(pos.x - inicioSeleccion.x),
                      height: Math.abs(pos.y - inicioSeleccion.y),
                    };

                    setAreaSeleccion(area);

                    if (Math.abs(area.width) > 5 || Math.abs(area.height) > 5) {
                      if (window._selectionThrottle) return;
                      window._selectionThrottle = true;

                      requestAnimationFrame(() => {
                        const ids = objetos.filter((obj) => {
                          const node = elementRefs.current[obj.id];
                          if (!node) return false;

                          if (obj.tipo === 'forma' && obj.figura === 'line') {
                            return detectarInterseccionLinea(obj, area, stage);
                          }

                          const box = node.getClientRect({ relativeTo: stage });
                          return (
                            box.x + box.width >= area.x &&
                            box.x <= area.x + area.width &&
                            box.y + box.height >= area.y &&
                            box.y <= area.y + area.height
                          );
                        }).map((obj) => obj.id);

                        setElementosPreSeleccionados(ids);
                        window._selectionThrottle = false;
                      });
                    }
                  });
                }}

                onMouseUp={(e) => {

                  const stage = e.target.getStage();


                  // Solo verificar si hay drag grupal activo para no procesar selección
                  if (window._grupoLider) {
                    console.log("🎯 Drag grupal activo, esperando onDragEnd...");
                    return; // No hacer nada más, dejar que ElementoCanvas maneje todo
                  }

                  // El resto del código de selección por área continúa igual...
                  if (!seleccionActiva || !areaSeleccion) return;

                  const nuevaSeleccion = objetos.filter((obj) => {
                    const node = elementRefs.current[obj.id];
                    if (!node) {
                      console.log(`⚠️ [SELECCIÓN ÁREA] No se encontró node para ${obj.id}`);

                      return false;
                    }

                    // 🔥 MANEJO ESPECIAL PARA LÍNEAS
                    if (obj.tipo === 'forma' && obj.figura === 'line') {
                      console.log(`📏 [SELECCIÓN ÁREA] Detectando línea ${obj.id} en área`);

                      return detectarInterseccionLinea(obj, areaSeleccion, stage);
                    }


                    // 🔄 LÓGICA PARA ELEMENTOS NORMALES
                    try {
                      const box = node.getClientRect();
                      return (
                        box.x + box.width >= areaSeleccion.x &&
                        box.x <= areaSeleccion.x + areaSeleccion.width &&
                        box.y + box.height >= areaSeleccion.y &&
                        box.y <= areaSeleccion.y + areaSeleccion.height
                      );

                    } catch (error) {
                      console.warn(`❌ [SELECCIÓN ÁREA] Error detectando ${obj.id}:`, error);

                      return false;
                    }
                  });


                  setElementosSeleccionados(nuevaSeleccion.map(obj => obj.id));
                  setElementosPreSeleccionados([]);
                  setSeleccionActiva(false);
                  setAreaSeleccion(null);

                  // 🔥 LIMPIAR THROTTLES Y CACHE
                  if (window._selectionThrottle) {
                    window._selectionThrottle = false;
                  }
                  if (window._boundsUpdateThrottle) {
                    window._boundsUpdateThrottle = false;
                  }
                  window._lineIntersectionCache = {};
                }}
              >
                <CanvasElementsLayer>

                  {seccionesOrdenadas.flatMap((seccion, index) => {
                    const alturaPx = seccion.altura;
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const esActiva = seccion.id === seccionActivaId;
                    const estaAnimando = seccionesAnimando.includes(seccion.id);

                    if (estaAnimando) {
                      console.log("🎭 SECCIÓN ANIMANDO:", seccion.id);
                    }

                    const elementos = [
                      // Fondo de sección - puede ser color o imagen
                      seccion.fondoTipo === "imagen" ? (
                        <FondoSeccion
                          key={`fondo-${seccion.id}`}
                          seccion={seccion}
                          offsetY={offsetY}
                          alturaPx={alturaPx}
                          onSelect={() => setSeccionActivaId(seccion.id)}
                          onUpdateFondoOffset={actualizarOffsetFondo}
                          isMobile={isMobile}
                        />
                      ) : (
                        <Rect
                          key={`seccion-${seccion.id}`}
                          id={seccion.id}
                          x={0}
                          y={offsetY}
                          width={800}
                          height={alturaPx}
                          fill={seccion.fondo || "#ffffff"}
                          stroke="transparent"
                          strokeWidth={0}
                          listening={!isMobile}
                          // ✅ desktop: click para seleccionar sección
                          onClick={!isMobile ? () => setSeccionActivaId(seccion.id) : undefined}
                          onTap={!isMobile ? () => setSeccionActivaId(seccion.id) : undefined}
                        />
                      )
                    ];


                    return elementos;
                  })}


                  {/* Control de altura para sección activa */}
                  {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
                    if (seccion.id !== seccionActivaId) return null;

                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const controlY = offsetY + seccion.altura - 5; // 5px antes del final

                    const modoSeccion = normalizarAltoModo(seccion.altoModo);
                    const permiteResizeAltura = (modoSeccion !== "pantalla");


                    return (
                      <Group name="ui" key={`control-altura-${seccion.id}`}>
                        {/* Línea indicadora */}
                        <Line
                          name="ui"
                          points={[50, controlY, 750, controlY]}
                          stroke="#773dbe"
                          strokeWidth={2}
                          dash={[5, 5]}
                          listening={false}
                        />

                        {/* Control central mejorado */}
                        <Group
                          x={400}
                          y={controlY}
                          listening={permiteResizeAltura}                 // ✅ clave: si es false, no captura eventos
                          opacity={permiteResizeAltura ? 1 : 0.25}        // ✅ visual deshabilitado
                          onMouseDown={permiteResizeAltura ? (e) => iniciarControlAltura(e, seccion.id) : undefined}
                          onMouseEnter={() => {
                            if (!controlandoAltura && permiteResizeAltura) setGlobalCursor("ns-resize", stageRef);
                          }}
                          onMouseLeave={() => {
                            if (!controlandoAltura && permiteResizeAltura) clearGlobalCursor(stageRef);
                          }}
                          draggable={false}
                        >


                          {/* Área de detección */}
                          <Rect
                            x={-35}
                            y={-12}
                            width={70}
                            height={24}
                            fill="transparent"
                            listening={true}
                          />

                          {/* Fondo del control con estado activo */}
                          <Rect
                            x={-25}
                            y={-6}
                            width={50}
                            height={12}
                            fill={controlandoAltura === seccion.id ? "#773dbe" : "rgba(119, 61, 190, 0.9)"}
                            cornerRadius={6}
                            shadowColor="rgba(0,0,0,0.3)"
                            shadowBlur={controlandoAltura === seccion.id ? 8 : 6}
                            shadowOffset={{ x: 0, y: controlandoAltura === seccion.id ? 4 : 3 }}
                            listening={false}
                          />

                          {/* Animación de pulso durante el control */}
                          {controlandoAltura === seccion.id && (
                            <Rect
                              x={-30}
                              y={-8}
                              width={60}
                              height={16}
                              fill="transparent"
                              stroke="#773dbe"
                              strokeWidth={2}
                              cornerRadius={8}
                              opacity={0.6}
                              listening={false}
                            />
                          )}

                          {/* Indicador visual */}
                          <Text
                            x={-6}
                            y={-3}
                            text="⋮⋮"
                            fontSize={10}
                            fill="white"
                            fontFamily="Arial"
                            listening={false}
                          />

                          {/* Puntos de agarre */}
                          <Circle x={-15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={-10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                        </Group>


                        {/* Fondo del indicador */}
                        <Rect
                          x={755}
                          y={controlY - 10}
                          width={40}
                          height={20}
                          fill="rgba(119, 61, 190, 0.1)"
                          stroke="rgba(119, 61, 190, 0.3)"
                          strokeWidth={1}
                          cornerRadius={4}
                          listening={false}
                        />

                        {/* Texto del indicador */}
                        <Text
                          x={760}
                          y={controlY - 6}
                          text={`${Math.round(seccion.altura)}px`}
                          fontSize={11}
                          fill="#773dbe"
                          fontFamily="Arial"
                          fontWeight="bold"
                          listening={false}
                        />
                      </Group>
                    );
                  })}

                  {/* Overlay mejorado durante control de altura */}
                  {controlandoAltura && (
                    <Group name="ui">
                      {/* Overlay sutil */}
                      <Rect
                        x={0}
                        y={0}
                        width={800}
                        height={altoCanvasDinamico}
                        fill="rgba(119, 61, 190, 0.05)"
                        listening={false}
                      />

                      {/* Indicador de la sección que se está modificando */}
                      {seccionesOrdenadas.map((seccion, index) => {
                        const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);

                        const modoSeccion = normalizarAltoModo(seccion.altoModo);
                        const permiteResizeAltura = (modoSeccion !== "pantalla");

                        return (
                          <Group key={seccion.id}>
                            {/* Rect “fondo” clickeable */}
                            <Rect
                              x={0}
                              y={offsetY}
                              width={800}
                              height={seccion.altura}
                              fill={seccion.fondo || "transparent"} // podés poner blanco u otro color
                              onClick={() => onSelectSeccion(seccion.id)}   // 👈 dispara el evento
                            />

                            {/* Rect highlight si estás controlando la altura */}
                            {seccion.id === controlandoAltura && (
                              <Rect
                                x={0}
                                y={offsetY}
                                width={800}
                                height={seccion.altura}
                                fill="transparent"
                                stroke="#773dbe"
                                strokeWidth={3}
                                dash={[8, 4]}
                                listening={false}
                              />
                            )}
                          </Group>
                        );
                      })}

                    </Group>
                  )}



                  {objetos.map((obj, i) => {
                    // 🎯 Determinar si está en modo edición
                    const isInEditMode = editing.id === obj.id && elementosSeleccionados[0] === obj.id;

                    // 🖼️ Caso especial: la galería la renderizamos acá (no usa ElementoCanvas)
                    if (obj.tipo === "galeria") {

                      return (
                        <GaleriaKonva
                          key={obj.id}
                          obj={obj}
                          registerRef={registerRef}
                          onHover={setHoverId}
                          isSelected={elementosSeleccionados.includes(obj.id)}
                          celdaGaleriaActiva={celdaGaleriaActiva}
                          onPickCell={(info) => setCeldaGaleriaActiva(info)}
                          seccionesOrdenadas={seccionesOrdenadas}
                          altoCanvas={altoCanvas}
                          onSelect={(id, e) => {
                            e?.evt && (e.evt.cancelBubble = true);
                            setElementosSeleccionados([id]);
                          }}
                          onDragMovePersonalizado={(pos, id) => {
                            window._isDragging = true;
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}
                          onDragStartPersonalizado={() => {
                            setIsDragging(true);
                          }}
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}
                          onChange={(id, nuevo) => {
                            setObjetos((prev) => {
                              const i = prev.findIndex((o) => o.id === id);
                              if (i === -1) return prev;
                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...nuevo };
                              return updated;
                            });
                          }}
                        />

                      );
                    }


                    if (obj.tipo === "countdown") {
                      return (
                        <CountdownKonva
                          key={obj.id}
                          obj={obj}
                          registerRef={registerRef}
                          onHover={setHoverId}
                          isSelected={elementosSeleccionados.includes(obj.id)}
                          seccionesOrdenadas={seccionesOrdenadas}
                          altoCanvas={altoCanvas}

                          // ✅ selección
                          onSelect={(id, e) => {
                            e?.evt && (e.evt.cancelBubble = true);
                            setElementosSeleccionados([id]);
                          }}

                          // ✅ PREVIEW liviano (no tocar estado del objeto para que no haya lag)
                          onDragMovePersonalizado={(pos, id) => {
                            setIsDragging(true);
                            if (!window._grupoLider) {
                              mostrarGuias(pos, id, objetos, elementRefs);
                            }
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}

                          // ✅ FIN de drag: limpiar guías / UI auxiliar
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}

                          // ✅ refs para el motor de drag
                          dragStartPos={dragStartPos}
                          hasDragged={hasDragged}

                          // ✅ ¡Clave! Al finalizar, tratamos x/y absolutas como en ElementoCanvas:
                          onChange={(id, cambios) => {
                            setObjetos(prev => {
                              const i = prev.findIndex(o => o.id === id);
                              if (i === -1) return prev;

                              const objOriginal = prev[i];

                              // 🟣 Si no es final de drag, mergeamos sin más (no tocar coords)
                              if (!cambios.finalizoDrag) {
                                const updated = [...prev];
                                updated[i] = { ...updated[i], ...cambios };
                                return updated;
                              }

                              // 🟣 Final de drag: 'cambios.y' viene ABSOLUTA (Stage coords)
                              const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                                cambios.y,
                                objOriginal.seccionId,
                                seccionesOrdenadas
                              );

                              let next = { ...cambios };
                              delete next.finalizoDrag;

                              if (nuevaSeccion) {
                                next = { ...next, ...coordenadasAjustadas, seccionId: nuevaSeccion };
                              } else {
                                // convertir y absoluta → y relativa a la sección actual
                                next.y = convertirAbsARel(cambios.y, objOriginal.seccionId, seccionesOrdenadas);
                              }

                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...next };
                              return updated;
                            });
                          }}
                        />
                      );
                    }





                    const objPreview =
                      editing.id === obj.id && obj.tipo === "texto"
                        ? (() => {
                          const textoPreview = String(editing.value ?? "");
                          const previewObj = { ...obj, texto: textoPreview };
                          const shouldKeepCenterPreview =
                            !obj.__groupAlign &&
                            !Number.isFinite(obj.width) &&
                            obj.__autoWidth !== false;

                          if (shouldKeepCenterPreview) {
                            const previewX = calcularXTextoCentrado(obj, textoPreview);
                            if (Number.isFinite(previewX)) {
                              previewObj.x = previewX;
                            }
                          }

                          return previewObj;
                        })()
                        : obj;

                    return (
                      <ElementoCanvas
                        key={obj.id}
                        obj={{
                          ...objPreview,
                          // 🔥 yLocal: en sección pantalla usamos yNorm * 500
                          // fallback legacy: si no hay yNorm, usamos obj.y
                          y: (() => {
                            const idxSec = seccionesOrdenadas.findIndex(s => s.id === objPreview.seccionId);
                            const offsetY = calcularOffsetY(seccionesOrdenadas, idxSec);

                            const yLocal = esSeccionPantallaById(objPreview.seccionId)
                              ? (Number.isFinite(objPreview.yNorm) ? (objPreview.yNorm * ALTURA_PANTALLA_EDITOR) : objPreview.y)
                              : objPreview.y;

                            return yLocal + offsetY;
                          })(),
                        }}
                        anchoCanvas={800}
                        isSelected={!isInEditMode && elementosSeleccionados.includes(obj.id)}
                        preSeleccionado={!isInEditMode && elementosPreSeleccionados.includes(obj.id)}
                        isInEditMode={isInEditMode} // 🔥 NUEVA PROP
                        onHover={isInEditMode ? null : setHoverId}
                        registerRef={registerRef}
                        onStartTextEdit={isInEditMode ? null : (id, texto) => {
                          const node = elementRefs.current[id];
                          const nodeMetrics = obtenerMetricasNodoInline(node);
                          const previousCurrentEditingId = window._currentEditingId ?? null;
                          setInlineOverlayMountedId(null);
                          captureInlineSnapshot("enter: pre-start", {
                            id,
                            previousId: previousCurrentEditingId,
                            textoLength: String(texto ?? "").length,
                          });
                          window._currentEditingId = id;
                          inlineEditPreviewRef.current = { id: null, centerX: null };
                          inlineDebugLog("start-inline-edit", {
                            id,
                            textoLength: String(texto ?? "").length,
                            objectX: obj?.x ?? null,
                            objectY: obj?.y ?? null,
                            previousCurrentEditingId,
                            nextCurrentEditingId: window._currentEditingId,
                            nodeMetrics,
                          });

                          startEdit(id, texto);
                          node?.draggable(false);
                          node?.getLayer?.()?.batchDraw?.();
                          captureInlineSnapshot("enter: after-start-sync", {
                            id,
                            previousId: previousCurrentEditingId,
                            nextCurrentEditingId: window._currentEditingId ?? null,
                          });
                        }}
                        editingId={editing.id}
                        inlineOverlayMountedId={inlineOverlayMountedId}
                        inlineVisibilityMode={inlineDebugAB.visibilitySource}
                        finishInlineEdit={finishEdit}
                        onSelect={isInEditMode ? null : (id, obj, e) => {
                          console.log("🎯 [CANVAS EDITOR] onSelect disparado:", {
                            id,
                            tipo: obj?.tipo,
                            figura: obj?.figura,
                            shiftKey: e?.evt?.shiftKey,
                            seleccionActual: elementosSeleccionados
                          });

                          if (obj.tipo === "rsvp-boton") {
                            console.log("🟣 Click en botón RSVP");
                            return;
                          }

                          if (editing.id && editing.id !== id) {
                            finishEdit();
                          }

                          e?.evt && (e.evt.cancelBubble = true);

                          const esShift = e?.evt?.shiftKey;

                          setElementosSeleccionados((prev) => {

                            if (esShift) {
                              console.log("➕ [CANVAS EDITOR] Modo Shift: agregando/quitando elemento");

                              if (prev.includes(id)) {
                                const nueva = prev.filter((x) => x !== id);
                                console.log("➖ [CANVAS EDITOR] Elemento removido. Nueva selección:", nueva);
                                return nueva;
                              } else {
                                const nueva = [...prev, id];
                                return nueva;
                              }
                            } else {
                              return [id];
                            }
                          });
                        }}


                        onChange={(id, nuevo) => {


                          // 🔥 NUEVO: Manejar preview inmediato de drag grupal
                          if (nuevo.isDragPreview) {

                            setObjetos(prev => {
                              const index = prev.findIndex(o => o.id === id);
                              if (index === -1) return prev;

                              const updated = [...prev];
                              const { isDragPreview, skipHistorial, ...cleanNuevo } = nuevo;
                              updated[index] = { ...updated[index], ...cleanNuevo };
                              return updated;
                            });
                            return;
                          }

                          // 🔥 MANEJAR SOLO batch update final de drag grupal
                          if (nuevo.isBatchUpdateFinal && id === 'BATCH_UPDATE_GROUP_FINAL') {

                            const { elementos, dragInicial, deltaX, deltaY } = nuevo;

                            setObjetos(prev => {
                              return prev.map(objeto => {
                                if (elementos.includes(objeto.id)) {
                                  if (dragInicial && dragInicial[objeto.id]) {
                                    const posInicial = dragInicial[objeto.id];
                                    return {
                                      ...objeto,
                                      x: posInicial.x + deltaX,
                                      y: posInicial.y + deltaY
                                    };
                                  }
                                }
                                return objeto;
                              });
                            });
                            return;
                          }

                          // 🔥 NO procesar si viene del Transform
                          if (nuevo.fromTransform) {

                            return;
                          }

                          const objOriginal = objetos.find((o) => o.id === id);
                          if (!objOriginal) return;

                          // 🔥 Para drag final, procesar inmediatamente
                          if (nuevo.finalizoDrag) {

                            const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                              nuevo.y,
                              objOriginal.seccionId,
                              seccionesOrdenadas
                            );

                            let coordenadasFinales = { ...nuevo };
                            delete coordenadasFinales.finalizoDrag;

                            if (nuevaSeccion) {
                              coordenadasFinales = {
                                ...coordenadasFinales,
                                ...coordenadasAjustadas,
                                seccionId: nuevaSeccion
                              };
                            } else {
                              coordenadasFinales.y = convertirAbsARel(
                                nuevo.y,
                                objOriginal.seccionId,
                                seccionesOrdenadas
                              );
                            }

                            // 1) Determinar sección final
                            const seccionFinalId = coordenadasFinales.seccionId || objOriginal.seccionId;

                            // 2) Obtener yRelPx (y relativa dentro de la sección en px)
                            let yRelPx;

                            if (nuevaSeccion) {
                              // coordenadasAjustadas normalmente ya trae y relativa
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            } else {
                              // si no cambió de sección, convertimos desde y absoluta
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            }

                            // 3) Aplicar política pantalla: guardar yNorm
                            if (esSeccionPantallaById(seccionFinalId)) {
                              const yNorm = Math.max(0, Math.min(1, yRelPx / ALTURA_PANTALLA_EDITOR));
                              coordenadasFinales.yNorm = yNorm;
                              delete coordenadasFinales.y; // ✅ clave: evitamos mezclar sistemas
                            } else {
                              // fijo: guardar y en px
                              coordenadasFinales.y = yRelPx;
                              delete coordenadasFinales.yNorm;
                            }



                            // Actualizar inmediatamente
                            setObjetos(prev => {
                              const index = prev.findIndex(o => o.id === id);
                              if (index === -1) return prev;

                              const updated = [...prev];
                              updated[index] = { ...updated[index], ...coordenadasFinales };
                              return updated;
                            });

                            return;
                          }

                          // 🔥 Para otros cambios (transform, etc.)
                          const hayDiferencias = Object.keys(nuevo).some(key => {
                            const valorAnterior = objOriginal[key];
                            const valorNuevo = nuevo[key];

                            if (typeof valorAnterior === 'number' && typeof valorNuevo === 'number') {
                              return Math.abs(valorAnterior - valorNuevo) > 0.01;
                            }

                            return valorAnterior !== valorNuevo;
                          });

                          if (!hayDiferencias) return;

                          const seccionId = nuevo.seccionId || objOriginal.seccionId;
                          const seccion = seccionesOrdenadas.find((s) => s.id === seccionId);
                          if (!seccion) return;

                          setObjetos(prev => {
                            const index = prev.findIndex(o => o.id === id);
                            if (index === -1) return prev;

                            const updated = [...prev];
                            updated[index] = { ...updated[index], ...nuevo };
                            return updated;
                          });
                        }}
                        onDragStartPersonalizado={isInEditMode ? null : () => setIsDragging(true)}
                        onDragEndPersonalizado={isInEditMode ? null : () => {
                          setIsDragging(false);
                          configurarDragEnd([]);
                        }}
                        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId) => {
                          // 🔥 NO mostrar guías durante drag grupal
                          if (!window._grupoLider) {
                            mostrarGuias(pos, elementId, objetos, elementRefs);
                          }
                          if (elementosSeleccionados.includes(elementId)) {
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === 'function') {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }
                        }}
                        dragStartPos={dragStartPos}
                        hasDragged={hasDragged}
                      />
                    );
                  })}



                  {seleccionActiva && areaSeleccion && (
                    <Rect
                      name="ui"
                      x={areaSeleccion.x}
                      y={areaSeleccion.y}
                      width={areaSeleccion.width}
                      height={areaSeleccion.height}
                      fill="rgba(119, 61, 190, 0.1)" // violeta claro
                      stroke="#773dbe"
                      strokeWidth={1}
                      dash={[4, 4]}
                    />
                  )}


                  {elementosSeleccionados.length > 0 && (() => {
                    // 🔒 Si la selección incluye al menos una galería, no mostramos Transformer
                    const hayGaleriaSeleccionada = elementosSeleccionados.some(id => {
                      const o = objetos.find(x => x.id === id);
                      return o?.tipo === "galeria";
                    });
                    if (hayGaleriaSeleccionada) return null;

                    return (
                      <SelectionBounds
                        selectedElements={elementosSeleccionados}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isDragging={isDragging}
                        onTransform={(newAttrs) => {
                          console.log("🔧 Transform detectado:", newAttrs);

                          if (elementosSeleccionados.length === 1) {
                            const id = elementosSeleccionados[0];
                            const objIndex = objetos.findIndex(o => o.id === id); // 🔥 DEFINIR PRIMERO

                            // 🔥 MOVER EL LOG AQUÍ (después de definir objIndex)
                            if (newAttrs.isFinal) {
                              console.log("🎯 FINAL TRANSFORM:", {
                                originalY: newAttrs.y,
                                elementIndex: objIndex,
                                elementId: elementosSeleccionados[0]
                              });
                            }

                            if (objIndex !== -1) {

                              if (newAttrs.isPreview) {
                                // Preview: actualización sin historial
                                setObjetos(prev => {
                                  const nuevos = [...prev];
                                  const elemento = nuevos[objIndex];
                                  // Countdown: durante preview dejamos que Konva escale el nodo
                                  // sin tocar estado React para evitar desincronización con Transformer.
                                  if (elemento.tipo === "countdown") {
                                    return prev;
                                  }

                                  const updatedElement = {
                                    ...elemento,
                                    // 🔥 NO actualizar X,Y durante preview - solo dimensiones
                                    rotation: newAttrs.rotation || elemento.rotation || 0
                                  };

                                  if (elemento.tipo === 'texto' && newAttrs.fontSize) {
                                    updatedElement.fontSize = newAttrs.fontSize;
                                    updatedElement.scaleX = 1;
                                    updatedElement.scaleY = 1;
                                  } else {
                                    if (newAttrs.width !== undefined) updatedElement.width = newAttrs.width;
                                    if (newAttrs.height !== undefined) updatedElement.height = newAttrs.height;
                                    if (newAttrs.radius !== undefined) updatedElement.radius = newAttrs.radius;
                                    updatedElement.scaleX = 1;
                                    updatedElement.scaleY = 1;
                                  }

                                  nuevos[objIndex] = updatedElement;
                                  return nuevos;
                                });

                                // 🔥 ACTUALIZAR POSICIÓN DEL BOTÓN DURANTE TRANSFORM
                                requestAnimationFrame(() => {
                                  if (typeof actualizarPosicionBotonOpciones === 'function') {
                                    actualizarPosicionBotonOpciones();
                                  }
                                });

                              } else if (newAttrs.isFinal) {
                                // Final: actualización completa
                                console.log('🎯 Guardando estado final para historial');
                                window._resizeData = { isResizing: false };

                                const { isPreview, isFinal, ...cleanAttrs } = newAttrs;

                                // 🔥 CONVERTIR coordenadas absolutas a relativas ANTES de guardar
                                const objOriginal = objetos[objIndex];
                                let finalAttrs = {
                                  ...cleanAttrs,
                                  y: convertirAbsARel(cleanAttrs.y, objOriginal.seccionId, seccionesOrdenadas),
                                  fromTransform: true
                                };

                                // ✅ COUNTDOWN: conservar escala final del drag (sin reconversión a chipWidth)
                                // para que el tamaño final coincida exactamente con lo soltado.
                                if (objOriginal.tipo === "countdown") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    scaleX: Number.isFinite(cleanAttrs.scaleX) ? cleanAttrs.scaleX : (objOriginal.scaleX ?? 1),
                                    scaleY: Number.isFinite(cleanAttrs.scaleY) ? cleanAttrs.scaleY : (objOriginal.scaleY ?? 1),
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                }

                                // ✅ offsetY solo para debug (evita ReferenceError)
                                let offsetY = 0;
                                try {
                                  const idx = seccionesOrdenadas.findIndex(s => s.id === objOriginal.seccionId);
                                  const safe = idx >= 0 ? idx : 0;
                                  // Nota: en tu código lo llamás a veces con 2 params, a veces con 3.
                                  // Acá usamos 3, consistente con otras partes del archivo.
                                  offsetY = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
                                } catch {
                                  offsetY = 0;
                                }

                                console.log("🔧 Convirtiendo coordenadas:", {
                                  yAbsoluta: cleanAttrs.y,
                                  offsetY,
                                  yRelativa: finalAttrs.y
                                });

                                if (objOriginal.tipo === "countdown") {
                                  actualizarObjeto(objIndex, finalAttrs);
                                } else {
                                  requestAnimationFrame(() => {
                                    actualizarObjeto(objIndex, finalAttrs);
                                  });
                                }

                              }
                            }
                          }
                        }}
                      />
                    );
                  })()}


                  {/* No mostrar hover durante drag/resize/edición NI cuando hay líder de grupo */}
                  {!window._resizeData?.isResizing && !isDragging && !window._grupoLider && !editing.id && (
                    <HoverIndicator hoveredElement={hoverId} elementRefs={elementRefs} />
                  )}



                  {/* 🎯 Controles especiales para líneas seleccionadas */}
                  {elementosSeleccionados.length === 1 && (() => {
                    const elementoSeleccionado = objetos.find(obj => obj.id === elementosSeleccionados[0]);
                    if (elementoSeleccionado?.tipo === 'forma' && elementoSeleccionado?.figura === 'line') {
                      return (
                        <LineControls
                          name="ui"
                          key={`line-controls-${elementoSeleccionado.id}-${JSON.stringify(elementoSeleccionado.points)}`}
                          lineElement={elementoSeleccionado}
                          elementRefs={elementRefs}
                          onUpdateLine={actualizarLinea}
                          altoCanvas={altoCanvasDinamico}
                          // 🔥 NUEVA PROP: Pasar información sobre drag grupal
                          isDragGrupalActive={window._grupoLider !== null}
                          elementosSeleccionados={elementosSeleccionados}
                        />
                      );
                    }
                    return null;
                  })()}





                  {/* Líneas de guía dinámicas mejoradas */}
                  {guiaLineas.map((linea, i) => {
                    // Determinar el estilo visual según el tipo
                    const esLineaSeccion = linea.priority === 'seccion';

                    return (
                      <Line
                        name="ui"
                        key={`${linea.type}-${i}`}
                        points={linea.points}
                        stroke={esLineaSeccion ? "#773dbe" : "#9333ea"} // Violeta más intenso para sección
                        strokeWidth={esLineaSeccion ? 2 : 1} // Líneas de sección más gruesas
                        dash={linea.style === 'dashed' ? [8, 6] : undefined} // Punteado para elementos
                        opacity={esLineaSeccion ? 0.9 : 0.7} // Líneas de sección más opacas
                        listening={false}
                        perfectDrawEnabled={false}
                        // Efecto sutil de resplandor para líneas de sección
                        shadowColor={esLineaSeccion ? "rgba(119, 61, 190, 0.3)" : undefined}
                        shadowBlur={esLineaSeccion ? 4 : 0}
                        shadowEnabled={esLineaSeccion}
                      />
                    );
                  })}


                </CanvasElementsLayer>

                {/* ✅ Overlay superior: borde de sección activa SIEMPRE arriba de todo */}
                <CanvasElementsLayer>
                  {(() => {
                    if (!seccionActivaId) return null;

                    const index = seccionesOrdenadas.findIndex(s => s.id === seccionActivaId);
                    if (index === -1) return null;

                    const seccion = seccionesOrdenadas[index];
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const estaAnimando = seccionesAnimando.includes(seccion.id);

                    return (
                      <Rect
                        key={`overlay-border-seccion-${seccion.id}`}
                        x={0}
                        y={offsetY}
                        width={800}
                        height={seccion.altura}
                        fill="transparent"
                        stroke="#773dbe"
                        strokeWidth={estaAnimando ? 4 : 3}
                        cornerRadius={0}
                        shadowColor={estaAnimando ? "rgba(119, 61, 190, 0.4)" : "rgba(119, 61, 190, 0.25)"}
                        shadowBlur={estaAnimando ? 16 : 12}
                        shadowOffset={{ x: 0, y: estaAnimando ? 4 : 3 }}
                        listening={false}
                      />
                    );
                  })()}
                </CanvasElementsLayer>

              </Stage>


            </div>

            {editing.id && elementRefs.current[editing.id] && (() => {
              const objetoEnEdicion = objetos.find(o => o.id === editing.id);

              return (
                <InlineTextEditor
                  editingId={editing.id}
                  node={elementRefs.current[editing.id]}
                  value={editing.value}
                  textAlign={objetoEnEdicion?.align || 'left'} // 🆕 Solo pasar alineación
                  onOverlayMountChange={handleInlineOverlayMountChange}
                  onChange={(nextValue) => {
                    const nextText = String(nextValue ?? "");
                    const prevStats = getInlineLineStats(editing.value);
                    const nextStats = getInlineLineStats(nextText);
                    if (
                      prevStats.lineCount !== nextStats.lineCount ||
                      prevStats.trailingNewlines !== nextStats.trailingNewlines
                    ) {
                      inlineDebugLog("linebreak-model-sync", {
                        id: editing.id || window._currentEditingId || null,
                        prevLength: prevStats.length,
                        nextLength: nextStats.length,
                        prevLineCount: prevStats.lineCount,
                        nextLineCount: nextStats.lineCount,
                        prevTrailingNewlines: prevStats.trailingNewlines,
                        nextTrailingNewlines: nextStats.trailingNewlines,
                      });
                    }
                    captureInlineSnapshot("input: before-render", {
                      id: editing.id || window._currentEditingId || null,
                      valueLength: nextText.length,
                    });
                    updateEdit(nextValue);
                  }}
                  onDebugEvent={(eventName, payload = {}) => {
                    captureInlineSnapshot(eventName, {
                      id: payload?.id || editing.id || null,
                      ...payload,
                    });
                  }}
                  onFinish={() => {
                    const finishId = editing.id;
                    captureInlineSnapshot("finish: blur", {
                      id: finishId,
                      valueLength: String(editing.value ?? "").length,
                    });
                    const textoNuevoRaw = String(editing.value ?? "");
                    const textoNuevoValidado = textoNuevoRaw.trim();
                    const index = objetos.findIndex(o => o.id === finishId);
                    const objeto = objetos[index];
                    const liveNodeAtFinish = elementRefs.current[finishId];
                    const liveMetricsAtFinish = obtenerMetricasNodoInline(liveNodeAtFinish);

                    inlineDebugLog("finish-start", {
                      id: finishId,
                      rawLength: textoNuevoRaw.length,
                      trimmedLength: textoNuevoValidado.length,
                      objectX: objeto?.x ?? null,
                      objectY: objeto?.y ?? null,
                      previewRef: { ...inlineEditPreviewRef.current },
                      liveMetricsAtFinish,
                    });

                    if (index === -1) {
                      console.warn("❌ El objeto ya no existe. Cancelando guardado.");
                      inlineDebugLog("finish-abort-missing-object", { id: finishId });
                      inlineCommitDebugRef.current = { id: null };
                      finishEdit();
                      return;
                    }

                    // ⚠️ Podés permitir texto vacío en formas si querés (yo lo permitiría)
                    if (textoNuevoValidado === "" && objeto.tipo === "texto") {
                      console.warn("⚠️ El texto está vacío. No se actualiza.");
                      inlineDebugLog("finish-abort-empty", {
                        id: finishId,
                        rawLength: textoNuevoRaw.length,
                        trimmedLength: textoNuevoValidado.length,
                      });
                      inlineCommitDebugRef.current = { id: null };
                      inlineEditPreviewRef.current = { id: null, centerX: null };
                      finishEdit();
                      return;
                    }

                    const actualizado = [...objetos];
                    const patch = { texto: textoNuevoRaw };

                    const shouldKeepCenterX =
                      objeto.tipo === "texto" &&
                      !objeto.__groupAlign &&
                      !Number.isFinite(objeto.width) &&
                      objeto.__autoWidth !== false;

                    if (shouldKeepCenterX) {
                      const nextX = calcularXTextoCentrado(objeto, textoNuevoRaw);
                      const currentX = Number.isFinite(objeto.x) ? objeto.x : 0;
                      if (Number.isFinite(nextX) && Math.abs(nextX - currentX) > 0.01) {
                        patch.x = nextX;
                      }

                      inlineDebugLog("finish-center-computed", {
                        id: finishId,
                        shouldKeepCenterX,
                        currentX,
                        nextX,
                        patchX: patch.x ?? null,
                      });
                    }

                    actualizado[index] = {
                      ...actualizado[index],
                      ...patch
                    };

                    const expectedX = Number.isFinite(patch.x)
                      ? patch.x
                      : (Number.isFinite(objeto.x) ? objeto.x : null);
                    inlineCommitDebugRef.current = {
                      id: finishId,
                      expectedX,
                      objectXBeforeCommit: Number.isFinite(objeto.x) ? objeto.x : null,
                      liveNodeXAtFinish: Number.isFinite(liveMetricsAtFinish?.x)
                        ? liveMetricsAtFinish.x
                        : null,
                      previewCenterX: null,
                      textLength: textoNuevoRaw.length,
                    };

                    inlineDebugLog("finish-apply-patch", {
                      id: finishId,
                      patch,
                      expectedX,
                    });
                    const logFinishVisibilityCheck = (phase) => {
                      const safeId = String(finishId || "").replace(/"/g, '\\"');
                      const overlayDomPresent = safeId
                        ? Boolean(document.querySelector(`[data-inline-editor-id="${safeId}"]`))
                        : false;
                      const liveNode = elementRefs.current[finishId];
                      inlineDebugLog("finish-visibility-check", {
                        phase,
                        id: finishId,
                        reactiveEditingId: editing.id || null,
                        globalEditingId: window.editing?.id ?? null,
                        currentEditingId: window._currentEditingId ?? null,
                        overlayMountedId: inlineOverlayMountedId ?? null,
                        overlayDomPresent,
                        nodeOpacity:
                          typeof liveNode?.opacity === "function"
                            ? liveNode.opacity()
                            : null,
                        nodeVisible:
                          typeof liveNode?.visible === "function"
                            ? liveNode.visible()
                            : null,
                        nodeMetrics: obtenerMetricasNodoInline(liveNode),
                      });
                    };
                    logFinishVisibilityCheck("before-commit");

                    captureInlineSnapshot("finish: before-flush", {
                      id: finishId,
                      expectedX,
                      patchX: patch.x ?? null,
                    });
                    flushSync(() => {
                      setObjetos(actualizado);
                    });
                    captureInlineSnapshot("finish: after-flush", {
                      id: finishId,
                      expectedX,
                      patchX: patch.x ?? null,
                    });
                    logFinishVisibilityCheck("after-commit-before-finishEdit");
                    inlineEditPreviewRef.current = { id: null, centerX: null };
                    flushSync(() => {
                      finishEdit();
                    });
                    const stageAfterFinishEdit =
                      stageRef.current?.getStage?.() || stageRef.current || null;
                    if (typeof stageAfterFinishEdit?.batchDraw === "function") {
                      stageAfterFinishEdit.batchDraw();
                    }
                    logFinishVisibilityCheck("after-finishEdit-sync");
                    if (window._currentEditingId === finishId) {
                      window._currentEditingId = null;
                    }
                    captureInlineSnapshot("finish: after-finishEdit", {
                      id: finishId,
                      expectedX,
                      patchX: patch.x ?? null,
                    });
                    requestAnimationFrame(() => {
                      logFinishVisibilityCheck("after-finishEdit-raf1");
                      captureInlineSnapshot("finish: raf1", {
                        id: finishId,
                        expectedX,
                        patchX: patch.x ?? null,
                      });
                      requestAnimationFrame(() => {
                        captureInlineSnapshot("finish: raf2", {
                          id: finishId,
                          expectedX,
                          patchX: patch.x ?? null,
                        });
                      });
                    });
                  }}
                  scaleVisual={escalaVisual}
                  finishMode={inlineDebugAB.finishMode}
                  widthMode={inlineDebugAB.overlayWidthMode}

                />
              );
            })()}


            {/* 🔥 STAGE ADICIONAL SOLO PARA LÍNEAS DIVISORIAS */}
            <DividersOverlayStage
              zoom={zoom}
              altoCanvasDinamico={altoCanvasDinamico}
              seccionesOrdenadas={seccionesOrdenadas}
            />


          </div>


        </div>


      </div>



      {/* ✅ Botón de opciones PEGADO a la esquina superior derecha del elemento */}
      {elementosSeleccionados.length === 1 && !editing.id && (() => {
        const elementoSeleccionado = objetos.find(o => o.id === elementosSeleccionados[0]);
        const nodeRef = elementRefs.current[elementosSeleccionados[0]];

        if (!nodeRef || !elementoSeleccionado) return null;

        const contenedor = contenedorRef.current;
        const stage = stageRef.current;
        if (!contenedor || !stage) return null;

        // 🔥 OBTENER POSICIÓN REAL DEL ELEMENTO EN EL STAGE
        const box = nodeRef.getClientRect();

        // 🔥 OBTENER COORDENADAS DEL STAGE RELATIVAS AL VIEWPORT
        const stageContainer = stage.container();
        const stageRect = stageContainer.getBoundingClientRect();

        // 🔥 CALCULAR POSICIÓN EXACTA DEL ELEMENTO EN PANTALLA
        const elementoEnPantallaX = stageRect.left + (box.x * escalaActiva);
        const elementoEnPantallaY = stageRect.top + (box.y * escalaActiva);
        const anchoElemento = box.width * escalaActiva;

        // 🎯 POSICIÓN MUY CERCA: Esquina superior derecha pegada al elemento
        const botonX = elementoEnPantallaX + anchoElemento - 8; // Solo -8px para que se superponga un poco
        const botonY = elementoEnPantallaY - 8; // -8px arriba del elemento

        return (
          <div
            ref={botonOpcionesRef}
            className="fixed z-50 bg-white border-2 border-purple-500 rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200"
            style={{
              left: "0px", // 🔥 POSICIÓN INICIAL - será actualizada por la función
              top: "0px",
              width: "24px",
              height: "24px",
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
              transition: "none",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(4px)",
              border: "2px solid #773dbe",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMostrarPanelZ((prev) => !prev);
              }}
              className="hover:bg-purple-50 w-full h-full rounded-full flex items-center justify-center transition-colors text-xs"
              title="Opciones del elemento"
            >
              ⚙️
            </button>
          </div>
        );
      })()}



      {mostrarPanelZ && (
        <MenuOpcionesElemento
          isOpen={mostrarPanelZ}
          botonOpcionesRef={botonOpcionesRef}
          elementoSeleccionado={objetos.find(o => o.id === elementosSeleccionados[0])}
          onCopiar={onCopiar}
          onPegar={onPegar}
          onDuplicar={onDuplicar}
          onEliminar={onEliminar}
          moverElemento={moverElemento}
          onCerrar={() => setMostrarPanelZ(false)}
          reemplazarFondo={reemplazarFondo}
          secciones={secciones}
          objetos={objetos}
          setSecciones={setSecciones}
          setObjetos={setObjetos}
          setElementosSeleccionados={setElementosSeleccionados}
        />
      )}


      <FloatingTextToolbar
        objetoSeleccionado={objetoSeleccionado}
        setObjetos={setObjetos}
        elementosSeleccionados={elementosSeleccionados}
        mostrarSelectorFuente={mostrarSelectorFuente}
        setMostrarSelectorFuente={setMostrarSelectorFuente}
        mostrarSelectorTamaño={mostrarSelectorTamaño}
        setMostrarSelectorTamaño={setMostrarSelectorTamaño}
        ALL_FONTS={ALL_FONTS}
        fontManager={fontManager}
        tamaniosDisponibles={tamaniosDisponibles}
        onCambiarAlineacion={onCambiarAlineacion}
      />



    </div>
  );

}
