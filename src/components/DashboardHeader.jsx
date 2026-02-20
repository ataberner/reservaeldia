// src/components/DashboardHeader.jsx
import { useState, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useRouter } from "next/router";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ChevronDown, LogOut, Minus, Plus } from "lucide-react";
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
    const accionesMobileRef = useRef(null);
    const headerRef = useRef(null);
    const [nombreBorrador, setNombreBorrador] = useState("");
    const router = useRouter();
    const [accionesMobileAbiertas, setAccionesMobileAbiertas] = useState(false);
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
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const node = headerRef.current;
        if (!node) return;

        const updateHeaderHeightVar = () => {
            const nextHeight = Math.round(node.getBoundingClientRect().height || 52);
            document.documentElement.style.setProperty(
                "--dashboard-header-height",
                `${nextHeight}px`
            );
        };

        updateHeaderHeightVar();

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => updateHeaderHeightVar());
            observer.observe(node);
            return () => observer.disconnect();
        }

        window.addEventListener("resize", updateHeaderHeightVar);
        return () => window.removeEventListener("resize", updateHeaderHeightVar);
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
        const handlePointerDownOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuAbierto(false);
            }
            if (
                accionesMobileRef.current &&
                !accionesMobileRef.current.contains(e.target)
            ) {
                setAccionesMobileAbiertas(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDownOutside);
        return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
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


    const subtleHeaderButton =
        "inline-flex items-center gap-1.5 rounded-xl border border-[#e6dbf8] bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_26px_rgba(119,61,190,0.16)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]";
    const primaryHeaderButton =
        "inline-flex items-center gap-1.5 rounded-xl border border-[#7e4dc6]/40 bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6433b0] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_12px_26px_rgba(119,61,190,0.34)] transition-all duration-200 hover:-translate-y-[1px] hover:from-[#8050c8] hover:via-[#6f3bbc] hover:to-[#5b2ea6] hover:shadow-[0_16px_32px_rgba(119,61,190,0.42)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c3f5]";
    const templateHeaderButton =
        "inline-flex items-center gap-1.5 rounded-xl border border-[#f3d37b] bg-gradient-to-r from-[#fff5cf] to-[#ffe5a8] px-3 py-1.5 text-xs font-semibold text-[#7a5103] shadow-[0_8px_18px_rgba(160,105,16,0.15)] transition-all duration-200 hover:-translate-y-[1px] hover:from-[#ffefc0] hover:to-[#ffdd92] hover:shadow-[0_12px_22px_rgba(160,105,16,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5db98]";
    const historyActionEnabled =
        "rounded-xl border border-[#e6dbf8] bg-white px-2.5 py-1.5 text-xs text-[#773dbe] shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#d4c1f1] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.16)]";
    const historyActionDisabled =
        "cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-2.5 py-1.5 text-xs text-gray-400 shadow-none";
    const dashboardModeButton =
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]";

    return (
        <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-white px-4 py-2 shadow-sm border-b border-gray-200">
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
                        className={`${subtleHeaderButton} text-sm`}
                    >
                        ← Volver
                    </button>

                    {/* Zoom (solo desktop / tablet) */}
                    {!isMobile && (
                        <div className="relative group">
                            <button
                                onClick={toggleZoom}
                                className={`${subtleHeaderButton} px-2.5`}
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
                            className={`flex items-center gap-1 ${historialExternos.length <= 1
                                ? historyActionDisabled
                                : historyActionEnabled
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
                            className={`flex items-center gap-1 ${futurosExternos.length === 0
                                ? historyActionDisabled
                                : historyActionEnabled
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
                    {!loadingAdminAccess && canManageSite && (
                        <button
                            onClick={guardarPlantilla}
                            className={templateHeaderButton}
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
                            className={primaryHeaderButton}
                        >
                            Vista previa y publicar
                        </button>
                    </div>

                    {/* ----------------- ACCIONES (mobile) ----------------- */}
                    <div ref={accionesMobileRef} className="sm:hidden ml-auto relative">
                        <button
                            onClick={() => setAccionesMobileAbiertas((v) => !v)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e6dbf8] bg-white/95 text-[#773dbe] shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.16)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]"
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
                                        className={`w-full justify-center ${primaryHeaderButton}`}
                                    >
                                        Vista previa y publicar
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
                            className={`${dashboardModeButton} ${vistaActual === "publicadas"
                                ? "border-[#d9c5f6] bg-[#f7f1ff] text-[#6f3bc0] shadow-[0_10px_22px_rgba(119,61,190,0.18)] hover:bg-[#f3ebff]"
                                : "border-[#e6dbf8] bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_24px_rgba(119,61,190,0.14)]"
                                }`}
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

                        {!loadingAdminAccess && canManageSite && (
                            <button
                                onClick={() =>
                                    onCambiarVista(
                                        vistaActual === "gestion" ? "home" : "gestion"
                                    )
                                }
                                className={`${dashboardModeButton} ${vistaActual === "gestion"
                                    ? "border-[#d9c5f6] bg-[#f7f1ff] text-[#6f3bc0] shadow-[0_10px_22px_rgba(119,61,190,0.18)] hover:bg-[#f3ebff]"
                                    : "border-[#e6dbf8] bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_24px_rgba(119,61,190,0.14)]"
                                    }`}
                                title={
                                    vistaActual === "gestion"
                                        ? "Volver al inicio del dashboard"
                                        : isSuperAdmin
                                        ? "Abrir tablero de gestión (superadmin)"
                                        : "Abrir tablero de gestión (admin)"
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

        </div>


    );
}
