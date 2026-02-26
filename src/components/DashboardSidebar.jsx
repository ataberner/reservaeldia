// src/components/DashboardSidebar.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import MiniToolbar from "./MiniToolbar";
import PanelDeFormas from "./PanelDeFormas";
import GaleriaDeImagenes from "./GaleriaDeImagenes";
import ModalCrearSeccion from "./ModalCrearSeccion";
import { FaBars, FaRegClock, FaRegEnvelope, FaTimes } from "react-icons/fa";
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


const ratioCell = (r) => (r === "4:3" ? 3 / 4 : r === "16:9" ? 9 / 16 : 1);
const MOBILE_BREAKPOINT = 768;
const MOBILE_BAR_HEIGHT_PX = 74;
const MOBILE_PANEL_GUTTER_PX = 8;
const MOBILE_PANEL_BOTTOM_EXTRA_PX = 2;


export default function DashboardSidebar({
    modoSelector,
    mostrarMiniToolbar,
    seccionActivaId,
}) {
    // --------------------------
    // ðŸ”¹ Estados internos del sidebar
    // --------------------------
    const [hoverSidebar, setHoverSidebar] = useState(false);
    const [fijadoSidebar, setFijadoSidebar] = useState(false);
    const [mostrarGaleria, setMostrarGaleria] = useState(false);
    const [imagenesSeleccionadas, setImagenesSeleccionadas] = useState(0);
    const [modoFormasCompleto, setModoFormasCompleto] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(
        typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
    );
    const modalCrear = useModalCrearSeccion();
    const [botonActivo, setBotonActivo] = useState(null); // 'texto' | 'forma' | 'imagen' | 'contador' | 'rsvp' | 'efectos' | 'menu' | null
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
    // ðŸ”¹ Reset de paneles al cerrar sidebar
    // --------------------------
    useEffect(() => {
        if (!sidebarAbierta) {
            setMostrarGaleria(false);
            setModoFormasCompleto(false);
        }
    }, [sidebarAbierta]);

    // --------------------------
    // ðŸ”¹ Cierra hover al hacer clic fuera
    // --------------------------
    useEffect(() => {
        const handleClickFuera = (e) => {
            const sidebar = document.querySelector("aside");
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
    const panelRef = useRef(null);

    // Helpers para mostrar/ocultar con pequeÃ±o delay seguro
    const openPanel = (tipo) => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (fijadoSidebar) return;
        if (tipo) setBotonActivo(tipo);
        setHoverSidebar(true);
    };

    const scheduleClosePanel = () => {
        if (fijadoSidebar) return;
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        // â³ delay mÃ¡s generoso
        closeTimerRef.current = setTimeout(() => setHoverSidebar(false), 250);
    };

    const cancelClosePanel = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

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
        if (!isMobileViewport) return;

        const tabsConAutoCierre = new Set(["texto", "imagen", "contador", "efectos", "menu"]);
        const handleInsertElement = () => {
            if (!fijadoSidebar) return;
            if (!botonActivo || !tabsConAutoCierre.has(botonActivo)) return;
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



    // --------------------------
    // ðŸ”¹ Crear nueva plantilla
    // --------------------------
    const ejecutarCrearPlantilla = async () => {
        const confirmar = confirm("Â¿QuerÃ©s crear la plantilla?");
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
                                texto: "Â¡Nos Casamos!",
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

                console.log("âœ… Plantilla creada:", res.data);
                alert("âœ… Plantilla creada con Ã©xito");
            } catch (error) {
                console.error("âŒ Error al crear la plantilla:", error);
                alert("OcurriÃ³ un error al crear la plantilla");
            }
        };
    };



    // ðŸ‘‡ handler para insertar el contador con defaults
    const onAgregarCuentaRegresiva = useCallback(({ targetISO, preset }) => {
        if (!seccionActivaId) {
            alert("Selecciona una seccion antes de agregar la cuenta regresiva.");
            return;
        }

        const rawPresetProps = (preset && preset.props) ? preset.props : {};
        const {
            x: _px,
            y: _py,
            width: _pw,
            height: _ph,
            fechaObjetivo: _pFecha,
            targetISO: _pTargetISO,
            tipo: _ptipo,
            id: _pid,
            ...presetPropsSafe
        } = rawPresetProps;

        window.dispatchEvent(new CustomEvent("insertar-elemento", {
            detail: {
                id: `count-${Date.now().toString(36)}`,
                tipo: "countdown",
                fechaObjetivo: targetISO,
                presetId: preset?.id,
                presetProps: presetPropsSafe,
            }
        }));
    }, [seccionActivaId]);



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

            // Si ya estaba fijado y vuelvo a hacer click en el mismo botÃ³n => cierro
            if (prevFijado && mismoBoton) {
                setHoverSidebar(false);
                setBotonActivo(null);
                if (boton === "rsvp") {
                    setRsvpForcePresetSelection(false);
                }
                return false;
            }

            // Si clic en otro botÃ³n => cambio el botÃ³n y dejo fijado
            if (boton !== "rsvp") {
                setRsvpForcePresetSelection(false);
            }
            setHoverSidebar(true);
            setBotonActivo(boton);
            return true;
        });
    };

    const sidebarShellClass = `
    fixed bottom-0 left-0 z-50 h-[74px] w-full text-slate-700
    md:top-[var(--dashboard-header-height,52px)] md:h-[calc(100vh-var(--dashboard-header-height,52px))] md:w-16
    flex items-center justify-center md:flex-col md:items-center md:justify-start
    border-t border-[#e6dbf8] md:border-t-0 md:border-r md:border-[#e6dbf8]
    bg-white/95 backdrop-blur-sm
    shadow-[0_-6px_18px_rgba(15,23,42,0.08)] md:shadow-[8px_0_24px_rgba(15,23,42,0.08)]
    px-2 py-1.5 md:px-0 md:py-2
  `;

    const iconGradientByButton = {
        menu: "from-[#7043bd] to-[#5c34a1]",
        texto: "from-[#7c4cc9] to-[#6538af]",
        forma: "from-[#3f74bf] to-[#345ea5]",
        imagen: "from-[#2f9a8f] to-[#247e74]",
        contador: "from-[#d27a47] to-[#b85b31]",
        rsvp: "from-[#2a8b6f] to-[#1d6f58]",
        efectos: "from-[#7c6a24] to-[#a9852d]",
    };

    const getIconButtonClass = (boton, { compact = false } = {}) => {
        const isActive = fijadoSidebar && botonActivo === boton;
        const gradient = iconGradientByButton[boton] || iconGradientByButton.menu;
        const shapeClass = compact ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-xl";
        return `group flex ${shapeClass} items-center justify-center border bg-gradient-to-br ${gradient} cursor-pointer transition-all duration-200 ${isActive
            ? "border-white/70 text-white ring-2 ring-white/55 shadow-[0_12px_24px_rgba(31,15,58,0.34)]"
            : "border-white/25 text-white/95 opacity-90 hover:-translate-y-[1px] hover:opacity-100 hover:border-white/40 hover:shadow-[0_12px_24px_rgba(31,15,58,0.28)]"
            }`;
    };




    // --------------------------
    // ðŸ”¹ No renderizar en modo selector
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
                className={sidebarShellClass}
                style={{ zIndex: 45, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
                <div
                    onClick={() => alternarSidebarConBoton("menu")}
                    onMouseEnter={() => openPanel("menu")}

                    className={`hidden md:flex ${getIconButtonClass("menu")}`}
                    title="MenÃº"
                >
                    <FaBars className="text-lg" />
                </div>

                {/* ðŸ–¥ï¸ Escritorio: barra vertical a la izquierda */}
                <div className="mt-4 hidden flex-col items-center gap-4 rounded-2xl border border-[#ede4fb] bg-gradient-to-b from-[#faf7ff] to-[#f4edff] px-2 py-3 md:flex">
                    <button
                        onMouseEnter={() => openPanel("texto")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            // Si el mouse se mueve hacia el panel, no cierres
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => alternarSidebarConBoton("texto")}
                        className={getIconButtonClass("texto")}
                        title="AÃ±adir texto"
                    >
                        <img src="/icons/texto.png" alt="Texto" className="w-6 h-6" />
                    </button>


                    <button
                        onMouseEnter={() => openPanel("forma")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            // Si el mouse se mueve hacia el panel, no cierres
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => alternarSidebarConBoton("forma")}
                        className={getIconButtonClass("forma")}
                        title="AÃ±adir forma"
                    >
                        <img src="/icons/forma.png" alt="Forma" className="w-6 h-6" />
                    </button>

                    <button
                        onMouseEnter={() => openPanel("imagen")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            // Si el mouse se mueve hacia el panel, no cierres
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => alternarSidebarConBoton("imagen")}
                        className={getIconButtonClass("imagen")}
                        title="Abrir galerÃ­a"
                    >
                        <img src="/icons/imagen.png" alt="Imagen" className="w-6 h-6" />
                    </button>

                    <button
                        onMouseEnter={() => openPanel("contador")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            // Si el mouse se mueve hacia el panel, no cierres
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => alternarSidebarConBoton("contador")}
                        className={getIconButtonClass("contador")}
                        title="Cuenta regresiva"
                    >
                        <FaRegClock className="text-lg" />
                    </button>

                    <button
                        onMouseEnter={() => openPanel("rsvp")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => {
                            setRsvpForcePresetSelection(false);
                            alternarSidebarConBoton("rsvp");
                        }}
                        className={getIconButtonClass("rsvp")}
                        title="Confirmar asistencia"
                    >
                        <FaRegEnvelope className="text-lg" />
                    </button>

                    <button
                        onMouseEnter={() => openPanel("efectos")}
                        onMouseLeave={(e) => {
                            const panel = document.getElementById("sidebar-panel");
                            if (safeContains(panel, e.relatedTarget)) return;
                            scheduleClosePanel();
                        }}
                        onClick={() => alternarSidebarConBoton("efectos")}
                        className={getIconButtonClass("efectos")}
                        title="Efectos"
                    >
                        <span className="text-sm font-semibold">Fx</span>
                    </button>
                </div>

                {/* ðŸ“± MÃ³vil: barra horizontal inferior */}
                <div className="grid w-full grid-cols-7 items-center gap-1 rounded-2xl border border-[#ede4fb] bg-gradient-to-r from-[#faf7ff] to-[#f4edff] px-1.5 py-1 md:hidden">
                    <button
                        onClick={() => alternarSidebarConBoton("menu")}
                        className={`${getIconButtonClass("menu", { compact: true })} justify-self-center`}
                        title="Menu"
                    >
                        <FaBars className="text-base" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("texto")}
                        className={`${getIconButtonClass("texto", { compact: true })} justify-self-center`}
                        title="AÃ±adir texto"
                    >
                        <img src="/icons/texto.png" alt="Texto" className="h-5 w-5" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("forma")}
                        className={`${getIconButtonClass("forma", { compact: true })} justify-self-center`}
                        title="AÃ±adir forma"
                    >
                        <img src="/icons/forma.png" alt="Forma" className="h-5 w-5" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("imagen")}
                        className={`${getIconButtonClass("imagen", { compact: true })} justify-self-center`}
                        title="Abrir galerÃ­a"
                    >
                        <img src="/icons/imagen.png" alt="Imagen" className="h-5 w-5" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("contador")}
                        className={`${getIconButtonClass("contador", { compact: true })} justify-self-center`}
                        title="Cuenta regresiva"
                    >
                        <FaRegClock className="text-base" />
                    </button>

                    <button
                        onClick={() => {
                            setRsvpForcePresetSelection(false);
                            alternarSidebarConBoton("rsvp");
                        }}
                        className={`${getIconButtonClass("rsvp", { compact: true })} justify-self-center`}
                        title="Confirmar asistencia"
                    >
                        <FaRegEnvelope className="text-base" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("efectos")}
                        className={`${getIconButtonClass("efectos", { compact: true })} justify-self-center`}
                        title="Efectos"
                    >
                        <span className="text-xs font-semibold">Fx</span>
                    </button>
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
                        cancelClosePanel(); // ðŸš« cancela el cierre programado
                        if (!fijadoSidebar) setHoverSidebar(true);
                    }}
                    onMouseLeave={(e) => {
                        const aside = document.querySelector("aside");
                        // Si el mouse se va hacia la barra lateral, no cierres
                        if (safeContains(aside, e.relatedTarget)) return;
                        scheduleClosePanel(); // â³ programa cierre
                    }}

                    onMouseDown={(e) => {
                        // ðŸ§  importante: si el usuario clickea dentro del panel, no cerramos
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
                        className="relative w-full h-full min-h-0 flex flex-col gap-3 px-2.5 pb-3 pt-10 text-slate-700"
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
                        {/* ðŸ”¹ BotÃ³n para cerrar el panel */}
                        {fijadoSidebar && (
                            <button
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

                        {/* ðŸ”¹ Panel de Formas */}
                        {botonActivo === "forma" && (
                            <PanelDeFormas
                                abierto={true}
                                onCerrar={() => setModoFormasCompleto(false)}
                                sidebarAbierta={sidebarAbierta}
                                seccionActivaId={seccionActivaId}
                            />
                        )}

                        {/* ðŸ”¹ MiniToolbar con todas las acciones */}
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
                            onAgregarForma={() => setModoFormasCompleto(true)}
                            onAgregarImagen={() => setMostrarGaleria((prev) => !prev)}
                            onAgregarCuentaRegresiva={onAgregarCuentaRegresiva}
                            mostrarGaleria={mostrarGaleria}
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
                            onCrearPlantilla={ejecutarCrearPlantilla}
                            onBorrarTodos={async () => {
                                const confirmar = confirm("Â¿Seguro que querÃ©s borrar TODOS tus borradores?");
                                if (!confirmar) return;
                                try {
                                    const functions = (await import("firebase/functions")).getFunctions();
                                    const borrarTodos = (await import("firebase/functions")).httpsCallable(
                                        functions,
                                        "borrarTodosLosBorradores"
                                    );
                                    await borrarTodos();
                                    alert("âœ… Todos los borradores fueron eliminados.");
                                    window.location.reload();
                                } catch (error) {
                                    console.error("âŒ Error al borrar todos los borradores", error);
                                    alert("No se pudieron borrar los borradores.");
                                }
                            }}
                            onAbrirModalSeccion={modalCrear.abrir}
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

