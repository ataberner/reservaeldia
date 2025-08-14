// C:\Reservaeldia\src\components\MenuOpcionesElemento.jsx
import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
    Copy, Trash2, Layers, ArrowDown, ArrowUp, MoveUp, MoveDown, PlusCircle, ClipboardPaste,
} from "lucide-react";


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
