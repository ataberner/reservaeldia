// src/components/DashboardSidebar.jsx
import React, { useState, useRef, useEffect } from "react";
import MiniToolbar from "./MiniToolbar";
import PanelDeFormas from "./PanelDeFormas";
import GaleriaDeImagenes from "./GaleriaDeImagenes";
import ModalCrearSeccion from "./ModalCrearSeccion";
import { FaBars, FaLock, FaLockOpen } from "react-icons/fa";
import { getFunctions, httpsCallable } from "firebase/functions";
import useModalCrearSeccion from "@/hooks/useModalCrearSeccion";
import useMisImagenes from "@/hooks/useMisImagenes";
import useUploaderDeImagen from "@/hooks/useUploaderDeImagen";


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
                        // ✅ Solo sube la imagen y actualiza la galería
                        // ❌ Ya no la inserta automáticamente en el canvas
                    },
                })}

            <aside
                className="bg-purple-900 text-white w-16 flex flex-col items-center py-2"
                style={{
                    position: "fixed",
                    top: "50px",
                    left: 0,
                    height: "calc(100vh - 50px)",
                    zIndex: 50,
                }}
            >



                {/* 🔹 Panel flotante al hacer hover */}
                {(hoverSidebar || fijadoSidebar) && (
                    <div
                        className="absolute left-16 top-4 h-[calc(100%-2rem)] w-72 bg-white border border-purple-300 shadow-2xl rounded-2xl z-40 overflow-y-auto transition-all duration-200"
                        onMouseEnter={() => setHoverSidebar(true)}
                        onMouseLeave={() => setHoverSidebar(false)}
                    >
                        <div className="relative p-5 pt-10 flex flex-col gap-5 text-gray-800">
                            {/* 🔹 Botón para desfijar */}
                            {fijadoSidebar && (
                                <button
                                    onClick={() => {
                                        setFijadoSidebar(false);
                                        setHoverSidebar(false);
                                        setBotonActivo(null);
                                    }}
                                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-full shadow transition"
                                    title="Cerrar panel"
                                >
                                    ←
                                </button>
                            )}


                            {/* Galería */}
                            {mostrarGaleria && (
                                <GaleriaDeImagenes
                                    imagenes={imagenes || []}
                                    imagenesEnProceso={imagenesEnProceso || []}
                                    cargarImagenes={cargarImagenes}
                                    borrarImagen={borrarImagen}
                                    hayMas={hayMas}
                                    seccionActivaId={seccionActivaId}
                                    cargando={cargando}
                                    onInsertar={(nuevo) => {
                                        window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: nuevo }));
                                        setMostrarGaleria(false);
                                    }}
                                    onSeleccionadasChange={setImagenesSeleccionadas}
                                />
                            )}

                            <MiniToolbar
                                visible={true}
                                esFlotante={true}
                                sidebarAbierta={true}
                                onAgregarTexto={(e) => {
                                    e?.stopPropagation?.();
                                    window.dispatchEvent(
                                        new CustomEvent("insertar-elemento", {
                                            detail: {
                                                id: `texto-${Date.now()}`,
                                                tipo: "texto",
                                                texto: "Texto",
                                                x: 100,
                                                y: 100,
                                                fontSize: 24,
                                                color: "#000000",
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
                                onAgregarForma={(e) => {
                                    e?.stopPropagation?.();
                                    setModoFormasCompleto(true);
                                }}
                                onAgregarImagen={() => setMostrarGaleria((prev) => !prev)}
                                cerrarSidebar={() => setHoverSidebar(false)}
                                galeriaAbierta={mostrarGaleria}
                                mostrarPanelFormas={false}
                                PanelDeFormasComponent={null}
                            />
                            {/* 🔹 Botón añadir sección */}
                            <button
                                onClick={modalCrear.abrir}
                                className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all duration-200"
                            >
                                <span className="text-lg">➕</span>
                                <span>Añadir sección</span>
                            </button>

                            {/* 🔹 Botón crear plantilla */}
                            <button
                                onClick={ejecutarCrearPlantilla}
                                className="flex items-center gap-2 w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all duration-200"
                            >
                                <span className="text-lg">✨</span>
                                <span>Crear plantilla</span>
                            </button>

                            {/* 🔹 Botón borrar todos */}
                            <button
                                onClick={async () => {
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
                                className="flex items-center gap-2 w-full bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all duration-200"
                            >
                                <span className="text-lg">🗑️</span>
                                <span>Borrar todos los borradores</span>
                            </button>



                        </div>
                    </div>
                )}


                <div className="p-4 border-purple-700 flex flex-col gap-4">
                    {/* 🔹 Menú principal */}
                    <div
                        onClick={() => alternarSidebarConBoton("menu")}
                        onMouseEnter={() => setHoverSidebar(true)}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${fijadoSidebar && botonActivo === "menu" ? 'bg-purple-800' : 'hover:bg-purple-700'
                            }`}
                        title="Menú"
                    >
                        <FaBars className="text-white text-xl" />
                    </div>





                    {/* 🔹 Íconos con control de hover individual */}
                    <div
                        onMouseEnter={() => setHoverSidebar(true)}
                        onMouseLeave={() => setHoverSidebar(false)}
                        className="flex flex-col gap-4 mt-4 items-center"
                    >
                        <button
                            onClick={() => alternarSidebarConBoton("texto")}
                            onMouseEnter={() => setHoverSidebar(true)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${fijadoSidebar && botonActivo === "texto" ? 'bg-purple-800' : 'hover:bg-purple-700'
                                }`}
                            title="Añadir texto"
                        >
                            <img src="/icons/texto.png" alt="Texto" className="w-6 h-6" />
                        </button>


                        <button
                            onClick={() => alternarSidebarConBoton("forma")}
                            onMouseEnter={() => setHoverSidebar(true)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${fijadoSidebar && botonActivo === "forma" ? 'bg-purple-800' : 'hover:bg-purple-700'
                                }`}
                            title="Añadir forma"
                        >
                            <img src="/icons/forma.png" alt="Forma" className="w-6 h-6" />
                        </button>


                        <button
                            onClick={() => alternarSidebarConBoton("imagen")}
                            onMouseEnter={() => setHoverSidebar(true)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${fijadoSidebar && botonActivo === "imagen" ? 'bg-purple-800' : 'hover:bg-purple-700'
                                }`}
                            title="Abrir galería"
                        >
                            <img src="/icons/imagen.png" alt="Imagen" className="w-6 h-6" />
                        </button>

                    </div>



                    {/* 🔹 Galería */}
                    {mostrarGaleria && (
                        <div
                            className="text-sm text-white overflow-hidden transition-all duration-300 ease-in-out"
                            style={{ maxHeight: "600px", opacity: 1 }}
                        >
                            <div className="flex flex-col items-start gap-2 transition-all duration-300">
                                <button
                                    onClick={abrirSelector}
                                    className="bg-white text-purple-800 px-3 py-1 rounded hover:bg-purple-200 transition text-sm"
                                >
                                    Subir imagen
                                </button>


                                <GaleriaDeImagenes
                                    imagenes={imagenes || []}               // ✅ fallback vacío
                                    imagenesEnProceso={imagenesEnProceso || []} // ✅ fallback vacío
                                    cargarImagenes={cargarImagenes}
                                    borrarImagen={borrarImagen}
                                    hayMas={hayMas}
                                    seccionActivaId={seccionActivaId}
                                    cargando={cargando}
                                    onInsertar={(nuevo) => {
                                        window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: nuevo }));
                                        setMostrarGaleria(false);
                                    }}
                                    onSeleccionadasChange={setImagenesSeleccionadas}
                                />
                            </div>
                        </div>
                    )}

                </div>
            </aside>

            <ModalCrearSeccion
                visible={modalCrear.visible}
                onClose={modalCrear.cerrar}
                onConfirm={modalCrear.onConfirmar}
            />
        </>
    );
}
