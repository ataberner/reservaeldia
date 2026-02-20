import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChromePicker } from "react-color";
import { Pipette } from "lucide-react";

export default function SelectorColorSeccion({ seccion, onChange, disabled = false }) {
    const [mostrarPicker, setMostrarPicker] = useState(false);
    const [color, setColor] = useState(seccion?.fondo || "#ffffff");
    const [pickerPosicion, setPickerPosicion] = useState({
        top: 0,
        left: 0,
        listo: false,
    });

    const pickerRef = useRef(null);
    const botonRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        setColor(seccion?.fondo || "#ffffff");
    }, [seccion?.fondo]);

    // Cerrar al hacer click fuera del boton y del panel.
    useEffect(() => {
        if (!mostrarPicker) return undefined;

        const handleClickFuera = (e) => {
            const clickEnBoton = pickerRef.current?.contains(e.target);
            const clickEnPanel = panelRef.current?.contains(e.target);
            if (!clickEnBoton && !clickEnPanel) {
                setMostrarPicker(false);
            }
        };

        document.addEventListener("mousedown", handleClickFuera);
        return () => document.removeEventListener("mousedown", handleClickFuera);
    }, [mostrarPicker]);

    const actualizarPosicionPicker = useCallback(() => {
        if (!mostrarPicker || typeof window === "undefined") return;

        const boton = botonRef.current;
        const panel = panelRef.current;
        if (!boton || !panel) return;

        const margenViewport = 8;
        const separacion = 10;
        const viewportAncho = Math.max(0, window.innerWidth || 0);
        const viewportAlto = Math.max(0, window.innerHeight || 0);

        const botonRect = boton.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const panelAncho = Math.max(200, panelRect.width || 250);
        const panelAlto = Math.max(120, panelRect.height || 320);

        let left = botonRect.left;
        if (left + panelAncho > viewportAncho - margenViewport) {
            left = viewportAncho - margenViewport - panelAncho;
        }
        if (left < margenViewport) {
            left = margenViewport;
        }

        const puedeAbajo =
            botonRect.bottom + separacion + panelAlto <= viewportAlto - margenViewport;
        const topAbajo = Math.min(
            botonRect.bottom + separacion,
            viewportAlto - margenViewport - panelAlto
        );
        const topArriba = Math.max(margenViewport, botonRect.top - separacion - panelAlto);

        setPickerPosicion({
            top: Math.round(puedeAbajo ? topAbajo : topArriba),
            left: Math.round(left),
            listo: true,
        });
    }, [mostrarPicker]);

    useLayoutEffect(() => {
        if (!mostrarPicker || typeof window === "undefined") {
            setPickerPosicion((prev) => ({ ...prev, listo: false }));
            return undefined;
        }

        const raf = window.requestAnimationFrame(() => {
            actualizarPosicionPicker();
        });

        window.addEventListener("resize", actualizarPosicionPicker);
        window.addEventListener("scroll", actualizarPosicionPicker, true);

        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", actualizarPosicionPicker);
            window.removeEventListener("scroll", actualizarPosicionPicker, true);
        };
    }, [mostrarPicker, actualizarPosicionPicker]);

    const coloresRapidos = [
        "#ffffff", "#f8f9fa", "#e9ecef", "#dee2e6",
        "#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1",
        "#5f27cd", "#341f97", "#495057", "#212529",
    ];

    const pickerPanel = (
        <div
            ref={panelRef}
            className="fixed z-[120]"
            style={{
                top: `${pickerPosicion.top}px`,
                left: `${pickerPosicion.left}px`,
                maxWidth: "calc(100vw - 16px)",
                visibility: pickerPosicion.listo ? "visible" : "hidden",
            }}
        >
            <div className="relative w-[250px] max-w-[calc(100vw-16px)] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                <ChromePicker
                    color={color}
                    disableAlpha={false}
                    styles={{
                        default: {
                            picker: {
                                width: "100%",
                                boxShadow: "none",
                            },
                        },
                    }}
                    onChange={(newColor) => {
                        const rgba = `rgba(${newColor.rgb.r}, ${newColor.rgb.g}, ${newColor.rgb.b}, ${newColor.rgb.a})`;
                        setColor(rgba);
                        onChange(seccion.id, rgba);
                    }}
                />

                <div className="grid grid-cols-6 gap-2 pt-3">
                    {typeof window !== "undefined" && "EyeDropper" in window && (
                        <button
                            onClick={async () => {
                                try {
                                    const eyeDropper = new window.EyeDropper();
                                    const result = await eyeDropper.open();
                                    setColor(result.sRGBHex);
                                    onChange(seccion.id, result.sRGBHex);
                                } catch (err) {
                                    console.warn("EyeDropper cancelado o no soportado", err);
                                }
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border bg-white shadow-sm transition-transform hover:scale-110 hover:bg-gray-100"
                            title="Seleccionar de pantalla"
                        >
                            <Pipette className="h-4 w-4 text-gray-700" />
                        </button>
                    )}

                    {coloresRapidos.map((c) => (
                        <button
                            key={c}
                            onClick={() => {
                                setColor(c);
                                onChange(seccion.id, c);
                            }}
                            className={`h-7 w-7 rounded border transition-transform hover:scale-110 ${color === c ? "ring-2 ring-purple-500" : ""}`}
                            style={{ backgroundColor: c }}
                            title={c}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="relative" ref={pickerRef}>
            <button
                ref={botonRef}
                onClick={() => setMostrarPicker((prev) => !prev)}
                disabled={disabled}
                className={`h-7 w-7 rounded-md border border-gray-300 shadow-sm transition-transform ${
                    disabled ? "cursor-not-allowed bg-gray-200" : "hover:scale-110"
                }`}
                style={{ backgroundColor: color }}
                title="Cambiar color de fondo"
                type="button"
            />

            {mostrarPicker &&
                (typeof document !== "undefined"
                    ? createPortal(pickerPanel, document.body)
                    : pickerPanel)}
        </div>
    );
}
