// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
import { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } from "@/utils/layout";
import { crearSeccion } from "@/models/estructuraInicial";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { useImperativeObjects } from '@/hooks/useImperativeObjects';
import SelectionBounds from './SelectionBounds';
import HoverIndicator from './HoverIndicator';
import LineToolbar from "./LineToolbar";
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
import { validarPuntosLinea } from "./editor/selection/selectionUtils";
import { guardarSeccionComoPlantilla } from "@/utils/plantillas";
import useGuiasCentrado from '@/hooks/useGuiasCentrado';
import Konva from "konva";
import { ALL_FONTS } from '../config/fonts';
import useTemplateFieldAuthoring from "@/components/editor/templateAuthoring/useTemplateFieldAuthoring";
import useBorradorSync from "./editor/persistence/useBorradorSync";
import useSectionsManager from "./editor/sections/useSectionsManager";
import useEditorEvents from "./editor/events/useEditorEvents";
import useEditorWindowBridge from "./editor/window/useEditorWindowBridge";
import useHistoryManager from "./editor/history/useHistoryManager";
import useCanvasScaleLayout from "@/components/editor/mobile/useCanvasScaleLayout";
import useCanvasInteractionState from "@/components/editor/mobile/useCanvasInteractionState";
import useStageGestures from "./editor/mobile/useStageGestures";
import useOptionButtonPosition from "@/components/editor/overlays/useOptionButtonPosition";
import {
  resolveInlineStageViewportMetrics as resolveInlineStageViewportMetricsShared,
} from "@/components/editor/overlays/inlineGeometry";
import {
  normalizeInlineEditableText as normalizeInlineEditableTextShared,
} from "@/components/editor/overlays/inlineTextModel";
import DividersOverlayStage from "@/components/canvas/DividersOverlayStage";
import SectionActionsOverlay from "@/components/editor/canvasEditor/SectionActionsOverlay";
import CanvasStageContent from "@/components/editor/canvasEditor/CanvasStageContent";
import {
  ALTURA_REFERENCIA_PANTALLA,
  ALTURA_PANTALLA_EDITOR,
  normalizarAltoModo,
  resolveKonvaFontStyle,
  limpiarObjetoUndefined,
  setGlobalCursor,
  clearGlobalCursor,
} from "@/components/editor/canvasEditor/canvasEditorCoreUtils";
import {
  isInlineDebugEnabled,
  isInlineMicroMoveDebugEnabled,
  formatInlineLogPayload,
  inlineDebugLog,
  nextInlineFrameMeta,
  roundInlineMetric,
  rectToInlinePayload,
  computeInlineRectDelta,
  isInlineRectEmpty,
  pickInlinePrimaryRect,
  collectInlineTextNodes,
  getInlineTextNodeLength,
  clampInlineRangeOffset,
  computeInlineGlobalTextOffset,
  resolveInlineCaretTextPosition,
  measureInlineRangeRects,
  buildInlineCaretFallbackRange,
  getInlineEdgeCharTarget,
  getInlineInkCharMetrics,
  buildInlineInkCenterRect,
  getInlineLineBoxRect,
  resolveInlineKonvaTextNode,
  getInlineKonvaProjectedRectViewport,
  getInlineSelectionCaretMetrics,
  getInlineLineStats,
  normalizeInlineDebugAB,
} from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";
import {
  applyObjectUpdateAtIndex,
  applyObjectUpdateById,
  normalizarMedidasGaleria as normalizarMedidasGaleriaUtil,
  applyLineUpdate,
} from "@/components/editor/canvasEditor/objectUpdateUtils";
import { createTextLayoutUtils } from "@/components/editor/canvasEditor/textLayoutUtils";
import useCanvasEditorStartupStatus from "@/components/editor/canvasEditor/useCanvasEditorStartupStatus";
import useCanvasEditorStageInteraction from "@/components/editor/canvasEditor/useCanvasEditorStageInteraction";
import useCanvasEditorFontPreload from "@/components/editor/canvasEditor/useCanvasEditorFontPreload";
import useCanvasEditorGlobalsBridge from "@/components/editor/canvasEditor/useCanvasEditorGlobalsBridge";
import { createLineIntersectionDetector } from "@/components/editor/canvasEditor/lineIntersectionUtils";
import CanvasEditorOverlays from "@/components/editor/canvasEditor/CanvasEditorOverlays";
import useCanvasEditorRsvpBridge from "@/components/editor/canvasEditor/useCanvasEditorRsvpBridge";
import useCanvasEditorSectionUiSync from "@/components/editor/canvasEditor/useCanvasEditorSectionUiSync";
import useCanvasEditorExternalCallbacks from "@/components/editor/canvasEditor/useCanvasEditorExternalCallbacks";
import useCanvasEditorOptionPanelOutsideClose from "@/components/editor/canvasEditor/useCanvasEditorOptionPanelOutsideClose";



Konva.dragDistance = 8;

function resolveKonvaPixelRatio() {
  if (typeof window === "undefined") return 1;

  const dpr = Number(window.devicePixelRatio || 1);
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const minSide = Math.min(Number(window.innerWidth || 0), Number(window.innerHeight || 0));
  const mobileLike = coarsePointer || (minSide > 0 && minSide <= 1024);

  if (mobileLike) return 1;
  return Math.min(dpr, 2);
}

Konva.pixelRatio = resolveKonvaPixelRatio();

