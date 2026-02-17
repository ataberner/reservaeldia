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
    // 🔹 Estados internos del sidebar
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
    // 🔹 Reset de paneles al cerrar sidebar
    // --------------------------
    useEffect(() => {
        if (!sidebarAbierta) {
            setMostrarGaleria(false);
            setModoFormasCompleto(false);
        }
    }, [sidebarAbierta]);

    // --------------------------
    // 🔹 Cierra hover al hacer clic fuera
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

    // Helpers para mostrar/ocultar con pequeño delay seguro
    const openPanel = (tipo) => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (fijadoSidebar) return;
        if (tipo) setBotonActivo(tipo);
        setHoverSidebar(true);
    };

    const scheduleClosePanel = () => {
        if (fijadoSidebar) return;
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        // ⏳ delay más generoso
        closeTimerRef.current = setTimeout(() => setHoverSidebar(false), 250);
    };

    const cancelClosePanel = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };



    // --------------------------
    // 🔹 Crear nueva plantilla
    // --------------------------
    const ejecutarCrearPlantilla = async () => {
        const confirmar = confirm("¿Querés crear la plantilla?");
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
                                texto: "¡Nos Casamos!",
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

                console.log("✅ Plantilla creada:", res.data);
                alert("✅ Plantilla creada con éxito");
            } catch (error) {
                console.error("❌ Error al crear la plantilla:", error);
                alert("Ocurrió un error al crear la plantilla");
            }
        };
    };



    // 👇 handler para insertar el contador con defaults
    const onAgregarCuentaRegresiva = useCallback(({ targetISO, preset }) => {
        if (!seccionActivaId) {
            alert("Seleccioná una sección antes de agregar la cuenta regresiva.");
            return;
        }

        const id = `count-${Date.now().toString(36)}`;
        const anchoBase = 800;
        const height = 90;
        const y = 140;

        // ✅ Calcular ancho real según defaults del CountdownKonva + preset
        // Defaults CountdownKonva:
        // chipWidth=46, paddingX=8, gap=8, n=4
        const presetProps = (preset && preset.props) ? preset.props : {};
        const n = 4;
        const gap = presetProps.gap ?? 8;
        const paddingX = presetProps.paddingX ?? 8;
        const chipWidth = presetProps.chipWidth ?? 46;

        const chipW = chipWidth + paddingX * 2;
        const totalW = n * chipW + gap * (n - 1);
        const width = Math.max(120, Math.round(totalW));
        const x = (anchoBase - width) / 2;

        const rawPresetProps = (preset && preset.props) ? preset.props : {};
        // ✅ No permitir que el preset pise geometría/fecha
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
        // 🧪 Marker único para verificar qué dispatch llega a CanvasEditor
        const marker = `sidebar-countdown-${Date.now()}`;
        console.log("[Sidebar] dispatch insertar-elemento", { marker, id, x, y, width, height });

        window.dispatchEvent(new CustomEvent("insertar-elemento", {
            detail: {
                marker,
                id,
                tipo: "countdown",
                x, y, width, height,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                fechaObjetivo: targetISO,
                ...presetPropsSafe,
                presetId: preset?.id,
            }
        }));
    }, [seccionActivaId]);



    const insertarGaleria = useCallback((cfg) => {
        const anchoBase = 800; // ancho del canvas

        // ✅ tomar porcentaje desde el popover, con fallback y clamp
        const widthPct = Math.max(10, Math.min(100, Number(cfg.widthPct ?? 70)));
        const width = (anchoBase * widthPct) / 100;

        // 🔢 Alto total en función de celdas, gap y ratio
        const gap = cfg.gap ?? 0;
        const cols = Math.max(1, cfg.cols || 1);
        const rows = Math.max(1, cfg.rows || 1);
        const ratioCell = (r) => (r === "4:3" ? 3 / 4 : r === "16:9" ? 9 / 16 : 1);
        const cellW = (width - gap * (cols - 1)) / cols;
        const cellH = cellW * ratioCell(cfg.ratio);
        const height = rows * cellH + gap * (rows - 1);

        // centrar horizontalmente según width calculado
        const x = (anchoBase - width) / 2;
        const y = 120;

        const id = `gal-${Date.now().toString(36)}`;
        const total = rows * cols;

        window.dispatchEvent(new CustomEvent("insertar-elemento", {
            detail: {
                id,
                tipo: "galeria",
                x, y, width, height,
                rows, cols,
                gap: cfg.gap,
                radius: cfg.radius,
                ratio: cfg.ratio,
                // opcional: guardar el widthPct por si después querés recalcular
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

            // Si ya estaba fijado y vuelvo a hacer click en el mismo botón => cierro
            if (prevFijado && mismoBoton) {
                setHoverSidebar(false);
                setBotonActivo(null);
                return false;
            }

            // Si clic en otro botón => cambio el botón y dejo fijado
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
    // 🔹 No renderizar en modo selector
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
                style={{ zIndex: 50 }}
            >
                <div
                    onClick={() => alternarSidebarConBoton("menu")}
                    onMouseEnter={() => openPanel("menu")}

                    className={getIconButtonClass("menu")}
                    title="Menú"
                >
                    <FaBars className="text-white text-xl" />
                </div>

                {/* 🖥️ Escritorio: barra vertical a la izquierda */}
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
                        title="Añadir texto"
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
                        title="Añadir forma"
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
                        title="Abrir galería"
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
                        <span className="text-xl">⏱️</span>
                    </button>
                </div>

                {/* 📱 Móvil: barra horizontal inferior */}
                <div className="flex md:hidden flex-row justify-around items-center w-full px-4">
                    <button
                        onClick={() => alternarSidebarConBoton("texto")}
                        className={getIconButtonClass("texto")}
                        title="Añadir texto"
                    >
                        <img src="/icons/texto.png" alt="Texto" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("forma")}
                        className={getIconButtonClass("forma")}
                        title="Añadir forma"
                    >
                        <img src="/icons/forma.png" alt="Forma" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("imagen")}
                        className={getIconButtonClass("imagen")}
                        title="Abrir galería"
                    >
                        <img src="/icons/imagen.png" alt="Imagen" className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => alternarSidebarConBoton("contador")}
                        className={getIconButtonClass("contador")}
                        title="Cuenta regresiva"
                    >
                        <span className="text-xl">⏱️</span>
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
                        cancelClosePanel(); // 🚫 cancela el cierre programado
                        if (!fijadoSidebar) setHoverSidebar(true);
                    }}
                    onMouseLeave={(e) => {
                        const aside = document.querySelector("aside");
                        // Si el mouse se va hacia la barra lateral, no cierres
                        if (safeContains(aside, e.relatedTarget)) return;
                        scheduleClosePanel(); // ⏳ programa cierre
                    }}

                    onMouseDown={(e) => {
                        // 🧠 importante: si el usuario clickea dentro del panel, no cerramos
                        e.stopPropagation();
                        if (!fijadoSidebar) setHoverSidebar(true);
                    }}
                    style={
                        typeof window !== "undefined" && window.innerWidth < 768
                            ? {
                                left: "0",
                                right: "0",
                                bottom: "70px",
                                width: "100%",
                                maxHeight: "60vh", // 🔹 ocupa más alto en móvil
                                overflowY: "auto", // 🔹 scroll vertical
                                WebkitOverflowScrolling: "touch", // 🔹 scroll suave en iOS
                            }
                            : {
                                left: "4rem",
                                top: "69px", // 🔹 justo debajo del header
                                height: "calc(100vh - 56px - 2rem)",
                                width: "18rem",
                                overflowY: "auto",
                            }
                    }
                >
                    <div className="relative pt-10 px-3 pb-4 flex flex-col gap-5 text-gray-800 w-full h-full min-h-0">
                        {/* 🔹 Botón para cerrar el panel */}
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
                                ←
                            </button>
                        )}

                        {/* 🔹 Panel de Formas */}
                        {botonActivo === "forma" && (
                            <PanelDeFormas
                                abierto={true}
                                onCerrar={() => setModoFormasCompleto(false)}
                                sidebarAbierta={sidebarAbierta}
                                seccionActivaId={seccionActivaId}
                            />
                        )}

                        {/* 🔹 MiniToolbar con todas las acciones */}
                        <MiniToolbar
                            botonActivo={botonActivo}
                            onAgregarTitulo={() => {
                                window.dispatchEvent(
                                    new CustomEvent("insertar-elemento", {
                                        detail: {
                                            id: `titulo-${Date.now()}`,
                                            tipo: "texto",
                                            texto: "Título",
                                            x: 100,
                                            y: 100,
                                            fontSize: 36,
                                            color: "#000000",
                                            fontFamily: "sans-serif",
                                            fontWeight: "bold",
                                            fontStyle: "normal",
                                            textDecoration: "none",
                                            rotation: 0,
                                            scaleX: 1,
                                            scaleY: 1,
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
                                            texto: "Subtítulo",
                                            x: 100,
                                            y: 160,
                                            fontSize: 24,
                                            color: "#333333",
                                            fontFamily: "sans-serif",
                                            fontWeight: "normal",
                                            fontStyle: "italic",
                                            textDecoration: "none",
                                            rotation: 0,
                                            scaleX: 1,
                                            scaleY: 1,
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
                                            texto: "Texto del párrafo...",
                                            x: 100,
                                            y: 220,
                                            fontSize: 18,
                                            color: "#444444",
                                            fontFamily: "sans-serif",
                                            fontWeight: "normal",
                                            fontStyle: "normal",
                                            textDecoration: "none",
                                            rotation: 0,
                                            scaleX: 1,
                                            scaleY: 1,
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
                                const confirmar = confirm("¿Seguro que querés borrar TODOS tus borradores?");
                                if (!confirmar) return;
                                try {
                                    const functions = (await import("firebase/functions")).getFunctions();
                                    const borrarTodos = (await import("firebase/functions")).httpsCallable(
                                        functions,
                                        "borrarTodosLosBorradores"
                                    );
                                    await borrarTodos();
                                    alert("✅ Todos los borradores fueron eliminados.");
                                    window.location.reload();
                                } catch (error) {
                                    console.error("❌ Error al borrar todos los borradores", error);
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
