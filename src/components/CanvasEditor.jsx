// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
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
import FontSelector from './FontSelector';
import { reemplazarFondoSeccion as reemplazarFondo } from "@/utils/accionesFondo";
import {
  convertirDecoracionFondoEnImagen,
  convertirImagenEnDecoracionFondo,
} from "@/utils/accionesFondo";
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
  inlineDebugLog,
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
import useCanvasEditorGiftBridge from "@/components/editor/canvasEditor/useCanvasEditorGiftBridge";
import useCanvasEditorSectionUiSync from "@/components/editor/canvasEditor/useCanvasEditorSectionUiSync";
import useCanvasEditorExternalCallbacks from "@/components/editor/canvasEditor/useCanvasEditorExternalCallbacks";
import useCanvasEditorOptionPanelOutsideClose from "@/components/editor/canvasEditor/useCanvasEditorOptionPanelOutsideClose";
import useCanvasEditorSectionFlow from "@/components/editor/canvasEditor/useCanvasEditorSectionFlow";
import useCanvasEditorInteractionEffects from "@/components/editor/canvasEditor/useCanvasEditorInteractionEffects";
import {
  buildCanvasDragPerfDiff,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import useCanvasEditorTextSystem from "@/components/editor/textSystem/runtime/useCanvasEditorTextSystem";
import useTextEditInteractionController from "@/components/editor/textSystem/runtime/useTextEditInteractionController";
import CanvasInlineEditingLayer from "@/components/editor/canvasEditor/CanvasInlineEditingLayer";
import { isFunctionalCtaButton } from "@/domain/functionalCtaButtons";
import TemplateEditorialDrawer from "@/components/editor/templateEditorial/TemplateEditorialDrawer";
import {
  applySectionSolidBackground,
  normalizeSectionBackgroundModel,
  removeBackgroundDecoration,
} from "@/domain/sections/backgrounds";


Konva.dragDistance = 8;

function shouldUseLowPowerKonvaRaster() {
  if (typeof window === "undefined") return false;

  const matchMedia = (query) =>
    typeof window.matchMedia === "function" && window.matchMedia(query).matches;

  const primaryCoarse = matchMedia("(pointer: coarse)");
  const primaryFine = matchMedia("(pointer: fine)");
  const noHover = matchMedia("(hover: none)");
  const maxTouchPoints =
    typeof navigator !== "undefined"
      ? Number(navigator.maxTouchPoints || 0)
      : 0;

  return primaryCoarse || (!primaryFine && noHover && maxTouchPoints > 0);
}

function resolveKonvaPixelRatio() {
  if (typeof window === "undefined") return 1;

  const dpr = Number(window.devicePixelRatio || 1);
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  if (shouldUseLowPowerKonvaRaster()) return 1;
  return Math.min(dpr, 2);
}

Konva.pixelRatio = resolveKonvaPixelRatio();

const PRESERVE_CANVAS_SELECTION_SELECTOR = [
  '[data-preserve-canvas-selection="true"]',
  '[data-dashboard-sidebar="true"]',
  "#sidebar-panel",
  '[data-option-button="true"]',
  '[data-inline-editor="true"]',
  ".menu-z-index",
  ".popup-fuente",
].join(", ");

function isTypographyEditableCanvasObject(obj) {
  return Boolean(
    obj &&
      (
        obj.tipo === "texto" ||
        isFunctionalCtaButton(obj) ||
        (
          obj.tipo === "forma" &&
          obj.figura === "rect" &&
          typeof obj.texto === "string"
        )
      )
  );
}

export default function CanvasEditor({
  slug,
  editorSession = null,
  zoom = 1,
  onHistorialChange,
  onFuturosChange,
  userId,
  onStartupStatusChange,
  canManageSite = false,
  readOnly = false,
  initialDraftData = null,
  initialEditorData = null,
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
  const guideOverlayRef = useRef(null);
  const [hoverId, setHoverIdState] = useState(null);
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
  const inlineRenderValueRef = useRef({ id: null, value: "" });
  const canvasEditorRenderCountRef = useRef(0);
  const canvasEditorRenderSnapshotRef = useRef(null);
  const canvasEditorObjetosRef = useRef(null);
  const canvasEditorObjetosVersionRef = useRef(0);
  const canvasEditorSeccionesRef = useRef(null);
  const canvasEditorSeccionesVersionRef = useRef(0);
  const canvasEditorStateTraceRef = useRef(null);
  const [inlineOverlayMountedId, setInlineOverlayMountedId] = useState(null);
  const [inlineOverlayMountSession, setInlineOverlayMountSession] = useState({
    id: null,
    sessionId: null,
    mounted: false,
    swapCommitted: false,
    phase: "idle",
    token: 0,
    offsetY: 0,
    offsetRevision: null,
    offsetSource: null,
    offsetSpace: "content-ink",
    renderAuthority: "konva",
    caretVisible: false,
    paintStable: false,
  });
  const inlineSwapAckSeqRef = useRef(0);
  const [inlineSwapAck, setInlineSwapAck] = useState({
    id: null,
    sessionId: null,
    phase: null,
    token: 0,
    offsetY: 0,
    offsetRevision: null,
    offsetSource: null,
    offsetSpace: "content-ink",
    renderAuthority: "konva",
    caretVisible: false,
    paintStable: false,
  });
  useEffect(() => {
    const mountedId = inlineOverlayMountSession?.mounted
      ? inlineOverlayMountSession.id || null
      : null;
    setInlineOverlayMountedId((previous) => (
      previous === mountedId ? previous : mountedId
    ));
  }, [inlineOverlayMountSession]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.__DBG_CANVAS_DRAG_PERF === undefined) {
      window.__DBG_CANVAS_DRAG_PERF = false;
    }
    if (window.__CANVAS_DRAG_PERF_EXPANDED === undefined) {
      window.__CANVAS_DRAG_PERF_EXPANDED = false;
    }
    if (window.__EDITOR_PRELOAD_DEBUG === undefined) {
      window.__EDITOR_PRELOAD_DEBUG = false;
    }
    if (window.__INLINE_DEBUG === undefined) {
      window.__INLINE_DEBUG = false;
    }
    if (window.__DBG_INLINE_INTENT === undefined) {
      window.__DBG_INLINE_INTENT = false;
    }
    if (window.__INLINE_FOCUS_RCA === undefined) {
      window.__INLINE_FOCUS_RCA = false;
    }
    if (window.__INLINE_DIAG_ALIGNMENT === undefined) {
      window.__INLINE_DIAG_ALIGNMENT = false;
    }
    if (window.__INLINE_DIAG_ALIGNMENT_EXTENDED === undefined) {
      window.__INLINE_DIAG_ALIGNMENT_EXTENDED = false;
    }
    if (window.__INLINE_DIAG_COMPACT === undefined) {
      window.__INLINE_DIAG_COMPACT = true;
    }
  }, []);
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
  const persistenceBridgeRef = useRef(null);
  const [anchoStage, setAnchoStage] = useState(800);
  const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
  const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
  const fuentesDisponibles = ALL_FONTS;
  const [draftMeta, setDraftMeta] = useState({
    plantillaId: null,
    templateWorkspace: null,
    templateAuthoringDraft: null,
    loadedAt: 0,
  });
  const [templateEditorialPanelOpen, setTemplateEditorialPanelOpen] = useState(false);
  const [mobileBackgroundEditSectionId, setMobileBackgroundEditSectionId] = useState(null);
  const [deleteSectionModal, setDeleteSectionModal] = useState({ isOpen: false, sectionId: null });
  const [isDeletingSection, setIsDeletingSection] = useState(false);
  const [mobileSectionActionsOpen, setMobileSectionActionsOpen] = useState(false);
  const [rsvpConfig, setRsvpConfig] = useState(null);
  const [giftsConfig, setGiftsConfig] = useState(null);
  const [sectionDecorationEdit, setSectionDecorationEdit] = useState(null);
  const supportsPointerEvents =
    typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
  const isHoverSuppressed =
    typeof window !== "undefined" &&
    Boolean(window._isDragging || window._grupoLider || window._resizeData?.isResizing);
  const effectiveHoverId = isHoverSuppressed ? null : hoverId;

  useEffect(() => {
    canvasEditorRenderCountRef.current += 1;
    if (typeof window === "undefined") return;

    if (canvasEditorObjetosRef.current !== objetos) {
      canvasEditorObjetosRef.current = objetos;
      canvasEditorObjetosVersionRef.current += 1;
    }
    if (canvasEditorSeccionesRef.current !== secciones) {
      canvasEditorSeccionesRef.current = secciones;
      canvasEditorSeccionesVersionRef.current += 1;
    }

    const isInteractionActive =
      window._isDragging ||
      window._grupoLider ||
      window._resizeData?.isResizing;
    if (!isInteractionActive) return;

    const nextSnapshot = {
      objetosVersion: canvasEditorObjetosVersionRef.current,
      seccionesVersion: canvasEditorSeccionesVersionRef.current,
      selectedIds: elementosSeleccionados.join(","),
      preselectedIds: elementosPreSeleccionados.join(","),
      hoverId: effectiveHoverId || null,
      editingId: editing.id || null,
      inlineOverlayMountedId: inlineOverlayMountedId || null,
      inlineOverlayPhase: inlineOverlayMountSession?.phase || null,
      activeSectionId: seccionActivaId || null,
      selectionBoxActive: Boolean(seleccionActiva || areaSeleccion),
      sectionDecorationEditKey: sectionDecorationEdit
        ? `${sectionDecorationEdit.sectionId || "?"}:${sectionDecorationEdit.decorationId || "?"}`
        : null,
    };
    const diff = buildCanvasDragPerfDiff(
      canvasEditorRenderSnapshotRef.current,
      nextSnapshot
    );
    canvasEditorRenderSnapshotRef.current = nextSnapshot;

    trackCanvasDragPerf("render:CanvasEditor", {
      renderCount: canvasEditorRenderCountRef.current,
      objectsCount: objetos.length,
      sectionsCount: secciones.length,
      selectedCount: elementosSeleccionados.length,
      dragging: Boolean(window._isDragging),
      groupLeader: window._grupoLider || null,
      resizing: Boolean(window._resizeData?.isResizing),
      changedKeys: diff.changedKeys,
      changes: diff.changes,
      ...nextSnapshot,
    }, {
      throttleMs: 120,
      throttleKey: "render:CanvasEditor",
    });
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const analysisWindowUntil = Number(window.__CANVAS_DRAG_ANALYSIS_UNTIL || 0);
    const isAnalysisActive =
      Boolean(window._isDragging) ||
      Boolean(window._grupoLider) ||
      Boolean(window._resizeData?.isResizing) ||
      analysisWindowUntil > nowMs;
    const tracedHoverId = isAnalysisActive ? null : (hoverId || null);

    const prevSnapshot = canvasEditorStateTraceRef.current;
    const nextSnapshot = {
      selectedIds: elementosSeleccionados.join(","),
      preselectedIds: elementosPreSeleccionados.join(","),
      hoverId: tracedHoverId,
    };
    canvasEditorStateTraceRef.current = nextSnapshot;

    if (!prevSnapshot) return;
    if (!isAnalysisActive) return;

    if (prevSnapshot.hoverId !== nextSnapshot.hoverId) {
      trackCanvasDragPerf("state:hover-change", {
        previousHoverId: prevSnapshot.hoverId,
        nextHoverId: nextSnapshot.hoverId,
        selectedIds: nextSnapshot.selectedIds,
        preselectedIds: nextSnapshot.preselectedIds,
        dragging: Boolean(window._isDragging),
      }, {
        throttleMs: 40,
        throttleKey: "state:hover-change",
      });
    }

    if (prevSnapshot.preselectedIds !== nextSnapshot.preselectedIds) {
      trackCanvasDragPerf("state:preselect-change", {
        previousPreselectedIds: prevSnapshot.preselectedIds,
        nextPreselectedIds: nextSnapshot.preselectedIds,
        hoverId: nextSnapshot.hoverId,
        selectedIds: nextSnapshot.selectedIds,
        dragging: Boolean(window._isDragging),
      }, {
        throttleMs: 40,
        throttleKey: "state:preselect-change",
      });
    }

    if (prevSnapshot.selectedIds !== nextSnapshot.selectedIds) {
      trackCanvasDragPerf("state:selection-change", {
        previousSelectedIds: prevSnapshot.selectedIds,
        nextSelectedIds: nextSnapshot.selectedIds,
        hoverId: nextSnapshot.hoverId,
        preselectedIds: nextSnapshot.preselectedIds,
        dragging: Boolean(window._isDragging),
      }, {
        throttleMs: 40,
        throttleKey: "state:selection-change",
      });
    }
  }, [elementosPreSeleccionados, elementosSeleccionados, hoverId]);

  useEffect(() => {
    setDraftMeta({
      plantillaId: null,
      templateWorkspace: null,
      templateAuthoringDraft: null,
      loadedAt: 0,
    });
    setTemplateEditorialPanelOpen(false);
    setSectionDecorationEdit(null);
  }, [slug]);

  useEffect(() => {
    setSectionDecorationEdit((previous) => {
      if (!previous?.sectionId || !previous?.decorationId) return previous;
      const targetSection = secciones.find((section) => section?.id === previous.sectionId);
      if (!targetSection) return null;
      const decoration = normalizeSectionBackgroundModel(targetSection, {
        sectionHeight: targetSection.altura,
      }).decoraciones.find((item) => item.id === previous.decorationId);
      return decoration ? previous : null;
    });
  }, [secciones]);

  useEffect(() => {
    setSectionDecorationEdit((previous) => {
      if (!previous?.sectionId || !seccionActivaId) return previous;
      if (previous.sectionId === seccionActivaId) return previous;
      return null;
    });
  }, [seccionActivaId]);

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
  const { abrirPanelRegalos } = useCanvasEditorGiftBridge({
    giftsConfig,
    setGiftsConfig,
  });
  const registerPersistenceBridge = useCallback((bridge) => {
    persistenceBridgeRef.current =
      bridge && typeof bridge === "object" ? bridge : null;
  }, []);

  const flushEditorPersistence = useCallback((options = {}) => {
    const flushNow = persistenceBridgeRef.current?.flushNow;
    if (typeof flushNow !== "function") {
      return Promise.resolve({
        ok: false,
        reason: "bridge-unavailable",
        error: "El editor todavia no expuso un flush directo.",
      });
    }
    return flushNow(options);
  }, []);





  useBorradorSync({
    slug,
    editorSession,
    userId,
    readOnly,
    initialDraftData,
    initialEditorData,
    onRegisterPersistenceBridge: registerPersistenceBridge,

    objetos,
    secciones,
    rsvp: rsvpConfig,
    gifts: giftsConfig,
    cargado,

    setObjetos,
    setSecciones,
    setRsvp: setRsvpConfig,
    setGifts: setGiftsConfig,
    setCargado,
    setSeccionActivaId,
    onDraftLoaded: (meta) => {
      const safeMeta = meta && typeof meta === "object" ? meta : {};
      setDraftMeta({
        plantillaId:
          typeof safeMeta.plantillaId === "string" ? safeMeta.plantillaId : null,
        templateWorkspace:
          safeMeta.templateWorkspace &&
          typeof safeMeta.templateWorkspace === "object"
            ? safeMeta.templateWorkspace
            : null,
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
    setSecciones,

    secciones,
    seccionActivaId,

    setElementosSeleccionados,
    rsvpConfig,
    setRsvpConfig,
    giftsConfig,
    setGiftsConfig,
    onRequestRsvpSetup: abrirPanelRsvp,
    onRequestGiftSetup: abrirPanelRegalos,

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

  const setHoverId = useCallback((nextHoverId) => {
    setHoverIdState((currentHoverId) => {
      if (
        typeof window !== "undefined" &&
        (window._isDragging || window._grupoLider || window._resizeData?.isResizing)
      ) {
        return currentHoverId;
      }

      const resolvedHoverId =
        typeof nextHoverId === "function"
          ? nextHoverId(currentHoverId)
          : nextHoverId;

      return Object.is(currentHoverId, resolvedHoverId)
        ? currentHoverId
        : resolvedHoverId;
    });
  }, []);

  const cerrarMenusFlotantes = useCallback(() => {
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
    setMostrarSelectorFuente(false);
    setMostrarSelectorTamano(false);
    setHoverId(null);
  }, [setHoverId]);

  const clearCanvasSelectionUi = useCallback(() => {
    setElementosSeleccionados([]);
    setElementosPreSeleccionados([]);
    setSeleccionActiva(false);
    setInicioSeleccion(null);
    setAreaSeleccion(null);
    cerrarMenusFlotantes();
  }, [
    cerrarMenusFlotantes,
    setAreaSeleccion,
    setElementosPreSeleccionados,
    setInicioSeleccion,
    setSeleccionActiva,
  ]);

  // ???Elemento actualmente seleccionado (o null)
  const objetoSeleccionado =
    elementosSeleccionados.length === 1
      ? objetos.find(o => o.id === elementosSeleccionados[0])
      : null;

  const templateAuthoring = useTemplateFieldAuthoring({
    enabled: canManageSite,
    slug,
    editorSession,
    userId,
    objetos,
    selectedElement: objetoSeleccionado,
    draftMeta,
  });
  const canRenderTemplateAuthoringMenu =
    canManageSite &&
    templateAuthoring.selectedIsSupportedElement;
  const templateWorkspace =
    draftMeta?.templateWorkspace && typeof draftMeta.templateWorkspace === "object"
      ? draftMeta.templateWorkspace
      : null;
  const canOpenTemplateEditorialPanel =
    canManageSite &&
    Boolean(templateWorkspace?.templateId) &&
    templateWorkspace?.mode === "template_edit";

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
  const handleTemplateEditorialSaved = useCallback((nextTemplate) => {
    const safeTemplate =
      nextTemplate && typeof nextTemplate === "object" ? nextTemplate : {};
    const nextPermissions =
      safeTemplate.permissions && typeof safeTemplate.permissions === "object"
        ? safeTemplate.permissions
        : templateWorkspace?.permissions || {};

    setDraftMeta((previous) => ({
      ...previous,
      templateWorkspace: previous?.templateWorkspace
        ? {
            ...previous.templateWorkspace,
            estadoEditorial: safeTemplate.estadoEditorial || previous.templateWorkspace.estadoEditorial || "publicada",
            tags: Array.isArray(safeTemplate.tags)
              ? safeTemplate.tags
              : previous.templateWorkspace.tags || [],
            templateName:
              safeTemplate.nombre ||
              previous.templateWorkspace.templateName ||
              "Plantilla",
            permissions: nextPermissions,
            readOnly:
              nextPermissions?.readOnly === true
                ? true
                : previous.templateWorkspace.readOnly === true,
          }
        : previous?.templateWorkspace || null,
    }));
  }, [templateWorkspace?.permissions]);

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

  const mobileTypographyToolbarVisible =
    isMobile && isTypographyEditableCanvasObject(objetoSeleccionado);

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
    if (typeof window === "undefined") return undefined;

    const applyKonvaPixelRatio = () => {
      const desiredRatio = resolveKonvaPixelRatio();
      if (Konva.pixelRatio !== desiredRatio) {
        Konva.pixelRatio = desiredRatio;
        stageRef.current?.getStage?.()?.batchDraw?.();
      }
    };

    applyKonvaPixelRatio();
    window.addEventListener("resize", applyKonvaPixelRatio);
    return () => {
      window.removeEventListener("resize", applyKonvaPixelRatio);
    };
  }, []);

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
    calcularPosTextoDesdeCentro,
    ajustarFontSizeAAnchoVisual,
    obtenerCentroVisualTextoX,
    calcularXTextoCentrado,
  } = textLayoutUtils;

  const calcularPatchTextoDesdeCentro = useCallback(
    (objTexto, nextFontSize, centerX, centerY) => {
      if (!objTexto || objTexto.tipo !== "texto") return null;

      const rotation = Number.isFinite(objTexto.rotation) ? objTexto.rotation : 0;
      const positioned = calcularPosTextoDesdeCentro(
        objTexto,
        nextFontSize,
        centerX,
        centerY,
        rotation
      );
      if (!positioned) return null;

      const nextX = Number(positioned.x);
      const nextYAbs = Number(positioned.y);
      const nextY =
        Number.isFinite(nextYAbs) && objTexto.seccionId
          ? convertirAbsARel(nextYAbs, objTexto.seccionId, seccionesOrdenadas)
          : null;

      return {
        x: Number.isFinite(nextX)
          ? nextX
          : (Number.isFinite(objTexto.x) ? objTexto.x : 0),
        y: Number.isFinite(nextY)
          ? nextY
          : (Number.isFinite(objTexto.y) ? objTexto.y : 0),
      };
    },
    [calcularPosTextoDesdeCentro, convertirAbsARel, seccionesOrdenadas]
  );

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
    onDeshacer: readOnly ? () => {} : onDeshacer,
    onRehacer: readOnly ? () => {} : onRehacer,
    onDuplicar: readOnly ? () => {} : onDuplicar,
    onEliminar: readOnly ? () => {} : onEliminar,
    onDeseleccionar: () => {
      if (sectionDecorationEdit?.sectionId && sectionDecorationEdit?.decorationId) {
        setSectionDecorationEdit(null);
        return;
      }
      if (elementosSeleccionados.length > 0) clearCanvasSelectionUi();
    },
    onCopiar: readOnly ? () => {} : onCopiar,
    onPegar: readOnly ? () => {} : onPegar,
    onCambiarAlineacion: readOnly ? () => {} : onCambiarAlineacion,
    isEditing: readOnly ? false : !!editing.id,
    tieneSeleccion: readOnly ? false : elementosSeleccionados.length > 0
  });


  const cambiarColorFondoSeccion = useCallback((seccionId, nuevoColor) => {
    setSectionDecorationEdit((previous) =>
      previous?.sectionId === seccionId ? null : previous
    );
    setSecciones((prev) => applySectionSolidBackground(prev, seccionId, nuevoColor));
  }, [setSecciones]);

  const usarImagenComoDecoracionFondo = useCallback((elementoImagen) => {
    convertirImagenEnDecoracionFondo({
      elementoImagen,
      secciones,
      objetos,
      setSecciones,
      setObjetos,
      setElementosSeleccionados,
      setSeccionActivaId,
      setSectionDecorationEdit,
      setMostrarPanelZ,
    });
  }, [
    objetos,
    secciones,
    setElementosSeleccionados,
    setObjetos,
    setSeccionActivaId,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const activeBackgroundDecorationMenuItem = useMemo(() => {
    if (!sectionDecorationEdit?.sectionId || !sectionDecorationEdit?.decorationId) return null;

    const sectionIndex = seccionesOrdenadas.findIndex(
      (section) => section?.id === sectionDecorationEdit.sectionId
    );
    if (sectionIndex === -1) return null;

    const targetSection = seccionesOrdenadas[sectionIndex];
    const decoration = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight: targetSection.altura,
    }).decoraciones.find((item) => item.id === sectionDecorationEdit.decorationId);

    if (!decoration) return null;

    const offsetY = calcularOffsetY(seccionesOrdenadas, sectionIndex, altoCanvas);

    return {
      id: `decoracion-fondo:${targetSection.id}:${decoration.id}`,
      tipo: "decoracion-fondo",
      nombre: decoration.nombre || "Decoracion del fondo",
      src: decoration.src,
      seccionId: targetSection.id,
      decorationId: decoration.id,
      x: decoration.x,
      y: offsetY + decoration.y,
      width: decoration.width,
      height: decoration.height,
      rotation: decoration.rotation || 0,
    };
  }, [altoCanvas, sectionDecorationEdit, seccionesOrdenadas]);

  const handleConvertirDecoracionFondoEnImagen = useCallback(() => {
    if (!activeBackgroundDecorationMenuItem) return;

    convertirDecoracionFondoEnImagen({
      seccionId: activeBackgroundDecorationMenuItem.seccionId,
      decorationId: activeBackgroundDecorationMenuItem.decorationId,
      secciones,
      objetos,
      setSecciones,
      setObjetos,
      setElementosSeleccionados,
      setSectionDecorationEdit,
      setSeccionActivaId,
    });
    setMostrarPanelZ(false);
  }, [
    activeBackgroundDecorationMenuItem,
    objetos,
    secciones,
    setElementosSeleccionados,
    setObjetos,
    setSeccionActivaId,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const handleEliminarDecoracionFondo = useCallback(() => {
    if (!activeBackgroundDecorationMenuItem) return;

    setSecciones((previous) =>
      removeBackgroundDecoration(
        previous,
        activeBackgroundDecorationMenuItem.seccionId,
        activeBackgroundDecorationMenuItem.decorationId
      )
    );
    setSectionDecorationEdit((previous) => {
      if (
        previous?.sectionId === activeBackgroundDecorationMenuItem.seccionId &&
        previous?.decorationId === activeBackgroundDecorationMenuItem.decorationId
      ) {
        return null;
      }
      return previous;
    });
    setMostrarPanelZ(false);
  }, [
    activeBackgroundDecorationMenuItem,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const handleFinalizarAjusteDecoracionFondo = useCallback(() => {
    setSectionDecorationEdit(null);
    setMostrarPanelZ(false);
  }, [setSectionDecorationEdit, setMostrarPanelZ]);

  useEffect(() => {
    if (sectionDecorationEdit?.sectionId && sectionDecorationEdit?.decorationId) return;
    setMostrarPanelZ(false);
  }, [sectionDecorationEdit]);


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
    repairTemplateAuthoringState: templateAuthoring.repairSnapshot,
    flushPersistenceNow: flushEditorPersistence,
  });


  const {
    seccionPendienteEliminar,
    cantidadElementosSeccionPendiente,
    altoCanvasDinamico,
    esSeccionPantallaById,
    abrirModalBorrarSeccion,
    cerrarModalBorrarSeccion,
    confirmarBorrarSeccion,
    onSelectSeccion,
    moverSeccionConScroll,
  } = useCanvasEditorSectionFlow({
    slug,
    secciones,
    objetos,
    seccionesOrdenadas,
    seccionActivaId,
    setSeccionActivaId,
    setSecciones,
    setObjetos,
    seccionesAnimando,
    setSeccionesAnimando,
    deleteSectionModal,
    setDeleteSectionModal,
    isDeletingSection,
    setIsDeletingSection,
    stageRef,
    autoSectionViewportRef,
    autoSectionScrollRafRef,
    followMoveScrollRafRef,
    seccionesAnimandoActivasRef,
    bloqueoAutoSeleccionSeccionRef,
    ultimaSeccionMovidaRef,
    previoAnimandoSeccionesRef,
    seccionActivaIdRef,
    normalizarAltoModo,
  });
  // ?? NUEVO HOOK PARA GUÃAS
  const publishGuideLines = useCallback((nextLines = []) => {
    guideOverlayRef.current?.setGuideLines?.(nextLines);
  }, []);

  const {
    prepararGuias,
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
    seccionesOrdenadas,
    onGuideLinesChange: publishGuideLines,
  });

  // ?? FunciÃ³n para actualizar posiciÃ³n del botÃ³n SIN re-render
  const { actualizarPosicionBotonOpciones } = useOptionButtonPosition({
    botonOpcionesRef,
    layoutRootRef: editorOverlayRootRef,
    elementRefs,
    elementosSeleccionados,
    backgroundDecorationSelection: activeBackgroundDecorationMenuItem,
    stageRef,
    escalaVisual,
    escalaActiva,
    isMobile,
    buttonSize: optionButtonSize,
  });

  const {
    handleTransformInteractionStart,
    handleTransformInteractionEnd,
  } = useCanvasEditorInteractionEffects({
    elementosSeleccionados,
    editingId: editing.id,
    setIsSelectionRotating,
    setMostrarPanelZ,
    actualizarPosicionBotonOpciones,
    setElementosPreSeleccionados,
    objetos,
    elementRefs,
  });
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

  const {
    inlineDebugAB,
    ensureInlineFontReady,
    captureInlineSnapshot,
    handleInlineOverlaySwapRequest,
    onInlineChange,
    onInlineDebugEvent,
    onInlineFinish,
  } = useCanvasEditorTextSystem({
    runtimeParams: {
      editing,
      isMobile,
      mobileSectionActionsOpen,
      setMobileSectionActionsOpen,
      seccionActivaId,
      fontManager,
      inlineSwapAckSeqRef,
      inlineCommitDebugRef,
      inlineVisibilitySnapshotRef,
      inlineKonvaDrawMetaRef,
      inlinePaintApproxRef,
      logInlineSnapshotRef,
      inlineRenderValueRef,
      inlineOverlayMountedId,
      setInlineOverlayMountedId,
      inlineOverlayMountSession,
      setInlineOverlayMountSession,
      setInlineSwapAck,
      stageRef,
      elementRefs,
      escalaVisual,
      objetos,
      startEdit,
      updateEdit,
      finishEdit,
      restoreElementDrag,
      obtenerMetricasNodoInline,
    },
    commitParams: (runtime) => ({
      editing,
      captureInlineSnapshot: runtime.captureInlineSnapshot,
      updateEdit,
      objetos,
      elementRefs,
      inlineEditPreviewRef,
      inlineCommitDebugRef,
      inlineOverlayMountedId,
      setInlineOverlayMountedId,
      setInlineOverlayMountSession,
      inlineOverlayEngine: runtime.inlineDebugAB?.overlayEngine || "phase_atomic_v2",
      finishEdit,
      restoreElementDrag,
      stageRef,
      escalaVisual,
      medirAnchoTextoKonva,
      obtenerMetricasTexto,
      calcularXTextoCentrado,
      setObjetos,
      setElementosSeleccionados,
      setMostrarPanelZ,
      obtenerMetricasNodoInline,
    }),
  });

  const textEditInteractionController = useTextEditInteractionController({
    editing,
    stageRef,
    scaleVisual: escalaVisual,
    onChange: onInlineChange,
    onFinish: onInlineFinish,
    onDebugEvent: onInlineDebugEvent,
  });
  const textEditBackendController = useMemo(() => ({
    registerBackend: textEditInteractionController.registerBackend,
    handleInput: textEditInteractionController.handleInput,
    handleFocus: textEditInteractionController.handleFocus,
    handleBlur: textEditInteractionController.handleBlur,
    handleKeyDown: textEditInteractionController.handleKeyDown,
    handleSelectionMutation: textEditInteractionController.handleSelectionMutation,
    syncDecorations: textEditInteractionController.syncDecorations,
    nativeCaretVisible: textEditInteractionController.nativeCaretVisible,
  }), [
    textEditInteractionController.handleBlur,
    textEditInteractionController.handleFocus,
    textEditInteractionController.handleInput,
    textEditInteractionController.handleKeyDown,
    textEditInteractionController.handleSelectionMutation,
    textEditInteractionController.nativeCaretVisible,
    textEditInteractionController.registerBackend,
    textEditInteractionController.syncDecorations,
  ]);

  const requestInlineEditFinish = useCallback((reason = "manual") => {
    const handled = textEditInteractionController.requestFinish(reason);
    if (!handled && editing.id) {
      onInlineFinish();
      return true;
    }
    return handled;
  }, [editing.id, onInlineFinish, textEditInteractionController.requestFinish]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (elementosSeleccionados.length === 0) return undefined;

    const resolveTargetElement = (target) => {
      if (target instanceof Element) return target;
      if (target instanceof Node) return target.parentElement;
      return null;
    };

    const isInsideCanvasStage = (targetElement) => {
      if (!targetElement) return false;
      const stage = stageRef.current?.getStage?.() || stageRef.current;
      const container = stage?.container?.() || stage?.content || null;
      return Boolean(container && typeof container.contains === "function" && container.contains(targetElement));
    };

    const shouldPreserveSelection = (targetElement) =>
      Boolean(targetElement?.closest?.(PRESERVE_CANVAS_SELECTION_SELECTOR));

    const handlePointerOutsideCanvas = (event) => {
      if (
        typeof window !== "undefined" &&
        (window._isDragging || window._grupoLider || window._resizeData?.isResizing)
      ) {
        return;
      }
      const targetElement = resolveTargetElement(event.target);
      if (!targetElement) return;
      if (isInsideCanvasStage(targetElement)) return;
      if (shouldPreserveSelection(targetElement)) return;

      if (editing.id) {
        requestInlineEditFinish("outside-canvas-pointerdown");
      }
      clearCanvasSelectionUi();
    };

    if (typeof window !== "undefined" && "PointerEvent" in window) {
      document.addEventListener("pointerdown", handlePointerOutsideCanvas, true);
      return () => {
        document.removeEventListener("pointerdown", handlePointerOutsideCanvas, true);
      };
    }

    document.addEventListener("mousedown", handlePointerOutsideCanvas, true);
    document.addEventListener("touchstart", handlePointerOutsideCanvas, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerOutsideCanvas, true);
      document.removeEventListener("touchstart", handlePointerOutsideCanvas, true);
    };
  }, [
    clearCanvasSelectionUi,
    editing.id,
    elementosSeleccionados.length,
    requestInlineEditFinish,
    stageRef,
  ]);




  useCanvasEditorGlobalsBridge({
    elementosSeleccionados,
    objetos,
    elementRefs,
    secciones,
    rsvpConfig,
    giftsConfig,
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

            {!readOnly && (
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
                sectionDecorationEdit={sectionDecorationEdit}
                setSectionDecorationEdit={setSectionDecorationEdit}
                setSeccionActivaId={setSeccionActivaId}
                canManageSite={canManageSite}
                refrescarPlantillasDeSeccion={refrescarPlantillasDeSeccion}
                abrirModalBorrarSeccion={abrirModalBorrarSeccion}
              />
            )}


            <div
              style={{
                position: "relative",
                width: 800,
                height: altoCanvasDinamico,
                pointerEvents: readOnly ? "none" : "auto",
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
                prepararGuias={prepararGuias}
                mostrarGuias={mostrarGuias}
                elementRefs={elementRefs}
                actualizarPosicionBotonOpciones={actualizarPosicionBotonOpciones}
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
                setInlineOverlayMountSession={setInlineOverlayMountSession}
                setInlineSwapAck={setInlineSwapAck}
                captureInlineSnapshot={captureInlineSnapshot}
                startEdit={startEdit}
                inlineOverlayMountedId={inlineOverlayMountedId}
                inlineOverlayMountSession={inlineOverlayMountSession}
                inlineDebugAB={inlineDebugAB}
                finishEdit={finishEdit}
                restoreElementDrag={restoreElementDrag}
                requestInlineEditFinish={requestInlineEditFinish}
                onInlineEditCanvasPointer={textEditInteractionController.handleCanvasPointer}
                inlineEditDecorations={textEditInteractionController.decorations}
                configurarDragEnd={configurarDragEnd}
                ajustarFontSizeAAnchoVisual={ajustarFontSizeAAnchoVisual}
                calcularPosTextoDesdeCentro={calcularPosTextoDesdeCentro}
                textResizeDebug={textResizeDebug}
                isTextResizeDebugEnabled={isTextResizeDebugEnabled}
                actualizarObjeto={actualizarObjeto}
                hoverId={effectiveHoverId}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                actualizarLinea={actualizarLinea}
                guiaLineas={[]}
                guideOverlayRef={guideOverlayRef}
                handleTransformInteractionStart={handleTransformInteractionStart}
                handleTransformInteractionEnd={handleTransformInteractionEnd}
                normalizarMedidasGaleria={normalizarMedidasGaleria}
                setElementosSeleccionados={setElementosSeleccionados}
                setSecciones={setSecciones}
                sectionDecorationEdit={sectionDecorationEdit}
                setSectionDecorationEdit={setSectionDecorationEdit}
              />


            </div>

            {!readOnly && (
              <CanvasInlineEditingLayer
                editing={editing}
                elementRefs={elementRefs}
                objetos={objetos}
                escalaVisual={escalaVisual}
                textEditController={textEditInteractionController}
                textEditBackendController={textEditBackendController}
                isMobile={isMobile}
                zoom={zoom}
                altoCanvasDinamico={altoCanvasDinamico}
                seccionesOrdenadas={seccionesOrdenadas}
              />
            )}


          </div>


        </div>


      </div>



      {/* ? BotÃ³n de opciones PEGADO a la esquina superior derecha del elemento */}
      {(!readOnly || canOpenTemplateEditorialPanel) && (
        <CanvasEditorOverlays
          readOnly={readOnly}
          elementosSeleccionados={elementosSeleccionados}
          editingId={editing.id}
          isSelectionRotating={isSelectionRotating}
          botonOpcionesRef={botonOpcionesRef}
          optionButtonSize={optionButtonSize}
          togglePanelOpciones={togglePanelOpciones}
          isMobile={isMobile}
          canManageSite={canManageSite}
          templateAuthoring={templateAuthoring}
          editorOverlayRootRef={editorOverlayRootRef}
          stageRef={stageRef}
          elementRefs={elementRefs}
          hoverId={effectiveHoverId}
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
          setSeccionActivaId={setSeccionActivaId}
          setSectionDecorationEdit={setSectionDecorationEdit}
          usarComoDecoracionFondo={usarImagenComoDecoracionFondo}
          abrirPanelRsvp={abrirPanelRsvp}
          abrirPanelRegalos={abrirPanelRegalos}
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
          calcularPatchTextoDesdeCentro={calcularPatchTextoDesdeCentro}
          obtenerCentroVisualTextoX={obtenerCentroVisualTextoX}
          canOpenTemplateEditorialPanel={canOpenTemplateEditorialPanel}
          templateWorkspace={templateWorkspace}
          onOpenTemplateEditorialPanel={() => setTemplateEditorialPanelOpen(true)}
          deleteSectionModal={deleteSectionModal}
          seccionPendienteEliminar={seccionPendienteEliminar}
          cantidadElementosSeccionPendiente={cantidadElementosSeccionPendiente}
          isDeletingSection={isDeletingSection}
          cerrarModalBorrarSeccion={cerrarModalBorrarSeccion}
          confirmarBorrarSeccion={confirmarBorrarSeccion}
          sectionDecorationEdit={sectionDecorationEdit}
          activeBackgroundDecorationMenuItem={activeBackgroundDecorationMenuItem}
          onConvertirDecoracionFondoEnImagen={handleConvertirDecoracionFondoEnImagen}
          onEliminarDecoracionFondo={handleEliminarDecoracionFondo}
          onFinalizarAjusteDecoracionFondo={handleFinalizarAjusteDecoracionFondo}
        />
      )}

      <TemplateEditorialDrawer
        open={templateEditorialPanelOpen}
        onClose={() => setTemplateEditorialPanelOpen(false)}
        templateWorkspace={templateWorkspace}
        onSaved={handleTemplateEditorialSaved}
      />



    </div>
  );

}










