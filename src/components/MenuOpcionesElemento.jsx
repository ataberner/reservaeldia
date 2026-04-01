// C:\Reservaeldia\src\components\MenuOpcionesElemento.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
    Copy, Trash2, Layers, ArrowDown, ArrowUp, MoveUp, MoveDown, PlusCircle, ClipboardPaste,
    Link2, X, Image as ImageIcon, ImageOff, Check
} from "lucide-react";
import {
    getAllowedMotionEffectsForElement,
    sanitizeMotionEffect,
} from "@/domain/motionEffects";
import { resolveUngroupSelectionCandidate } from "@/domain/editor/grouping";
import TemplateDynamicFieldMenuSection from "@/components/editor/templateAuthoring/TemplateDynamicFieldMenuSection";
import { classifyRenderObjectContract } from "../../shared/renderContractPolicy.js";

// Normaliza y valida URL básica
function sanitizeURL(url) {
    if (!url) return "";
    const t = String(url).trim();
    const ok = /^(https?:\/\/|mailto:|tel:|whatsapp:)/i.test(t);
    if (ok) return t;
    // dominio simple -> completar
    if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return `https://${t}`;
    try {
        const u = new URL(t);
        return u.toString();
    } catch {
        return "";
    }
}

const VIEWPORT_PADDING = 8;
const DEFAULT_MENU_SIZE = { width: 256, height: 300 };
const DEFAULT_MENU_SIZE_WITH_AUTHORING = { width: 320, height: 360 };
const DEFAULT_LINK_FLYOUT_SIZE = { width: 320, height: 180 };
const DEFAULT_EFFECTS_FLYOUT_SIZE = { width: 300, height: 320 };
const DEFAULT_LAYER_FLYOUT_SIZE = { width: 224, height: 180 };
const BACKGROUND_MOTION_EFFECT_OPTIONS = Object.freeze([
    {
        value: "none",
        label: "Sin movimiento",
        description: "El fondo queda quieto.",
    },
    {
        value: "dynamic",
        label: "Con movimiento",
        description: "Se mueve de forma bien visible al recorrer la invitacion.",
    },
]);

function describeLegacyRenderContract(classification) {
    const contractId = String(classification?.contractId || "").trim();
    if (contractId === "countdown_schema_v1") {
        return "Este countdown usa schema v1 legacy. Se mantiene por compatibilidad, pero esta congelado para nuevas expansiones.";
    }
    if (contractId === "icono_svg_legacy") {
        return "Este icono usa la rama legacy icono-svg. Se mantiene por compatibilidad, pero el trabajo nuevo debe ir sobre el contrato moderno tipo='icono'.";
    }
    return "Este elemento usa un contrato legacy congelado. Sigue soportado por compatibilidad, pero no debe servir como base para trabajo nuevo.";
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function resolveViewportSize() {
    return {
        width: Math.max(0, window.innerWidth || 0),
        height: Math.max(0, window.innerHeight || 0),
    };
}

function getMeasuredSize(elementRef, fallback) {
    const node = elementRef?.current;
    const measuredWidth = Number(node?.offsetWidth || 0);
    const measuredHeight = Number(node?.offsetHeight || 0);
    return {
        width: measuredWidth > 0 ? measuredWidth : fallback.width,
        height: measuredHeight > 0 ? measuredHeight : fallback.height,
    };
}

function resolveAnchoredPosition(anchorRect, requestedSize, gap = 8) {
    const viewport = resolveViewportSize();
    const maxWidth = Math.max(120, viewport.width - VIEWPORT_PADDING * 2);
    const maxHeight = Math.max(120, viewport.height - VIEWPORT_PADDING * 2);

    const width = clamp(requestedSize.width, 120, maxWidth);
    const height = clamp(requestedSize.height, 120, maxHeight);

    let x = anchorRect.right + gap;
    let y = anchorRect.top;

    if (x + width > viewport.width - VIEWPORT_PADDING) {
        x = anchorRect.left - width - gap;
    }
    if (y + height > viewport.height - VIEWPORT_PADDING) {
        y = anchorRect.bottom - height;
    }

    const minX = VIEWPORT_PADDING;
    const maxX = Math.max(minX, viewport.width - width - VIEWPORT_PADDING);
    const minY = VIEWPORT_PADDING;
    const maxY = Math.max(minY, viewport.height - height - VIEWPORT_PADDING);

    return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
        width,
        height,
    };
}


/**
 * Menú contextual para un elemento seleccionado en el canvas.
 * - Se posiciona pegado al botón ⚙️ (botonOpcionesRef)
 * - Evita el "flash" inicial usando useLayoutEffect + visibility hasta tener posición lista
 */
