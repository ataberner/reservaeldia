// src/components/DashboardSidebar.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import MiniToolbar from "./MiniToolbar";
import PanelDeFormas from "./PanelDeFormas";
import GaleriaDeImagenes from "./GaleriaDeImagenes";
import ModalCrearSeccion from "./ModalCrearSeccion";
import { FaBars, FaLock, FaLockOpen } from "react-icons/fa";
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
    const modalCrear = useModalCrearSeccion();
    const [botonActivo, setBotonActivo] = useState(null); // 'texto' | 'forma' | 'imagen' | 'menu' | null
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


    const closeTimerRef = useRef(null);

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
                return false;
            }

            // Si clic en otro botÃ³n => cambio el botÃ³n y dejo fijado
            setHoverSidebar(true);
            setBotonActivo(boton);
            return true;
        });
    };

    const getIconButtonClass = (boton) => {
        const isActive = fijadoSidebar && botonActivo === boton;
        return `w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-all duration-150 ${isActive
            ? "bg-purple-700 ring-2 ring-purple-300 shadow-inner scale-95"
            : "hover:bg-purple-700"
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
                        await handleSeleccion(e);
                    },
                })}

            <aside
                className="
    bg-purple-900 text-white flex items-center justify-around
    md:flex-col md:items-center md:w-16 md:justify-start
    py-2 fixed
    bottom-0 left-0 w-full h-[60px]
    md:top-[52px] md:bottom-0 md:h-[calc(100vh-52px)] md:w-16 md:flex-col
  "
                style={{ zIndex: 50, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
                <div
                    onClick={() => alternarSidebarConBoton("menu")}
                    onMouseEnter={() => openPanel("menu")}

                    className={getIconButtonClass("menu")}
                    title="MenÃº"
                >
                    <FaBars className="text-white text-xl" />
                </div>

                {/* ðŸ–¥ï¸ Escritorio: barra vertical a la izquierda */}
                <div className="hidden md:flex flex-col items-center gap-4 mt-4">
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
                        <span className="text-xl">â±ï¸</span>
                    </button>
                </div>

                {/* ðŸ“± MÃ³vil: barra horizontal inferior */}
                <div className="flex md:hidden flex-row justify-around items-center w-full px-4">
                    <button
                        onClick={() => alternarSidebarConBoton("texto")}
                        className={getIconButtonClass("texto")}
                        title="AÃ±adir texto"
                    >
                        <img src="/icons/texto.png" alt="Texto" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("forma")}
                        className={getIconButtonClass("forma")}
                        title="AÃ±adir forma"
                    >
                        <img src="/icons/forma.png" alt="Forma" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("imagen")}
                        className={getIconButtonClass("imagen")}
                        title="Abrir galerÃ­a"
                    >
                        <img src="/icons/imagen.png" alt="Imagen" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("contador")}
                        className={getIconButtonClass("contador")}
                        title="Cuenta regresiva"
                    >
                        <span className="text-xl">â±ï¸</span>
                    </button>
                </div>
            </aside>



            {(hoverSidebar || fijadoSidebar) && (
                <div
                    id="sidebar-panel"
                    className="
      absolute bg-white border border-purple-300 shadow-2xl 
      rounded-t-2xl md:rounded-2xl z-40 
      transition-all duration-300 animate-slideUp
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
                        typeof window !== "undefined" && window.innerWidth < 768
                            ? {
                                left: "0",
                                right: "0",
                                bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
                                width: "100%",
                                maxHeight: "60vh", // ðŸ”¹ ocupa mÃ¡s alto en mÃ³vil
                                overflowY: "auto", // ðŸ”¹ scroll vertical
                                WebkitOverflowScrolling: "touch", // ðŸ”¹ scroll suave en iOS
                            }
                            : {
                                left: "4rem",
                                top: "69px", // ðŸ”¹ justo debajo del header
                                height: "calc(100vh - 56px - 2rem)",
                                width: "18rem",
                                overflowY: "auto",
                            }
                    }
                >
                    <div className="relative pt-10 px-3 pb-4 flex flex-col gap-5 text-gray-800 w-full h-full min-h-0">
                        {/* ðŸ”¹ BotÃ³n para cerrar el panel */}
                        {fijadoSidebar && (
                            <button
                                onClick={() => {
                                    setFijadoSidebar(false);
                                    setHoverSidebar(false);
                                    setBotonActivo(null);
                                }}
                                className="
            absolute top-2 right-2 z-[60] w-8 h-8 flex items-center justify-center 
            bg-purple-100 text-purple-700 hover:bg-purple-200 
            rounded-full shadow transition pointer-events-auto
          "
                                title="Cerrar panel"
                            >
                                â†
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






