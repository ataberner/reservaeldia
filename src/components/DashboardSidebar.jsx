// src/components/DashboardSidebar.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import AssistantGuidedTour from "@/components/editor/assistantTour/AssistantGuidedTour";
import { logAssistantTourDebug } from "@/components/editor/assistantTour/assistantTourDebug";
import MiniToolbar from "./MiniToolbar";
import PanelDeFormas from "./PanelDeFormas";
import ModalCrearSeccion from "./ModalCrearSeccion";
import {
    FaChevronRight,
    FaFont,
    FaGift,
    FaMagic,
    FaRegCalendarAlt,
    FaRegClock,
    FaRegEnvelope,
    FaRegImage,
    FaShapes,
    FaTimes,
} from "react-icons/fa";
import { GripHorizontal, Redo2, Sparkles, Undo2 } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import useModalCrearSeccion from "@/hooks/useModalCrearSeccion";
import useMisImagenes from "@/hooks/useMisImagenes";
import useUploaderDeImagen from "@/hooks/useUploaderDeImagen";
import { functions } from "@/firebase";
import {
    triggerEditorRedo,
    triggerEditorUndo,
} from "@/utils/editorHistoryControls";
import {
    buildCanvasImageElementFromLibraryImage,
    canAccessGalleryBuilder,
    resolveValidGalleryCellSelection,
} from "@/domain/gallery/sidebarModel";
import { normalizeGalleryLayoutIds } from "@/domain/gallery/galleryLayoutPresets";
import { resolveStoryTextSidebarBinding } from "@/domain/templates/storyText";
import {
    clampAssistantStepIndex,
    getAssistantNavigationState,
    getAssistantStep,
    getAssistantStepIndexByTabId,
    getAssistantSteps,
    isAssistantTabId,
    resolveAssistantResumeStepIndex,
} from "@/domain/editor/assistantMode";
import {
    clampAssistantSubstepIndex,
    getAssistantLinearProgressLabel,
    getAssistantSubstep,
    getAssistantSubstepSignature,
    hasAssistantPhotoStepContent,
    resolveAssistantSubstepsForStep,
} from "@/domain/editor/assistantSubsteps";
import {
    ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR,
    ASSISTANT_GUIDED_TOUR_TARGET_ATTR,
    ASSISTANT_GUIDED_TOUR_TARGETS,
} from "@/domain/editor/assistantGuidedTour";
import {
    DASHBOARD_EDITOR_CANVAS_GAP_PX as DESKTOP_PANEL_GAP_PX,
    DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX as DESKTOP_PANEL_LEFT_PX,
    DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX as DESKTOP_PANEL_WIDTH_PX,
    DASHBOARD_SIDEBAR_MOBILE_BREAKPOINT_PX as MOBILE_BREAKPOINT,
    DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT,
    createDashboardSidebarPanelLayout,
    resolveEditorSidebarAutoOpenDraftKey,
} from "@/domain/dashboard/editorCanvasLayout";
import { shouldPreventMobileScrollChain } from "@/domain/dashboard/mobileScrollContainment";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
    readCanvasEditorMethod,
    readEditorObjects,
    readEditorSections,
    readEditorSelectionSnapshot,
} from "@/lib/editorRuntimeBridge";


/**
 * Evita el error: "parameter 1 is not of type 'Node'"
 * En mouseleave, relatedTarget puede ser null o un objeto que no es Node.
 */
function safeContains(container, maybeNode) {
    if (!container) return false;
    if (!maybeNode) return false;
    // En algunos casos relatedTarget puede ser Window/Document/etc.
    if (!(maybeNode instanceof Node)) return false;
    return container.contains(maybeNode);
}

const MOBILE_BAR_HEIGHT_PX = 96;
const MOBILE_PANEL_GUTTER_PX = 8;
const MOBILE_PANEL_BOTTOM_EXTRA_PX = 2;
const MOBILE_SCROLL_FADE_WIDTH_PX = 92;
const MOBILE_PANEL_MIN_HEIGHT_PX = 240;
const MOBILE_PANEL_DEFAULT_HEIGHT_RATIO = 0.52;
const MOBILE_PANEL_DEFAULT_MAX_HEIGHT_PX = 440;
const MOBILE_PANEL_MAX_HEIGHT_RATIO = 0.72;
const MOBILE_PANEL_TOP_GAP_PX = 12;
const MOBILE_PANEL_SCROLL_GESTURE_TOLERANCE_PX = 4;
const TABS_WITH_AUTO_CLOSE_ON_INSERT = new Set(["texto", "imagen", "gallery-builder", "contador", "efectos"]);
const SIDEBAR_TOOL_TABS = Object.freeze([
    {
        id: "detalles",
        title: "Detalles del evento",
        desktopLabel: "Detalles evento",
        mobileLabel: "Evento",
        Icon: FaRegCalendarAlt,
        wide: true,
    },
    {
        id: "texto",
        title: "Texto",
        desktopLabel: "Texto",
        mobileLabel: "Texto",
        Icon: FaFont,
        mobileIconSrc: "/icons/texto.png",
    },
    {
        id: "forma",
        title: "Elementos",
        desktopLabel: "Elementos",
        mobileLabel: "Elementos",
        Icon: FaShapes,
        mobileIconSrc: "/icons/forma.png",
    },
    {
        id: "imagen",
        title: "Fotos",
        desktopLabel: "Fotos",
        mobileLabel: "Fotos",
        Icon: FaRegImage,
        mobileIconSrc: "/icons/imagen.png",
    },
    {
        id: "gallery-builder",
        title: "Builder de galeria",
        mobileTitle: "Builder galeria",
        desktopLabel: "Builder gal.",
        mobileLabel: "Builder",
        Icon: FaRegImage,
        requiresGalleryBuilder: true,
        wide: true,
    },
    {
        id: "contador",
        title: "Contador",
        desktopLabel: "Contador",
        mobileLabel: "Contador",
        Icon: FaRegClock,
        requiresCountdown: true,
    },
    {
        id: "rsvp",
        title: "Asistencia",
        desktopLabel: "Asistencia",
        mobileLabel: "Asistencia",
        Icon: FaRegEnvelope,
    },
    {
        id: "regalos",
        title: "Regalos",
        desktopLabel: "Regalos",
        mobileLabel: "Regalos",
        Icon: FaGift,
    },
    {
        id: "efectos",
        title: "Efectos",
        desktopLabel: "Efectos",
        mobileLabel: "Efectos",
        Icon: FaMagic,
        mobileIconText: "Fx",
        requiresAdmin: true,
    },
]);

function renderMobileSidebarTabIcon(tab) {
    if (tab.mobileIconSrc) {
        return <img src={tab.mobileIconSrc} alt={tab.mobileLabel} className="h-5 w-5" />;
    }

    if (tab.mobileIconText) {
        return <span className="text-[13px] font-bold">{tab.mobileIconText}</span>;
    }

    const Icon = tab.Icon;
    return <Icon className="text-lg" aria-hidden="true" />;
}

function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
}

function resolveDashboardHeaderBottom() {
    if (typeof window === "undefined" || typeof document === "undefined") return 52;

    let headerBottom = 0;
    const headerNode = document.querySelector('[data-dashboard-header="true"]');
    if (headerNode && typeof headerNode.getBoundingClientRect === "function") {
        headerBottom = Math.max(0, Number(headerNode.getBoundingClientRect().bottom) || 0);
    }

    const cssValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--dashboard-header-height");
    const cssHeight = Number.parseFloat(cssValue);
    if (Number.isFinite(cssHeight) && cssHeight > 0) {
        headerBottom = Math.max(headerBottom, cssHeight);
    }

    return headerBottom || 52;
}

function resolveMobilePanelHeightBounds() {
    if (typeof window === "undefined") {
        return {
            min: MOBILE_PANEL_MIN_HEIGHT_PX,
            max: MOBILE_PANEL_DEFAULT_MAX_HEIGHT_PX,
            defaultHeight: MOBILE_PANEL_DEFAULT_MAX_HEIGHT_PX,
        };
    }

    const viewportHeight = Math.max(1, Number(window.innerHeight) || 0);
    const panelBottomOffset =
        MOBILE_BAR_HEIGHT_PX + MOBILE_PANEL_BOTTOM_EXTRA_PX;
    const availableHeight =
        viewportHeight -
        resolveDashboardHeaderBottom() -
        panelBottomOffset -
        MOBILE_PANEL_TOP_GAP_PX;
    const maxByViewport = Math.round(viewportHeight * MOBILE_PANEL_MAX_HEIGHT_RATIO);
    const max = Math.max(160, Math.floor(Math.min(maxByViewport, availableHeight)));
    const min = Math.min(MOBILE_PANEL_MIN_HEIGHT_PX, max);
    const defaultHeight = clampNumber(
        Math.round(
            Math.min(
                viewportHeight * MOBILE_PANEL_DEFAULT_HEIGHT_RATIO,
                MOBILE_PANEL_DEFAULT_MAX_HEIGHT_PX
            )
        ),
        min,
        max
    );

    return { min, max, defaultHeight };
}

function publishSidebarPanelLayout(detail = {}) {
    if (typeof window === "undefined") return;

    const nextDetail = createDashboardSidebarPanelLayout(detail);

    window.__dashboardSidebarPanelLayout = nextDetail;
    window.dispatchEvent(
        new CustomEvent(DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT, {
            detail: nextDetail,
        })
    );
}