export default function MenuOpcionesElemento({
    isOpen,
    botonOpcionesRef,            // ref al botón ⚙️
    elementoSeleccionado,        // objeto actual
    menuContext = null,
    onCopiar,
    onPegar,
    onDuplicar,
    onAgrupar,
    onDesagrupar,
    onEliminar,
    moverElemento,               // ("al-frente" | "al-fondo" | "subir" | "bajar")
    onCerrar,                    // cierra el menú en el padre (setMostrarPanelZ(false))
    // Para "Usar como fondo"
    reemplazarFondo,
    secciones,
    objetos,
    setSecciones,
    setObjetos,
    setElementosSeleccionados,
    setSeccionActivaId,
    setSectionDecorationEdit,
    usarComoDecoracionFondo,
    onConvertirDecoracionFondoEnImagen,
    onEliminarDecoracionFondo,
    onFinalizarAjusteDecoracionFondo,
    onActualizarMovimientoDecoracionFondo,
    onDesanclarImagenFondoBase,
    onFinalizarAjusteFondoBase,
    onConfigurarRsvp,
    onConfigurarRegalos,
    canManageSite = false,
    templateAuthoring = null,
}) {
    // Estado local del submenu "Orden de capa"
    const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);

    // Posición calculada del menú
    const [pos, setPos] = useState({ x: -9999, y: -9999 });
    // Flag para mostrar el menú sólo cuando tenemos coords válidas
    const [ready, setReady] = useState(false);

    // Ref del panel principal (para click-outside del padre)
    const menuRootRef = useRef(null);

    // Ref del botón "Orden de capa" (ancla para posicionar el flyout)
    const btnOrdenRef = useRef(null);

    // Ref del flyout (por si querés click-outside específico del flyout)
    const submenuRef = useRef(null);

    // Posición del flyout
    const [submenuPos, setSubmenuPos] = useState({
        x: -9999,
        y: -9999,
        width: DEFAULT_LAYER_FLYOUT_SIZE.width,
    });
    const [submenuReady, setSubmenuReady] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mobileBottomOffset, setMobileBottomOffset] = useState(8);


    const esImagen = elementoSeleccionado?.tipo === "imagen";
    const esRsvp = elementoSeleccionado?.tipo === "rsvp-boton";
    const esRegalo = elementoSeleccionado?.tipo === "regalo-boton";
    const esGrupo = elementoSeleccionado?.tipo === "grupo";
    const esDecoracionFondo = elementoSeleccionado?.tipo === "decoracion-fondo";
    const esImagenFondoSeccion = elementoSeleccionado?.tipo === "imagen-fondo-seccion";
    const menuKind = menuContext?.kind || (elementoSeleccionado ? "canvas-object" : null);
    const isMultiSelectionMenu = menuKind === "multi-selection";
    const multiSelectionIds = useMemo(
        () => (
            Array.isArray(menuContext?.selectedIds)
                ? menuContext.selectedIds.map((id) => String(id || "").trim()).filter(Boolean)
                : []
        ),
        [menuContext?.selectedIds]
    );
    const multiSelectionCount = Array.isArray(menuContext?.selectedObjects)
        ? menuContext.selectedObjects.length
        : multiSelectionIds.length;
    const authoringConfig =
        templateAuthoring && typeof templateAuthoring === "object" ? templateAuthoring : null;
    const shouldRenderTemplateAuthoringSection = canManageSite && Boolean(authoringConfig);
    const selectedRenderContract = useMemo(
        () => (isMultiSelectionMenu ? null : classifyRenderObjectContract(elementoSeleccionado || null)),
        [elementoSeleccionado, isMultiSelectionMenu]
    );
    const ungroupCandidate = useMemo(
        () => {
            if (!esGrupo || menuKind !== "canvas-object" || !elementoSeleccionado?.id) {
                return { eligible: false, reason: "selection-not-group" };
            }

            return resolveUngroupSelectionCandidate({
                objetos,
                secciones,
                selectedIds: [elementoSeleccionado.id],
            });
        },
        [elementoSeleccionado?.id, esGrupo, menuKind, objetos, secciones]
    );
    const canUngroupSelection = ungroupCandidate?.eligible === true;

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(max-width: 768px)");
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener?.("change", update);
        return () => mq.removeEventListener?.("change", update);
    }, []);

    const calcularOffsetBottomMobile = useCallback(() => {
        if (typeof window === "undefined") return 8;

        const viewportHeight = Math.max(0, window.innerHeight || 0);
        const sidebar = document.querySelector('[data-dashboard-sidebar="true"]') || document.querySelector("aside");
        if (!sidebar || typeof sidebar.getBoundingClientRect !== "function") {
            return 8;
        }

        const rect = sidebar.getBoundingClientRect();
        const overlapsBottom = rect.bottom >= viewportHeight - 1;
        if (!overlapsBottom) return 8;

        const obstructionHeight = Math.max(0, viewportHeight - rect.top);
        return Math.max(8, Math.ceil(obstructionHeight + 8));
    }, []);

    // --- Helper: calcula la posición final del menú desde el rect del botón ⚙️
    const baseMenuSize = shouldRenderTemplateAuthoringSection
        ? DEFAULT_MENU_SIZE_WITH_AUTHORING
        : DEFAULT_MENU_SIZE;
    const desktopMenuWidthClass = shouldRenderTemplateAuthoringSection ? "w-80" : "w-64";

    const calcularPosDesdeRect = useCallback((rect) => {
        const measured = getMeasuredSize(menuRootRef, baseMenuSize);
        const posResuelta = resolveAnchoredPosition(rect, measured, 8);
        return { x: posResuelta.x, y: posResuelta.y };
    }, [baseMenuSize]);


    // --- Submenú Enlace ---
    const [mostrarSubmenuEnlace, setMostrarSubmenuEnlace] = useState(false);
    const btnEnlaceRef = useRef(null);
    const submenuEnlaceRef = useRef(null);
    const [enlacePos, setEnlacePos] = useState({
        x: -9999,
        y: -9999,
        width: DEFAULT_LINK_FLYOUT_SIZE.width,
    });
    const [enlaceReady, setEnlaceReady] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [urlError, setUrlError] = useState(false);
    const [mostrarSubmenuEfectos, setMostrarSubmenuEfectos] = useState(false);
    const btnEfectosRef = useRef(null);
    const submenuEfectosRef = useRef(null);
    const [efectosPos, setEfectosPos] = useState({
        x: -9999,
        y: -9999,
        width: DEFAULT_EFFECTS_FLYOUT_SIZE.width,
    });
    const [efectosReady, setEfectosReady] = useState(false);

    const allowedMotionEffects = getAllowedMotionEffectsForElement(elementoSeleccionado);
    const currentMotionEffect = sanitizeMotionEffect(elementoSeleccionado?.motionEffect);
    const backgroundMotionModeRaw = elementoSeleccionado?.backgroundMotionMode || "none";
    const backgroundMotionMode =
        backgroundMotionModeRaw === "none" ? "none" : "dynamic";

    // Al abrir el menú, pre-cargar la URL actual del elemento (si tiene)
    useEffect(() => {
        if (!isOpen || !elementoSeleccionado) return;
        const actual = elementoSeleccionado?.enlace?.href || elementoSeleccionado?.enlace || "";
        setUrlInput(actual || "");
        setUrlError(false);
    }, [isOpen, elementoSeleccionado]);

    useEffect(() => {
        if (isOpen) return;
        setMostrarSubmenuCapa(false);
        setMostrarSubmenuEnlace(false);
        setMostrarSubmenuEfectos(false);
    }, [isOpen]);

    // Posicionar los flyouts
    const recalcularSubmenuEnlacePos = useCallback(() => {
        const btn = btnEnlaceRef.current;
        if (!btn) return;
        const anchor = btn.getBoundingClientRect();
        const measured = getMeasuredSize(submenuEnlaceRef, DEFAULT_LINK_FLYOUT_SIZE);
        const posResuelta = resolveAnchoredPosition(anchor, measured, 8);
        setEnlacePos({ x: posResuelta.x, y: posResuelta.y, width: posResuelta.width });
    }, []);

    const recalcularSubmenuEfectosPos = useCallback(() => {
        const btn = btnEfectosRef.current;
        if (!btn) return;
        const anchor = btn.getBoundingClientRect();
        const measured = getMeasuredSize(submenuEfectosRef, DEFAULT_EFFECTS_FLYOUT_SIZE);
        const posResuelta = resolveAnchoredPosition(anchor, measured, 8);
        setEfectosPos({ x: posResuelta.x, y: posResuelta.y, width: posResuelta.width });
    }, []);

    useLayoutEffect(() => {
        if (!mostrarSubmenuEnlace) {
            setEnlaceReady(false);
            setEnlacePos({
                x: -9999,
                y: -9999,
                width: DEFAULT_LINK_FLYOUT_SIZE.width,
            });
            return;
        }
        recalcularSubmenuEnlacePos();
        setEnlaceReady(true);
    }, [mostrarSubmenuEnlace, recalcularSubmenuEnlacePos]);

    useEffect(() => {
        if (!mostrarSubmenuEnlace) return;
        const handle = () => recalcularSubmenuEnlacePos();
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuEnlace, recalcularSubmenuEnlacePos]);

    useLayoutEffect(() => {
        if (!mostrarSubmenuEfectos) {
            setEfectosReady(false);
            setEfectosPos({
                x: -9999,
                y: -9999,
                width: DEFAULT_EFFECTS_FLYOUT_SIZE.width,
            });
            return;
        }
        recalcularSubmenuEfectosPos();
        setEfectosReady(true);
    }, [mostrarSubmenuEfectos, recalcularSubmenuEfectosPos]);

    useEffect(() => {
        if (!mostrarSubmenuEfectos) return;
        const handle = () => recalcularSubmenuEfectosPos();
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuEfectos, recalcularSubmenuEfectosPos]);

    const guardarEnlace = () => {
        const limpio = sanitizeURL(urlInput);
        if (!limpio) {
            setUrlError(true);
            return;
        }
        // Guardamos como objeto con target siempre _blank
        setObjetos(prev =>
            prev.map(o => {
                if (o.id !== elementoSeleccionado?.id) return o;
                return {
                    ...o,
                    enlace: {
                        href: limpio,
                        target: "_blank",
                        rel: "noopener noreferrer",
                    },
                };
            })
        );
        setMostrarSubmenuEnlace(false);
        onCerrar();
    };

    const quitarEnlace = () => {
        setObjetos(prev =>
            prev.map(o => {
                if (o.id !== elementoSeleccionado?.id) return o;
                const { enlace, ...rest } = o;
                return rest;
            })
        );
        setMostrarSubmenuEnlace(false);
        onCerrar();
    };

    const actualizarMotionEffect = (effect) => {
        const nextEffect = sanitizeMotionEffect(effect);
        setObjetos((prev) =>
            prev.map((item) => {
                if (item.id !== elementoSeleccionado?.id) return item;
                return { ...item, motionEffect: nextEffect };
            })
        );

        setMostrarSubmenuCapa(false);
        setMostrarSubmenuEnlace(false);
        setMostrarSubmenuEfectos(false);
        onCerrar();
    };

    const actualizarMovimientoDecoracionFondo = (nextMode) => {
        if (typeof onActualizarMovimientoDecoracionFondo !== "function") return;

        setMostrarSubmenuCapa(false);
        setMostrarSubmenuEnlace(false);
        setMostrarSubmenuEfectos(false);
        onActualizarMovimientoDecoracionFondo(nextMode);
        onCerrar();
    };

    const renderBackgroundMotionMenu = (description) => (
        <div className="relative">
            <button
                ref={btnEfectosRef}
                onClick={() => {
                    setMostrarSubmenuCapa(false);
                    setMostrarSubmenuEnlace(false);
                    setMostrarSubmenuEfectos((prev) => !prev);
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
                <span className="inline-flex h-4 w-4 items-center justify-center text-[11px] font-semibold">Fx</span>
                Efectos del fondo
            </button>

            {mostrarSubmenuEfectos &&
                createPortal(
                    <div
                        ref={submenuEfectosRef}
                        className="fixed z-[60] bg-white border rounded shadow-lg p-2 space-y-1 menu-z-index"
                        style={{
                            left: efectosPos.x,
                            top: efectosPos.y,
                            width: efectosPos.width,
                            maxWidth: "calc(100vw - 16px)",
                            maxHeight: 320,
                            overflowY: "auto",
                            visibility: efectosReady ? "visible" : "hidden",
                            borderColor: "#773dbe",
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-2 pb-1 text-xs font-semibold text-zinc-700">
                            Movimiento del fondo
                        </div>
                        <p className="px-2 pb-1 text-[11px] text-zinc-500">
                            {description}
                        </p>

                        {BACKGROUND_MOTION_EFFECT_OPTIONS.map((option) => {
                            const isActive = backgroundMotionMode === option.value;
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => actualizarMovimientoDecoracionFondo(option.value)}
                                    className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition ${isActive
                                        ? "bg-purple-50 text-purple-800"
                                        : "hover:bg-gray-100"
                                        }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block">{option.label}</span>
                                        <span className="mt-0.5 block text-[11px] text-zinc-500">
                                            {option.description}
                                        </span>
                                    </span>
                                    {isActive ? <span className="text-xs font-semibold">Activo</span> : null}
                                </button>
                            );
                        })}
                    </div>,
                    document.body
                )
            }
        </div>
    );



    // 1) Posicionar ANTES del paint para evitar flicker
    useLayoutEffect(() => {
        if (!isOpen) {
            // si está cerrado, reseteamos
            setReady(false);
            setPos({ x: -9999, y: -9999 });
            return;
        }
        if (isMobile) {
            setReady(true);
            return;
        }
        const btn = botonOpcionesRef?.current;
        if (!btn) return;

        const r = btn.getBoundingClientRect();
        const p = calcularPosDesdeRect(r);
        setPos(p);
        setReady(true); // ya tenemos posición; mostrar menú
    }, [isOpen, botonOpcionesRef, isMobile, calcularPosDesdeRect]);

    useLayoutEffect(() => {
        if (!isOpen || !isMobile) {
            setMobileBottomOffset(8);
            return;
        }

        const updateBottomOffset = () => {
            setMobileBottomOffset(calcularOffsetBottomMobile());
        };

        updateBottomOffset();
        window.addEventListener("resize", updateBottomOffset);
        window.addEventListener("orientationchange", updateBottomOffset);
        window.addEventListener("scroll", updateBottomOffset, true);
        return () => {
            window.removeEventListener("resize", updateBottomOffset);
            window.removeEventListener("orientationchange", updateBottomOffset);
            window.removeEventListener("scroll", updateBottomOffset, true);
        };
    }, [isOpen, isMobile, calcularOffsetBottomMobile]);

    const recalcularSubmenuCapaPos = useCallback(() => {
        const btn = btnOrdenRef.current;
        if (!btn) return;
        const anchor = btn.getBoundingClientRect();
        const measured = getMeasuredSize(submenuRef, DEFAULT_LAYER_FLYOUT_SIZE);
        const posResuelta = resolveAnchoredPosition(anchor, measured, 8);
        setSubmenuPos({ x: posResuelta.x, y: posResuelta.y, width: posResuelta.width });
    }, []);

    useLayoutEffect(() => {
        if (!mostrarSubmenuCapa) {
            setSubmenuReady(false);
            setSubmenuPos({
                x: -9999,
                y: -9999,
                width: DEFAULT_LAYER_FLYOUT_SIZE.width,
            });
            return;
        }
        recalcularSubmenuCapaPos();
        setSubmenuReady(true);
    }, [mostrarSubmenuCapa, recalcularSubmenuCapaPos]);

    useEffect(() => {
        if (!mostrarSubmenuCapa) return;
        const handle = () => recalcularSubmenuCapaPos();
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuCapa, recalcularSubmenuCapaPos]);


    // 2) Reposicionar ante scroll/resize mientras esté abierto
    useEffect(() => {
        if (!isOpen) return;
        const handle = () => {
            const btn = botonOpcionesRef?.current;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            setPos(calcularPosDesdeRect(r));
        };

        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [isOpen, botonOpcionesRef, calcularPosDesdeRect]);

    if (!isOpen) return null;

    const portalTarget = typeof document !== "undefined" ? document.body : null;
    if (!portalTarget) return null;

    return createPortal(
        <div
            ref={menuRootRef}
            className={`fixed z-50 bg-white border shadow-xl p-3 text-sm space-y-1 menu-z-index ${isMobile ? "rounded-2xl w-auto" : `rounded-lg ${desktopMenuWidthClass}`}`}
            style={
                isMobile
                    ? {
                        left: "8px",
                        right: "8px",
                        bottom: `calc(${mobileBottomOffset}px + env(safe-area-inset-bottom, 0px))`,
                        top: "auto",
                        borderColor: "#773dbe",
                        borderWidth: "1px",
                        maxHeight: "70vh",
                        overflowY: "auto",
                        animation: "fadeInScale 0.15s ease-out",
                        visibility: ready ? "visible" : "hidden",
                    }
                    : {
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        borderColor: "#773dbe",
                        borderWidth: "1px",
                        maxWidth: "calc(100vw - 16px)",
                        maxHeight: "400px",
                        overflowY: "auto",
                        animation: "fadeInScale 0.15s ease-out",
                        visibility: ready ? "visible" : "hidden",
                    }
            }
            // Evitar que se propague el click al body (click-outside)
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {isMultiSelectionMenu ? (
                <>
                    <div className="mb-2 rounded-xl border border-[#eadffd] bg-[#faf6ff] px-3 py-2">
                        <div className="text-sm font-semibold text-[#5f3596]">
                            Seleccion multiple
                        </div>
                        <div className="text-[11px] text-slate-500">
                            {multiSelectionCount} elemento{multiSelectionCount === 1 ? "" : "s"} seleccionado{multiSelectionCount === 1 ? "" : "s"}
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            onCopiar();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Copy className="w-4 h-4" /> Copiar
                    </button>

                    <button
                        onClick={() => {
                            onPegar();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <ClipboardPaste className="w-4 h-4" /> Pegar
                    </button>

                    <button
                        onClick={() => {
                            onDuplicar();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <PlusCircle className="w-4 h-4" /> Duplicar
                    </button>

                    <button
                        onClick={() => {
                            onAgrupar?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Layers className="w-4 h-4" /> Agrupar elementos
                    </button>

                    <button
                        onClick={() => {
                            onEliminar();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Trash2 className="w-4 h-4 text-red-500" /> Eliminar
                    </button>
                </>
            ) : esImagenFondoSeccion ? (
                <>
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#eadffd] bg-[#faf6ff] px-3 py-2">
                        {elementoSeleccionado?.src ? (
                            <div className="h-11 w-11 overflow-hidden rounded-lg border border-[#dccaf7] bg-white">
                                <img
                                    src={elementoSeleccionado.src}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        ) : null}
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#5f3596]">
                                {elementoSeleccionado?.nombre || "Imagen de fondo"}
                            </div>
                            <div className="text-[11px] text-slate-500">
                                Opciones del fondo
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            onDesanclarImagenFondoBase?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <ImageOff className="w-4 h-4" /> Desanclar fondo
                    </button>

                    {renderBackgroundMotionMenu(
                        "Activa un movimiento claro en la imagen de fondo al recorrer la invitacion."
                    )}

                    <button
                        onClick={() => {
                            onFinalizarAjusteFondoBase?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Check className="w-4 h-4 text-emerald-600" /> Terminar ajuste
                    </button>
                </>
            ) : esDecoracionFondo ? (
                <>
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#eadffd] bg-[#faf6ff] px-3 py-2">
                        {elementoSeleccionado?.src ? (
                            <div className="h-11 w-11 overflow-hidden rounded-lg border border-[#dccaf7] bg-white">
                                <img
                                    src={elementoSeleccionado.src}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        ) : null}
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#5f3596]">
                                {elementoSeleccionado?.nombre || "Decoracion del fondo"}
                            </div>
                            <div className="text-[11px] text-slate-500">
                                Opciones de la decoracion
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            onConvertirDecoracionFondoEnImagen?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <ImageIcon className="w-4 h-4" /> Volver a imagen
                    </button>

                    {renderBackgroundMotionMenu(
                        "Activa un movimiento claro en el fondo al recorrer la invitacion."
                    )}

                    <button
                        onClick={() => {
                            onEliminarDecoracionFondo?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Trash2 className="w-4 h-4 text-red-500" /> Quitar decoracion
                    </button>

                    <button
                        onClick={() => {
                            onFinalizarAjusteDecoracionFondo?.();
                            onCerrar();
                        }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                    >
                        <Check className="w-4 h-4 text-emerald-600" /> Terminar ajuste
                    </button>
                </>
            ) : (
                <>
            {selectedRenderContract?.isLegacyFrozenCompat ? (
                <div className="mb-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
                    {describeLegacyRenderContract(selectedRenderContract)}
                </div>
            ) : null}
            {/* Copiar */}
            <button
                onClick={() => {
                    onCopiar();
                    onCerrar();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
                <Copy className="w-4 h-4" /> Copiar
            </button>

            {/* Pegar */}
            <button
                onClick={() => {
                    onPegar();
                    onCerrar();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
                <ClipboardPaste className="w-4 h-4" /> Pegar
            </button>

            {/* Duplicar */}
            <button
                onClick={() => {
                    onDuplicar();
                    onCerrar();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
                <PlusCircle className="w-4 h-4" /> Duplicar
            </button>

            {esGrupo && canUngroupSelection && (
                <button
                    onClick={() => {
                        onDesagrupar?.();
                        onCerrar();
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <Layers className="w-4 h-4" /> Desagrupar
                </button>
            )}

            {!esGrupo && shouldRenderTemplateAuthoringSection && (
                <TemplateDynamicFieldMenuSection
                    visible={true}
                    canConfigure={authoringConfig?.canConfigure === true}
                    loading={authoringConfig?.loading === true}
                    saving={authoringConfig?.saving === true}
                    error={authoringConfig?.error || ""}
                    selectedElement={elementoSeleccionado}
                    selectedElementType={authoringConfig?.selectedElementType || ""}
                    selectedIsSupportedElement={authoringConfig?.selectedIsSupportedElement === true}
                    suggestedFieldType={authoringConfig?.selectedElementDefaultFieldType || "text"}
                    selectedField={authoringConfig?.selectedField || null}
                    fieldsSchema={authoringConfig?.fieldsSchema || []}
                    onRefreshFields={authoringConfig?.onRefreshFields}
                    onCreateField={authoringConfig?.onCreateField}
                    onLinkField={authoringConfig?.onLinkField}
                    onEditField={authoringConfig?.onEditField}
                    onUnlinkField={authoringConfig?.onUnlinkField}
                    onDeleteField={authoringConfig?.onDeleteField}
                    onViewUsage={authoringConfig?.onViewUsage}
                />
            )}


            {/* Enlace */}
            {!esGrupo && (
            <div className="relative">
                <button
                    ref={btnEnlaceRef}
                    onClick={() => {
                        // cerramos el de capa si estaba abierto, para no superponer
                        setMostrarSubmenuCapa(false);
                        setMostrarSubmenuEfectos(false);
                        setMostrarSubmenuEnlace(prev => !prev);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <Link2 className="w-4 h-4" /> Enlace
                </button>

                {/* Flyout Enlace */}
                {mostrarSubmenuEnlace &&
                    createPortal(
                        <div
                            ref={submenuEnlaceRef}
                            className="fixed z-[60] bg-white border rounded shadow-lg p-3 space-y-3 menu-z-index"
                            style={{
                                left: enlacePos.x,
                                top: enlacePos.y,
                                width: enlacePos.width,
                                maxWidth: "calc(100vw - 16px)",
                                visibility: enlaceReady ? "visible" : "hidden",
                                borderColor: "#773dbe",
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-sm font-medium">Agregar enlace</div>

                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => {
                                    setUrlInput(e.target.value);
                                    if (urlError) setUrlError(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") guardarEnlace();
                                    if (e.key === "Escape") setMostrarSubmenuEnlace(false);
                                }}
                                placeholder="https://ejemplo.com o mailto:..."
                                className={`w-full px-3 py-2 border rounded outline-none ${urlError ? "border-red-500" : "border-gray-300"
                                    }`}
                            />

                            {/* Chips rápidos (opcional) */}
                            <div className="flex flex-wrap gap-2 text-xs">
                                {["https://", "mailto:", "tel:", "whatsapp:"].map((pref) => (
                                    <button
                                        key={pref}
                                        onClick={() => setUrlInput((u) => (u.startsWith(pref) ? u : pref + u))}
                                        className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                                    >
                                        {pref}
                                    </button>
                                ))}
                            </div>

                            {/* Footer responsivo */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center mt-2">
                                {/* Botón Quitar enlace */}
                                <button
                                    onClick={quitarEnlace}
                                    className="inline-flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-red-600 hover:bg-red-50 rounded whitespace-nowrap"
                                >
                                    <X className="w-4 h-4" />
                                    Quitar enlace
                                </button>

                                {/* Botones Cancelar y Guardar */}
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => setMostrarSubmenuEnlace(false)}
                                        className="px-2.5 py-1.5 text-[13px] rounded hover:bg-gray-100 whitespace-nowrap"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={guardarEnlace}
                                        className="px-2.5 py-1.5 text-[13px] bg-[#773dbe] text-white rounded hover:opacity-90 whitespace-nowrap"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>


                            <p className="text-[11px] text-gray-500">
                                Se abrirá siempre en una pestaña nueva.
                            </p>
                        </div>,
                        document.body
                    )
                }
            </div>
            )}



            {!esGrupo && (
            <div className="relative">
                <button
                    ref={btnEfectosRef}
                    onClick={() => {
                        setMostrarSubmenuCapa(false);
                        setMostrarSubmenuEnlace(false);
                        setMostrarSubmenuEfectos((prev) => !prev);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <span className="inline-flex h-4 w-4 items-center justify-center text-[11px] font-semibold">Fx</span>
                    Efectos del elemento
                </button>

                {mostrarSubmenuEfectos &&
                    createPortal(
                        <div
                            ref={submenuEfectosRef}
                            className="fixed z-[60] bg-white border rounded shadow-lg p-2 space-y-1 menu-z-index"
                            style={{
                                left: efectosPos.x,
                                top: efectosPos.y,
                                width: efectosPos.width,
                                maxWidth: "calc(100vw - 16px)",
                                maxHeight: 320,
                                overflowY: "auto",
                                visibility: efectosReady ? "visible" : "hidden",
                                borderColor: "#773dbe",
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-2 pb-1 text-xs font-semibold text-zinc-700">
                                Efectos del elemento
                            </div>
                            <p className="px-2 pb-1 text-[11px] text-zinc-500">
                                Este ajuste aplica solo al elemento seleccionado y se ve en la vista previa.
                            </p>

                            {[
                                { value: "none", label: "Sin efecto" },
                                { value: "reveal", label: "Aparicion al hacer scroll" },
                                { value: "draw", label: "Dibujar linea" },
                                { value: "zoom", label: "Zoom sutil" },
                                { value: "hover", label: "Interaccion al tocar" },
                                { value: "pulse", label: "Pulso suave" },
                                { value: "rsvp", label: "Llamado RSVP" },
                            ]
                                .filter((option) => allowedMotionEffects.includes(option.value))
                                .map((option) => {
                                    const isActive = currentMotionEffect === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => actualizarMotionEffect(option.value)}
                                            className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition ${isActive
                                                ? "bg-purple-50 text-purple-800"
                                                : "hover:bg-gray-100"
                                                }`}
                                        >
                                            <span>{option.label}</span>
                                            {isActive ? <span className="text-xs font-semibold">Activo</span> : null}
                                        </button>
                                    );
                                })}
                        </div>,
                        document.body
                    )
                }
            </div>
            )}

            {/* Usar como fondo (solo si es imagen) */}
            {!esGrupo && esImagen && (
                <button
                    onClick={() => {
                        reemplazarFondo({
                            elementoImagen: elementoSeleccionado,
                            secciones,
                            objetos,
                            setSecciones,
                            setObjetos,
                            setElementosSeleccionados,
                            setSeccionActivaId,
                            setSectionDecorationEdit,
                            setMostrarPanelZ: onCerrar, // reutilizamos onCerrar para cerrar el menú
                        });
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded" />
                    Usar como fondo
                </button>
            )}

            {!esGrupo && esImagen && typeof usarComoDecoracionFondo === "function" && (
                <button
                    onClick={() => {
                        usarComoDecoracionFondo(elementoSeleccionado);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <div className="w-4 h-4 rounded border border-[#dccaf7] bg-gradient-to-br from-[#f7f1ff] to-[#e8dcff]" />
                    Usar como decoracion del fondo
                </button>
            )}

            {esRsvp && (
                <button
                    onClick={() => {
                        if (typeof onConfigurarRsvp === "function") {
                            onConfigurarRsvp();
                        }
                        onCerrar();
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <div className="w-4 h-4 rounded border border-violet-300 bg-violet-100" />
                    Editar confirmar asistencia
                </button>
            )}

            {esRegalo && (
                <button
                    onClick={() => {
                        if (typeof onConfigurarRegalos === "function") {
                            onConfigurarRegalos();
                        }
                        onCerrar();
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <div className="w-4 h-4 rounded border border-amber-300 bg-amber-100" />
                    Editar regalos
                </button>
            )}

            {/* Eliminar */}
            <button
                onClick={() => {
                    onEliminar();
                    onCerrar();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
                <Trash2 className="w-4 h-4 text-red-500" /> Eliminar
            </button>

            {/* Submenú Orden de capa */}
            <div className="relative">
                <button
                    ref={btnOrdenRef}
                    onClick={() => {
                        setMostrarSubmenuEnlace(false);
                        setMostrarSubmenuEfectos(false);
                        setMostrarSubmenuCapa((prev) => !prev);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <Layers className="w-4 h-4" /> Orden de capa
                </button>


                {mostrarSubmenuCapa &&
                    createPortal(
                        <div
                            ref={submenuRef}
                            className="fixed z-[60] bg-white border rounded shadow-lg p-2 space-y-1 menu-z-index"
                            style={{
                                left: submenuPos.x,
                                top: submenuPos.y,
                                width: submenuPos.width,
                                maxWidth: "calc(100vw - 16px)",
                                visibility: submenuReady ? "visible" : "hidden",
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => {
                                    moverElemento("al-frente");
                                    setMostrarSubmenuCapa(false);
                                    onCerrar();
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                            >
                                <ArrowUp className="w-4 h-4" /> Traer al frente
                            </button>

                            <button
                                onClick={() => {
                                    moverElemento("subir");
                                    setMostrarSubmenuCapa(false);
                                    onCerrar();
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                            >
                                <MoveUp className="w-4 h-4" /> Subir
                            </button>

                            <button
                                onClick={() => {
                                    moverElemento("bajar");
                                    setMostrarSubmenuCapa(false);
                                    onCerrar();
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                            >
                                <MoveDown className="w-4 h-4" /> Bajar
                            </button>

                            <button
                                onClick={() => {
                                    moverElemento("al-fondo");
                                    setMostrarSubmenuCapa(false);
                                    onCerrar();
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                            >
                                <ArrowDown className="w-4 h-4" /> Enviar al fondo
                            </button>
                        </div>,
                        document.body
                    )
                }


            </div>
                </>
            )}
        </div>,
        portalTarget
    );
}
