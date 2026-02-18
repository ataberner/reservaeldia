// src/components/DashboardHeader.jsx
import { useState, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useRouter } from "next/router";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ChevronDown, LogOut, Minus, Plus } from "lucide-react";
import SelectorColorSeccion from "./SelectorColorSeccion";
import { markEditorSessionIntentionalExit } from "@/lib/monitoring/editorIssueReporter";



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
    canManageSite = false,
    isSuperAdmin = false,
    loadingAdminAccess = false,
}) {
    const [menuAbierto, setMenuAbierto] = useState(false);
    const menuRef = useRef(null);
    const [nombreBorrador, setNombreBorrador] = useState("");
    const router = useRouter();
    const [colorFondo, setColorFondo] = useState("#ffffff");
    const [seccionActiva, setSeccionActiva] = useState(null);
    const [accionesMobileAbiertas, setAccionesMobileAbiertas] = useState(false);

    const [publicando, setPublicando] = useState(false);
    const [progreso, setProgreso] = useState(0);
    const [urlFinal, setUrlFinal] = useState(null);

    const [mostrarModalURL, setMostrarModalURL] = useState(false);
    const [slugPersonalizado, setSlugPersonalizado] = useState("");
    const [slugDisponible, setSlugDisponible] = useState(null); // true / false / null
    const [verificandoSlug, setVerificandoSlug] = useState(false);
    const [slugPublicoExistente, setSlugPublicoExistente] = useState(null);
    const emailNormalizado = String(usuario?.email || "").trim();
    const nombreNormalizado = String(usuario?.displayName || "").trim();
    const nombreDesdeEmail = emailNormalizado
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const nombreCompletoUsuario = nombreNormalizado || nombreDesdeEmail || "Usuario";
    const emailUsuario = emailNormalizado || "Sin email";
    const inicialUsuario =
        String(nombreCompletoUsuario || emailNormalizado || "U")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";


    // 🧠 Función para verificar si existe el slug en Firestore
    const verificarDisponibilidadSlug = async (slug) => {
        if (!slug) {
            setSlugDisponible(null);
            return;
        }

        setVerificandoSlug(true);
        try {
            const ref = doc(db, "publicadas", slug);
            const snap = await getDoc(ref);
            setSlugDisponible(!snap.exists());
        } catch (err) {
            console.error("Error verificando slug:", err);
            setSlugDisponible(null);
        } finally {
            setVerificandoSlug(false);
        }
    };



    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(max-width: 640px)");
        const update = () => setIsMobile(mq.matches);

        update();
        mq.addEventListener?.("change", update);
        window.addEventListener("resize", update);

        return () => {
            mq.removeEventListener?.("change", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    useEffect(() => {
        if (!isMobile) return;

        // Si en mobile quedó en 50%, lo volvemos a 100%
        if (zoom !== 1) {
            toggleZoom?.();
        }
    }, [isMobile, zoom, toggleZoom]);


    useEffect(() => {
        const cargarDatosBorrador = async () => {
            if (!slugInvitacion) return;

            const ref = doc(db, "borradores", slugInvitacion);
            const snap = await getDoc(ref);

            if (snap.exists()) {
                const data = snap.data();
                // Si no tiene slugPublico asociado, asegurate de limpiarlo
                if (data.slugPublico) {
                    setSlugPublicoExistente(data.slugPublico);
                } else {
                    setSlugPublicoExistente(null);
                }
            }
        };

        cargarDatosBorrador();
    }, [slugInvitacion]);

    useEffect(() => {
        return () => setSlugPublicoExistente(null);
    }, [slugInvitacion]);


    useEffect(() => {
        const syncSeccionActiva = () => {
            const activaId = window.canvasEditor?.seccionActivaId ?? null;
            const secciones = Array.isArray(window.canvasEditor?.secciones)
                ? window.canvasEditor.secciones
                : [];
            const activa = activaId ? secciones.find((s) => s.id === activaId) || null : null;

            setSeccionActiva(activa);
            setColorFondo(activa?.fondo || "#ffffff");
        };

        syncSeccionActiva();
        window.addEventListener("seccion-activa", syncSeccionActiva);
        window.addEventListener("editor-selection-change", syncSeccionActiva);

        return () => {
            window.removeEventListener("seccion-activa", syncSeccionActiva);
            window.removeEventListener("editor-selection-change", syncSeccionActiva);
        };
    }, []);


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
            setAccionesMobileAbiertas(false);

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
        setPublicando(true);
        setProgreso(10);
        setUrlFinal(null);

        try {
            const functions = getFunctions();
            const publicarInvitacion = httpsCallable(functions, "publicarInvitacion");

            // Simular progreso mientras se genera el HTML
            const fakeProgress = setInterval(() => {
                setProgreso((prev) => (prev < 90 ? prev + 5 : prev));
            }, 400);

            const result = await publicarInvitacion({ slug: slugInvitacion });
            clearInterval(fakeProgress);

            const url = result.data?.url;
            if (!url) throw new Error("No se recibió la URL final");

            // Completa la barra y muestra éxito
            setProgreso(100);
            setUrlFinal(url);
            setSlugPublicoExistente(slugPublico || slugPublicoExistente || slugPersonalizado);




        } catch (error) {
            console.error("❌ Error al publicar la invitación:", error);
            alert("Ocurrió un error al publicar la invitación.");
        }
    };

    useEffect(() => {
        const cargarSlugPublico = async () => {
            // 🧠 Solo se ejecuta cuando abrís el modal y hay un slugInvitacion cargado
            if (!mostrarModalURL || !slugInvitacion) return;

            try {
                // 🔍 Buscar si el borrador ya tiene guardado un slugPublico
                const ref = doc(db, "borradores", slugInvitacion);
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();

                    // ✅ Si el borrador ya tiene un slugPublico, lo guardamos en estado
                    if (data.slugPublico) {
                        setSlugPublicoExistente(data.slugPublico);
                        setSlugDisponible(true);
                    } else {
                        // ❌ Si no tiene slugPublico, reseteamos estado
                        setSlugPublicoExistente(null);
                        setSlugDisponible(null);
                    }
                } else {
                    setSlugPublicoExistente(null);
                    setSlugDisponible(null);
                }
            } catch (err) {
                console.error("Error cargando slugPublico:", err);
                setSlugPublicoExistente(null);
                setSlugDisponible(null);
            }
        };

        cargarSlugPublico();
    }, [mostrarModalURL, slugInvitacion]);





    return (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-white px-4 py-2 shadow-sm border-b border-gray-200">
            {slugInvitacion ? (
                /* ----------------- 🟣 Modo edición ----------------- */
                <div className="flex items-center gap-2 flex-1">
                    {/* Botón volver */}
                    <button
                        onClick={() => {
                            markEditorSessionIntentionalExit({
                                slug: slugInvitacion || null,
                                reason: "header-back-button",
                            });
                            // 1) Cerrar editor localmente primero (evita falsos positivos del watchdog)
                            setSlugInvitacion(null);
                            setModoEditor(null);
                            onCambiarVista?.("home");

                            // 2) Limpiar URL sin agregar historial nuevo
                            router.replace("/dashboard", undefined, { shallow: true });
                        }}
                        className="flex items-center gap-2 px-2 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
                    >
                        ← Volver
                    </button>

                    {/* Zoom (solo desktop / tablet) */}
                    {!isMobile && (
                        <div className="relative group">
                            <button
                                onClick={toggleZoom}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-white text-gray-800 border border-gray-300 rounded shadow hover:bg-gray-100 transition"
                            >
                                {zoom === 1 ? <Minus size={14} /> : <Plus size={14} />}
                                <span>{zoom === 1 ? "100%" : "50%"}</span>
                            </button>
                            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                                {zoom === 1 ? "Alejar 50%" : "Acercar 100%"}
                            </div>
                        </div>
                    )}


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

                    {/* Botón cuadrado para elegir color */}
                    {seccionActiva && (
                        <SelectorColorSeccion
                            seccion={seccionActiva}
                            onChange={(id, color) => {
                                window.canvasEditor?.cambiarColorFondoSeccion?.(id, color);
                                setColorFondo(color); // reflejar cambio inmediato en el cuadrado
                            }}
                        />
                    )}







                    {/* Guardar plantilla */}
                    {!loadingAdminAccess && canManageSite && (
                        <button
                            onClick={guardarPlantilla}
                            className="px-3 py-1 bg-yellow-400 text-gray-800 rounded hover:bg-yellow-500 transition text-xs"
                        >
                            Guardar plantilla
                        </button>
                    )}



                    {/* ----------------- ACCIONES (desktop) ----------------- */}
                    <div className="hidden sm:flex gap-2 ml-auto">
                        {/* Input editable con nombre del borrador */}
                        <input
                            type="text"
                            value={nombreBorrador}
                            onChange={(e) => setNombreBorrador(e.target.value)}
                            onBlur={async () => {
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
                            onClick={() => setMostrarModalURL(true)}
                            className={`px-3 py-1 text-white rounded transition text-xs ${slugPublicoExistente ? "bg-green-600 hover:bg-green-700" : "bg-[#773dbe] hover:bg-purple-700"
                                }`}
                        >
                            {slugPublicoExistente ? "Ver o actualizar invitación" : "Publicar invitación"}
                        </button>
                    </div>

                    {/* ----------------- ACCIONES (mobile) ----------------- */}
                    <div className="sm:hidden ml-auto relative">
                        <button
                            onClick={() => setAccionesMobileAbiertas((v) => !v)}
                            className="px-2 py-1 rounded-full border text-gray-700 bg-white hover:bg-gray-50 text-xs"
                            title="Más opciones"
                        >
                            ⋯
                        </button>

                        {accionesMobileAbiertas && (
                            <div className="absolute right-0 mt-2 w-72 bg-white border rounded-xl shadow-lg p-3 z-50">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-semibold text-gray-700">Opciones</div>
                                    <button
                                        onClick={() => setAccionesMobileAbiertas(false)}
                                        className="text-gray-400 hover:text-gray-600 text-sm"
                                        title="Cerrar"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <label className="block text-[11px] text-gray-500 mb-1">Nombre del borrador</label>
                                <input
                                    type="text"
                                    value={nombreBorrador}
                                    onChange={(e) => setNombreBorrador(e.target.value)}
                                    onBlur={async () => {
                                        if (!slugInvitacion) return;
                                        const ref = doc(db, "borradores", slugInvitacion);
                                        await (await import("firebase/firestore")).updateDoc(ref, {
                                            nombre: nombreBorrador,
                                        });
                                    }}
                                    className="w-full border border-gray-300 rounded px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                                    placeholder="Sin nombre"
                                />

                                <div className="mt-3 flex gap-2">
                                    <button
                                        onClick={() => {
                                            setAccionesMobileAbiertas(false);
                                            generarVistaPrevia();
                                        }}
                                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs"
                                    >
                                        Vista previa
                                    </button>

                                    <button
                                        onClick={() => {
                                            setAccionesMobileAbiertas(false);
                                            setMostrarModalURL(true);
                                        }}
                                        className={`flex-1 px-3 py-2 text-white rounded-lg transition text-xs ${slugPublicoExistente ? "bg-green-600 hover:bg-green-700" : "bg-[#773dbe] hover:bg-purple-700"
                                            }`}
                                    >
                                        {slugPublicoExistente ? "Ver / Actualizar" : "Publicar"}
                                    </button>
                                </div>
                            </div>
                        )}
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
                        <button
                            onClick={() =>
                                onCambiarVista(
                                    vistaActual === "publicadas" ? "home" : "publicadas"
                                )
                            }
                            className="px-3 py-1 border text-xs rounded-full hover:bg-gray-50 transition"
                            title={
                                vistaActual === "publicadas"
                                    ? "Volver al inicio del dashboard"
                                    : "Ver tus invitaciones publicadas"
                            }
                        >
                            {vistaActual === "publicadas"
                                ? "← Volver al dashboard"
                                : "Mis invitaciones publicadas"}
                        </button>

                        {!loadingAdminAccess && isSuperAdmin && (
                            <button
                                onClick={() =>
                                    onCambiarVista(
                                        vistaActual === "gestion" ? "home" : "gestion"
                                    )
                                }
                                className="px-3 py-1 border text-xs rounded-full hover:bg-gray-50 transition"
                                title={
                                    vistaActual === "gestion"
                                        ? "Volver al inicio del dashboard"
                                        : isSuperAdmin
                                        ? "Abrir tablero de gestión (superadmin)"
                                        : "Abrir tablero de gestión"
                                }
                            >
                                {vistaActual === "gestion"
                                    ? "← Volver al dashboard"
                                    : "Gestión del sitio"}
                            </button>
                        )}
                    </div>
                </div>


            )}

            {/* 🔹 Menú usuario siempre visible */}
            <div className="relative ml-2" ref={menuRef}>
                <div
                    className={`flex items-center gap-1.5 cursor-pointer rounded-full border px-1.5 py-1 transition-all duration-200 ${menuAbierto
                        ? "border-purple-300 bg-purple-50 shadow-sm ring-2 ring-purple-200"
                        : "border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm"
                        }`}
                    onClick={() => setMenuAbierto(!menuAbierto)}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="menu"
                    aria-expanded={menuAbierto}
                    aria-label="Abrir menu de usuario"
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setMenuAbierto((prev) => !prev);
                        }
                    }}
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
                            {inicialUsuario}
                        </div>
                    )}
                    <ChevronDown
                        className={`text-gray-600 transition-transform duration-200 ${menuAbierto ? "rotate-180" : ""}`}
                        size={14}
                    />
                </div>

                {menuAbierto && (
                    <div className="absolute right-0 mt-2 w-72 max-w-[88vw] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-xs shadow-xl z-50 origin-top-right animate-fade-slide">
                        <div className="border-b border-gray-100 bg-gradient-to-r from-purple-50 via-white to-white px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                Cuenta
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                                {usuario?.photoURL ? (
                                    <img
                                        src={usuario.photoURL}
                                        alt="Foto de perfil"
                                        className="h-8 w-8 rounded-full object-cover"
                                    />
                                ) : (
                                    <div
                                        className="h-8 w-8 flex items-center justify-center rounded-full text-white text-xs font-semibold"
                                        style={{ backgroundColor: "#773dbe" }}
                                    >
                                        {inicialUsuario}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p
                                        className="text-[12px] font-semibold text-gray-800 truncate"
                                        title={nombreCompletoUsuario}
                                    >
                                        {nombreCompletoUsuario}
                                    </p>
                                    <p
                                        className="text-[11px] text-gray-500 truncate"
                                        title={emailUsuario}
                                    >
                                        {emailUsuario}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                const { getAuth, signOut } = await import("firebase/auth");
                                const auth = getAuth();
                                await signOut(auth);
                                window.location.href = "/";
                            }}
                            className="group mx-2 my-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-left font-medium text-red-700 transition hover:border-red-200 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        >
                            <LogOut size={14} className="shrink-0" />
                            <span className="truncate">Cerrar sesion</span>
                        </button>
                    </div>
                )}
            </div>

            {publicando && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-96 text-center animate-fadeIn">
                        {!urlFinal ? (
                            <>
                                <h3 className="text-sm font-medium mb-3 text-gray-700">
                                    Publicando invitación...
                                </h3>
                                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
                                    <div
                                        className="bg-[#773dbe] h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progreso}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-500">{progreso}% completado</p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-base font-semibold mb-2 text-gray-800">
                                    🎉 ¡Invitación publicada!
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    Tu invitación ya está lista para compartir.
                                </p>

                                {/* 🔹 Caja con URL y botón Copiar */}
                                <div className="relative mb-4 flex items-center">
                                    <input
                                        type="text"
                                        readOnly
                                        value={urlFinal}
                                        className="flex-1 border border-gray-300 rounded-l-lg text-xs px-3 py-2 text-gray-700 bg-gray-50 select-all focus:outline-none"
                                    />

                                    {/* Estado interno del botón Copiar */}
                                    <button
                                        onClick={(e) => {
                                            navigator.clipboard.writeText(urlFinal);
                                            e.target.textContent = "Copiado ✓";
                                            e.target.classList.add("bg-green-500", "hover:bg-green-600");
                                            setTimeout(() => {
                                                e.target.textContent = "Copiar";
                                                e.target.classList.remove("bg-green-500", "hover:bg-green-600");
                                            }, 1200);
                                        }}
                                        className="bg-[#773dbe] text-white text-xs px-3 py-2 rounded-r-lg hover:bg-purple-700 transition-all"
                                        title="Copiar enlace"
                                    >
                                        Copiar
                                    </button>
                                </div>

                                {/* 🔹 Botones de acción */}
                                <div className="flex justify-center gap-3">
                                    <a
                                        href={urlFinal}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-[#773dbe] text-white px-4 py-2 rounded-lg text-xs hover:bg-purple-700 transition"
                                    >
                                        Ver invitación
                                    </a>
                                    <button
                                        onClick={() => setPublicando(false)}
                                        className="text-xs text-gray-500 hover:text-gray-700 transition"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}


            {mostrarModalURL && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-96 text-center animate-fadeIn">
                        {slugPublicoExistente ? (
                            <>
                                <h3 className="text-base font-semibold mb-2 text-gray-800">
                                    🌐 Tu invitación ya está publicada
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    Tenés una versión pública online. Podés <strong>verla en el enlace</strong> o <strong>actualizarla</strong> para reemplazarla con los últimos cambios.
                                </p>

                                {/* 🔹 Caja con URL claramente identificada */}
                                <div className="mb-4 text-left">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Enlace público:
                                    </label>
                                    <a
                                        href={`https://reservaeldia.com.ar/i/${slugPublicoExistente}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-sm text-[#773dbe] font-medium underline hover:text-purple-800 break-words"
                                    >
                                        https://reservaeldia.com.ar/i/{slugPublicoExistente}
                                    </a>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        (Click en el enlace para visitar la invitación publicada)
                                    </p>
                                </div>

                                {/* 🔹 Línea divisoria visual */}
                                <hr className="border-gray-200 mb-4" />

                                {/* 🔹 Botones */}
                                <div className="flex justify-center gap-3 mt-2">
                                    <button
                                        onClick={() => setMostrarModalURL(false)}
                                        className="text-xs text-gray-500 hover:text-gray-700 transition"
                                    >
                                        Cerrar
                                    </button>

                                    <button
                                        onClick={async () => {
                                            setMostrarModalURL(false);
                                            setPublicando(true);
                                            setProgreso(10);
                                            setUrlFinal(null);

                                            try {
                                                const functions = getFunctions();
                                                const publicarInvitacion = httpsCallable(functions, "publicarInvitacion");

                                                const result = await publicarInvitacion({
                                                    slug: slugInvitacion,
                                                    slugPublico: slugPublicoExistente,
                                                });

                                                const url = result.data?.url;
                                                if (!url) throw new Error("No se recibió la URL final");

                                                setProgreso(100);
                                                setUrlFinal(url);

                                                // ✅ Forzar re-render inmediato del botón "Ver o actualizar invitación"
                                                setSlugPublicoExistente(slugPublicoExistente);

                                            } catch (error) {
                                                console.error("❌ Error al actualizar la invitación:", error);
                                                alert("Ocurrió un error al actualizar la invitación.");
                                                setPublicando(false);
                                            }
                                        }}
                                        className="px-4 py-2 rounded-lg text-xs text-white bg-[#773dbe] hover:bg-purple-700 transition-all"
                                    >
                                        🔄 Actualizar invitación publicada
                                    </button>

                                </div>

                                <p className="text-[11px] text-gray-400 mt-3">
                                    Este botón sobrescribe la versión publicada con los últimos cambios del editor.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-base font-semibold mb-2 text-gray-800">
                                    🌐 Elegí tu dirección web
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    Tu invitación se publicará en el siguiente enlace:
                                </p>

                                {/* Campo URL */}
                                <div className="flex items-center border rounded-lg overflow-hidden mb-3">
                                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-2 select-none">
                                        https://reservaeldia.com.ar/i/
                                    </span>
                                    <input
                                        type="text"
                                        className="flex-1 px-2 py-2 text-xs focus:outline-none"
                                        placeholder="nombre-de-tu-invitacion"
                                        value={slugPersonalizado}
                                        onChange={(e) => {
                                            let valor = e.target.value.toLowerCase();
                                            valor = valor.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                                            setSlugPersonalizado(valor);
                                            verificarDisponibilidadSlug(valor);
                                        }}
                                    />
                                </div>

                                {/* Feedback visual */}
                                <div className="h-4 mb-4">
                                    {verificandoSlug && (
                                        <span className="text-xs text-gray-400">Verificando...</span>
                                    )}
                                    {slugDisponible === true && (
                                        <span className="text-xs text-green-600">✅ Disponible</span>
                                    )}
                                    {slugDisponible === false && (
                                        <span className="text-xs text-red-500">❌ Ya está en uso</span>
                                    )}
                                </div>

                                {/* Botones */}
                                <div className="flex justify-center gap-3 mt-2">
                                    <button
                                        onClick={() => setMostrarModalURL(false)}
                                        className="text-xs text-gray-500 hover:text-gray-700 transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        disabled={!slugDisponible || !slugPersonalizado}
                                        onClick={async () => {
                                            setMostrarModalURL(false);
                                            setPublicando(true);
                                            setProgreso(10);
                                            setUrlFinal(null);

                                            try {
                                                const functions = getFunctions();
                                                const publicarInvitacion = httpsCallable(functions, "publicarInvitacion");

                                                const result = await publicarInvitacion({
                                                    slug: slugInvitacion,
                                                    slugPublico: slugPersonalizado,
                                                });

                                                const url = result.data?.url;
                                                if (!url) throw new Error("No se recibió la URL final");

                                                setProgreso(100);
                                                setUrlFinal(url);
                                                setSlugPublicoExistente(slugPersonalizado);
                                            } catch (error) {
                                                console.error("❌ Error al publicar la invitación:", error);
                                                alert("Ocurrió un error al publicar la invitación.");
                                                setPublicando(false);
                                            }
                                        }}
                                        className={`px-4 py-2 rounded-lg text-xs text-white transition-all ${slugDisponible
                                            ? "bg-[#773dbe] hover:bg-purple-700"
                                            : "bg-gray-300 cursor-not-allowed"
                                            }`}
                                    >
                                        Publicar invitación
                                    </button>
                                </div>
                            </>
                        )}


                    </div>
                </div>
            )}





        </div>


    );
}
