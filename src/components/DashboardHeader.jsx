// src/components/DashboardHeader.jsx
import { useState, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useRouter } from "next/router";
import { getFunctions, httpsCallable } from "firebase/functions";


export default function DashboardHeader({
    slugInvitacion,
    zoom,
    historialExternos,
    futurosExternos,
    usuario,
    setSlugInvitacion,
    setModoEditor,
    toggleZoom,
    generarVistaPrevia,
    vistaActual,
    onCambiarVista,
}) {
    const [menuAbierto, setMenuAbierto] = useState(false);
    const menuRef = useRef(null);
    const [nombreBorrador, setNombreBorrador] = useState("");
    const router = useRouter();


    // Cargar nombre del borrador al montar o cambiar slug
    useEffect(() => {
        const cargarNombre = async () => {
            if (!slugInvitacion) return;

            try {
                const ref = doc(db, "borradores", slugInvitacion);
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();

                    // Si no tiene nombre, poner un valor temporal
                    setNombreBorrador(data.nombre || "Sin nombre");
                }
            } catch (error) {
                console.error("❌ Error cargando nombre del borrador:", error);
            }
        };

        cargarNombre();
    }, [slugInvitacion]);


    // Cerrar menú si clic afuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuAbierto(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 🔹 Función para guardar plantilla
    const guardarPlantilla = async () => {
        const nombre = prompt("¿Qué nombre querés darle a la nueva plantilla?");
        if (!nombre) return;

        try {
            const ref = doc(db, "borradores", slugInvitacion);
            const snap = await getDoc(ref);
            if (!snap.exists) throw new Error("No se encontró el borrador");

            const data = snap.data();
            const id = nombre.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

            // ✅ Capturar imagen del canvas
            const stage = window.canvasEditor?.stageRef;
            if (!stage) {
                alert("❌ El editor no está listo todavía.");
                return;
            }

            const dataURL = stage.toDataURL({ pixelRatio: 2 });
            const res = await fetch(dataURL);
            const blob = await res.blob();

            // ✅ Subir imagen a Firebase Storage
            const storage = (await import("firebase/storage")).getStorage();
            const storageRef = (await import("firebase/storage")).ref(
                storage,
                `previews/plantillas/${id}.png`
            );
            await (await import("firebase/storage")).uploadBytes(storageRef, blob);

            const portada = await (await import("firebase/storage")).getDownloadURL(storageRef);

            // ✅ Crear plantilla en Firestore
            const functions = getFunctions();
            const crearPlantilla = httpsCallable(functions, "crearPlantilla");

            await crearPlantilla({
                id,
                datos: {
                    nombre,
                    tipo: "boda",
                    portada,
                    editor: "konva",
                    objetos: data.objetos,
                    secciones: data.secciones,
                },
            });

            alert("✅ La plantilla se guardó correctamente.");
        } catch (error) {
            console.error("❌ Error al guardar plantilla:", error);
            alert("Ocurrió un error al guardar la plantilla.");
        }
    };

    // 🔹 Función para publicar invitación
    const publicarInvitacion = async () => {
        const confirmar = confirm("¿Querés publicar esta invitación?");
        if (!confirmar) return;

        const functions = getFunctions();
        const publicarInvitacion = httpsCallable(functions, "publicarInvitacion");

        try {
            const result = await publicarInvitacion({ slug: slugInvitacion });
            const urlFinal = result.data?.url;
            if (urlFinal) window.open(urlFinal, "_blank");
        } catch (error) {
            alert("❌ Error al publicar la invitación.");
            console.error(error);
        }
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-white px-4 py-2 shadow-sm border-b border-gray-200">
            {slugInvitacion ? (
                /* ----------------- 🟣 Modo edición ----------------- */
                <div className="flex items-center gap-2 flex-1">
                    {/* Botón volver */}
                    <button
                        onClick={async () => {
                            // 1) Limpiar la URL (saca ?slug=...) sin agregar historial nuevo
                            await router.replace("/dashboard", undefined, { shallow: true });

                            // 2) Recién ahora reseteamos estado y vista
                            setSlugInvitacion(null);
                            setModoEditor(null);
                            onCambiarVista?.("home");
                        }}
                        className="flex items-center gap-2 px-2 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
                    >
                        ← Volver
                    </button>

                    {/* Zoom */}
                    <div className="relative group">
                        <button
                            onClick={toggleZoom}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-white text-gray-800 border border-gray-300 rounded shadow hover:bg-gray-100 transition"
                        >
                            <span>{zoom === 1 ? "➖" : "➕"}</span>
                            <span>{zoom === 1 ? "100%" : "50%"}</span>
                        </button>
                        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                            {zoom === 1 ? "Alejar 50%" : "Acercar 100%"}
                        </div>
                    </div>

                    {/* Botón Deshacer */}
                    <div className="relative group">
                        <button
                            onClick={() => {
                                if (window.canvasEditor?.deshacer) {
                                    window.canvasEditor.deshacer();
                                } else {
                                    const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true });
                                    document.dispatchEvent(e);
                                }
                            }}
                            disabled={historialExternos.length <= 1}
                            className={`px-2 py-1 rounded-full text-xs transition-all duration-200 flex items-center gap-1 ${historialExternos.length <= 1
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
                                }`}
                        >
                            ⟲
                            {historialExternos.length > 1 && (
                                <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded-full min-w-[14px] text-center">
                                    {historialExternos.length - 1}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Botón Rehacer */}
                    <div className="relative group">
                        <button
                            onClick={() => {
                                if (window.canvasEditor?.rehacer) {
                                    window.canvasEditor.rehacer();
                                } else {
                                    const e = new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true });
                                    document.dispatchEvent(e);
                                }
                            }}
                            disabled={futurosExternos.length === 0}
                            className={`px-2 py-1 rounded-full text-xs transition-all duration-200 flex items-center gap-1 ${futurosExternos.length === 0
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
                                }`}
                        >
                            ⟳
                            {futurosExternos.length > 0 && (
                                <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded-full min-w-[14px] text-center">
                                    {futurosExternos.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Guardar plantilla */}
                    <button
                        onClick={guardarPlantilla}
                        className="px-3 py-1 bg-yellow-400 text-gray-800 rounded hover:bg-yellow-500 transition text-xs"
                    >
                        Guardar plantilla
                    </button>



                    {/* Botones Vista previa / Generar */}
                    <div className="flex gap-2 ml-auto">
                        {/* 🔹 Input editable con nombre del borrador */}
                        <input
                            type="text"
                            value={nombreBorrador}
                            onChange={(e) => setNombreBorrador(e.target.value)}
                            onBlur={async () => {
                                // Guardar en Firestore cuando se pierde el foco
                                if (!slugInvitacion) return;
                                const ref = doc(db, "borradores", slugInvitacion);
                                await (await import("firebase/firestore")).updateDoc(ref, {
                                    nombre: nombreBorrador,
                                });
                            }}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-purple-400"
                            title="Editar nombre del borrador"
                        />
                        <button
                            onClick={generarVistaPrevia}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs flex items-center gap-1"
                        >
                            Vista previa
                        </button>
                        <button
                            onClick={publicarInvitacion}
                            className="px-3 py-1 bg-[#773dbe] text-white rounded hover:bg-purple-700 transition text-xs"
                        >
                            Generar
                        </button>
                    </div>
                </div>
            ) : (
                /* ----------------- 🟢 Vista dashboard ----------------- */
                <div className="flex items-center gap-2 flex-1 justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/assets/img/logo.png" alt="Logo" className="h-5" />
                        <span className="text-xs font-semibold text-gray-700 hidden sm:block">DASHBOARD</span>
                    </div>

                    <div className="flex items-center gap-2 mr-2">
                        {vistaActual === "publicadas" ? (
                            <button
                                onClick={() => onCambiarVista("home")}
                                className="px-3 py-1 border text-xs rounded-full hover:bg-gray-50 transition"
                                title="Volver al inicio del dashboard"
                            >
                                ← Volver al dashboard
                            </button>
                        ) : (
                            <button
                                onClick={() => onCambiarVista("publicadas")}
                                className="px-3 py-1 border text-xs rounded-full hover:bg-gray-50 transition"
                                title="Ver tus invitaciones publicadas"
                            >
                                Mis invitaciones publicadas
                            </button>
                        )}
                    </div>
                </div>


            )}

            {/* 🔹 Menú usuario siempre visible */}
            <div className="relative ml-2" ref={menuRef}>
                <div
                    className="flex items-center gap-1 cursor-pointer rounded-full px-1 py-1 transition-all duration-200 hover:bg-gray-100"
                    onClick={() => setMenuAbierto(!menuAbierto)}
                >
                    {usuario?.photoURL ? (
                        <img
                            src={usuario.photoURL}
                            alt="Foto de perfil"
                            className="w-7 h-7 rounded-full object-cover transition-transform duration-200 hover:scale-105"
                            title={usuario.displayName || usuario.email || 'Usuario'}
                        />
                    ) : (
                        <div
                            className="w-7 h-7 flex items-center justify-center rounded-full text-white text-xs font-semibold transition-transform duration-200 hover:scale-105"
                            style={{ backgroundColor: "#773dbe" }}
                            title={usuario?.displayName || usuario?.email || 'Usuario'}
                        >
                            {usuario?.email?.[0]?.toUpperCase() || "U"}
                        </div>
                    )}
                    <span className="text-gray-600 text-xs">▼</span>
                </div>

                {menuAbierto && (
                    <div className="absolute right-0 mt-1 w-36 bg-white border rounded shadow-md py-1 z-50 origin-top-right animate-fade-slide text-xs">
                        <button
                            onClick={async () => {
                                const { getAuth, signOut } = await import("firebase/auth");
                                const auth = getAuth();
                                await signOut(auth);
                                window.location.href = "/";
                            }}
                            className="w-full text-left px-3 py-1 hover:bg-gray-100 transition-colors"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
