// src/components/DashboardSidebar.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import MiniToolbar from "./MiniToolbar";
import PanelDeFormas from "./PanelDeFormas";
import ModalCrearSeccion from "./ModalCrearSeccion";
import { FaChevronRight, FaGift, FaRegClock, FaRegEnvelope, FaTimes } from "react-icons/fa";
import { getFunctions, httpsCallable } from "firebase/functions";
import useModalCrearSeccion from "@/hooks/useModalCrearSeccion";
import useMisImagenes from "@/hooks/useMisImagenes";
import useUploaderDeImagen from "@/hooks/useUploaderDeImagen";


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

const MOBILE_BREAKPOINT = 768;
const MOBILE_BAR_HEIGHT_PX = 96;
const MOBILE_PANEL_GUTTER_PX = 8;
const MOBILE_PANEL_BOTTOM_EXTRA_PX = 2;
const MOBILE_SCROLL_FADE_WIDTH_PX = 92;
const TABS_WITH_AUTO_CLOSE_ON_INSERT = new Set(["texto", "imagen", "contador", "efectos"]);


export default function DashboardSidebar({
    modoSelector,
    seccionActivaId,
}) {
    // --------------------------
    // Estados internos del sidebar
    // --------------------------
    const [hoverSidebar, setHoverSidebar] = useState(false);
    const [fijadoSidebar, setFijadoSidebar] = useState(false);
    const [, setMostrarGaleria] = useState(false);
    const [, setImagenesSeleccionadas] = useState(0);
    const [isMobileViewport, setIsMobileViewport] = useState(
        typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
    );
    const [showMobileScrollHint, setShowMobileScrollHint] = useState(false);
    const modalCrear = useModalCrearSeccion();
    const [botonActivo, setBotonActivo] = useState(null); // 'texto' | 'forma' | 'imagen' | 'contador' | 'rsvp' | 'regalos' | 'efectos' | null
    const [rsvpForcePresetSelection, setRsvpForcePresetSelection] = useState(false);
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
    const sidebarAbierta = fijadoSidebar || hoverSidebar;

    // --------------------------
    // Reset de paneles al cerrar sidebar
    // --------------------------
    useEffect(() => {
        if (!sidebarAbierta) {
            setMostrarGaleria(false);
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
    const mobileToolbarScrollRef = useRef(null);

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
        setFijadoSidebar(false);
        setHoverSidebar(false);
        setBotonActivo(null);
        setRsvpForcePresetSelection(false);
    }, []);

    useEffect(() => {
        if (!isMobileViewport) return;
        if (!(hoverSidebar || fijadoSidebar)) return;
        if (!botonActivo) return;

        const panelEl = panelRef.current;
        if (!panelEl) return;
        panelEl.scrollTop = 0;
    }, [isMobileViewport, hoverSidebar, fijadoSidebar, botonActivo]);

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
            if (!fijadoSidebar) return;
            if (!botonActivo || !TABS_WITH_AUTO_CLOSE_ON_INSERT.has(botonActivo)) return;
            closeSidebarPanel();
        };

        window.addEventListener("insertar-elemento", handleInsertElement);
        return () => window.removeEventListener("insertar-elemento", handleInsertElement);
    }, [isMobileViewport, fijadoSidebar, botonActivo, closeSidebarPanel]);

    useEffect(() => {
        const handleAbrirPanelRsvp = (event) => {
            const forcePresetSelection = event?.detail?.forcePresetSelection === true;
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
                const functions = getFunctions();
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

    const insertarGaleria = useCallback((cfg) => {
        const rows = Math.max(1, cfg.rows || 1);
        const cols = Math.max(1, cfg.cols || 1);
        const total = rows * cols;
        const widthPct = Math.max(10, Math.min(100, Number(cfg.widthPct ?? 70)));

        window.dispatchEvent(new CustomEvent("insertar-elemento", {
            detail: {
                id: `gal-${Date.now().toString(36)}`,
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
            }
        }));
    }, []);





    const alternarSidebarConBoton = (boton) => {
        setFijadoSidebar((prevFijado) => {
            const mismoBoton = botonActivo === boton;

            // Si ya estaba fijado y vuelvo a hacer click en el mismo boton => cierro
            if (prevFijado && mismoBoton) {
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

    const sidebarShellClass = `
    fixed bottom-0 left-0 z-50 h-[96px] w-full text-slate-700
    md:top-[var(--dashboard-header-height,52px)] md:h-[calc(100vh-var(--dashboard-header-height,52px))] md:w-16
    flex items-center justify-center md:flex-col md:items-center md:justify-start
    border-t border-[#e6dbf8] md:border-t-0 md:border-r md:border-[#e6dbf8]
    bg-white md:bg-white/95 md:backdrop-blur-sm
    shadow-[0_-4px_12px_rgba(15,23,42,0.08)] md:shadow-[8px_0_24px_rgba(15,23,42,0.08)]
    px-2 py-1.5 md:px-0 md:py-2
  `;

    const iconGradientByButton = {
        texto: "from-[#7c4cc9] to-[#6538af]",
        forma: "from-[#3f74bf] to-[#345ea5]",
        imagen: "from-[#2f9a8f] to-[#247e74]",
        contador: "from-[#d27a47] to-[#b85b31]",
        rsvp: "from-[#2a8b6f] to-[#1d6f58]",
        regalos: "from-[#d15b7f] to-[#b64568]",
        efectos: "from-[#7c6a24] to-[#a9852d]",
    };

    const getIconButtonClass = (boton, { compact = false } = {}) => {
        const isActive = fijadoSidebar && botonActivo === boton;
        const gradient = iconGradientByButton[boton] || iconGradientByButton.texto;
        const shapeClass = compact ? "h-11 w-11 rounded-xl" : "h-10 w-10 rounded-xl";
        return `group flex ${shapeClass} items-center justify-center border bg-gradient-to-br ${gradient} cursor-pointer transition-all duration-200 ${isActive
            ? "border-white/70 text-white ring-2 ring-white/55 shadow-[0_12px_24px_rgba(31,15,58,0.34)]"
            : "border-white/25 text-white/95 opacity-90 hover:-translate-y-[1px] hover:opacity-100 hover:border-white/40 hover:shadow-[0_12px_24px_rgba(31,15,58,0.28)]"
            }`;
    };




    // --------------------------
    // No renderizar en modo selector
    // --------------------------
    if (modoSelector) return null;

    return (
        <>
            {componenteInput &&
                React.cloneElement(componenteInput, {
                    onChange: async (e) => {
                        const uploadedUrl = await handleSeleccion(e);
                        if (
                            typeof uploadedUrl === "string" &&
                            uploadedUrl &&
                            typeof window.asignarImagenACelda === "function"
                        ) {
                            window.asignarImagenACelda(uploadedUrl, "cover");
                        }
                    },
                })}

            <aside
                ref={asideRef}
                data-dashboard-sidebar="true"
                className={sidebarShellClass}
                style={{ zIndex: 45, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
                {/* Escritorio: barra vertical a la izquierda */}
                <div className="mt-2 hidden flex-col items-center gap-3 rounded-2xl border border-[#ede4fb] bg-gradient-to-b from-[#faf7ff] to-[#f4edff] px-2 py-3 md:flex">
                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("texto")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("texto")}
                            className={getIconButtonClass("texto")}
                            title="Texto"
                        >
                            <img src="/icons/texto.png" alt="Texto" className="w-6 h-6" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Texto
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("forma")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("forma")}
                            className={getIconButtonClass("forma")}
                            title="Elementos"
                        >
                            <img src="/icons/forma.png" alt="Elementos" className="w-6 h-6" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Elementos
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("imagen")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("imagen")}
                            className={getIconButtonClass("imagen")}
                            title="Imagenes"
                        >
                            <img src="/icons/imagen.png" alt="Imagenes" className="w-6 h-6" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Imagenes
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("contador")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("contador")}
                            className={getIconButtonClass("contador")}
                            title="Contador"
                        >
                            <FaRegClock className="text-lg" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Contador
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("rsvp")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => {
                                setRsvpForcePresetSelection(false);
                                alternarSidebarConBoton("rsvp");
                            }}
                            className={getIconButtonClass("rsvp")}
                            title="Asistencia"
                        >
                            <FaRegEnvelope className="text-lg" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Asistencia
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("regalos")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("regalos")}
                            className={getIconButtonClass("regalos")}
                            title="Regalos"
                        >
                            <FaGift className="text-lg" />
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Regalos
                        </span>
                    </div>

                    <div
                        className="flex flex-col items-center gap-1"
                        onMouseEnter={() => openPanel("efectos")}
                        onMouseLeave={(e) => {
                            const panel = panelRef.current;
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                    >
                        <button type="button"
                            onClick={() => alternarSidebarConBoton("efectos")}
                            className={getIconButtonClass("efectos")}
                            title="Efectos"
                        >
                            <span className="text-sm font-semibold">Fx</span>
                        </button>
                        <span className="text-[10px] font-semibold text-[#5f3596] leading-none">
                            Efectos
                        </span>
                    </div>

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
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("texto")}
                                    className={`${getIconButtonClass("texto", { compact: true })} justify-self-center`}
                                    title="Texto"
                                >
                                    <img src="/icons/texto.png" alt="Texto" className="h-5 w-5" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Texto</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("forma")}
                                    className={`${getIconButtonClass("forma", { compact: true })} justify-self-center`}
                                    title="Elementos"
                                >
                                    <img src="/icons/forma.png" alt="Elementos" className="h-5 w-5" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Elementos</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("imagen")}
                                    className={`${getIconButtonClass("imagen", { compact: true })} justify-self-center`}
                                    title="Imagenes"
                                >
                                    <img src="/icons/imagen.png" alt="Imagenes" className="h-5 w-5" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Imagenes</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("contador")}
                                    className={`${getIconButtonClass("contador", { compact: true })} justify-self-center`}
                                    title="Contador"
                                >
                                    <FaRegClock className="text-lg" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Contador</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => {
                                        setRsvpForcePresetSelection(false);
                                        alternarSidebarConBoton("rsvp");
                                    }}
                                    className={`${getIconButtonClass("rsvp", { compact: true })} justify-self-center`}
                                    title="Asistencia"
                                >
                                    <FaRegEnvelope className="text-lg" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Asistencia</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("regalos")}
                                    className={`${getIconButtonClass("regalos", { compact: true })} justify-self-center`}
                                    title="Regalos"
                                >
                                    <FaGift className="text-lg" />
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Regalos</span>
                            </div>

                            <div className="flex min-w-[62px] shrink-0 flex-col items-center gap-1.5">
                                <button type="button"
                                    onClick={() => alternarSidebarConBoton("efectos")}
                                    className={`${getIconButtonClass("efectos", { compact: true })} justify-self-center`}
                                    title="Efectos"
                                >
                                    <span className="text-[13px] font-bold">Fx</span>
                                </button>
                                <span className="text-[10px] font-semibold leading-none text-[#5f3596]">Efectos</span>
                            </div>
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
                <div
                    ref={panelRef}
                    id="sidebar-panel"
                    className="
      absolute z-40 rounded-2xl border border-[#e6dbf8] bg-white
      md:rounded-2xl shadow-[0_20px_40px_rgba(15,23,42,0.12)]
      transition-all duration-200 animate-slideUp
    "
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
                                height: "min(52vh, 440px)",
                                overflow: "hidden",
                                overscrollBehaviorY: "contain",
                                touchAction: "pan-y",
                                display: "flex",
                                flexDirection: "column",
                            }
                            : {
                                left: "4rem",
                                top: "var(--dashboard-header-height, 52px)",
                                height: "calc(100vh - var(--dashboard-header-height, 52px))",
                                width: "18rem",
                                overflowY: "auto",
                            }
                    }
                >
                    <div
                        className={`relative w-full h-full min-h-0 flex flex-col text-slate-700 ${
                            botonActivo === "forma"
                                ? "gap-0 px-2.5 pb-0.5 pt-8"
                                : "gap-3 px-2.5 pb-3 pt-10"
                        }`}
                        style={
                            isMobileViewport
                                ? {
                                    flex: 1,
                                    minHeight: 0,
                                    overflowY: "auto",
                                    WebkitOverflowScrolling: "touch",
                                    overscrollBehaviorY: "contain",
                                }
                                : undefined
                        }
                    >
                        {/* Boton para cerrar el panel */}
                        {fijadoSidebar && (
                            <button type="button"
                                onClick={closeSidebarPanel}
                                className="
            absolute top-2 right-2 z-[60] flex h-8 w-8 items-center justify-center rounded-full
            border border-[#dbc9f6] bg-white text-[#6d3eb6]
            shadow-[0_8px_18px_rgba(95,53,150,0.18)] transition-all duration-200
            hover:-translate-y-[1px] hover:bg-[#f8f2ff] hover:shadow-[0_12px_24px_rgba(95,53,150,0.26)]
            pointer-events-auto
          "
                                title="Cerrar panel"
                            >
                                <FaTimes className="text-sm" />
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
                            abrirSelector={abrirSelector}
                            onInsertarGaleria={insertarGaleria}
                            rsvpForcePresetSelection={rsvpForcePresetSelection}
                            onRsvpPresetSelectionComplete={() => setRsvpForcePresetSelection(false)}
                        />
                    </div>
                </div>
            )}



            <ModalCrearSeccion
                visible={modalCrear.visible}
                onClose={modalCrear.cerrar}
                onConfirm={modalCrear.onConfirmar}
            />
        </>
    );
}