function readTemplateAuthoringSnapshotState(targetWindow) {
    if (typeof window === "undefined" && !targetWindow) {
        return { ready: false, snapshot: {} };
    }
    const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
        "getTemplateAuthoringSnapshot",
        targetWindow
    );
    if (typeof getTemplateAuthoringSnapshot !== "function") {
        return { ready: false, snapshot: {} };
    }
    return { ready: true, snapshot: getTemplateAuthoringSnapshot() || {} };
}

function readStoryTextAssistantStepState(targetWindow) {
    const { ready, snapshot: authoringSnapshot } =
        readTemplateAuthoringSnapshotState(targetWindow);
    if (!ready) return { ready: false, hasBinding: false };

    const hasBinding = resolveStoryTextSidebarBinding({
        fieldsSchema: authoringSnapshot?.fieldsSchema,
        defaults: authoringSnapshot?.defaults,
        objetos: readEditorObjects(targetWindow),
    }).hasBinding === true;

    return { ready: true, hasBinding };
}

function isScrollableOverflowY(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized === "auto" || normalized === "scroll" || normalized === "overlay";
}

function getElementFromEventTarget(target) {
    if (!target) return null;
    if (target.nodeType === 1) return target;
    return target.parentElement || null;
}

function canScrollWithinBoundaryY(target, boundary, deltaY) {
    if (!boundary || !target || typeof window === "undefined") return false;

    let current = getElementFromEventTarget(target);
    while (current && boundary.contains(current)) {
        const style = window.getComputedStyle?.(current);
        const overflowY = style?.overflowY || style?.overflow || "";
        const canScrollY =
            isScrollableOverflowY(overflowY) &&
            Number(current.scrollHeight || 0) > Number(current.clientHeight || 0) + 1;

        if (
            canScrollY &&
            !shouldPreventMobileScrollChain({
                deltaY,
                scrollTop: current.scrollTop,
                scrollHeight: current.scrollHeight,
                clientHeight: current.clientHeight,
            })
        ) {
            return true;
        }

        if (current === boundary) break;
        current = current.parentElement;
    }

    return false;
}


