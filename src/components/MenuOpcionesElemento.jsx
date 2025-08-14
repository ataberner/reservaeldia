// C:\Reservaeldia\src\components\MenuOpcionesElemento.jsx
import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
    Copy, Trash2, Layers, ArrowDown, ArrowUp, MoveUp, MoveDown, PlusCircle, ClipboardPaste,
    Link2, X
} from "lucide-react";

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


    const esImagen = elementoSeleccionado?.tipo === "imagen";

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

    // Al abrir el menú, pre-cargar la URL actual del elemento (si tiene)
    useEffect(() => {
        if (!isOpen || !elementoSeleccionado) return;
        const actual = elementoSeleccionado?.enlace?.href || elementoSeleccionado?.enlace || "";
        setUrlInput(actual || "");
        setUrlError(false);
    }, [isOpen, elementoSeleccionado]);

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



    // 1) Posicionar ANTES del paint para evitar flicker
    useLayoutEffect(() => {
        if (!isOpen) {
            // si está cerrado, reseteamos
            setReady(false);
            setPos({ x: -9999, y: -9999 });
            return;
        }
        const btn = botonOpcionesRef?.current;
        if (!btn) return;

        const r = btn.getBoundingClientRect();
        const p = calcularPosDesdeRect(r);
        setPos(p);
        setReady(true); // ya tenemos posición; mostrar menú
    }, [isOpen, botonOpcionesRef]);

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

    return (
        <div
            ref={menuRootRef}
            className="fixed z-50 bg-white border rounded-lg shadow-xl p-3 text-sm space-y-1 menu-z-index w-64"
            style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                borderColor: "#773dbe",
                borderWidth: "1px",
                maxHeight: "400px",
                overflowY: "auto",
                animation: "fadeInScale 0.15s ease-out",
                visibility: ready ? "visible" : "hidden", // 🔑 evita flash
            }}
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
                    onClick={() => setMostrarSubmenuCapa(prev => !prev)}
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
        </div>
    );
}