export default function CanvasEditor({
  slug,
  zoom = 1,
  onHistorialChange,
  onFuturosChange,
  userId,
  onStartupStatusChange,
  canManageSite = false,
}) {
  const [objetos, setObjetos] = useState([]);
  const [celdaGaleriaActiva, setCeldaGaleriaActiva] = useState(null);
  const [secciones, setSecciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
  const [elementosSeleccionados, setElementosSeleccionados] = useState([]);
  const [cargado, setCargado] = useState(false);
  const stageRef = useRef(null);
  const { dragStartPos, hasDragged, isDragging, setIsDragging } = useCanvasInteractionState();
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
  const inlineSnapshotHistoryRef = useRef({});
  const inlineVisibilitySnapshotRef = useRef({});
  const inlineKonvaDrawMetaRef = useRef({ seq: 0, nowMs: null, source: null });
  const inlinePaintApproxRef = useRef({ lastPaintApproxMs: null, pending: false });
  const logInlineSnapshotRef = useRef(null);
  const pendingInlineStartRef = useRef(0);
  const prevEditingIdRef = useRef(null);
  const inlineRenderValueRef = useRef({ id: null, value: "" });
  const [inlineOverlayMountedId, setInlineOverlayMountedId] = useState(null);
  const inlineSwapAckSeqRef = useRef(0);
  const [inlineSwapAck, setInlineSwapAck] = useState({
    id: null,
    sessionId: null,
    phase: null,
    token: 0,
    offsetY: 0,
  });
  const contenedorRef = useRef(null);
  const editorOverlayRootRef = useRef(null);
  const autoSectionViewportRef = useRef(null);
  const autoSectionScrollRafRef = useRef(0);
  const followMoveScrollRafRef = useRef(0);
  const seccionesAnimandoActivasRef = useRef(false);
  const bloqueoAutoSeleccionSeccionRef = useRef(0);
  const ultimaSeccionMovidaRef = useRef(null);
  const previoAnimandoSeccionesRef = useRef(false);
  const seccionActivaIdRef = useRef(null);
  const ignoreNextUpdateRef = useRef(0);
  const [anchoStage, setAnchoStage] = useState(800);
  const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
  const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
  const fuentesDisponibles = ALL_FONTS;
  const [draftMeta, setDraftMeta] = useState({
    plantillaId: null,
    templateAuthoringDraft: null,
    loadedAt: 0,
  });
  const [mobileBackgroundEditSectionId, setMobileBackgroundEditSectionId] = useState(null);
  const [deleteSectionModal, setDeleteSectionModal] = useState({ isOpen: false, sectionId: null });
  const [isDeletingSection, setIsDeletingSection] = useState(false);
  const [mobileSectionActionsOpen, setMobileSectionActionsOpen] = useState(false);
  const [rsvpConfig, setRsvpConfig] = useState(null);
  const supportsPointerEvents =
    typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";

  useEffect(() => {
    setDraftMeta({
      plantillaId: null,
      templateAuthoringDraft: null,
      loadedAt: 0,
    });
  }, [slug]);

  const isTextResizeDebugEnabled = () =>
    typeof window !== "undefined" && Boolean(window.__DBG_TEXT_RESIZE);

  const textResizeDebug = (...args) => {
    if (!isTextResizeDebugEnabled()) return;
    console.log("[TEXT-COMMIT]", ...args);
  };

  const restoreElementDrag = useCallback((elementId) => {
    if (!elementId) return;
    const node = elementRefs.current?.[elementId];
    if (!node || typeof node.draggable !== "function") return;
    try {
      node.draggable(true);
    } catch {}
    try {
      node.getLayer?.()?.batchDraw?.();
    } catch {}
  }, []);

  const { abrirPanelRsvp } = useCanvasEditorRsvpBridge({
    rsvpConfig,
    setRsvpConfig,
  });




  useBorradorSync({
    slug,
    userId,

    objetos,
    secciones,
    rsvp: rsvpConfig,
    cargado,

    setObjetos,
    setSecciones,
    setRsvp: setRsvpConfig,
    setCargado,
    setSeccionActivaId,
    onDraftLoaded: (meta) => {
      const safeMeta = meta && typeof meta === "object" ? meta : {};
      setDraftMeta({
        plantillaId:
          typeof safeMeta.plantillaId === "string" ? safeMeta.plantillaId : null,
        templateAuthoringDraft:
          safeMeta.templateAuthoringDraft &&
          typeof safeMeta.templateAuthoringDraft === "object"
            ? safeMeta.templateAuthoringDraft
            : null,
        loadedAt: Number(safeMeta.loadedAt || Date.now()),
      });
    },

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
    rsvpConfig,
    setRsvpConfig,
    onRequestRsvpSetup: abrirPanelRsvp,

    normalizarAltoModo,
    ALTURA_PANTALLA_EDITOR,

    nuevoTextoRef,
  });

  const seccionesOrdenadas = useMemo(
    () => [...secciones].sort((a, b) => a.orden - b.orden),
    [secciones]
  );
  const { handleBackgroundImageStatusChange } = useCanvasEditorStartupStatus({
    slug,
    secciones,
    seccionesOrdenadas,
    cargado,
    onStartupStatusChange,
  });

  const seccionPendienteEliminar = useMemo(
    () => secciones.find((seccion) => seccion.id === deleteSectionModal.sectionId) || null,
    [secciones, deleteSectionModal.sectionId]
  );

  const cantidadElementosSeccionPendiente = useMemo(() => {
    if (!seccionPendienteEliminar?.id) return 0;
    return objetos.filter((obj) => obj.seccionId === seccionPendienteEliminar.id).length;
  }, [objetos, seccionPendienteEliminar]);

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
    setMostrarSelectorTamano(false);
    setHoverId(null);
  }, []);

  // ???Elemento actualmente seleccionado (o null)
  const objetoSeleccionado =
    elementosSeleccionados.length === 1
      ? objetos.find(o => o.id === elementosSeleccionados[0])
      : null;

  const templateAuthoring = useTemplateFieldAuthoring({
    enabled: canManageSite,
    slug,
    userId,
    objetos,
    selectedElement: objetoSeleccionado,
    draftMeta,
  });
  const templateAuthoringStatus = templateAuthoring.status || { isReady: true, issues: [] };
  const templateAuthoringIssues = Array.isArray(templateAuthoringStatus.issues)
    ? templateAuthoringStatus.issues
    : [];
  const templateAuthoringIssueCount = templateAuthoringIssues.length;
  const canRenderTemplateAuthoringMenu =
    canManageSite &&
    templateAuthoring.selectedIsSupportedElement;
  const templateAuthoringStatusLabel = !templateAuthoring.canConfigure
    ? "Schema deshabilitado"
    : templateAuthoringStatus.isReady
      ? "Listo para publicar"
      : `No listo para publicar (${templateAuthoringIssueCount})`;
  const templateAuthoringStatusClass = !templateAuthoring.canConfigure
    ? "border-slate-300 bg-slate-100 text-slate-700"
    : templateAuthoringStatus.isReady
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-300 bg-amber-50 text-amber-700";

  const handleViewTemplateFieldUsage = useCallback(
    (fieldKey) => {
      const usage = templateAuthoring.getFieldUsage(fieldKey);
      if (!usage.length) {
        alert(`El campo '${fieldKey}' no tiene targets activos.`);
        return;
      }
      alert(`Campo '${fieldKey}' usado en ${usage.length} elemento(s):\n- ${usage.join("\n- ")}`);
    },
    [templateAuthoring]
  );

  const [mostrarSelectorTamano, setMostrarSelectorTamano] = useState(false);
  const tamaniosDisponibles = Array.from({ length: (260 - 6) / 2 + 1 }, (_, i) => 6 + i * 2);
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

    // ? Debounce por frame para evitar rÃ¡fagas de re-attach del Transformer
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

  const {
    isMobile,
    isMobilePortrait,
    scale,
    anchoContenedor,
    escalaActiva,
    escalaVisual,
    wrapperBaseWidth,
    escalaFitMobilePortrait,
  } = useCanvasScaleLayout({
    contenedorRef,
    zoom,
  });

  const mobileTypographyToolbarVisible = isMobile && Boolean(
    objetoSeleccionado &&
    (
      objetoSeleccionado.tipo === "texto" ||
      (
        objetoSeleccionado.tipo === "forma" &&
        objetoSeleccionado.figura === "rect" &&
        typeof objetoSeleccionado.texto === "string"
      )
    )
  );

  const mobileTextToolbarVisible =
    mobileTypographyToolbarVisible ||
    (isMobile && objetoSeleccionado?.tipo === "icono");

  const mobileFontStripVisible =
    mobileTypographyToolbarVisible && mostrarSelectorFuente;
  const mobileSizeStripVisible =
    mobileTypographyToolbarVisible && mostrarSelectorTamano;
  const mobileBottomTypographyStripVisible =
    mobileFontStripVisible || mobileSizeStripVisible;
  const optionButtonSize = isMobile ? 38 : 24;

  useEffect(() => {
    const desiredRatio = isMobile ? 1 : resolveKonvaPixelRatio();
    if (Konva.pixelRatio !== desiredRatio) {
      Konva.pixelRatio = desiredRatio;
      stageRef.current?.getStage?.()?.batchDraw?.();
    }
  }, [isMobile]);

  const inlineDebugAB = useMemo(() => {
    if (typeof window === "undefined") {
      return normalizeInlineDebugAB(null);
    }
    const normalized = normalizeInlineDebugAB(window.__INLINE_AB);
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const queryEngine = params.get("inlineOverlayEngine");
      const hasPhaseAtomicFlag =
        params.has("phase_atomic_v2") ||
        params.get("phase_atomic_v2") === "1" ||
        window.__INLINE_OVERLAY_ENGINE === "phase_atomic_v2";
      if (queryEngine === "phase_atomic_v2" || hasPhaseAtomicFlag) {
        return {
          ...normalized,
          overlayEngine: "phase_atomic_v2",
        };
      }
    } catch {
      // no-op
    }
    return normalized;
  }, [editing.id, editing.value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const queryEngine = params.get("inlineOverlayEngine");
      const hasPhaseAtomicFlag =
        queryEngine === "phase_atomic_v2" ||
        params.has("phase_atomic_v2") ||
        params.get("phase_atomic_v2") === "1";
      if (!hasPhaseAtomicFlag) return;
      window.__INLINE_OVERLAY_ENGINE = "phase_atomic_v2";
      window.__INLINE_AB = {
        ...(window.__INLINE_AB && typeof window.__INLINE_AB === "object"
          ? window.__INLINE_AB
          : {}),
        overlayEngine: "phase_atomic_v2",
      };
    } catch {
      // no-op
    }
  }, [editing.id, editing.value]);

  useEffect(() => {
    if (!isMobile && mobileSectionActionsOpen) {
      setMobileSectionActionsOpen(false);
    }
  }, [isMobile, mobileSectionActionsOpen]);

  useEffect(() => {
    seccionesAnimandoActivasRef.current = seccionesAnimando.length > 0;
  }, [seccionesAnimando]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && followMoveScrollRafRef.current) {
        window.cancelAnimationFrame(followMoveScrollRafRef.current);
        followMoveScrollRafRef.current = 0;
      }
    };
  }, []);

  const ensureInlineFontReady = useCallback(async (fontFamily) => {
    const normalizedFont = fontManager.normalizeFontName(fontFamily);
    if (!normalizedFont) {
      return {
        waited: false,
        ready: true,
        fontName: null,
        loadedCount: null,
        failedCount: null,
      };
    }

    if (fontManager.isFontAvailable(normalizedFont)) {
      return {
        waited: false,
        ready: true,
        fontName: normalizedFont,
        loadedCount: null,
        failedCount: null,
      };
    }

    let loadSummary = null;
    try {
      loadSummary = await fontManager.loadFonts([normalizedFont], { timeoutMs: 700 });
    } catch {
      // no-op
    }

    if (typeof document !== "undefined" && document.fonts?.load) {
      try {
        await Promise.race([
          document.fonts.load(`16px "${normalizedFont}"`),
          new Promise((resolve) => setTimeout(resolve, 200)),
        ]);
      } catch {
        // no-op
      }
    }

    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    return {
      waited: true,
      ready: fontManager.isFontAvailable(normalizedFont),
      fontName: normalizedFont,
      loadedCount: loadSummary?.loaded?.length ?? null,
      failedCount: loadSummary?.failed?.length ?? null,
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    setMobileSectionActionsOpen(false);
  }, [seccionActivaId, isMobile]);

  const markInlineKonvaDraw = useCallback((source = "unknown") => {
    const nowMs =
      typeof window !== "undefined" && typeof window.performance?.now === "function"
        ? roundInlineMetric(Number(window.performance.now()), 3)
        : null;
    const prevSeq = Number(inlineKonvaDrawMetaRef.current?.seq || 0);
    inlineKonvaDrawMetaRef.current = {
      seq: prevSeq + 1,
      nowMs,
      source,
    };
  }, []);

  const applyInlineOverlayMountState = useCallback((id, mounted, meta = {}) => {
    const safeId = id || null;
    if (!safeId) return;

    if (mounted) {
      logInlineSnapshotRef.current?.("konva-hide-before-applied", {
        id: safeId,
        hideCanvasTextWhenEditing: true,
        hideApplied: false,
        ...meta,
      });
    }

    const nodeForHandoff = elementRefs.current[safeId] || null;
    if (mounted) {
      logInlineSnapshotRef.current?.("konva: before-hide", {
        id: safeId,
        eventLoopPhase: "sync",
        ...meta,
      });
    }
    if (nodeForHandoff && typeof nodeForHandoff.opacity === "function") {
      nodeForHandoff.opacity(mounted ? 0 : 1);
      const layer = nodeForHandoff.getLayer?.() || null;
      if (typeof layer?.batchDraw === "function") {
        layer.batchDraw();
        markInlineKonvaDraw("layer.batchDraw");
      } else {
        const stage = stageRef.current?.getStage?.() || stageRef.current || null;
        if (typeof stage?.batchDraw === "function") {
          stage.batchDraw();
          markInlineKonvaDraw("stage.batchDraw");
        }
      }
      if (mounted) {
        logInlineSnapshotRef.current?.("konva: after-hide-sync", {
          id: safeId,
          eventLoopPhase: "sync",
          ...meta,
        });
        requestAnimationFrame((rafStamp) => {
          logInlineSnapshotRef.current?.("konva: after-hide-raf1", {
            id: safeId,
            eventLoopPhase: "raf",
            rafStamp: roundInlineMetric(Number(rafStamp), 3),
            ...meta,
          });
        });
      }
      if (mounted) {
        logInlineSnapshotRef.current?.("konva-hide-applied", {
          id: safeId,
          hideCanvasTextWhenEditing: true,
          hideApplied: true,
          ...meta,
        });
      }
    }

    setInlineOverlayMountedId((previous) => {
      const next = mounted ? safeId : (previous === safeId ? null : previous);
      const node = elementRefs.current[safeId] || null;
      const nodeVisibility = node
        ? {
            opacity:
              typeof node.opacity === "function" ? node.opacity() : null,
            visible:
              typeof node.visible === "function" ? node.visible() : null,
          }
        : null;
      const safeDomId = String(safeId).replace(/"/g, '\\"');
      const overlayDomPresent = safeDomId
        ? Boolean(document.querySelector(`[data-inline-editor-id="${safeDomId}"]`))
        : false;
      inlineDebugLog("overlay-mounted-state", {
        id: safeId,
        mounted,
        previousOverlayMountedId: previous,
        nextOverlayMountedId: next,
        overlayDomPresent,
        nodeVisibility,
        ...meta,
      });
      if (mounted) {
        logInlineSnapshotRef.current?.("overlay-visible-applied", {
          id: safeId,
          overlayMounted: next === safeId,
          overlayDomPresent,
          ...meta,
        });
      }
      return next;
    });
  }, [markInlineKonvaDraw]);

  const handleInlineOverlayMountChange = useCallback((id, mounted) => {
    if (inlineDebugAB.overlayEngine === "phase_atomic_v2") return;
    applyInlineOverlayMountState(id, mounted, {
      engine: "legacy",
      phase: mounted ? "active" : "done",
    });
  }, [applyInlineOverlayMountState, inlineDebugAB.overlayEngine]);

  const scheduleInlineSwapCommit = useCallback((commitFn) => {
    if (typeof commitFn !== "function") return;
    const runCommit = () => commitFn();
    if (typeof queueMicrotask === "function") {
      queueMicrotask(runCommit);
      return;
    }
    Promise.resolve().then(runCommit);
  }, []);

  const handleInlineOverlaySwapRequest = useCallback((payload = {}) => {
    const id = payload?.id || null;
    const sessionId = payload?.sessionId || null;
    const phase = payload?.phase || null;
    const offsetY = Number(payload?.offsetY);
    if (!id || !sessionId || !phase) return;

    const meta = {
      engine: "phase_atomic_v2",
      phase,
      sessionId,
      offsetY: Number.isFinite(offsetY) ? roundInlineMetric(offsetY, 4) : null,
    };

    if (phase === "ready_to_swap") {
      scheduleInlineSwapCommit(() => {
        applyInlineOverlayMountState(id, true, meta);
        inlineSwapAckSeqRef.current += 1;
        setInlineSwapAck({
          id,
          sessionId,
          phase: "swap-commit",
          token: inlineSwapAckSeqRef.current,
          offsetY: Number.isFinite(offsetY) ? offsetY : 0,
        });
      });
      return;
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      scheduleInlineSwapCommit(() => {
        applyInlineOverlayMountState(id, false, meta);
        inlineSwapAckSeqRef.current += 1;
        setInlineSwapAck({
          id,
          sessionId,
          phase,
          token: inlineSwapAckSeqRef.current,
          offsetY: Number.isFinite(offsetY) ? offsetY : 0,
        });
      });
    }
  }, [applyInlineOverlayMountState, scheduleInlineSwapCommit]);

  const logInlineSnapshot = useCallback((eventName, extra = {}) => {
    if (typeof window === "undefined") return;
    if (!isInlineDebugEnabled()) return;
    if (window.__INLINE_SNAPSHOT !== true) return;

    const snapshotAllowlist = new Set([
      "overlay: pre-focus-call",
      "overlay: post-focus-sync",
      "overlay: before-show",
      "overlay: after-show-sync",
      "overlay: after-show-raf1",
      "konva: before-hide",
      "konva: after-hide-sync",
      "konva: after-hide-raf1",
      "selection-set",
      "konva-hide-before-applied",
      "konva-hide-applied",
    ]);
    if (!snapshotAllowlist.has(eventName)) return;

    const nowMsRaw =
      typeof window.performance?.now === "function"
        ? Number(window.performance.now())
        : null;
    if (!inlinePaintApproxRef.current.pending && typeof requestAnimationFrame === "function") {
      inlinePaintApproxRef.current.pending = true;
      requestAnimationFrame(() => {
        requestAnimationFrame((stamp) => {
          inlinePaintApproxRef.current.lastPaintApproxMs = roundInlineMetric(
            Number(stamp),
            3
          );
          inlinePaintApproxRef.current.pending = false;
        });
      });
    }

    const snapshotId =
      extra.id ||
      editing.id ||
      inlineCommitDebugRef.current?.id ||
      prevEditingIdRef.current ||
      null;
    const snapshotKey = String(snapshotId || "__none__");
    const safeId =
      snapshotId == null ? null : String(snapshotId).replace(/"/g, '\\"');
    const overlayEl = safeId
      ? document.querySelector(`[data-inline-editor-id="${safeId}"]`)
      : null;
    const contentEl = overlayEl
      ? (
          overlayEl.querySelector('[contenteditable="true"]') ||
          overlayEl.querySelector("input") ||
          overlayEl.querySelector("textarea")
        )
      : null;

    const overlayRect = rectToInlinePayload(overlayEl?.getBoundingClientRect?.() || null);
    const inkFirstCharMetrics = getInlineInkCharMetrics(contentEl, "first");
    const inkFirstCharRect = inkFirstCharMetrics?.inkRect ?? null;
    const inkLineBoxRect = getInlineLineBoxRect(contentEl);
    const readOverlayMetric = (attrName) => {
      const raw = overlayEl?.getAttribute?.(attrName);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? roundInlineMetric(numeric) : null;
    };
    const readExtraMetric = (key) => {
      const numeric = Number(extra?.[key]);
      return Number.isFinite(numeric) ? roundInlineMetric(numeric) : null;
    };
    const computedBaselineOffsetPx =
      readExtraMetric("computedBaselineOffsetPx") ??
      readOverlayMetric("data-inline-computed-baseline-offset") ??
      null;
    const appliedVerticalCorrectionPx =
      readExtraMetric("appliedVerticalCorrectionPx") ??
      readOverlayMetric("data-inline-vertical-correction") ??
      null;
    const topRawPx =
      readExtraMetric("topRawPx") ??
      readOverlayMetric("data-inline-top-raw") ??
      null;
    const topCorrectedPx =
      readExtraMetric("topCorrectedPx") ??
      readOverlayMetric("data-inline-top-corrected") ??
      null;
    const baselineFromTopPx =
      readExtraMetric("baselineFromTopPx") ??
      readOverlayMetric("data-inline-baseline-from-top") ??
      null;
    const eventLoopPhase =
      typeof extra?.eventLoopPhase === "string"
        ? extra.eventLoopPhase
        : (eventName.includes("raf") ? "raf" : "sync");
    const rafStamp = readExtraMetric("rafStamp");
    const nowMs = Number.isFinite(nowMsRaw) ? roundInlineMetric(nowMsRaw, 3) : null;
    const lastPaintApprox =
      readExtraMetric("lastPaintApprox") ??
      inlinePaintApproxRef.current.lastPaintApproxMs ??
      null;
    const overlayComputedStyle =
      overlayEl && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(overlayEl)
        : null;
    const overlayComputedOpacity = overlayComputedStyle
      ? roundInlineMetric(Number(overlayComputedStyle.opacity || 1), 4)
      : null;
    const overlayComputedVisibility = overlayComputedStyle?.visibility ?? null;
    const overlayComputedDisplay = overlayComputedStyle?.display ?? null;
    const overlayComputedTransform = overlayComputedStyle?.transform ?? null;
    const overlayComputedWillChange = overlayComputedStyle?.willChange ?? null;
    const overlayIsConnected = Boolean(overlayEl?.isConnected);
    const overlayHasFocus = Boolean(contentEl && document.activeElement === contentEl);

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const node = snapshotId ? elementRefs.current[snapshotId] || null : null;
    const konvaTextOpacity =
      node && typeof node.opacity === "function"
        ? roundInlineMetric(Number(node.opacity()), 4)
        : null;
    const konvaTextVisible =
      node && typeof node.visible === "function" ? Boolean(node.visible()) : null;
    const currentDrawSeq = Number(inlineKonvaDrawMetaRef.current?.seq || 0);
    const previousDrawSeq =
      Number(inlineVisibilitySnapshotRef.current[snapshotKey]?.drawSeq || 0);
    const konvaDrawnThisFrame =
      currentDrawSeq > 0 && currentDrawSeq !== previousDrawSeq;
    inlineVisibilitySnapshotRef.current[snapshotKey] = {
      drawSeq: currentDrawSeq,
    };
    const konvaTextNode = resolveInlineKonvaTextNode(node, stage);
    const konvaProjection = getInlineKonvaProjectedRectViewport(
      konvaTextNode,
      stage,
      escalaVisual
    );
    const konvaTextClientRect = konvaProjection.konvaTextClientRect;
    const konvaProjectedRectViewport = konvaProjection.konvaProjectedRectViewport;
    const konvaVsDomInkDelta = konvaProjectedRectViewport
      ? {
          dx: inkFirstCharRect
            ? roundInlineMetric(
                Number(inkFirstCharRect.x) - Number(konvaProjectedRectViewport.x)
              )
            : null,
          dy: inkFirstCharRect
            ? roundInlineMetric(
                Number(inkFirstCharRect.y) - Number(konvaProjectedRectViewport.y)
              )
            : null,
          dw: inkLineBoxRect
            ? roundInlineMetric(
                Number(inkLineBoxRect.width) - Number(konvaProjectedRectViewport.width)
              )
            : null,
          dh: inkLineBoxRect
            ? roundInlineMetric(
                Number(inkLineBoxRect.height) - Number(konvaProjectedRectViewport.height)
              )
            : null,
        }
      : null;

    const readKonvaStyleValue = (target, key) => {
      if (!target) return null;
      try {
        const fn = target[key];
        if (typeof fn === "function") {
          const value = fn.call(target);
          return value ?? null;
        }
        if (typeof target.getAttr === "function") {
          const attrValue = target.getAttr(key);
          if (typeof attrValue !== "undefined") return attrValue;
        }
        if (target?.attrs && Object.prototype.hasOwnProperty.call(target.attrs, key)) {
          return target.attrs[key];
        }
      } catch {
        return null;
      }
      return null;
    };

    const konvaStyleNode = konvaTextNode || node;
    const konvaFontSize = Number(readKonvaStyleValue(konvaStyleNode, "fontSize"));
    const konvaLineHeightRaw = Number(readKonvaStyleValue(konvaStyleNode, "lineHeight"));
    const konvaLineHeightEffective =
      Number.isFinite(konvaFontSize) && Number.isFinite(konvaLineHeightRaw)
        ? roundInlineMetric(konvaFontSize * konvaLineHeightRaw)
        : (Number.isFinite(konvaLineHeightRaw) ? roundInlineMetric(konvaLineHeightRaw) : null);

    const konvaTextStyleSnapshot = {
      fontFamily: readKonvaStyleValue(konvaStyleNode, "fontFamily"),
      fontSize: Number.isFinite(konvaFontSize) ? roundInlineMetric(konvaFontSize) : null,
      fontStyle: readKonvaStyleValue(konvaStyleNode, "fontStyle"),
      fontVariant: readKonvaStyleValue(konvaStyleNode, "fontVariant"),
      fontWeight: readKonvaStyleValue(konvaStyleNode, "fontWeight"),
      lineHeight: konvaLineHeightEffective,
      padding: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "padding"));
        return Number.isFinite(value) ? roundInlineMetric(value) : readKonvaStyleValue(konvaStyleNode, "padding");
      })(),
      align: readKonvaStyleValue(konvaStyleNode, "align"),
      verticalAlign: readKonvaStyleValue(konvaStyleNode, "verticalAlign"),
      scaleX: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "scaleX"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      scaleY: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "scaleY"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      offsetX: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "offsetX"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      offsetY: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "offsetY"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      rotation: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "rotation"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
    };

    const domComputedStyle =
      contentEl && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(contentEl)
        : null;
    const domTextStyleSnapshot = {
      fontFamily: domComputedStyle?.fontFamily ?? null,
      fontSize: domComputedStyle?.fontSize ?? null,
      fontWeight: domComputedStyle?.fontWeight ?? null,
      fontStyle: domComputedStyle?.fontStyle ?? null,
      lineHeight: domComputedStyle?.lineHeight ?? null,
      letterSpacing: domComputedStyle?.letterSpacing ?? null,
      paddingTop: domComputedStyle?.paddingTop ?? null,
      paddingLeft: domComputedStyle?.paddingLeft ?? null,
      borderTopWidth: domComputedStyle?.borderTopWidth ?? null,
      borderLeftWidth: domComputedStyle?.borderLeftWidth ?? null,
      boxSizing: domComputedStyle?.boxSizing ?? null,
      whiteSpace: domComputedStyle?.whiteSpace ?? null,
      transform: domComputedStyle?.transform ?? null,
    };

    const baselineDiagnostics = {
      domGlyphTop: inkFirstCharRect ? roundInlineMetric(Number(inkFirstCharRect.y)) : null,
      domLineBoxTop: inkLineBoxRect ? roundInlineMetric(Number(inkLineBoxRect.y)) : null,
      domLineBoxHeight: inkLineBoxRect ? roundInlineMetric(Number(inkLineBoxRect.height)) : null,
      konvaTop: konvaProjectedRectViewport ? roundInlineMetric(Number(konvaProjectedRectViewport.y)) : null,
      konvaHeight: konvaProjectedRectViewport ? roundInlineMetric(Number(konvaProjectedRectViewport.height)) : null,
      deltaTop:
        konvaProjectedRectViewport && inkLineBoxRect
          ? roundInlineMetric(Number(inkLineBoxRect.y) - Number(konvaProjectedRectViewport.y))
          : null,
      deltaGlyphTop:
        konvaProjectedRectViewport && inkFirstCharRect
          ? roundInlineMetric(Number(inkFirstCharRect.y) - Number(konvaProjectedRectViewport.y))
          : null,
    };

    const payload = {
      escalaVisual,
      nowMs,
      eventLoopPhase,
      rafStamp,
      lastPaintApprox,
      overlayRect,
      inkFirstCharRect,
      inkLineBoxRect,
      konvaTextOpacity,
      konvaTextVisible,
      konvaDrawnThisFrame,
      overlayComputedOpacity,
      overlayComputedVisibility,
      overlayComputedDisplay,
      overlayComputedTransform,
      overlayComputedWillChange,
      overlayIsConnected,
      overlayHasFocus,
      konvaTextClientRect,
      konvaProjectedRectViewport,
      konvaVsDomInkDelta,
      computedBaselineOffsetPx,
      appliedVerticalCorrectionPx,
      topRawPx,
      topCorrectedPx,
      baselineFromTopPx,
      konvaTextStyleSnapshot,
      domTextStyleSnapshot,
      baselineDiagnostics,
    };

    const overlayVisibleForCrossfade =
      Number(overlayComputedOpacity) > 0 &&
      overlayComputedDisplay !== "none" &&
      overlayComputedVisibility !== "hidden";
    const overlayHiddenForCrossfade =
      Number(overlayComputedOpacity) === 0 ||
      overlayComputedDisplay === "none" ||
      overlayComputedVisibility === "hidden";
    const crossfadeState = {
      bothVisible:
        Number(konvaTextOpacity) > 0 &&
        overlayVisibleForCrossfade,
      bothHidden:
        Number(konvaTextOpacity) === 0 &&
        overlayHiddenForCrossfade,
    };
    payload.crossfadeState = crossfadeState;

    inlineDebugLog(`snapshot-${eventName}`, payload);

    const threshold = 0.5;
    const deltaTop = Number(baselineDiagnostics.deltaTop);
    const hasKonvaDomMismatch =
      Number.isFinite(deltaTop) &&
      Math.abs(deltaTop) >= threshold;

    if (hasKonvaDomMismatch) {
      const mismatchPayload = {
        eventName,
        deltaTop: baselineDiagnostics.deltaTop,
        deltaGlyphTop: baselineDiagnostics.deltaGlyphTop,
        konvaProjectedRectViewport,
        inkLineBoxRect,
      };
      const ts = new Date().toISOString();
      console.log(
        `[INLINE][ALERT][${ts}] konva-dom-mismatch\n${formatInlineLogPayload(mismatchPayload)}`
      );
    }

    const crossfadeAlertEvents = new Set([
      "overlay: before-show",
      "overlay: after-show-sync",
      "overlay: after-show-raf1",
      "konva: before-hide",
      "konva: after-hide-sync",
      "konva: after-hide-raf1",
    ]);
    if (
      crossfadeAlertEvents.has(eventName) &&
      (crossfadeState.bothVisible || crossfadeState.bothHidden)
    ) {
      const ts = new Date().toISOString();
      console.log(
        `[INLINE][ALERT][${ts}] crossfade-glitch\n${formatInlineLogPayload({
          eventName,
          crossfadeState,
          konvaTextOpacity,
          konvaTextVisible,
          overlayComputedOpacity,
          overlayComputedDisplay,
          overlayComputedVisibility,
          nowMs,
          eventLoopPhase,
          rafStamp,
          lastPaintApprox,
          deltaTop: baselineDiagnostics.deltaTop,
          deltaGlyphTop: baselineDiagnostics.deltaGlyphTop,
        })}`
      );
    }
  }, [editing.id, escalaVisual]);

  const captureInlineSnapshot = useCallback((eventName, extra = {}) => {
    logInlineSnapshot(eventName, extra);
  }, [logInlineSnapshot]);

  logInlineSnapshotRef.current = logInlineSnapshot;

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
      window.__INLINE_DEBUG = false;
    }
    if (window.__INLINE_MICROMOVE_DEBUG === undefined) {
      window.__INLINE_MICROMOVE_DEBUG = false;
    }
    if (window.__INLINE_FRAME_SEQ === undefined) {
      window.__INLINE_FRAME_SEQ = 0;
    }
    window.__INLINE_AB = { ...inlineDebugAB };
    inlineDebugLog("debug-enabled", {
      enabled: window.__INLINE_DEBUG,
      microMoveEnabled: window.__INLINE_MICROMOVE_DEBUG,
      inlineAB: window.__INLINE_AB,
      frameSeq: window.__INLINE_FRAME_SEQ,
    });
  }, [inlineDebugAB]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!Array.isArray(window.__INLINE_TRACE)) {
      window.__INLINE_TRACE = [];
    }
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }

    const fallbackRunMatrix = async (options = {}) => {
      const maxErrorPx = Number.isFinite(Number(options?.maxErrorPx))
        ? Number(options.maxErrorPx)
        : 0.5;
      const phases = new Set(["after-first-paint", "post-layout"]);
      const trace = Array.isArray(window.__INLINE_TRACE) ? [...window.__INLINE_TRACE] : [];
      const filtered = trace.filter((entry) => phases.has(entry?.phase || entry?.eventName));
      const failures = filtered.filter((entry) => {
        const dx = Math.abs(Number(entry?.dx || 0));
        const dy = Math.abs(Number(entry?.dy || 0));
        return dx > maxErrorPx || dy > maxErrorPx;
      });
      return {
        generatedAt: new Date().toISOString(),
        engine: "canvas-fallback",
        summary: {
          sampleCount: filtered.length,
          failures: failures.length,
          passRate:
            filtered.length > 0
              ? roundInlineMetric(((filtered.length - failures.length) / filtered.length) * 100, 2)
              : null,
          maxErrorPx,
        },
        sampleCount: trace.length,
        trace,
      };
    };

    const previousRunMatrix = window.__INLINE_TEST.runMatrix;
    if (typeof previousRunMatrix !== "function") {
      window.__INLINE_TEST.runMatrix = fallbackRunMatrix;
    }
    if (typeof window.__INLINE_TEST.clearTrace !== "function") {
      window.__INLINE_TEST.clearTrace = () => {
        window.__INLINE_TRACE = [];
        return true;
      };
    }

    return () => {
      if (window.__INLINE_TEST?.runMatrix === fallbackRunMatrix) {
        delete window.__INLINE_TEST.runMatrix;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }

    const findInlineProbeCandidate = (preferredId = null) => {
      if (preferredId) {
        const preferred = objetos.find((obj) => obj?.id === preferredId) || null;
        if (preferred && (
          preferred.tipo === "texto" ||
          (preferred.tipo === "forma" && preferred.figura === "rect" && typeof preferred.texto === "string")
        )) {
          return preferred;
        }
      }
      return (
        objetos.find((obj) => (
          obj?.tipo === "texto" ||
          (obj?.tipo === "forma" && obj?.figura === "rect" && typeof obj?.texto === "string")
        )) || null
      );
    };

    const startFirstTextEdit = async (options = {}) => {
      const preferredId = options?.id || null;
      const candidate = findInlineProbeCandidate(preferredId);
      if (!candidate) {
        return { ok: false, reason: "no-inline-text-candidate" };
      }
      try {
        await ensureInlineFontReady(candidate.fontFamily);
      } catch {
        // no-op
      }
      const id = candidate.id;
      const initialValue = String(candidate.texto ?? "");
      setInlineOverlayMountedId(null);
      setInlineSwapAck((prev) => ({
        id: null,
        sessionId: null,
        phase: "probe-reset",
        token: Number(prev?.token || 0) + 1,
        offsetY: 0,
      }));
      window._currentEditingId = id;
      flushSync(() => {
        startEdit(id, initialValue);
      });
      const node = elementRefs.current[id] || null;
      node?.draggable?.(false);
      node?.getLayer?.()?.batchDraw?.();
      return {
        ok: true,
        id,
        valueLength: initialValue.length,
      };
    };

    const setInlineValueForProbe = async (nextValue = "") => {
      if (!editing.id) {
        return { ok: false, reason: "no-active-inline-session" };
      }
      const safeValue = String(nextValue ?? "");
      flushSync(() => {
        updateEdit(safeValue);
      });
      return { ok: true, id: editing.id, valueLength: safeValue.length };
    };

    const finishInlineEditForProbe = async () => {
      const currentId = editing.id || null;
      if (!currentId) {
        return { ok: false, reason: "no-active-inline-session" };
      }
      flushSync(() => {
        finishEdit();
      });
      restoreElementDrag(currentId);
      if (window._currentEditingId === currentId) {
        window._currentEditingId = null;
      }
      setInlineOverlayMountedId((prev) => (prev === currentId ? null : prev));
      return { ok: true, id: currentId };
    };

    const getInlineProbeState = () => ({
      editingId: editing.id || null,
      overlayMountedId: inlineOverlayMountedId || null,
      objectsCount: objetos.length,
      textCandidateCount: objetos.filter((obj) => (
        obj?.tipo === "texto" ||
        (obj?.tipo === "forma" && obj?.figura === "rect" && typeof obj?.texto === "string")
      )).length,
    });

    window.__INLINE_TEST.startFirstTextEdit = startFirstTextEdit;
    window.__INLINE_TEST.setInlineValue = setInlineValueForProbe;
    window.__INLINE_TEST.finishInlineEdit = finishInlineEditForProbe;
    window.__INLINE_TEST.getProbeState = getInlineProbeState;

    return () => {
      if (window.__INLINE_TEST?.startFirstTextEdit === startFirstTextEdit) {
        delete window.__INLINE_TEST.startFirstTextEdit;
      }
      if (window.__INLINE_TEST?.setInlineValue === setInlineValueForProbe) {
        delete window.__INLINE_TEST.setInlineValue;
      }
      if (window.__INLINE_TEST?.finishInlineEdit === finishInlineEditForProbe) {
        delete window.__INLINE_TEST.finishInlineEdit;
      }
      if (window.__INLINE_TEST?.getProbeState === getInlineProbeState) {
        delete window.__INLINE_TEST.getProbeState;
      }
    };
  }, [
    editing.id,
    ensureInlineFontReady,
    finishEdit,
    inlineOverlayMountedId,
    objetos,
    restoreElementDrag,
    startEdit,
    updateEdit,
  ]);

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


  // ?? FunciÃ³n para actualizar offsets de imagen de fondo (SIN UNDEFINED)
  const actualizarOffsetFondo = useCallback((seccionId, nuevosOffsets, esPreview = false) => {
    setSecciones(prev =>
      prev.map(s => {
        if (s.id !== seccionId) return s;

        // ?? CREAR OBJETO LIMPIO
        const seccionActualizada = { ...s };

        // ?? SOLO AGREGAR CAMPOS SI TIENEN VALORES VÃLIDOS
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
  const [isSelectionRotating, setIsSelectionRotating] = useState(false);

  const logOptionButtonMenuDebug = useCallback((eventName, payload = {}) => {
    if (typeof window === "undefined" || window.__DBG_OPTION_BUTTON !== true) return;
    console.log(`[OPTION-BUTTON][MENU] ${eventName}`, {
      ts: new Date().toISOString(),
      ...payload,
    });
  }, []);

  const togglePanelOpciones = useCallback((source = "unknown", nativeEvent = null) => {
    setMostrarPanelZ((prev) => {
      const next = !prev;
      logOptionButtonMenuDebug("toggle", {
        source,
        prev,
        next,
        selectedId: elementosSeleccionados?.[0] ?? null,
        selectionCount: elementosSeleccionados.length,
        isMobile,
        nativeEventType: nativeEvent?.type ?? null,
        pointerType: nativeEvent?.pointerType ?? null,
      });
      return next;
    });
  }, [elementosSeleccionados, isMobile, logOptionButtonMenuDebug]);

  useEffect(() => {
    logOptionButtonMenuDebug("panel-state", {
      open: mostrarPanelZ,
      selectedId: elementosSeleccionados?.[0] ?? null,
      selectionCount: elementosSeleccionados.length,
      isMobile,
    });
  }, [
    mostrarPanelZ,
    elementosSeleccionados,
    isMobile,
    logOptionButtonMenuDebug,
  ]);

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

  useCanvasEditorStageInteraction({
    stageRef,
    setIsDragging,
    isMobile,
  });

  useCanvasEditorFontPreload({
    objetos,
    cargado,
    stageRef,
    fontManager,
  });
  useCanvasEditorSectionUiSync({
    seccionActivaIdRef,
    seccionActivaId,
    mobileBackgroundEditSectionId,
  });



  useEffect(() => {
    if (!nuevoTextoRef.current) return;

    const obj = objetos.find((o) => o.id === nuevoTextoRef.current);
    if (obj) {
      setElementosSeleccionados([obj.id]);
      // NO iniciar ediciÃ³n automÃ¡ticamente - solo seleccionar
      nuevoTextoRef.current = null;
    }
  }, [objetos]);




  useEffect(() => {
    const handleClickFuera = (e) => {
      if (!e.target.closest(".popup-fuente")) {
        setMostrarSelectorFuente(false);
        setMostrarSelectorTamano(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);




  useCanvasEditorExternalCallbacks({
    historial,
    onHistorialChange,
    futuros,
    onFuturosChange,
  });





  useEffect(() => {

  }, [seleccionActiva, areaSeleccion, inicioSeleccion]);







  const actualizarObjeto = (index, nuevo) => {
    const nuevos = applyObjectUpdateAtIndex(objetos, index, nuevo);
    setObjetos(nuevos);
  };

  const actualizarObjetoPorId = (id, cambios) => {
    const index = objetos.findIndex((o) => o.id === id);
    if (index === -1) return console.warn("? No se encontrÃ³ el objeto con ID:", id);
    const nuevos = applyObjectUpdateById(objetos, id, cambios);
    setObjetos(nuevos);
  };

  const normalizarMedidasGaleria = useCallback((galeria, widthCandidate, xCandidate) => {
    return normalizarMedidasGaleriaUtil(galeria, widthCandidate, xCandidate);
  }, []);

  const actualizarLinea = (lineId, nuevaData) => {
    setObjetos((prev) => applyLineUpdate(prev, lineId, nuevaData));
  };

  const textLayoutUtils = createTextLayoutUtils({
    fontManager,
    resolveKonvaFontStyle,
    textResizeDebug,
    getNodeById: (id) => elementRefs.current?.[id] || null,
  });

  const {
    obtenerMetricasTexto,
    medirAnchoTextoKonva,
    medirAltoTextoKonva,
    calcularXTextoCentradoPorTamano,
    calcularXTextoDesdeCentro,
    calcularYTextoDesdeCentro,
    calcularPosTextoDesdeCentro,
    ajustarFontSizeAAnchoVisual,
    obtenerCentroVisualTextoX,
    calcularXTextoCentrado,
  } = textLayoutUtils;

  useCanvasEditorOptionPanelOutsideClose({
    logOptionButtonMenuDebug,
    setMostrarPanelZ,
  });



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
        setMostrarSelectorTamano(false);
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
    getTemplateAuthoringSnapshot: templateAuthoring.getSnapshot,
    getTemplateAuthoringStatus: templateAuthoring.getStatus,
  });


  const esSeccionPantallaById = useCallback((seccionId) => {
    const s = seccionesOrdenadas.find(x => x.id === seccionId);
    return s && normalizarAltoModo(s.altoModo) === "pantalla";
  }, [seccionesOrdenadas]);


  const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;

  const abrirModalBorrarSeccion = useCallback((seccionId) => {
    if (!seccionId || isDeletingSection) return;
    setDeleteSectionModal({ isOpen: true, sectionId: seccionId });
  }, [isDeletingSection]);

  const cerrarModalBorrarSeccion = useCallback(() => {
    if (isDeletingSection) return;
    setDeleteSectionModal({ isOpen: false, sectionId: null });
  }, [isDeletingSection]);

  const confirmarBorrarSeccion = useCallback(async () => {
    const seccionId = deleteSectionModal.sectionId;
    if (!seccionId || isDeletingSection) return;

    setIsDeletingSection(true);
    try {
      await borrarSeccionExternal({
        seccionId,
        secciones,
        objetos,
        slug,
        seccionActivaId,
        setSecciones,
        setObjetos,
        setSeccionActivaId,
      });
      setDeleteSectionModal({ isOpen: false, sectionId: null });
    } finally {
      setIsDeletingSection(false);
    }
  }, [
    deleteSectionModal.sectionId,
    isDeletingSection,
    secciones,
    objetos,
    slug,
    seccionActivaId,
    setSecciones,
    setObjetos,
    setSeccionActivaId,
  ]);


  // 3) Cada vez que el usuario selecciona una secciÃ³n, actualizamos global y notificamos
  const onSelectSeccion = useCallback((id) => {
    try {
      setSeccionActivaId(id);
      window._seccionActivaId = id;
      window.dispatchEvent(new CustomEvent("seccion-activa", { detail: { id } }));
    } catch (e) {
      console.warn("No pude emitir seccion-activa:", e);
    }
  }, [setSeccionActivaId]);

  const resolverViewportScrollSecciones = useCallback(() => {
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer || typeof window === "undefined") return null;

    const mainElement = stageContainer.closest?.("main");
    if (mainElement) return mainElement;

    let current = stageContainer.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const overflowY = String(style.overflowY || "").toLowerCase();
      const overflow = String(style.overflow || "").toLowerCase();
      const isScrollable =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay" ||
        overflow === "auto" ||
        overflow === "scroll" ||
        overflow === "overlay";

      if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }
      current = current.parentElement;
    }

    return window;
  }, []);

  const obtenerObjetivoScrollSeccion = useCallback(({
    seccionId,
    seccionesFuente = null,
  } = {}) => {
    if (!seccionId || typeof window === "undefined") return null;

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer) return null;

    const stageRect = stageContainer.getBoundingClientRect?.();
    if (!stageRect || !Number.isFinite(stageRect.top) || !Number.isFinite(stageRect.height)) {
      return null;
    }

    const viewport = autoSectionViewportRef.current || resolverViewportScrollSecciones();
    if (!viewport) return null;

    const base = Array.isArray(seccionesFuente) && seccionesFuente.length > 0
      ? seccionesFuente
      : seccionesOrdenadas;
    if (!Array.isArray(base) || base.length === 0) return null;

    const ordenadas = [...base].sort((a, b) => a.orden - b.orden);
    const index = ordenadas.findIndex((s) => s.id === seccionId);
    if (index < 0) return null;

    const alturaCanvasLocal = Math.max(
      1,
      ordenadas.reduce((acc, s) => acc + (Number(s.altura) || 0), 0)
    );
    const pxPorUnidad = Number(stageRect.height || 0) / alturaCanvasLocal;
    if (!(pxPorUnidad > 0)) return null;

    const offsetY = calcularOffsetY(ordenadas, index);
    const alturaSeccion = Math.max(1, Number(ordenadas[index]?.altura) || 1);
    const seccionTopViewport = stageRect.top + offsetY * pxPorUnidad;
    const seccionBottomViewport = seccionTopViewport + alturaSeccion * pxPorUnidad;
    const centroSeccion = (seccionTopViewport + seccionBottomViewport) / 2;

    let viewportTop = 0;
    let viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let scrollActual = window.scrollY || window.pageYOffset || 0;

    if (viewport !== window) {
      const viewportRect = viewport.getBoundingClientRect?.();
      if (!viewportRect) return null;
      viewportTop = viewportRect.top;
      viewportHeight = viewport.clientHeight || (viewportRect.bottom - viewportRect.top) || 0;
      scrollActual = viewport.scrollTop || 0;
    }

    if (!(viewportHeight > 0)) return null;

    const centroDeseadoViewport = viewportTop + viewportHeight / 2;
    const delta = centroSeccion - centroDeseadoViewport;
    const targetScroll = Math.max(0, scrollActual + delta);

    return {
      viewport,
      currentScroll: scrollActual,
      targetScroll,
    };
  }, [resolverViewportScrollSecciones, seccionesOrdenadas]);

  const desplazarViewportHaciaSeccion = useCallback(({
    seccionId,
    seccionesFuente = null,
    behavior = "smooth",
  } = {}) => {
    const objetivo = obtenerObjetivoScrollSeccion({ seccionId, seccionesFuente });
    if (!objetivo) return;

    const { viewport, currentScroll, targetScroll } = objetivo;
    if (Math.abs(targetScroll - currentScroll) < 2) return;

    if (viewport === window) {
      window.scrollTo({ top: Math.round(targetScroll), behavior });
      return;
    }

    viewport.scrollTo({ top: Math.round(targetScroll), behavior });
  }, [obtenerObjetivoScrollSeccion]);

  const seguirScrollDuranteMovimientoSeccion = useCallback(({
    seccionId,
    maxDurationMs = 1400,
  } = {}) => {
    if (!seccionId || typeof window === "undefined") return;

    if (followMoveScrollRafRef.current) {
      window.cancelAnimationFrame(followMoveScrollRafRef.current);
      followMoveScrollRafRef.current = 0;
    }

    const startedAt = window.performance?.now?.() || Date.now();

    const step = (nowRaw) => {
      const now = Number.isFinite(nowRaw) ? nowRaw : (window.performance?.now?.() || Date.now());
      const elapsed = now - startedAt;

      const objetivo = obtenerObjetivoScrollSeccion({
        seccionId,
      });

      if (!objetivo) {
        if (elapsed < maxDurationMs) {
          followMoveScrollRafRef.current = window.requestAnimationFrame(step);
        } else {
          followMoveScrollRafRef.current = 0;
        }
        return;
      }

      const { viewport, currentScroll, targetScroll } = objetivo;
      const delta = targetScroll - currentScroll;
      const animando = seccionesAnimandoActivasRef.current;
      const gain = animando ? 0.08 : 0.14;
      const nextScroll = Math.abs(delta) < 0.8
        ? targetScroll
        : currentScroll + delta * gain;
      const roundedTop = Math.round(Math.max(0, nextScroll));

      if (viewport === window) {
        window.scrollTo({ top: roundedTop, behavior: "auto" });
      } else {
        viewport.scrollTo({ top: roundedTop, behavior: "auto" });
      }

      bloqueoAutoSeleccionSeccionRef.current = Math.max(
        bloqueoAutoSeleccionSeccionRef.current,
        Date.now() + 220
      );

      const remaining = Math.abs(targetScroll - nextScroll);
      if (!animando) {
        followMoveScrollRafRef.current = 0;
        return;
      }

      if (elapsed < maxDurationMs && remaining > 0.9) {
        followMoveScrollRafRef.current = window.requestAnimationFrame(step);
        return;
      }

      followMoveScrollRafRef.current = 0;
    };

    followMoveScrollRafRef.current = window.requestAnimationFrame(step);
  }, [obtenerObjetivoScrollSeccion]);

  const moverSeccionConScroll = useCallback(({
    seccionId,
    direccion,
  }) => {
    if (!seccionId || (direccion !== "subir" && direccion !== "bajar")) return;

    ultimaSeccionMovidaRef.current = seccionId;
    bloqueoAutoSeleccionSeccionRef.current = Date.now() + 1500;
    onSelectSeccion(seccionId);

    const ordenadasActuales = [...secciones].sort((a, b) => a.orden - b.orden);
    const indiceActual = ordenadasActuales.findIndex((s) => s.id === seccionId);
    if (indiceActual < 0) return;

    const indiceDestino = direccion === "subir" ? indiceActual - 1 : indiceActual + 1;
    if (indiceDestino < 0 || indiceDestino >= ordenadasActuales.length) return;

    moverSeccionExternal({
      seccionId,
      direccion,
      secciones,
      slug,
      setSecciones,
      setSeccionesAnimando,
    });

    seguirScrollDuranteMovimientoSeccion({
      seccionId,
      maxDurationMs: 1400,
    });
  }, [
    secciones,
    slug,
    setSecciones,
    setSeccionesAnimando,
    onSelectSeccion,
    seguirScrollDuranteMovimientoSeccion,
  ]);

  const sincronizarSeccionVisiblePorScroll = useCallback(() => {
    if (!seccionesOrdenadas.length || typeof window === "undefined") return;
    if (bloqueoAutoSeleccionSeccionRef.current > Date.now()) return;

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer) return;

    const stageRect = stageContainer.getBoundingClientRect?.();
    if (!stageRect || !Number.isFinite(stageRect.top) || !Number.isFinite(stageRect.height)) {
      return;
    }

    const viewport = autoSectionViewportRef.current || resolverViewportScrollSecciones();
    if (!viewport) return;

    let viewportTop = 0;
    let viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;

    if (viewport !== window) {
      const viewportRect = viewport.getBoundingClientRect?.();
      if (!viewportRect) return;
      viewportTop = viewportRect.top;
      viewportBottom = viewportRect.bottom;
    }

    if (!Number.isFinite(viewportTop) || !Number.isFinite(viewportBottom) || viewportBottom <= viewportTop) {
      return;
    }

    const alturaStagePx = Number(stageRect.height || 0);
    const alturaCanvas = Math.max(1, Number(altoCanvasDinamico) || 1);
    if (!(alturaStagePx > 0)) return;

    const pxPorUnidad = alturaStagePx / alturaCanvas;
    if (!(pxPorUnidad > 0)) return;

    const centroViewport = (viewportTop + viewportBottom) / 2;
    let mejorId = null;
    let mejorVisible = 0;
    let mejorRatio = -1;
    let mejorDistanciaCentro = Number.POSITIVE_INFINITY;

    seccionesOrdenadas.forEach((seccion, index) => {
      const alturaSeccion = Math.max(1, Number(seccion.altura) || 1);
      const offsetY = calcularOffsetY(seccionesOrdenadas, index);
      const top = stageRect.top + offsetY * pxPorUnidad;
      const bottom = top + alturaSeccion * pxPorUnidad;

      const visible = Math.max(0, Math.min(bottom, viewportBottom) - Math.max(top, viewportTop));
      if (visible <= 0) return;

      const ratioVisible = visible / (alturaSeccion * pxPorUnidad);
      const distanciaCentro = Math.abs((top + bottom) / 2 - centroViewport);

      const mejoraPorVisible = visible > mejorVisible + 1;
      const empateVisible = Math.abs(visible - mejorVisible) <= 1;
      const mejoraPorRatio = empateVisible && ratioVisible > mejorRatio + 0.001;
      const empateRatio = empateVisible && Math.abs(ratioVisible - mejorRatio) <= 0.001;
      const mejoraPorCentro = empateRatio && distanciaCentro < mejorDistanciaCentro;

      if (mejoraPorVisible || mejoraPorRatio || mejoraPorCentro) {
        mejorId = seccion.id;
        mejorVisible = visible;
        mejorRatio = ratioVisible;
        mejorDistanciaCentro = distanciaCentro;
      }
    });

    if (!mejorId) return;
    if (seccionActivaIdRef.current === mejorId) return;

    onSelectSeccion(mejorId);
  }, [altoCanvasDinamico, onSelectSeccion, resolverViewportScrollSecciones, seccionesOrdenadas]);

  useEffect(() => {
    const estabaAnimando = previoAnimandoSeccionesRef.current;
    const estaAnimandoAhora = seccionesAnimando.length > 0;

    if (estabaAnimando && !estaAnimandoAhora) {
      const seccionMovidaId = ultimaSeccionMovidaRef.current;
      if (seccionMovidaId) {
        bloqueoAutoSeleccionSeccionRef.current = Date.now() + 750;
        onSelectSeccion(seccionMovidaId);
        if (typeof window !== "undefined" && followMoveScrollRafRef.current) {
          window.cancelAnimationFrame(followMoveScrollRafRef.current);
          followMoveScrollRafRef.current = 0;
        }
        ultimaSeccionMovidaRef.current = null;
      }
    }

    previoAnimandoSeccionesRef.current = estaAnimandoAhora;
  }, [seccionesAnimando, onSelectSeccion]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!seccionesOrdenadas.length) return undefined;

    autoSectionViewportRef.current = resolverViewportScrollSecciones();
    const scrollTarget = autoSectionViewportRef.current || window;

    const scheduleSync = () => {
      if (autoSectionScrollRafRef.current) return;
      autoSectionScrollRafRef.current = window.requestAnimationFrame(() => {
        autoSectionScrollRafRef.current = 0;
        sincronizarSeccionVisiblePorScroll();
      });
    };

    scheduleSync();

    const eventTarget = scrollTarget === window ? window : scrollTarget;
    eventTarget.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", scheduleSync);
      window.visualViewport.addEventListener("resize", scheduleSync);
    }

    return () => {
      eventTarget.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("scroll", scheduleSync);
        window.visualViewport.removeEventListener("resize", scheduleSync);
      }
      if (autoSectionScrollRafRef.current) {
        window.cancelAnimationFrame(autoSectionScrollRafRef.current);
        autoSectionScrollRafRef.current = 0;
      }
    };
  }, [resolverViewportScrollSecciones, seccionesOrdenadas.length, sincronizarSeccionVisiblePorScroll]);





  // ?? NUEVO HOOK PARA GUÃAS
  const {
    guiaLineas,
    mostrarGuias,
    limpiarGuias,
    configurarDragEnd
  } = useGuiasCentrado({
    anchoCanvas: 800,
    altoCanvas: altoCanvasDinamico,
    // UX: guÃ­a de secciÃ³n solo al centrar, con imÃ¡n sutil.
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

  // ?? FunciÃ³n para actualizar posiciÃ³n del botÃ³n SIN re-render
  const { actualizarPosicionBotonOpciones } = useOptionButtonPosition({
    botonOpcionesRef,
    layoutRootRef: editorOverlayRootRef,
    elementRefs,
    elementosSeleccionados,
    stageRef,
    escalaVisual,
    escalaActiva,
    isMobile,
    buttonSize: optionButtonSize,
  });

  const handleTransformInteractionStart = useCallback((payload = {}) => {
    const rotating = payload?.isRotate === true;
    setIsSelectionRotating(rotating);
    if (rotating) {
      setMostrarPanelZ(false);
    }
  }, []);

  const handleTransformInteractionEnd = useCallback(() => {
    setIsSelectionRotating(false);
    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("transform-interaction-end");
      }
    });
  }, [actualizarPosicionBotonOpciones]);

  useEffect(() => {
    if (elementosSeleccionados.length === 1 && !editing.id) return;
    setIsSelectionRotating(false);
  }, [elementosSeleccionados.length, editing.id]);



  useEffect(() => {
    const onDragStartGlobal = () => {
      // limpiar hover/preselecciÃ³n inmediatamente para evitar "flash" visual
      flushSync(() => {
        setHoverId(null);
        setElementosPreSeleccionados([]);
        setIsDragging(true);
      });
    };
    const onDragEndGlobal = () => {
      // nada por ahora; si quisieras, podrÃ­as recalcular algo acÃ¡
    };

    window.addEventListener("dragging-start", onDragStartGlobal);
    window.addEventListener("dragging-end", onDragEndGlobal);
    return () => {
      window.removeEventListener("dragging-start", onDragStartGlobal);
      window.removeEventListener("dragging-end", onDragEndGlobal);
    };
  }, []);





  // ?? OPTIMIZACIÃ“N: Limpiar cache de intersecciÃ³n al cambiar selecciÃ³n
  useEffect(() => {
    // Limpiar cache cuando cambia la selecciÃ³n
    if (window._lineIntersectionCache) {
      window._lineIntersectionCache = {};
    }
  }, [elementosSeleccionados.length]);

  // ?? OPTIMIZACIÃ“N: Forzar actualizaciÃ³n de lÃ­neas despuÃ©s de drag grupal
  useEffect(() => {
    if (window._grupoLider || elementosSeleccionados.length === 0) return;

    // Solo correr esta optimizaciÃ³n cuando acaba de finalizar un drag grupal.
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const recentlyEndedGroupDrag =
      Number.isFinite(window._skipUntil) && window._skipUntil > now;
    if (!recentlyEndedGroupDrag) return;

    const hayLineas = objetos.some(obj =>
      elementosSeleccionados.includes(obj.id) &&
      obj.tipo === 'forma' &&
      obj.figura === 'line'
    );
    if (!hayLineas) return;

    const timer = setTimeout(() => {
      elementosSeleccionados.forEach(id => {
        const node = elementRefs.current[id];
        if (node && node.getLayer) {
          node.getLayer()?.batchDraw();
        }
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [elementosSeleccionados, objetos]);
  const detectarInterseccionLinea = useMemo(() => createLineIntersectionDetector(), []);


  // ?? Ajustar el transformer cuando cambia el texto inline
  useEffect(() => {
    if (!editing.id || !elementRefs.current[editing.id]) return;

    const node = elementRefs.current[editing.id];

    // ?? Actualizar el transformer si estÃ¡ presente
    const transformer = node.getStage()?.findOne('Transformer');
    if (transformer && transformer.nodes && transformer.nodes().includes(node)) {
      transformer.forceUpdate(); // Actualiza manualmente el transformer
      transformer.getLayer()?.batchDraw(); // Redibuja
    }
  }, [editing.id, editing.value]);

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

    const shouldAutoCorrectFinalX =
      Number.isFinite(pending.expectedX) &&
      Number.isFinite(finalX) &&
      Math.abs(deltaFinalVsExpected) > 0.25;
    if (shouldAutoCorrectFinalX) {
      inlineDebugLog("finish-post-commit:autocorrect-x", {
        id: pending.id,
        fromX: finalX,
        toX: pending.expectedX,
        deltaFinalVsExpected,
      });
      setObjetos((prev) => {
        const index = prev.findIndex((o) => o.id === pending.id);
        if (index < 0) return prev;
        const current = prev[index];
        const currentX = Number.isFinite(current?.x) ? current.x : null;
        if (
          Number.isFinite(currentX) &&
          Number.isFinite(pending.expectedX) &&
          Math.abs(currentX - pending.expectedX) <= 0.01
        ) {
          return prev;
        }
        const next = [...prev];
        next[index] = {
          ...current,
          x: pending.expectedX,
        };
        return next;
      });
    }

    inlineCommitDebugRef.current = { id: null };
  }, [editing.id, objetos, obtenerMetricasNodoInline]);




  useCanvasEditorGlobalsBridge({
    elementosSeleccionados,
    objetos,
    elementRefs,
    secciones,
    altoCanvas,
    seccionActivaId,
    celdaGaleriaActiva,
    setCeldaGaleriaActiva,
    hoverId,
    setHoverId,
  });



  // Cleanup del sistema imperativo
  useEffect(() => {
    return () => {
      imperativeObjects.cleanup();
    };
  }, []);
  const stageGestures = useStageGestures({
    secciones,
    objetos,
    elementRefs,
    dragStartPos,
    hasDragged,
    seleccionActiva,
    inicioSeleccion,
    areaSeleccion,
    detectarInterseccionLinea,
    setElementosSeleccionados,
    setElementosPreSeleccionados,
    setSeleccionActiva,
    setInicioSeleccion,
    setAreaSeleccion,
    onSelectSeccion,
    cerrarMenusFlotantes,
  });

  const mobileCanvasToolbarOffset = mobileTextToolbarVisible
    ? mobileBottomTypographyStripVisible
      ? 88
      : 32
    : 0;

  const mobileSectionActionsTop = mobileBottomTypographyStripVisible
    ? "calc(172px + env(safe-area-inset-top, 0px))"
    : mobileTextToolbarVisible
      ? "calc(118px + env(safe-area-inset-top, 0px))"
      : "calc(64px + env(safe-area-inset-top, 0px))";

  const scaledCanvasHeightCompensation = isMobile &&
    Number.isFinite(escalaVisual) &&
    Number.isFinite(altoCanvasDinamico)
    ? (escalaVisual - 1) * altoCanvasDinamico
    : 0;



  return (
    <div
      ref={editorOverlayRootRef}
      className="flex justify-center"
      style={{
        // ? Dejamos que el scroll lo maneje el <main> del DashboardLayout (un solo scroll)
        marginTop: 0,
        position: "relative",
        overflowX: "hidden",

        // ? UX mobile: permitir scroll vertical natural alrededor del canvas
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",

        // ? espacio para que no â€œchoqueâ€ con header / barras
        paddingTop: 12 + mobileCanvasToolbarOffset,
        paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        transition: "padding-top 180ms ease",
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
          paddingTop: "20px", // ? MENOS PADDING INTERNO
          paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))", // ? ESPACIO INFERIOR
        }}
      >

        <div
          style={{
            transform: `scale(${escalaVisual})`,
            transformOrigin: 'top center',
            width: zoom === 0.8 ? "1220px" : "1000px", // ? 920px canvas + 150px cada lado
            position: "relative",
            marginBottom: scaledCanvasHeightCompensation,
          }}
        >

          <div
            className="relative"
            style={{
              width: zoom === 0.8 ? "1220px" : "1000px", // ? AJUSTAR SEGÃšN ZOOM
              display: "flex",
              justifyContent: "center",
            }}
          >

            <SectionActionsOverlay
              seccionActivaId={seccionActivaId}
              seccionesOrdenadas={seccionesOrdenadas}
              altoCanvas={altoCanvas}
              seccionesAnimando={seccionesAnimando}
              isMobile={isMobile}
              mobileSectionActionsTop={mobileSectionActionsTop}
              mobileSectionActionsOpen={mobileSectionActionsOpen}
              setMobileSectionActionsOpen={setMobileSectionActionsOpen}
              handleCrearSeccion={handleCrearSeccion}
              moverSeccionConScroll={moverSeccionConScroll}
              isDeletingSection={isDeletingSection}
              cambiarColorFondoSeccion={cambiarColorFondoSeccion}
              togglePantallaCompletaSeccion={togglePantallaCompletaSeccion}
              secciones={secciones}
              objetos={objetos}
              setSecciones={setSecciones}
              setObjetos={setObjetos}
              setElementosSeleccionados={setElementosSeleccionados}
              mobileBackgroundEditSectionId={mobileBackgroundEditSectionId}
              setMobileBackgroundEditSectionId={setMobileBackgroundEditSectionId}
              canManageSite={canManageSite}
              refrescarPlantillasDeSeccion={refrescarPlantillasDeSeccion}
              abrirModalBorrarSeccion={abrirModalBorrarSeccion}
            />


            <div
              style={{
                position: "relative",
                width: 800,
                height: altoCanvasDinamico,
              }}
            >

              <CanvasStageContent
                stageRef={stageRef}
                altoCanvasDinamico={altoCanvasDinamico}
                stageGestures={stageGestures}
                seccionesOrdenadas={seccionesOrdenadas}
                altoCanvas={altoCanvas}
                seccionActivaId={seccionActivaId}
                seccionesAnimando={seccionesAnimando}
                onSelectSeccion={onSelectSeccion}
                actualizarOffsetFondo={actualizarOffsetFondo}
                isMobile={isMobile}
                mobileBackgroundEditSectionId={mobileBackgroundEditSectionId}
                handleBackgroundImageStatusChange={handleBackgroundImageStatusChange}
                controlandoAltura={controlandoAltura}
                normalizarAltoModo={normalizarAltoModo}
                iniciarControlAltura={iniciarControlAltura}
                supportsPointerEvents={supportsPointerEvents}
                setGlobalCursor={setGlobalCursor}
                clearGlobalCursor={clearGlobalCursor}
                objetos={objetos}
                editing={editing}
                elementosSeleccionados={elementosSeleccionados}
                elementosPreSeleccionados={elementosPreSeleccionados}
                setElementosPreSeleccionados={setElementosPreSeleccionados}
                seleccionActiva={seleccionActiva}
                areaSeleccion={areaSeleccion}
                setHoverId={setHoverId}
                registerRef={registerRef}
                celdaGaleriaActiva={celdaGaleriaActiva}
                setCeldaGaleriaActiva={setCeldaGaleriaActiva}
                mostrarGuias={mostrarGuias}
                elementRefs={elementRefs}
                actualizarPosicionBotonOpciones={actualizarPosicionBotonOpciones}
                setIsDragging={setIsDragging}
                limpiarGuias={limpiarGuias}
                dragStartPos={dragStartPos}
                hasDragged={hasDragged}
                setObjetos={setObjetos}
                determinarNuevaSeccion={determinarNuevaSeccion}
                convertirAbsARel={convertirAbsARel}
                esSeccionPantallaById={esSeccionPantallaById}
                ALTURA_PANTALLA_EDITOR={ALTURA_PANTALLA_EDITOR}
                inlineEditPreviewRef={inlineEditPreviewRef}
                calcularXTextoCentrado={calcularXTextoCentrado}
                ensureInlineFontReady={ensureInlineFontReady}
                pendingInlineStartRef={pendingInlineStartRef}
                inlineDebugLog={inlineDebugLog}
                obtenerMetricasNodoInline={obtenerMetricasNodoInline}
                obtenerCentroVisualTextoX={obtenerCentroVisualTextoX}
                setInlineOverlayMountedId={setInlineOverlayMountedId}
                setInlineSwapAck={setInlineSwapAck}
                captureInlineSnapshot={captureInlineSnapshot}
                startEdit={startEdit}
                inlineOverlayMountedId={inlineOverlayMountedId}
                inlineDebugAB={inlineDebugAB}
                finishEdit={finishEdit}
                restoreElementDrag={restoreElementDrag}
                configurarDragEnd={configurarDragEnd}
                ajustarFontSizeAAnchoVisual={ajustarFontSizeAAnchoVisual}
                calcularPosTextoDesdeCentro={calcularPosTextoDesdeCentro}
                textResizeDebug={textResizeDebug}
                isTextResizeDebugEnabled={isTextResizeDebugEnabled}
                actualizarObjeto={actualizarObjeto}
                hoverId={hoverId}
                isDragging={isDragging}
                actualizarLinea={actualizarLinea}
                guiaLineas={guiaLineas}
                handleTransformInteractionStart={handleTransformInteractionStart}
                handleTransformInteractionEnd={handleTransformInteractionEnd}
                normalizarMedidasGaleria={normalizarMedidasGaleria}
                setElementosSeleccionados={setElementosSeleccionados}
              />


            </div>

            {editing.id && elementRefs.current[editing.id] && (() => {
              const objetoEnEdicion = objetos.find(o => o.id === editing.id);
              const keepCenterDuringEdit =
                Boolean(objetoEnEdicion) &&
                objetoEnEdicion.tipo === "texto" &&
                !objetoEnEdicion.__groupAlign &&
                !Number.isFinite(Number(objetoEnEdicion.width)) &&
                objetoEnEdicion.__autoWidth !== false;

              return (
                <InlineTextEditor
                  editingId={editing.id}
                  node={elementRefs.current[editing.id]}
                  value={editing.value}
                  textAlign={objetoEnEdicion?.align || 'left'} // ?? Solo pasar alineación
                  maintainCenterWhileEditing={keepCenterDuringEdit}
                  onOverlayMountChange={handleInlineOverlayMountChange}
                  onOverlaySwapRequest={handleInlineOverlaySwapRequest}
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
                    const safeFinishId = String(finishId || "").replace(/"/g, '\\"');
                    const overlayRoot =
                      typeof document !== "undefined" && safeFinishId
                        ? document.querySelector(`[data-inline-editor-id="${safeFinishId}"]`)
                        : null;
                    const overlayEditor = overlayRoot?.querySelector?.('[contenteditable="true"]');
                    const domRawText =
                      overlayEditor && typeof overlayEditor.innerText === "string"
                        ? overlayEditor.innerText
                        : null;
                    let textoNuevoRaw =
                      domRawText == null
                        ? normalizeInlineEditableTextShared(String(editing.value ?? ""), {
                          trimPhantomTrailingNewline: true,
                        })
                        : normalizeInlineEditableTextShared(domRawText, {
                          trimPhantomTrailingNewline: true,
                        });
                    const domCenterXCanvas = (() => {
                      if (!overlayRoot || typeof document === "undefined") return null;
                      const overlayRect = overlayRoot.getBoundingClientRect?.();
                      if (
                        !Number.isFinite(overlayRect?.left) ||
                        !Number.isFinite(overlayRect?.width)
                      ) {
                        return null;
                      }
                      const stage = stageRef.current?.getStage?.() || stageRef.current || null;
                      const stageMetrics = resolveInlineStageViewportMetricsShared(stage, {
                        scaleVisual: escalaVisual,
                      });
                      const stageRect = stageMetrics?.stageRect;
                      const totalScaleX = Number(stageMetrics?.totalScaleX);
                      if (!stageRect || !Number.isFinite(stageRect.left)) return null;
                      if (!Number.isFinite(totalScaleX) || totalScaleX <= 0) return null;
                      const centerXViewport = overlayRect.left + (overlayRect.width / 2);
                      return (centerXViewport - stageRect.left) / totalScaleX;
                    })();
                    captureInlineSnapshot("finish: blur", {
                      id: finishId,
                      valueLength: textoNuevoRaw.length,
                    });
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
                      domCenterXCanvas,
                      previewRef: { ...inlineEditPreviewRef.current },
                      liveMetricsAtFinish,
                    });

                    if (index === -1) {
                      console.warn("? El objeto ya no existe. Cancelando guardado.");
                      inlineDebugLog("finish-abort-missing-object", { id: finishId });
                      inlineCommitDebugRef.current = { id: null };
                      finishEdit();
                      restoreElementDrag(finishId);
                      return;
                    }

                    // ?? PodÃ©s permitir texto vacÃ­o en formas si querÃ©s (yo lo permitirÃ­a)
                    if (textoNuevoValidado === "" && objeto.tipo === "texto") {
                      console.warn("?? El texto estÃ¡ vacÃ­o. No se actualiza.");
                      inlineDebugLog("finish-abort-empty", {
                        id: finishId,
                        rawLength: textoNuevoRaw.length,
                        trimmedLength: textoNuevoValidado.length,
                      });
                      inlineCommitDebugRef.current = { id: null };
                      inlineEditPreviewRef.current = { id: null, centerX: null };
                      finishEdit();
                      restoreElementDrag(finishId);
                      return;
                    }

                    const textoActualRaw = String(objeto?.texto ?? "");
                    const textoSinCambios = textoNuevoRaw === textoActualRaw;
                    if (textoSinCambios) {
                      inlineDebugLog("finish-noop-unchanged-text", {
                        id: finishId,
                        valueLength: textoNuevoRaw.length,
                      });
                      inlineCommitDebugRef.current = { id: null };
                      inlineEditPreviewRef.current = { id: null, centerX: null };
                      finishEdit();
                      restoreElementDrag(finishId);
                      return;
                    }

                    const actualizado = [...objetos];
                    const patch = { texto: textoNuevoRaw };

                    const shouldKeepCenterX =
                      objeto.tipo === "texto" &&
                      !objeto.__groupAlign &&
                      !Number.isFinite(objeto.width) &&
                      objeto.__autoWidth !== false;
                    const lockedCenterX =
                      inlineEditPreviewRef.current?.id === finishId &&
                      Number.isFinite(inlineEditPreviewRef.current?.centerX)
                        ? inlineEditPreviewRef.current.centerX
                        : null;

                    if (shouldKeepCenterX) {
                      const baseLineHeight =
                        typeof objeto.lineHeight === "number" && objeto.lineHeight > 0
                          ? objeto.lineHeight
                          : 1.2;
                      const letterSpacing =
                        Number.isFinite(Number(objeto.letterSpacing)) ? Number(objeto.letterSpacing) : 0;
                      const liveNodeX =
                        Number.isFinite(liveMetricsAtFinish?.x) ? liveMetricsAtFinish.x : (
                          typeof liveNodeAtFinish?.x === "function" ? liveNodeAtFinish.x() : null
                        );
                      const nextWidthFromKonva = medirAnchoTextoKonva(objeto, textoNuevoRaw);
                      const nextMetrics = obtenerMetricasTexto(textoNuevoRaw, {
                        fontSize: objeto.fontSize,
                        fontFamily: objeto.fontFamily,
                        fontWeight: objeto.fontWeight,
                        fontStyle: objeto.fontStyle,
                        lineHeight: baseLineHeight * 0.92,
                        letterSpacing,
                      });
                      const nextWidth =
                        Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
                          ? nextWidthFromKonva
                          : nextMetrics.width;
                      const availableWidthForCenter = Math.max(
                        1,
                        800 - (
                          Number.isFinite(objeto.x)
                            ? objeto.x
                            : (Number.isFinite(liveNodeX) ? liveNodeX : 0)
                        )
                      );
                      const centerWidthForCommit =
                        Number.isFinite(nextWidth) && nextWidth > 0
                          ? Math.min(nextWidth, availableWidthForCenter)
                          : nextWidth;
                      const xFromDomCenter =
                        Number.isFinite(domCenterXCanvas) && Number.isFinite(centerWidthForCommit)
                          ? domCenterXCanvas - (centerWidthForCommit / 2)
                          : null;
                      const nextX = calcularXTextoCentrado(
                        objeto,
                        textoNuevoRaw,
                        lockedCenterX
                      );
                      const currentX = Number.isFinite(objeto.x) ? objeto.x : 0;
                      const committedX = Number.isFinite(xFromDomCenter)
                        ? xFromDomCenter
                        : (Number.isFinite(liveNodeX) ? liveNodeX : nextX);
                      if (Number.isFinite(committedX) && Math.abs(committedX - currentX) > 0.01) {
                        patch.x = committedX;
                      }

                      inlineDebugLog("finish-center-computed", {
                        id: finishId,
                        shouldKeepCenterX,
                        lockedCenterX,
                        domCenterXCanvas,
                        nextWidth,
                        centerWidthForCommit,
                        availableWidthForCenter,
                        xFromDomCenter,
                        liveNodeX,
                        currentX,
                        nextX,
                        committedX: patch.x ?? null,
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
                    restoreElementDrag(finishId);
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
                  overlayEngine={inlineDebugAB.overlayEngine}
                  swapAckToken={inlineSwapAck}

                />
              );
            })()}


            {/* Stage extra solo en desktop para no duplicar memoria en mobile */}
            {!isMobile && (
              <DividersOverlayStage
                zoom={zoom}
                altoCanvasDinamico={altoCanvasDinamico}
                seccionesOrdenadas={seccionesOrdenadas}
              />
            )}


          </div>


        </div>


      </div>



      {/* ? BotÃ³n de opciones PEGADO a la esquina superior derecha del elemento */}
      <CanvasEditorOverlays
        elementosSeleccionados={elementosSeleccionados}
        editingId={editing.id}
        isSelectionRotating={isSelectionRotating}
        botonOpcionesRef={botonOpcionesRef}
        optionButtonSize={optionButtonSize}
        togglePanelOpciones={togglePanelOpciones}
        isMobile={isMobile}
        canManageSite={canManageSite}
        templateAuthoringStatusClass={templateAuthoringStatusClass}
        templateAuthoring={templateAuthoring}
        templateAuthoringStatus={templateAuthoringStatus}
        templateAuthoringStatusLabel={templateAuthoringStatusLabel}
        editorOverlayRootRef={editorOverlayRootRef}
        stageRef={stageRef}
        elementRefs={elementRefs}
        hoverId={hoverId}
        mostrarPanelZ={mostrarPanelZ}
        objetos={objetos}
        onCopiar={onCopiar}
        onPegar={onPegar}
        onDuplicar={onDuplicar}
        onEliminar={onEliminar}
        moverElemento={moverElemento}
        setMostrarPanelZ={setMostrarPanelZ}
        reemplazarFondo={reemplazarFondo}
        secciones={secciones}
        setSecciones={setSecciones}
        setObjetos={setObjetos}
        setElementosSeleccionados={setElementosSeleccionados}
        abrirPanelRsvp={abrirPanelRsvp}
        canRenderTemplateAuthoringMenu={canRenderTemplateAuthoringMenu}
        handleViewTemplateFieldUsage={handleViewTemplateFieldUsage}
        objetoSeleccionado={objetoSeleccionado}
        mostrarSelectorFuente={mostrarSelectorFuente}
        setMostrarSelectorFuente={setMostrarSelectorFuente}
        mostrarSelectorTamano={mostrarSelectorTamano}
        setMostrarSelectorTamano={setMostrarSelectorTamano}
        allFonts={ALL_FONTS}
        fontManager={fontManager}
        tamaniosDisponibles={tamaniosDisponibles}
        onCambiarAlineacion={onCambiarAlineacion}
        deleteSectionModal={deleteSectionModal}
        seccionPendienteEliminar={seccionPendienteEliminar}
        cantidadElementosSeccionPendiente={cantidadElementosSeccionPendiente}
        isDeletingSection={isDeletingSection}
        cerrarModalBorrarSeccion={cerrarModalBorrarSeccion}
        confirmarBorrarSeccion={confirmarBorrarSeccion}
      />



    </div>
  );

}