export default function DashboardSidebar({
    slugInvitacion = "",
    generarVistaPrevia,
    modoSelector,
    seccionActivaId,
    historialExternos = [],
    futurosExternos = [],
    editorReadOnly = false,
    canManageSite = false,
    editorSession = null,
    templateSessionMeta = null,
    userUid = "",
    assistantTourEditorReady = false,
    assistantTourPreferencesLoaded = false,
    assistantTourOptOut = false,
    assistantTourSaving = false,
    onAssistantTourPreferenceChange = null,
    assistantTourPreviewOpen = false,
    assistantTourOpeningKey = "",
}) {
    // --------------------------
    // Estados internos del sidebar
    // --------------------------
    const initialAutoAssistantDraftKey = resolveEditorSidebarAutoOpenDraftKey({
        slugInvitacion,
        editorSession,
        modoSelector,
    });
    const shouldAutoOpenAssistantInitially = Boolean(initialAutoAssistantDraftKey);
    const initialAssistantTabId = shouldAutoOpenAssistantInitially
        ? getAssistantStep(0)?.id || "detalles"
        : null;
    const [hoverSidebar, setHoverSidebar] = useState(shouldAutoOpenAssistantInitially);
    const [fijadoSidebar, setFijadoSidebar] = useState(shouldAutoOpenAssistantInitially);
    const [, setMostrarGaleria] = useState(false);
    const [, setImagenesSeleccionadas] = useState(0);
    const [isMobileViewport, setIsMobileViewport] = useState(
        typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
    );
    const [showMobileScrollHint, setShowMobileScrollHint] = useState(false);
    const [mobilePanelHeight, setMobilePanelHeight] = useState(
        () => {
            const bounds = resolveMobilePanelHeightBounds();
            return shouldAutoOpenAssistantInitially && isMobileViewport
                ? bounds.max
                : bounds.defaultHeight;
        }
    );
    const [isMobilePanelResizing, setIsMobilePanelResizing] = useState(false);
    const modalCrear = useModalCrearSeccion();
    const [botonActivo, setBotonActivo] = useState(initialAssistantTabId); // 'detalles' | 'texto' | 'forma' | 'imagen' | 'gallery-builder' | 'contador' | 'rsvp' | 'regalos' | 'efectos' | null
    const [assistantActive, setAssistantActive] = useState(shouldAutoOpenAssistantInitially);
    const [assistantHasStarted, setAssistantHasStarted] = useState(shouldAutoOpenAssistantInitially);
    const [assistantStepIndex, setAssistantStepIndex] = useState(0);
    const [assistantSubstepIndex, setAssistantSubstepIndex] = useState(0);
    const [assistantContentVersion, setAssistantContentVersion] = useState(0);
    const [assistantHasStoryTextStep, setAssistantHasStoryTextStep] = useState(false);
    const [rsvpForcePresetSelection, setRsvpForcePresetSelection] = useState(false);
    const [assistantTourFieldEditSignal, setAssistantTourFieldEditSignal] =
        useState(null);
    const assistantTourFieldEditSignalIdRef = useRef(0);
    const sidebarDebugStateRef = useRef({});
    sidebarDebugStateRef.current = {
        assistantTourOpeningKey,
        draftKey: resolveEditorSidebarAutoOpenDraftKey({
            slugInvitacion,
            editorSession,
            modoSelector,
        }),
        assistantActive,
        botonActivo,
        assistantStepIndex,
        assistantSubstepIndex,
    };
    const {
        imagenes,
        imagenesEnProceso,
        cargarImagenes,
        subirImagen,
        borrarImagen,
        hayMas,
        cargando
    } = useMisImagenes();
    const { abrirSelector, componenteInput, handleSeleccion } = useUploaderDeImagen(subirImagen);
    const handleAssistantTourFieldEdit = useCallback((detail = {}) => {
        const targetId = String(detail?.targetId || "").trim();
        if (!targetId) return;
        assistantTourFieldEditSignalIdRef.current += 1;
        logAssistantTourDebug("owner-field-edit-signal", () => ({
            source: "DashboardSidebar.handleAssistantTourFieldEdit",
            signalId: assistantTourFieldEditSignalIdRef.current,
            targetId,
            hasValue: String(detail?.value ?? "").trim().length > 0,
            valueLength: String(detail?.value ?? "").length,
            trimmedLength: String(detail?.value ?? "").trim().length,
            ...sidebarDebugStateRef.current,
        }));
        setAssistantTourFieldEditSignal({
            id: assistantTourFieldEditSignalIdRef.current,
            targetId,
            value: String(detail?.value ?? ""),
        });
    }, []);
    const pendingUploadedImageHandlerRef = useRef(null);
    const abrirSelectorImagen = useCallback((onUploadedImage, options = {}) => {
        const request =
            onUploadedImage && typeof onUploadedImage === "object" && !Array.isArray(onUploadedImage)
                ? onUploadedImage
                : {
                    ...options,
                    onUploadedImage:
                        typeof onUploadedImage === "function" ? onUploadedImage : null,
                };
        pendingUploadedImageHandlerRef.current = request;
        abrirSelector();
    }, [abrirSelector]);
    const sidebarAbierta = fijadoSidebar || hoverSidebar;
    const canUseGalleryBuilder = canAccessGalleryBuilder({
        canManageSite,
        editorReadOnly,
        editorSession,
        templateSessionMeta,
    });
    const canUseCountdown = canManageSite === true;
    const canUseEffects = canManageSite === true;
    const assistantStoryTextStepState =
        typeof window !== "undefined"
            ? readStoryTextAssistantStepState(window)
            : { ready: false, hasBinding: false };
    const assistantIncludeStoryText = assistantStoryTextStepState.ready
        ? assistantStoryTextStepState.hasBinding
        : assistantHasStoryTextStep;
    const assistantIncludePhotos = useMemo(
        () =>
            hasAssistantPhotoStepContent({
                objects: readEditorObjects(),
                sections: readEditorSections(),
            }),
        [assistantContentVersion]
    );
    const assistantFlowOptions = useMemo(() => ({
        includeStoryText: assistantIncludeStoryText,
        includePhotos: assistantIncludePhotos,
    }), [assistantIncludePhotos, assistantIncludeStoryText]);

    // --------------------------
    // Reset de paneles al cerrar sidebar
    // --------------------------
    useEffect(() => {
        if (!sidebarAbierta) {
            setMostrarGaleria(false);
            mobilePanelResizeSessionRef.current = null;
            setIsMobilePanelResizing(false);
        }
    }, [sidebarAbierta]);

    // --------------------------
    // Cierra hover al hacer clic fuera
    // --------------------------
    useEffect(() => {
        const handleClickFuera = (e) => {
            const sidebar = asideRef.current;
            if (!sidebar) return;

            if (!sidebar.contains(e.target) && !fijadoSidebar) {
                setHoverSidebar(false);
            }
        };

        document.addEventListener("mousedown", handleClickFuera);
        return () => document.removeEventListener("mousedown", handleClickFuera);
    }, [fijadoSidebar]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const syncViewport = () => setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
        syncViewport();
        window.addEventListener("resize", syncViewport);
        return () => window.removeEventListener("resize", syncViewport);
    }, []);


    const closeTimerRef = useRef(null);
    const asideRef = useRef(null);
    const panelRef = useRef(null);
    const mobilePanelResizeSessionRef = useRef(null);
    const mobileToolbarScrollRef = useRef(null);
    const autoAssistantDraftKeyRef = useRef(initialAutoAssistantDraftKey || null);

    const syncAssistantStoryTextStep = useCallback(() => {
        if (typeof window === "undefined") return assistantHasStoryTextStep;
        const nextState = readStoryTextAssistantStepState(window);
        if (!nextState.ready) return assistantHasStoryTextStep;
        setAssistantHasStoryTextStep(nextState.hasBinding);
        return nextState.hasBinding;
    }, [assistantHasStoryTextStep]);

    const resolveAssistantFlowOptions = useCallback(() => ({
        includeStoryText: syncAssistantStoryTextStep(),
        includePhotos: hasAssistantPhotoStepContent({
            objects: readEditorObjects(),
            sections: readEditorSections(),
        }),
    }), [syncAssistantStoryTextStep]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        syncAssistantStoryTextStep();
        window.addEventListener(
            EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
            syncAssistantStoryTextStep
        );
        window.addEventListener(
            EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
            syncAssistantStoryTextStep
        );
        window.addEventListener("abrir-borrador", syncAssistantStoryTextStep);

        return () => {
            window.removeEventListener(
                EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
                syncAssistantStoryTextStep
            );
            window.removeEventListener(
                EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
                syncAssistantStoryTextStep
            );
            window.removeEventListener("abrir-borrador", syncAssistantStoryTextStep);
        };
    }, [syncAssistantStoryTextStep]);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;

        let rafId = null;
        let timeoutId = null;
        const refreshAssistantContent = () => {
            if (rafId !== null || timeoutId !== null) return;

            const commit = () => {
                rafId = null;
                timeoutId = null;
                setAssistantContentVersion((version) => version + 1);
            };

            if (typeof window.requestAnimationFrame === "function") {
                rafId = window.requestAnimationFrame(commit);
            } else {
                timeoutId = window.setTimeout(commit, 0);
            }
        };

        const events = [
            EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT,
            EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT,
            EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
            EDITOR_BRIDGE_EVENTS.GALLERY_CELL_CHANGE,
            EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
            EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_CHANGED,
            EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_CHANGED,
            EDITOR_BRIDGE_EVENTS.ACTIVE_SECTION_CHANGE,
            "abrir-borrador",
        ];

        events.forEach((eventName) => {
            window.addEventListener(eventName, refreshAssistantContent);
        });

        return () => {
            events.forEach((eventName) => {
                window.removeEventListener(eventName, refreshAssistantContent);
            });
            if (rafId !== null && typeof window.cancelAnimationFrame === "function") {
                window.cancelAnimationFrame(rafId);
            }
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, []);

    // Helpers para mostrar/ocultar con pequeno delay seguro
    const openPanel = (tipo) => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (fijadoSidebar) return;
        if (tipo) setBotonActivo(tipo);
        setHoverSidebar(true);
    };

    const scheduleClosePanel = () => {
        if (fijadoSidebar) return;
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        // Delay mas generoso
        closeTimerRef.current = setTimeout(() => setHoverSidebar(false), 250);
    };

    const cancelClosePanel = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const openAssistantAtStep = useCallback((stepIndex, options = {}) => {
        const flowOptions = resolveAssistantFlowOptions();
        const safeStepIndex = clampAssistantStepIndex(stepIndex, flowOptions);
        const step = getAssistantStep(safeStepIndex, flowOptions);
        logAssistantTourDebug("assistant-open-at-step", () => ({
            source: "DashboardSidebar.openAssistantAtStep",
            requestedStepIndex: stepIndex,
            safeStepIndex,
            options,
            step: {
                id: step?.id || "",
                label: step?.label || "",
            },
            previousState: {
                assistantActive: sidebarDebugStateRef.current.assistantActive,
                botonActivo: sidebarDebugStateRef.current.botonActivo,
                assistantStepIndex:
                    sidebarDebugStateRef.current.assistantStepIndex,
                assistantSubstepIndex:
                    sidebarDebugStateRef.current.assistantSubstepIndex,
            },
            flowOptions,
            isMobileViewport,
            assistantTourOpeningKey:
                sidebarDebugStateRef.current.assistantTourOpeningKey,
            draftKey: sidebarDebugStateRef.current.draftKey,
            stack: new Error("assistant-open-at-step").stack,
        }));

        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }

        setAssistantStepIndex(safeStepIndex);
        if (options.preserveSubstep !== true) {
            const nextSubstepIndex = Number(options.substepIndex);
            setAssistantSubstepIndex(
                Number.isFinite(nextSubstepIndex)
                    ? Math.max(0, Math.trunc(nextSubstepIndex))
                    : 0
            );
        }
        setAssistantActive(true);
        setAssistantHasStarted(true);
        setBotonActivo(step.id);
        setFijadoSidebar(true);
        setHoverSidebar(true);
        setRsvpForcePresetSelection(false);

        if (options.expandMobilePanel === true && isMobileViewport) {
            const bounds = resolveMobilePanelHeightBounds();
            setMobilePanelHeight(bounds.max);
        }
    }, [isMobileViewport, resolveAssistantFlowOptions]);

    const handleAssistantAccessClick = useCallback(() => {
        const flowOptions = resolveAssistantFlowOptions();
        const resumeStepIndex = resolveAssistantResumeStepIndex({
            hasStarted: assistantHasStarted,
            currentStepIndex: assistantStepIndex,
            ...flowOptions,
        });
        const resumeStep = getAssistantStep(resumeStepIndex, flowOptions);

        if (
            assistantActive &&
            assistantStepIndex === resumeStepIndex &&
            botonActivo === resumeStep.id
        ) {
            return;
        }

        openAssistantAtStep(resumeStepIndex, {
            expandMobilePanel: true,
            preserveSubstep: true,
        });
    }, [
        assistantActive,
        assistantHasStarted,
        assistantStepIndex,
        botonActivo,
        openAssistantAtStep,
        resolveAssistantFlowOptions,
    ]);

    useEffect(() => {
        const flowOptions = assistantFlowOptions;
        setAssistantStepIndex((currentIndex) => {
            if (assistantActive && botonActivo) {
                const activeStepIndex = getAssistantStepIndexByTabId(
                    botonActivo,
                    flowOptions
                );
                if (activeStepIndex >= 0) return activeStepIndex;
            }
            return clampAssistantStepIndex(currentIndex, flowOptions);
        });

        if (
            assistantActive &&
            botonActivo &&
            !isAssistantTabId(botonActivo, flowOptions)
        ) {
            const nextStepIndex = clampAssistantStepIndex(
                assistantStepIndex,
                flowOptions
            );
            setBotonActivo(getAssistantStep(nextStepIndex, flowOptions).id);
        }
    }, [
        assistantActive,
        assistantFlowOptions,
        assistantStepIndex,
        botonActivo,
    ]);

    useEffect(() => {
        if (modoSelector) {
            logAssistantTourDebug("sidebar-auto-assistant-skip", () => ({
                reason: "selector-mode",
                previousAutoDraftKey: autoAssistantDraftKeyRef.current,
                ...sidebarDebugStateRef.current,
            }));
            autoAssistantDraftKeyRef.current = null;
            return;
        }

        const draftKey = resolveEditorSidebarAutoOpenDraftKey({
            slugInvitacion,
            editorSession,
            modoSelector,
        });
        if (!draftKey) {
            logAssistantTourDebug("sidebar-auto-assistant-skip", () => ({
                reason: "missing-draft-key",
                previousAutoDraftKey: autoAssistantDraftKeyRef.current,
                ...sidebarDebugStateRef.current,
            }));
            autoAssistantDraftKeyRef.current = null;
            return;
        }
        if (autoAssistantDraftKeyRef.current === draftKey) {
            logAssistantTourDebug("sidebar-auto-assistant-skip", () => ({
                reason: "same-draft-key",
                autoDraftKey: autoAssistantDraftKeyRef.current,
                ...sidebarDebugStateRef.current,
            }));
            return;
        }

        logAssistantTourDebug("sidebar-auto-assistant-open", () => ({
            reason: "draft-opened",
            previousAutoDraftKey: autoAssistantDraftKeyRef.current,
            nextDraftKey: draftKey,
            ...sidebarDebugStateRef.current,
        }));
        autoAssistantDraftKeyRef.current = draftKey;
        openAssistantAtStep(0, {
            expandMobilePanel: true,
            debugReason: "sidebar-auto-open-draft",
        });
    }, [editorSession, modoSelector, openAssistantAtStep, slugInvitacion]);

    const assistantTourDraftKey = resolveEditorSidebarAutoOpenDraftKey({
        slugInvitacion,
        editorSession,
        modoSelector,
    });
    useEffect(() => {
        logAssistantTourDebug("sidebar-mount", () => ({
            source: "DashboardSidebar",
            assistantTourDraftKey,
            ...sidebarDebugStateRef.current,
        }));
        return () => {
            logAssistantTourDebug("sidebar-unmount", () => ({
                source: "DashboardSidebar",
                ...sidebarDebugStateRef.current,
            }));
        };
    }, []);

    const handleAssistantTourRequestAssistantMode = useCallback(() => {
        logAssistantTourDebug("assistant-tour-request-assistant-mode", () => ({
            source: "DashboardSidebar.handleAssistantTourRequestAssistantMode",
            ...sidebarDebugStateRef.current,
        }));
        openAssistantAtStep(0, {
            expandMobilePanel: true,
            debugReason: "tour-request-assistant-mode",
        });
    }, [openAssistantAtStep]);

    const handleAssistantPrevious = useCallback(() => {
        const flowOptions = resolveAssistantFlowOptions();
        const navigation = getAssistantNavigationState(assistantStepIndex, flowOptions);
        const currentSubsteps = resolveAssistantSubstepsForStep(
            navigation.currentStep.id,
            {
                objects: readEditorObjects(),
                sections: readEditorSections(),
            }
        );
        const currentSubstepIndex = clampAssistantSubstepIndex(
            assistantSubstepIndex,
            currentSubsteps
        );
        logAssistantTourDebug("assistant-previous-click", () => ({
            source: "DashboardSidebar.handleAssistantPrevious",
            currentSubstepIndex,
            currentSubstepsCount: currentSubsteps.length,
            navigation,
            ...sidebarDebugStateRef.current,
        }));

        if (currentSubstepIndex > 0) {
            setAssistantSubstepIndex(currentSubstepIndex - 1);
            return;
        }

        if (!navigation.canGoPrevious) return;

        const previousStep = getAssistantStep(navigation.previousStepIndex, flowOptions);
        const previousSubsteps = resolveAssistantSubstepsForStep(
            previousStep.id,
            {
                objects: readEditorObjects(),
                sections: readEditorSections(),
            }
        );
        openAssistantAtStep(navigation.previousStepIndex, {
            substepIndex: Math.max(0, previousSubsteps.length - 1),
        });
    }, [
        assistantStepIndex,
        assistantSubstepIndex,
        openAssistantAtStep,
        resolveAssistantFlowOptions,
    ]);

    const handleAssistantNext = useCallback(() => {
        const flowOptions = resolveAssistantFlowOptions();
        const navigation = getAssistantNavigationState(assistantStepIndex, flowOptions);
        const currentSubsteps = resolveAssistantSubstepsForStep(
            navigation.currentStep.id,
            {
                objects: readEditorObjects(),
                sections: readEditorSections(),
            }
        );
        const currentSubstepIndex = clampAssistantSubstepIndex(
            assistantSubstepIndex,
            currentSubsteps
        );
        logAssistantTourDebug("assistant-next-click", () => ({
            source: "DashboardSidebar.handleAssistantNext",
            currentSubstepIndex,
            currentSubstepsCount: currentSubsteps.length,
            navigation,
            ...sidebarDebugStateRef.current,
        }));

        if (currentSubstepIndex < currentSubsteps.length - 1) {
            setAssistantSubstepIndex(currentSubstepIndex + 1);
            return;
        }

        if (!navigation.canGoNext) return;
        openAssistantAtStep(navigation.nextStepIndex, { substepIndex: 0 });
    }, [
        assistantStepIndex,
        assistantSubstepIndex,
        openAssistantAtStep,
        resolveAssistantFlowOptions,
    ]);

    const clampMobilePanelHeight = useCallback((height) => {
        const bounds = resolveMobilePanelHeightBounds();
        return clampNumber(height, bounds.min, bounds.max);
    }, []);

    const handleMobilePanelResizePointerDown = useCallback((event) => {
        if (!isMobileViewport) return;
        if (event.button !== undefined && event.button !== 0) return;

        const bounds = resolveMobilePanelHeightBounds();
        const currentHeight = clampNumber(
            mobilePanelHeight || bounds.defaultHeight,
            bounds.min,
            bounds.max
        );

        mobilePanelResizeSessionRef.current = {
            pointerId: event.pointerId,
            startY: Number(event.clientY) || 0,
            startHeight: currentHeight,
        };
        setMobilePanelHeight(currentHeight);
        setIsMobilePanelResizing(true);

        try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture is an enhancement; the panel still ignores unsupported paths safely.
        }
        event.preventDefault();
        event.stopPropagation();
    }, [isMobileViewport, mobilePanelHeight]);

    const handleMobilePanelResizePointerMove = useCallback((event) => {
        const session = mobilePanelResizeSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;

        const currentY = Number(event.clientY) || session.startY;
        const nextHeight = session.startHeight + (session.startY - currentY);
        setMobilePanelHeight(clampMobilePanelHeight(nextHeight));

        event.preventDefault();
        event.stopPropagation();
    }, [clampMobilePanelHeight]);

    const finishMobilePanelResize = useCallback((event) => {
        const session = mobilePanelResizeSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;

        mobilePanelResizeSessionRef.current = null;
        setIsMobilePanelResizing(false);
        try {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture?.(event.pointerId);
            }
        } catch {
            // No-op: cleanup still resets the local resize session.
        }
        event.preventDefault();
        event.stopPropagation();
    }, []);

    useEffect(() => {
        if (!isMobileViewport) {
            mobilePanelResizeSessionRef.current = null;
            setIsMobilePanelResizing(false);
            return undefined;
        }
        if (typeof window === "undefined") return undefined;

        const syncMobilePanelBounds = () => {
            setMobilePanelHeight((current) => {
                const bounds = resolveMobilePanelHeightBounds();
                return clampNumber(current || bounds.defaultHeight, bounds.min, bounds.max);
            });
        };

        syncMobilePanelBounds();
        window.addEventListener("resize", syncMobilePanelBounds);
        window.addEventListener("orientationchange", syncMobilePanelBounds);

        return () => {
            window.removeEventListener("resize", syncMobilePanelBounds);
            window.removeEventListener("orientationchange", syncMobilePanelBounds);
        };
    }, [isMobileViewport]);

    const syncMobileScrollHint = useCallback(() => {
        const scrollContainer = mobileToolbarScrollRef.current;
        if (!scrollContainer || !isMobileViewport) {
            setShowMobileScrollHint(false);
            return;
        }

        const scrollableDistance = scrollContainer.scrollWidth - scrollContainer.clientWidth;
        const canScroll = scrollableDistance > 18;
        const isNearEnd = scrollContainer.scrollLeft >= scrollableDistance - 12;
        setShowMobileScrollHint(canScroll && !isNearEnd);
    }, [isMobileViewport]);

    const mobileToolbarViewportMaskStyle = showMobileScrollHint
        ? {
            // Fadea el viewport real para que el hint se mezcle con el fondo y no tape el contenido.
            WebkitMaskImage: `linear-gradient(
                to right,
                rgba(0, 0, 0, 1) 0,
                rgba(0, 0, 0, 1) calc(100% - ${MOBILE_SCROLL_FADE_WIDTH_PX}px),
                rgba(0, 0, 0, 0.96) calc(100% - 76px),
                rgba(0, 0, 0, 0.74) calc(100% - 46px),
                rgba(0, 0, 0, 0.28) calc(100% - 18px),
                rgba(0, 0, 0, 0) 100%
            )`,
            maskImage: `linear-gradient(
                to right,
                rgba(0, 0, 0, 1) 0,
                rgba(0, 0, 0, 1) calc(100% - ${MOBILE_SCROLL_FADE_WIDTH_PX}px),
                rgba(0, 0, 0, 0.96) calc(100% - 76px),
                rgba(0, 0, 0, 0.74) calc(100% - 46px),
                rgba(0, 0, 0, 0.28) calc(100% - 18px),
                rgba(0, 0, 0, 0) 100%
            )`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
        }
        : undefined;

    const closeSidebarPanel = useCallback(() => {
        setAssistantActive(false);
        setFijadoSidebar(false);
        setHoverSidebar(false);
        setBotonActivo(null);
        setRsvpForcePresetSelection(false);
    }, []);

    useEffect(() => {
        if (botonActivo !== "gallery-builder") return;
        if (canUseGalleryBuilder) return;
        closeSidebarPanel();
    }, [botonActivo, canUseGalleryBuilder, closeSidebarPanel]);

    useEffect(() => {
        if (botonActivo !== "contador") return;
        if (canUseCountdown) return;
        closeSidebarPanel();
    }, [botonActivo, canUseCountdown, closeSidebarPanel]);

    useEffect(() => {
        if (botonActivo !== "efectos") return;
        if (canUseEffects) return;
        closeSidebarPanel();
    }, [botonActivo, canUseEffects, closeSidebarPanel]);

    useEffect(() => {
        return () => {
            publishSidebarPanelLayout({
                pinned: false,
                offsetLeft: 0,
                botonActivo: null,
            });
        };
    }, []);

    useEffect(() => {
        const pinned = !modoSelector && !isMobileViewport && fijadoSidebar && Boolean(botonActivo);
        const panelRect = panelRef.current?.getBoundingClientRect?.() || null;
        const panelRight = pinned
            ? Math.round(panelRect?.right || (DESKTOP_PANEL_LEFT_PX + DESKTOP_PANEL_WIDTH_PX))
            : 0;

        publishSidebarPanelLayout({
            pinned,
            offsetLeft: pinned ? panelRight + DESKTOP_PANEL_GAP_PX : 0,
            panelLeft: DESKTOP_PANEL_LEFT_PX,
            panelWidth: DESKTOP_PANEL_WIDTH_PX,
            panelRight: pinned ? panelRight : DESKTOP_PANEL_LEFT_PX + DESKTOP_PANEL_WIDTH_PX,
            botonActivo: pinned ? botonActivo : null,
        });
    }, [
        botonActivo,
        fijadoSidebar,
        isMobileViewport,
        modoSelector,
    ]);

    useEffect(() => {
        if (!isMobileViewport) return;
        if (!(hoverSidebar || fijadoSidebar)) return;
        if (!botonActivo) return;

        const panelEl = panelRef.current;
        if (!panelEl) return;
        panelEl.scrollTop = 0;
    }, [isMobileViewport, hoverSidebar, fijadoSidebar, botonActivo]);

    useEffect(() => {
        if (!isMobileViewport) return undefined;
        if (!(hoverSidebar || fijadoSidebar)) return undefined;

        const panelEl = panelRef.current;
        if (!panelEl) return undefined;

        const touchState = {
            active: false,
            startX: 0,
            startY: 0,
            lastY: 0,
        };

        const handleTouchStart = (event) => {
            if (event.touches?.length !== 1) {
                touchState.active = false;
                return;
            }

            const touch = event.touches[0];
            touchState.active = true;
            touchState.startX = Number(touch.clientX) || 0;
            touchState.startY = Number(touch.clientY) || 0;
            touchState.lastY = touchState.startY;
            event.stopPropagation();
        };

        const handleTouchMove = (event) => {
            if (!touchState.active || event.touches?.length !== 1) return;

            const touch = event.touches[0];
            const currentX = Number(touch.clientX) || touchState.startX;
            const currentY = Number(touch.clientY) || touchState.lastY;
            const totalX = currentX - touchState.startX;
            const totalY = currentY - touchState.startY;
            const deltaY = touchState.lastY - currentY;
            touchState.lastY = currentY;

            event.stopPropagation();

            const verticalGesture =
                Math.abs(totalY) > MOBILE_PANEL_SCROLL_GESTURE_TOLERANCE_PX &&
                Math.abs(totalY) > Math.abs(totalX);
            if (!verticalGesture) return;

            const canScrollInPanel = canScrollWithinBoundaryY(
                event.target,
                panelEl,
                deltaY
            );

            if (!canScrollInPanel && event.cancelable) {
                event.preventDefault();
            }
        };

        const handleTouchEnd = () => {
            touchState.active = false;
        };

        const handleWheel = (event) => {
            if (event.ctrlKey || event.metaKey) return;

            const deltaY = Number(event.deltaY) || 0;
            const verticalWheel =
                Math.abs(deltaY) > Math.abs(Number(event.deltaX) || 0) &&
                Math.abs(deltaY) > 0;
            if (!verticalWheel) return;

            event.stopPropagation();

            const canScrollInPanel = canScrollWithinBoundaryY(
                event.target,
                panelEl,
                deltaY
            );

            if (!canScrollInPanel && event.cancelable) {
                event.preventDefault();
            }
        };

        panelEl.addEventListener("touchstart", handleTouchStart, { passive: true });
        panelEl.addEventListener("touchmove", handleTouchMove, { passive: false });
        panelEl.addEventListener("touchend", handleTouchEnd);
        panelEl.addEventListener("touchcancel", handleTouchEnd);
        panelEl.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            panelEl.removeEventListener("touchstart", handleTouchStart);
            panelEl.removeEventListener("touchmove", handleTouchMove);
            panelEl.removeEventListener("touchend", handleTouchEnd);
            panelEl.removeEventListener("touchcancel", handleTouchEnd);
            panelEl.removeEventListener("wheel", handleWheel);
        };
    }, [isMobileViewport, hoverSidebar, fijadoSidebar]);

    useEffect(() => {
        syncMobileScrollHint();

        const scrollContainer = mobileToolbarScrollRef.current;
        if (!scrollContainer) return;

        scrollContainer.addEventListener("scroll", syncMobileScrollHint, { passive: true });
        window.addEventListener("resize", syncMobileScrollHint);

        return () => {
            scrollContainer.removeEventListener("scroll", syncMobileScrollHint);
            window.removeEventListener("resize", syncMobileScrollHint);
        };
    }, [syncMobileScrollHint]);

    useEffect(() => {
        if (!isMobileViewport) return;

        const handleInsertElement = () => {
            if (assistantActive) return;
            if (!fijadoSidebar) return;
            if (!botonActivo || !TABS_WITH_AUTO_CLOSE_ON_INSERT.has(botonActivo)) return;
            closeSidebarPanel();
        };

        window.addEventListener("insertar-elemento", handleInsertElement);
        return () => window.removeEventListener("insertar-elemento", handleInsertElement);
    }, [assistantActive, isMobileViewport, fijadoSidebar, botonActivo, closeSidebarPanel]);

    useEffect(() => {
        const handleAbrirPanelRsvp = (event) => {
            const forcePresetSelection = event?.detail?.forcePresetSelection === true;
            setAssistantActive(false);
            setBotonActivo("rsvp");
            setFijadoSidebar(true);
            setHoverSidebar(true);
            setRsvpForcePresetSelection(forcePresetSelection);
        };

        window.addEventListener("abrir-panel-rsvp", handleAbrirPanelRsvp);
        return () => window.removeEventListener("abrir-panel-rsvp", handleAbrirPanelRsvp);
    }, []);

    useEffect(() => {
        const handleAbrirPanelRegalos = () => {
            setAssistantActive(false);
            setBotonActivo("regalos");
            setFijadoSidebar(true);
            setHoverSidebar(true);
            setRsvpForcePresetSelection(false);
        };

        window.addEventListener("abrir-panel-regalos", handleAbrirPanelRegalos);
        return () => window.removeEventListener("abrir-panel-regalos", handleAbrirPanelRegalos);
    }, []);

    useEffect(() => {
        const handleAbrirModalSeccionDesdeHeader = () => {
            modalCrear.abrir();
        };

        window.addEventListener("dashboard-abrir-modal-seccion", handleAbrirModalSeccionDesdeHeader);
        return () =>
            window.removeEventListener("dashboard-abrir-modal-seccion", handleAbrirModalSeccionDesdeHeader);
    }, [modalCrear.abrir]);



    // --------------------------
    // Crear nueva plantilla
    // --------------------------
    const ejecutarCrearPlantilla = useCallback(async () => {
        const confirmar = confirm("Queres crear la plantilla?");
        if (!confirmar) return;

        const urlFondo =
            "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/plantillas%2Fboda-clasica%2Fportadas%2Fportada.jpg?alt=media&token=d20172d1-974f-4ff8-b1d8-ce29af329b96";

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = urlFondo;

        img.onload = async () => {
            const fondo = {
                id: "fondo",
                tipo: "imagen",
                src: urlFondo,
                x: 0,
                y: 0,
                rotation: 0,
                esFondo: true,
            };

            try {
                const crearPlantilla = httpsCallable(functions, "crearPlantilla");

                const res = await crearPlantilla({
                    id: "nueva-plantilla-" + Date.now(),
                    datos: {
                        nombre: "Nueva Plantilla",
                        tipo: "boda",
                        editor: "konva",
                        portada: "https://reservaeldia.com.ar/img/previews/boda-parallax.jpg",
                        objetos: [
                            fondo,
                            {
                                id: "titulo1",
                                tipo: "texto",
                                texto: "Nos Casamos!",
                                x: 100,
                                y: 200,
                                fontSize: 20,
                                color: "#773dbe",
                                rotation: 0,
                                scaleX: 1,
                                scaleY: 1,
                                fontFamily: "sans-serif",
                                fontWeight: "normal",
                                fontStyle: "normal",
                                textDecoration: "none",
                                textAlign: "left",
                                lineHeight: 1.2,
                            },
                            {
                                id: "nombres",
                                tipo: "texto",
                                texto: "Euge & Agus",
                                x: 100,
                                y: 280,
                                fontSize: 24,
                                color: "#333",
                                scaleX: 1,
                                scaleY: 1,
                                fontFamily: "sans-serif",
                                fontWeight: "normal",
                                fontStyle: "normal",
                                textDecoration: "none",
                                textAlign: "left",
                                lineHeight: 1.2,
                            },
                            {
                                id: "hoja",
                                tipo: "imagen",
                                src: "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/plantillas%2Fboda-clasica%2Fimg%2Fhoja-portada.png?alt=media&token=f7c2abf4-86f2-480a-9566-116f56435409",
                                x: 100,
                                y: 300,
                            },
                        ],
                    },
                });

                console.log("Plantilla creada:", res.data);
                alert("Plantilla creada con exito");
            } catch (error) {
                console.error("Error al crear la plantilla:", error);
                alert("Ocurrio un error al crear la plantilla");
            }
        };
    }, []);

    useEffect(() => {
        const handleCrearPlantillaDesdeHeader = () => {
            ejecutarCrearPlantilla();
        };

        window.addEventListener("dashboard-crear-plantilla", handleCrearPlantillaDesdeHeader);
        return () =>
            window.removeEventListener("dashboard-crear-plantilla", handleCrearPlantillaDesdeHeader);
    }, [ejecutarCrearPlantilla]);

    const insertarGaleria = useCallback((cfg = {}) => {
        const rows = Math.max(1, cfg.rows || 1);
        const cols = Math.max(1, cfg.cols || 1);
        const requestedCellCount = Number(cfg.cellCount);
        const total =
            Number.isInteger(requestedCellCount) && requestedCellCount > 0
                ? requestedCellCount
                : rows * cols;
        const widthPct = Math.max(10, Math.min(100, Number(cfg.widthPct ?? 70)));
        const allowedLayouts = normalizeGalleryLayoutIds(cfg.allowedLayouts);
        const defaultLayout = allowedLayouts.includes(cfg.defaultLayout)
            ? cfg.defaultLayout
            : allowedLayouts[0] || "";
        const currentLayout = allowedLayouts.includes(cfg.currentLayout)
            ? cfg.currentLayout
            : defaultLayout;
        const galleryId = `gal-${Date.now().toString(36)}`;

        window.dispatchEvent(new CustomEvent("insertar-elemento", {
            detail: {
                id: galleryId,
                tipo: "galeria",
                rows,
                cols,
                gap: cfg.gap,
                radius: cfg.radius,
                ratio: cfg.ratio,
                widthPct,
                cells: Array.from({ length: total }, () => ({
                    mediaUrl: null, fit: "cover", bg: "#f3f4f6"
                })),
                ...(allowedLayouts.length
                    ? {
                        allowedLayouts,
                        defaultLayout,
                        currentLayout,
                    }
                    : {}),
            }
        }));
        return galleryId;
    }, []);





    const alternarSidebarConBoton = (boton, { forceOpen = false } = {}) => {
        setFijadoSidebar((prevFijado) => {
            const mismoBoton = botonActivo === boton;

            // Si ya estaba fijado y vuelvo a hacer click en el mismo boton => cierro
            if (!forceOpen && prevFijado && mismoBoton) {
                setHoverSidebar(false);
                setBotonActivo(null);
                if (boton === "rsvp") {
                    setRsvpForcePresetSelection(false);
                }
                return false;
            }

            // Si clic en otro boton => cambio el boton y dejo fijado
            if (boton !== "rsvp") {
                setRsvpForcePresetSelection(false);
            }
            setHoverSidebar(true);
            setBotonActivo(boton);
            return true;
        });
    };

    const handleSidebarTabClick = (boton) => {
        const shouldForceOpenNormalTab = assistantActive;

        if (assistantActive) {
            setAssistantActive(false);
        }

        if (boton === "rsvp") {
            setRsvpForcePresetSelection(false);
        }

        alternarSidebarConBoton(boton, { forceOpen: shouldForceOpenNormalTab });
    };

    // Runtime-sensitive shell contract: the header-height variable keeps the
    // editor tool rail aligned with the fixed dashboard header.
    const sidebarShellClass = `
    fixed bottom-0 left-0 z-50 h-[96px] w-full text-slate-700
    md:top-[var(--dashboard-header-height,52px)] md:h-[calc(100vh-var(--dashboard-header-height,52px))] md:w-[205px]
    flex items-center justify-center md:flex-col md:items-center md:justify-start
    border-t border-[#e6dbf8] md:border-t-0 md:border-r md:border-[#e6dbf8]
    bg-white md:bg-white/95 md:backdrop-blur-sm
    shadow-[0_-4px_12px_rgba(15,23,42,0.08)] md:shadow-none
    px-2 py-1.5 md:px-0 md:py-2
  `;

    const iconGradientByButton = {
        detalles: "from-[#6f5fc4] to-[#523c9f]",
        texto: "from-[#7c4cc9] to-[#6538af]",
        forma: "from-[#3f74bf] to-[#345ea5]",
        imagen: "from-[#2f9a8f] to-[#247e74]",
        "gallery-builder": "from-[#8c6a1f] to-[#6d5015]",
        contador: "from-[#d27a47] to-[#b85b31]",
        rsvp: "from-[#2a8b6f] to-[#1d6f58]",
        regalos: "from-[#d15b7f] to-[#b64568]",
        efectos: "from-[#7c6a24] to-[#a9852d]",
    };

    const getIconButtonClass = (boton, { compact = false } = {}) => {
        const isActive = !assistantActive && fijadoSidebar && botonActivo === boton;
        const gradient = iconGradientByButton[boton] || iconGradientByButton.texto;
        const shapeClass = compact ? "h-11 w-11 rounded-xl" : "h-10 w-10 rounded-xl";
        return `group flex ${shapeClass} items-center justify-center border bg-gradient-to-br ${gradient} cursor-pointer transition-all duration-200 ${isActive
            ? "border-white/70 text-white ring-2 ring-white/55 shadow-[0_12px_24px_rgba(31,15,58,0.34)]"
            : "border-white/25 text-white/95 opacity-90 hover:-translate-y-[1px] hover:opacity-100 hover:border-white/40 hover:shadow-[0_12px_24px_rgba(31,15,58,0.28)]"
            }`;
    };
    const getDesktopToolButtonClass = (boton = null, { wide = false } = {}) => {
        const isActive = boton && !assistantActive && fijadoSidebar && botonActivo === boton;
        const widthClass = wide ? "w-[158px]" : "w-[130px]";
        return `inline-flex h-[42px] ${widthClass} items-center gap-2 rounded-[32px] px-[17px] pb-[10px] pl-[15px] pt-2 font-['Source_Sans_Pro',sans-serif] text-[14px] font-[550] leading-[24px] tracking-[0px] text-[#262626] transition hover:bg-[#EFDFFB] ${isActive ? "bg-[#EFDFFB]" : ""}`;
    };
    const desktopToolIconClass = "h-4 w-4 shrink-0 text-[#262626]";
    const desktopToolTextClass =
        "whitespace-nowrap font-['Source_Sans_Pro',sans-serif] text-[14px] font-[550] leading-[24px] tracking-[0px] text-[#262626]";
    const mobilePanelShellMotionClass = `animate-slideUp ${
        isMobilePanelResizing ? "transition-none" : "transition-all duration-200"
    }`;
    const mobilePanelResizeHandleClass =
        "flex h-5 shrink-0 cursor-ns-resize touch-none items-center justify-center bg-white/95 text-[#a58bc9] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d8c8f1]";
    const handleDesktopToolMouseLeave = (e) => {
        const panel = panelRef.current;
        if (safeContains(panel, e.relatedTarget)) return;
        scheduleClosePanel();
    };
    const mobileHistoryButtonBase =
        "group flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200";
    const mobileHistoryButtonEnabled =
        "border-[#e5d7fb] bg-white text-[#6f3bc0] shadow-[0_10px_20px_rgba(95,53,150,0.12)] hover:-translate-y-[1px] hover:border-[#d7c4f5] hover:bg-[#faf6ff]";
    const mobileHistoryButtonDisabled =
        "cursor-not-allowed border-[#ece7f7] bg-[#f5f3fa] text-slate-300 shadow-none";
    const assistantAccessLabel = "Asistente";
    const assistantAccessTitle = assistantHasStarted
        ? "Volver al asistente"
        : "Abrir el asistente";
    const assistantNavigation = getAssistantNavigationState(
        assistantStepIndex,
        assistantFlowOptions
    );
    const assistantCurrentStep = assistantNavigation.currentStep;
    const shouldShowAssistantControls =
        assistantActive &&
        Boolean(botonActivo) &&
        isAssistantTabId(botonActivo, assistantFlowOptions) &&
        assistantCurrentStep.id === botonActivo;
    const assistantMode = shouldShowAssistantControls;
    const assistantSubsteps = useMemo(() => (
        shouldShowAssistantControls
            ? resolveAssistantSubstepsForStep(assistantCurrentStep.id, {
            objects: readEditorObjects(),
            sections: readEditorSections(),
        })
            : []
    ), [
        assistantContentVersion,
        assistantCurrentStep.id,
        shouldShowAssistantControls,
    ]);
    const assistantSubstepSignature = getAssistantSubstepSignature(assistantSubsteps);
    const assistantSubstepIndexSafe = clampAssistantSubstepIndex(
        assistantSubstepIndex,
        assistantSubsteps
    );
    const assistantCurrentSubstep = shouldShowAssistantControls
        ? getAssistantSubstep(assistantSubstepIndexSafe, assistantSubsteps)
        : null;
    const assistantStepSubstepCounts = useMemo(() => {
        if (!shouldShowAssistantControls) return [];
        const context = {
            objects: readEditorObjects(),
            sections: readEditorSections(),
        };
        return getAssistantSteps(assistantFlowOptions).map((step) =>
            resolveAssistantSubstepsForStep(step.id, context).length
        );
    }, [
        assistantContentVersion,
        assistantFlowOptions,
        shouldShowAssistantControls,
    ]);
    const assistantHasNextSubstep =
        shouldShowAssistantControls &&
        assistantSubstepIndexSafe < assistantSubsteps.length - 1;
    const assistantCanGoPrevious =
        shouldShowAssistantControls &&
        (assistantSubstepIndexSafe > 0 || assistantNavigation.canGoPrevious);
    const assistantStepLabel = assistantCurrentSubstep?.label
        ? `${assistantCurrentStep.label} - ${assistantCurrentSubstep.label}`
        : assistantCurrentStep.label;
    const assistantLinearProgressLabel = getAssistantLinearProgressLabel({
        stepSubstepCounts: assistantStepSubstepCounts,
        currentStepIndex: assistantNavigation.currentStepIndex,
        currentSubstepIndex: assistantSubstepIndexSafe,
    });
    const assistantNextIsPreview =
        shouldShowAssistantControls &&
        !assistantHasNextSubstep &&
        !assistantNavigation.canGoNext;
    const assistantTourState = useMemo(() => ({
        active: assistantActive,
        mounted: shouldShowAssistantControls,
        currentStep: assistantCurrentStep,
        currentSubstep: assistantCurrentSubstep,
        currentStepIndex: assistantNavigation.currentStepIndex,
        currentSubstepIndex: assistantSubstepIndexSafe,
        progressLabel: assistantLinearProgressLabel,
        nextIsPreview: assistantNextIsPreview,
    }), [
        assistantActive,
        assistantCurrentStep,
        assistantCurrentSubstep,
        assistantLinearProgressLabel,
        assistantNavigation.currentStepIndex,
        assistantNextIsPreview,
        assistantSubstepIndexSafe,
        shouldShowAssistantControls,
    ]);

    useEffect(() => {
        logAssistantTourDebug("sidebar-assistant-tour-state", () => ({
            ...sidebarDebugStateRef.current,
            assistantTourState: {
                active: assistantTourState.active,
                mounted: assistantTourState.mounted,
                currentStepId: assistantTourState.currentStep?.id || "",
                currentStepLabel: assistantTourState.currentStep?.label || "",
                currentSubstepId: assistantTourState.currentSubstep?.id || "",
                currentSubstepLabel: assistantTourState.currentSubstep?.label || "",
                currentStepIndex: assistantTourState.currentStepIndex,
                currentSubstepIndex: assistantTourState.currentSubstepIndex,
                progressLabel: assistantTourState.progressLabel,
                nextIsPreview: assistantTourState.nextIsPreview,
            },
            assistantStepSubstepCounts,
            assistantSubstepSignature,
            assistantFlowOptions,
        }));
    }, [
        assistantFlowOptions,
        assistantStepSubstepCounts,
        assistantSubstepSignature,
        assistantTourState,
    ]);

    useEffect(() => {
        if (!shouldShowAssistantControls) return;
        setAssistantSubstepIndex((currentIndex) =>
            clampAssistantSubstepIndex(currentIndex, assistantSubsteps)
        );
    }, [assistantSubstepSignature, assistantSubsteps, shouldShowAssistantControls]);

    const canOpenAssistantPreview = typeof generarVistaPrevia === "function";
    const mobileAssistantButtonClass =
        assistantActive
            ? "border-white/70 bg-gradient-to-br from-[#692B9A] to-[#F39F5F] text-white shadow-[0_12px_24px_rgba(105,43,154,0.24)] ring-2 ring-white/55"
            : "border-[#e5d7fb] bg-white text-[#692B9A] shadow-[0_10px_20px_rgba(95,53,150,0.12)] hover:-translate-y-[1px] hover:border-[#d7c4f5] hover:bg-[#faf6ff]";
    const desktopAssistantButtonClass =
        assistantActive
            ? "inline-flex h-[42px] w-[158px] items-center gap-2 rounded-[32px] border border-transparent bg-[#692B9A] px-[17px] pb-[10px] pl-[15px] pt-2 font-['Source_Sans_Pro',sans-serif] text-[14px] font-[650] leading-[24px] tracking-[0px] text-white shadow-[0_12px_24px_rgba(105,43,154,0.18)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c8f1]"
            : "inline-flex h-[42px] w-[158px] items-center gap-2 rounded-[32px] border border-[#eadff8] bg-white px-[17px] pb-[10px] pl-[15px] pt-2 font-['Source_Sans_Pro',sans-serif] text-[14px] font-[650] leading-[24px] tracking-[0px] text-[#692B9A] transition hover:bg-[#EFDFFB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c8f1]";
    const assistantStepButtonBase =
        "inline-flex min-h-10 items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c8f1] disabled:cursor-not-allowed disabled:opacity-45";
    const assistantStepButtonSecondary =
        "border-[#e4d8f5] bg-white text-[#5f3596] hover:bg-[#faf6ff]";
    const assistantStepButtonPrimary =
        "border-transparent bg-[#692B9A] text-white hover:bg-[#5b2387]";
    const canUndo = !editorReadOnly && historialExternos.length > 1;
    const canRedo = !editorReadOnly && futurosExternos.length > 0;
    const availableSidebarTabs = SIDEBAR_TOOL_TABS.filter((tab) => {
        if (tab.requiresGalleryBuilder) return canUseGalleryBuilder;
        if (tab.requiresCountdown) return canUseCountdown;
        if (tab.requiresAdmin) return canUseEffects;
        return true;
    });




    // --------------------------
    // No renderizar en modo selector
    // --------------------------
    if (modoSelector) return null;

    return (
        <>
            {componenteInput &&
                React.cloneElement(componenteInput, {
                    onChange: async (e) => {
                        const uploadRequest = pendingUploadedImageHandlerRef.current;
                        const uploadedImageHandler =
                            typeof uploadRequest?.onUploadedImage === "function"
                                ? uploadRequest.onUploadedImage
                                : typeof uploadRequest === "function"
                                    ? uploadRequest
                                    : null;
                        const selectedFile = e.target.files?.[0] || null;
                        if (!selectedFile) return;

                        try {
                            uploadRequest?.onUploadStart?.({ file: selectedFile });
                            const uploadedUrl = await handleSeleccion(e);
                            if (typeof uploadedUrl !== "string" || !uploadedUrl) {
                                throw new Error("No se pudo obtener la URL de la imagen subida.");
                            }

                            if (typeof uploadedImageHandler === "function") {
                                const result = await uploadedImageHandler(uploadedUrl, {
                                    file: selectedFile,
                                });
                                if (result === false) {
                                    uploadRequest?.onUploadError?.(
                                        new Error("No se pudo aplicar el reemplazo de imagen."),
                                        { file: selectedFile, uploadedUrl }
                                    );
                                    return;
                                }
                                uploadRequest?.onUploadSuccess?.({
                                    file: selectedFile,
                                    uploadedUrl,
                                    result,
                                });
                                return;
                            }

                            const validGalleryCellSelection = resolveValidGalleryCellSelection({
                                objects: readEditorObjects(),
                                galleryCell: readEditorSelectionSnapshot().galleryCell,
                            });
                            if (validGalleryCellSelection) {
                                const assignedToGalleryCell =
                                    typeof window.asignarImagenACelda === "function" &&
                                    window.asignarImagenACelda(uploadedUrl, "cover") === true;
                                if (assignedToGalleryCell) {
                                    return;
                                }

                                throw new Error("No se pudo asignar la imagen a la celda seleccionada.");
                            }

                            const imageElement = buildCanvasImageElementFromLibraryImage(uploadedUrl, {
                                id: `img-${Date.now()}`,
                                seccionActivaId,
                            });
                            if (!imageElement) {
                                throw new Error("No se pudo crear el objeto de imagen.");
                            }

                            window.dispatchEvent(
                                new CustomEvent(EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT, {
                                    detail: imageElement,
                                })
                            );
                        } catch (error) {
                            console.error("Error al subir imagen desde el sidebar:", error);
                            uploadRequest?.onUploadError?.(error, { file: selectedFile });
                        } finally {
                            uploadRequest?.onUploadSettled?.({ file: selectedFile });
                            if (pendingUploadedImageHandlerRef.current === uploadRequest) {
                                pendingUploadedImageHandlerRef.current = null;
                            }
                        }
                    },
                })}

            {/* Runtime-sensitive hook: selection preservation and option menu
                placement query this sidebar by data attribute. */}
            <aside
                ref={asideRef}
                data-dashboard-sidebar="true"
                className={sidebarShellClass}
                style={{ zIndex: 45, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
                {/* Escritorio: barra vertical a la izquierda */}
                <div className="mt-2 hidden flex-col items-start gap-2 py-3 pl-0 pr-0 md:flex">
                    <button
                        type="button"
                        onClick={handleAssistantAccessClick}
                        className={desktopAssistantButtonClass}
                        title={assistantAccessTitle}
                        aria-label={assistantAccessTitle}
                    >
                        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="whitespace-nowrap">
                            {assistantAccessLabel}
                        </span>
                    </button>
                    <div className="h-px w-[158px] bg-[#efe5fb]" />

                    {availableSidebarTabs.map((tab) => {
                        const Icon = tab.Icon;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onMouseEnter={() => openPanel(tab.id)}
                                onMouseLeave={handleDesktopToolMouseLeave}
                                onClick={() => handleSidebarTabClick(tab.id)}
                                className={getDesktopToolButtonClass(tab.id, { wide: tab.wide })}
                                title={tab.title}
                            >
                                <Icon className={desktopToolIconClass} aria-hidden="true" />
                                <span className={desktopToolTextClass}>
                                    {tab.desktopLabel}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Movil: barra horizontal inferior */}
                <div className="relative w-full md:hidden">
                    <div className="overflow-hidden rounded-2xl border border-[#ede4fb] bg-gradient-to-r from-[#faf7ff] to-[#f4edff] shadow-[0_10px_24px_rgba(95,53,150,0.08)]">
                        <div
                            ref={mobileToolbarScrollRef}
                            className="w-full overflow-x-auto scrollbar-hide"
                            style={mobileToolbarViewportMaskStyle}
                        >
                            <div className="flex min-w-max items-start gap-2.5 px-2.5 py-2 pr-3">
                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={triggerEditorUndo}
                                    disabled={!canUndo}
                                    className={`${mobileHistoryButtonBase} ${
                                        canUndo
                                            ? mobileHistoryButtonEnabled
                                            : mobileHistoryButtonDisabled
                                    }`}
                                    title="Deshacer"
                                >
                                    <Undo2 className="h-4 w-4" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">
                                    Deshacer
                                </span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={triggerEditorRedo}
                                    disabled={!canRedo}
                                    className={`${mobileHistoryButtonBase} ${
                                        canRedo
                                            ? mobileHistoryButtonEnabled
                                            : mobileHistoryButtonDisabled
                                    }`}
                                    title="Rehacer"
                                >
                                    <Redo2 className="h-4 w-4" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">
                                    Rehacer
                                </span>
                            </div>

                            <div className="flex min-w-[70px] shrink-0 flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleAssistantAccessClick}
                                    className={`${mobileHistoryButtonBase} ${mobileAssistantButtonClass}`}
                                    title={assistantAccessTitle}
                                    aria-label={assistantAccessTitle}
                                >
                                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">
                                    {assistantAccessLabel}
                                </span>
                            </div>

                            {availableSidebarTabs.map((tab) => (
                                <div
                                    key={tab.id}
                                    className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5"
                                >
                                    <button type="button"
                                        onClick={() => handleSidebarTabClick(tab.id)}
                                        className={`${getIconButtonClass(tab.id, { compact: true })} justify-self-center`}
                                        title={tab.mobileTitle || tab.title}
                                    >
                                        {renderMobileSidebarTabIcon(tab)}
                                    </button>
                                    <span className="text-[10px] font-semibold leading-none text-[#5f3596]">
                                        {tab.mobileLabel}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>
                    {showMobileScrollHint && (
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
                            <div className="relative flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-white/78 text-[#7b57ac] shadow-[0_8px_18px_rgba(95,53,150,0.16)] backdrop-blur-[6px] animate-pulse">
                                <FaChevronRight className="text-[9px]" />
                            </div>
                        </div>
                    )}
                </div>
            </aside>



            {(hoverSidebar || fijadoSidebar) && (
                /* Runtime-sensitive hook: editor text toolbar geometry and
                   selection preservation query #sidebar-panel. */
                <div
                    ref={panelRef}
                    id="sidebar-panel"
                    className={`absolute z-40 border border-[#e6dbf8] bg-white ${mobilePanelShellMotionClass}`}
                    onMouseEnter={() => {
                        cancelClosePanel(); // Cancela el cierre programado
                        if (!fijadoSidebar) setHoverSidebar(true);
                    }}
                    onMouseLeave={(e) => {
                        const aside = asideRef.current;
                        // Si el mouse se va hacia la barra lateral, no cierres
                        if (safeContains(aside, e.relatedTarget)) return;
                        scheduleClosePanel(); // Programa cierre
                    }}

                    onMouseDown={(e) => {
                        // Importante: si el usuario clickea dentro del panel, no cerramos
                        e.stopPropagation();
                        if (!fijadoSidebar) setHoverSidebar(true);
                    }}
                    style={
                        isMobileViewport
                            ? {
                                position: "fixed",
                                left: `${MOBILE_PANEL_GUTTER_PX}px`,
                                right: `${MOBILE_PANEL_GUTTER_PX}px`,
                                bottom: `${MOBILE_BAR_HEIGHT_PX + MOBILE_PANEL_BOTTOM_EXTRA_PX}px`,
                                width: "auto",
                                height: `${mobilePanelHeight}px`,
                                overflow: "hidden",
                                overscrollBehaviorY: "contain",
                                touchAction: "pan-y",
                                display: "flex",
                                flexDirection: "column",
                            }
                            : {
                                left: `${DESKTOP_PANEL_LEFT_PX}px`,
                                top: "var(--dashboard-header-height, 52px)",
                                height: "calc(100vh - var(--dashboard-header-height, 52px))",
                                width: `${DESKTOP_PANEL_WIDTH_PX}px`,
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                            }
                    }
                >
                    {isMobileViewport ? (
                        <button
                            type="button"
                            className={mobilePanelResizeHandleClass}
                            onPointerDown={handleMobilePanelResizePointerDown}
                            onPointerMove={handleMobilePanelResizePointerMove}
                            onPointerUp={finishMobilePanelResize}
                            onPointerCancel={finishMobilePanelResize}
                            aria-label="Ajustar altura del panel"
                            title="Ajustar altura del panel"
                        >
                            <GripHorizontal className="h-4 w-4 opacity-70" aria-hidden="true" />
                        </button>
                    ) : null}
                    <div
                        {...(shouldShowAssistantControls
                            ? {
                                [ASSISTANT_GUIDED_TOUR_TARGET_ATTR]:
                                    ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_CONTENT,
                                "data-assistant-tour-step-id": assistantCurrentStep.id,
                                "data-assistant-tour-substep-id":
                                    assistantCurrentSubstep?.id || "",
                            }
                            : {})}
                        className={`relative w-full min-h-0 flex flex-1 flex-col text-slate-700 ${
                            botonActivo === "forma"
                                ? "gap-0 px-2.5 pb-0.5 pt-8"
                                : botonActivo === "detalles"
                                    ? "gap-3 px-0 pb-3 pt-10"
                                : "gap-3 px-2.5 pb-3 pt-10"
                        }`}
                        style={{
                            flex: 1,
                            minHeight: 0,
                            height: "auto",
                            overflowY: shouldShowAssistantControls ? "hidden" : "auto",
                            WebkitOverflowScrolling: "touch",
                            overscrollBehaviorY: "contain",
                        }}
                    >
                        {/* Boton para cerrar el panel */}
                        {fijadoSidebar && (
                            <button type="button"
                                onClick={closeSidebarPanel}
                                className="
            absolute top-2 right-2 z-[60] flex h-8 w-8 items-center justify-center
            bg-transparent text-[#262626] transition-colors duration-200
            hover:text-[#692B9A]
            pointer-events-auto
          "
                                title="Cerrar panel"
                            >
                                <FaTimes className="text-[18px] font-light leading-[24px] tracking-[0px] text-[#262626]" />
                            </button>
                        )}

                        {/* Panel de Formas */}
                        {botonActivo === "forma" && (
                            <PanelDeFormas
                                abierto={true}
                                sidebarAbierta={sidebarAbierta}
                                seccionActivaId={seccionActivaId}
                            />
                        )}

                        {/* MiniToolbar con todas las acciones */}
                        <MiniToolbar
                            botonActivo={botonActivo}
                            onAgregarTitulo={() => {
                                window.dispatchEvent(
                                    new CustomEvent("insertar-elemento", {
                                        detail: {
                                            id: `titulo-${Date.now()}`,
                                            tipo: "texto",
                                            variant: "titulo",
                                            texto: "Titulo",
                                            color: "#000000",
                                            fontFamily: "sans-serif",
                                            fontWeight: "bold",
                                            fontStyle: "normal",
                                            textDecoration: "none",
                                        },
                                    })
                                );
                            }}
                            onAgregarSubtitulo={() => {
                                window.dispatchEvent(
                                    new CustomEvent("insertar-elemento", {
                                        detail: {
                                            id: `subtitulo-${Date.now()}`,
                                            tipo: "texto",
                                            variant: "subtitulo",
                                            texto: "Subtitulo",
                                            color: "#333333",
                                            fontFamily: "sans-serif",
                                            fontWeight: "normal",
                                            fontStyle: "italic",
                                            textDecoration: "none",
                                        },
                                    })
                                );
                            }}
                            onAgregarParrafo={() => {
                                window.dispatchEvent(
                                    new CustomEvent("insertar-elemento", {
                                        detail: {
                                            id: `parrafo-${Date.now()}`,
                                            tipo: "texto",
                                            variant: "parrafo",
                                            texto: "Texto del parrafo...",
                                            color: "#444444",
                                            fontFamily: "sans-serif",
                                            fontWeight: "normal",
                                            fontStyle: "normal",
                                            textDecoration: "none",
                                        },
                                    })
                                );
                            }}
                            setMostrarGaleria={setMostrarGaleria}
                            imagenes={imagenes}
                            imagenesEnProceso={imagenesEnProceso}
                            cargarImagenes={cargarImagenes}
                            borrarImagen={borrarImagen}
                            hayMas={hayMas}
                            cargando={cargando}
                            seccionActivaId={seccionActivaId}
                            setImagenesSeleccionadas={setImagenesSeleccionadas}
                            abrirSelector={abrirSelectorImagen}
                            onInsertarGaleria={insertarGaleria}
                            editorReadOnly={editorReadOnly}
                            canUseGalleryBuilder={canUseGalleryBuilder}
                            templateSessionMeta={templateSessionMeta}
                            rsvpForcePresetSelection={rsvpForcePresetSelection}
                            onRsvpPresetSelectionComplete={() => setRsvpForcePresetSelection(false)}
                            assistantMode={assistantMode}
                            assistantSubstep={assistantCurrentSubstep}
                            onAssistantTourFieldEdit={handleAssistantTourFieldEdit}
                        />
                    </div>
                    {shouldShowAssistantControls && (
                        <div
                            className="shrink-0 border-t border-[#eadff8] bg-white/96 px-2.5 py-2 shadow-[0_-8px_18px_rgba(95,53,150,0.06)]"
                            {...{
                                [ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR]: "true",
                            }}
                        >
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate font-['Source_Sans_Pro',sans-serif] text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[#692B9A]">
                                    {assistantStepLabel}
                                </div>
                                <div className="shrink-0 truncate font-['Source_Sans_Pro',sans-serif] text-[11px] font-semibold leading-[14px] text-[#262626]">
                                    {assistantLinearProgressLabel}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleAssistantPrevious}
                                    disabled={!assistantCanGoPrevious}
                                    className={`${assistantStepButtonBase} ${assistantStepButtonSecondary}`}
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    onClick={
                                        assistantNextIsPreview
                                            ? generarVistaPrevia
                                            : handleAssistantNext
                                    }
                                    {...{
                                        [ASSISTANT_GUIDED_TOUR_TARGET_ATTR]:
                                            assistantNextIsPreview
                                                ? ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_PREVIEW
                                                : ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_NEXT,
                                    }}
                                    disabled={
                                        assistantNextIsPreview
                                            ? !canOpenAssistantPreview
                                            : !assistantHasNextSubstep && !assistantNavigation.canGoNext
                                    }
                                    className={`${assistantStepButtonBase} ${assistantStepButtonPrimary}`}
                                >
                                    {assistantNextIsPreview ? "Vista previa" : "Siguiente"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}



            <AssistantGuidedTour
                draftKey={assistantTourDraftKey}
                userUid={userUid}
                editorReady={assistantTourEditorReady}
                editorReadOnly={editorReadOnly}
                preferencesLoaded={assistantTourPreferencesLoaded}
                assistantTourOptOut={assistantTourOptOut}
                assistantTourSaving={assistantTourSaving}
                onAssistantTourPreferenceChange={onAssistantTourPreferenceChange}
                onRequestAssistantMode={handleAssistantTourRequestAssistantMode}
                isPreviewOpen={assistantTourPreviewOpen}
                assistantState={assistantTourState}
                fieldEditSignal={assistantTourFieldEditSignal}
                openingKey={assistantTourOpeningKey}
            />

            <ModalCrearSeccion
                visible={modalCrear.visible}
                onClose={modalCrear.cerrar}
                onConfirm={modalCrear.onConfirmar}
            />
        </>
    );
}
