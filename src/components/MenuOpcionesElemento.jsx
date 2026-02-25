// C:\Reservaeldia\src\components\MenuOpcionesElemento.jsx
import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
    Copy, Trash2, Layers, ArrowDown, ArrowUp, MoveUp, MoveDown, PlusCircle, ClipboardPaste,
    Link2, X
} from "lucide-react";
import {
    getAllowedMotionEffectsForElement,
    sanitizeMotionEffect,
} from "@/domain/motionEffects";

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


/**
 * Menú contextual para un elemento seleccionado en el canvas.
 * - Se posiciona pegado al botón ⚙️ (botonOpcionesRef)
 * - Evita el "flash" inicial usando useLayoutEffect + visibility hasta tener posición lista
 */
export default function MenuOpcionesElemento({
    isOpen,
    botonOpcionesRef,            // ref al botón ⚙️
    elementoSeleccionado,        // objeto actual
    onCopiar,
    onPegar,
    onDuplicar,
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
    const [submenuPos, setSubmenuPos] = useState({ x: -9999, y: -9999 });
    const [submenuReady, setSubmenuReady] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mobileBottomOffset, setMobileBottomOffset] = useState(8);


    const esImagen = elementoSeleccionado?.tipo === "imagen";

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
        const sidebar = document.querySelector("aside");
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
    const calcularPosDesdeRect = (r) => {
        const menuWidth = 256; // w-64
        const menuHeight = 300; // estimación
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = r.right + 8; // por defecto a la derecha del botón
        let y = r.top;

        // Si se sale a la derecha, lo ponemos a la izquierda del botón
        if (x + menuWidth > vw) x = r.left - menuWidth - 8;

        // Si se sale por abajo, lo acomodamos hacia arriba
        if (y + menuHeight > vh) y = Math.max(8, r.bottom - menuHeight);

        return { x, y };
    };


    // --- Submenú Enlace ---
    const [mostrarSubmenuEnlace, setMostrarSubmenuEnlace] = useState(false);
    const btnEnlaceRef = useRef(null);
    const submenuEnlaceRef = useRef(null);
    const [enlacePos, setEnlacePos] = useState({ x: -9999, y: -9999 });
    const [enlaceReady, setEnlaceReady] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [urlError, setUrlError] = useState(false);
    const [mostrarSubmenuEfectos, setMostrarSubmenuEfectos] = useState(false);
    const btnEfectosRef = useRef(null);
    const submenuEfectosRef = useRef(null);
    const [efectosPos, setEfectosPos] = useState({ x: -9999, y: -9999 });
    const [efectosReady, setEfectosReady] = useState(false);

    const allowedMotionEffects = getAllowedMotionEffectsForElement(elementoSeleccionado);
    const currentMotionEffect = sanitizeMotionEffect(elementoSeleccionado?.motionEffect);

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

    // Posicionar el flyout de "Enlace"
    useLayoutEffect(() => {
        if (!mostrarSubmenuEnlace) {
            setEnlaceReady(false);
            setEnlacePos({ x: -9999, y: -9999 });
            return;
        }
        const btn = btnEnlaceRef.current;
        if (!btn) return;

        const r = btn.getBoundingClientRect();
        const flyoutWidth = 320;  // un poco más ancho para el input
        const flyoutHeight = 160; // estimado
        const gap = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = r.right + gap;
        let y = r.top;

        if (x + flyoutWidth > vw) x = r.left - flyoutWidth - gap;
        if (y + flyoutHeight > vh) y = Math.max(8, r.bottom - flyoutHeight);

        setEnlacePos({ x, y });
        setEnlaceReady(true);
    }, [mostrarSubmenuEnlace]);

    // Reposicionar ante scroll/resize con el flyout abierto
    useEffect(() => {
        if (!mostrarSubmenuEnlace) return;
        const handle = () => {
            const btn = btnEnlaceRef.current;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const flyoutWidth = 320, flyoutHeight = 160, gap = 8;
            const vw = window.innerWidth, vh = window.innerHeight;

            let x = r.right + gap;
            let y = r.top;
            if (x + flyoutWidth > vw) x = r.left - flyoutWidth - gap;
            if (y + flyoutHeight > vh) y = Math.max(8, r.bottom - flyoutHeight);

            setEnlacePos({ x, y });
        };
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuEnlace]);

    useLayoutEffect(() => {
        if (!mostrarSubmenuEfectos) {
            setEfectosReady(false);
            setEfectosPos({ x: -9999, y: -9999 });
            return;
        }

        const btn = btnEfectosRef.current;
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const flyoutWidth = 300;
        const flyoutHeight = 300;
        const gap = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = rect.right + gap;
        let y = rect.top;
        if (x + flyoutWidth > vw) x = rect.left - flyoutWidth - gap;
        if (x < 8) x = 8;
        if (y + flyoutHeight > vh) y = Math.max(8, rect.bottom - flyoutHeight);

        setEfectosPos({ x, y });
        setEfectosReady(true);
    }, [mostrarSubmenuEfectos]);

    useEffect(() => {
        if (!mostrarSubmenuEfectos) return;

        const handle = () => {
            const btn = btnEfectosRef.current;
            if (!btn) return;

            const rect = btn.getBoundingClientRect();
            const flyoutWidth = 300;
            const flyoutHeight = 300;
            const gap = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let x = rect.right + gap;
            let y = rect.top;
            if (x + flyoutWidth > vw) x = rect.left - flyoutWidth - gap;
            if (x < 8) x = 8;
            if (y + flyoutHeight > vh) y = Math.max(8, rect.bottom - flyoutHeight);

            setEfectosPos({ x, y });
        };

        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuEfectos]);

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
    }, [isOpen, botonOpcionesRef, isMobile]);

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

    useLayoutEffect(() => {
        if (!mostrarSubmenuCapa) {
            setSubmenuReady(false);
            setSubmenuPos({ x: -9999, y: -9999 });
            return;
        }
        const btn = btnOrdenRef.current;
        if (!btn) return;

        const r = btn.getBoundingClientRect();
        const flyoutWidth = 224;   // ~ w-56
        const flyoutHeight = 180;  // estimado
        const gap = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = r.right + gap;     // por defecto, a la derecha del botón
        let y = r.top;

        // Si no entra a la derecha, lo abrimos a la izquierda del panel
        if (x + flyoutWidth > vw) x = r.left - flyoutWidth - gap;

        // Si se pasa por abajo, lo “clamp” hacia arriba
        if (y + flyoutHeight > vh) y = Math.max(8, r.bottom - flyoutHeight);

        setSubmenuPos({ x, y });
        setSubmenuReady(true);
    }, [mostrarSubmenuCapa]);


    useEffect(() => {
        if (!mostrarSubmenuCapa) return;
        const handle = () => {
            const btn = btnOrdenRef.current;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const gap = 8, flyoutWidth = 224, flyoutHeight = 180;
            const vw = window.innerWidth, vh = window.innerHeight;

            let x = r.right + gap;
            let y = r.top;
            if (x + flyoutWidth > vw) x = r.left - flyoutWidth - gap;
            if (y + flyoutHeight > vh) y = Math.max(8, r.bottom - flyoutHeight);

            setSubmenuPos({ x, y });
        };

        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [mostrarSubmenuCapa]);


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
    }, [isOpen, botonOpcionesRef]);

    if (!isOpen) return null;

    const portalTarget = typeof document !== "undefined" ? document.body : null;
    if (!portalTarget) return null;

    return createPortal(
        <div
            ref={menuRootRef}
            className={`fixed z-50 bg-white border shadow-xl p-3 text-sm space-y-1 menu-z-index ${isMobile ? "rounded-2xl w-auto" : "rounded-lg w-64"}`}
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


            {/* Enlace */}
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
                                width: 320,
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
                    Efectos
                </button>

                {mostrarSubmenuEfectos &&
                    createPortal(
                        <div
                            ref={submenuEfectosRef}
                            className="fixed z-[60] bg-white border rounded shadow-lg p-2 space-y-1 menu-z-index"
                            style={{
                                left: efectosPos.x,
                                top: efectosPos.y,
                                width: 300,
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

                            {[
                                { value: "none", label: "Sin efecto" },
                                { value: "reveal", label: "Aparicion al hacer scroll" },
                                { value: "draw", label: "Dibujar linea" },
                                { value: "zoom", label: "Zoom sutil" },
                                { value: "hover", label: "Interaccion al tocar" },
                                { value: "pulse", label: "Pulso suave" },
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

            {/* Usar como fondo (solo si es imagen) */}
            {esImagen && (
                <button
                    onClick={() => {
                        reemplazarFondo({
                            elementoImagen: elementoSeleccionado,
                            secciones,
                            objetos,
                            setSecciones,
                            setObjetos,
                            setElementosSeleccionados,
                            setMostrarPanelZ: onCerrar, // reutilizamos onCerrar para cerrar el menú
                        });
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                    <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded" />
                    Usar como fondo
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
                                width: 224,              // w-56
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
        </div>,
        portalTarget
    );
}
