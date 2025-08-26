import { useEffect, useRef, useState } from "react";
import { ChromePicker } from "react-color";
import { Pipette } from "lucide-react";


export default function SelectorColorSeccion({ seccion, onChange, disabled = false }) {
    const [mostrarPicker, setMostrarPicker] = useState(false);
    const pickerRef = useRef(null);
    const [color, setColor] = useState(seccion?.fondo || "#ffffff");

    // cerrar al hacer click afuera
    useEffect(() => {
        const handleClickFuera = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setMostrarPicker(false);
            }
        };
        if (mostrarPicker) {
            document.addEventListener("mousedown", handleClickFuera);
            return () => document.removeEventListener("mousedown", handleClickFuera);
        }
    }, [mostrarPicker]);

    useEffect(() => {
        setColor(seccion?.fondo || "#ffffff");
    }, [seccion?.fondo]);

    // 🎨 paleta rápida
    const coloresRapidos = [
        "#ffffff", "#f8f9fa", "#e9ecef", "#dee2e6",
        "#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1",
        "#5f27cd", "#341f97", "#495057", "#212529",
    ];

    return (
        <div className="relative" ref={pickerRef}>
            {/* cuadrado header */}
            <button
                onClick={() => setMostrarPicker(!mostrarPicker)}
                disabled={disabled}
                className={`w-6 h-6 rounded border shadow-sm transition-transform ${disabled ? "bg-gray-200 cursor-not-allowed"
                    : "hover:scale-110"
                    }`}
                style={{ backgroundColor: color }}
                title="Cambiar color de fondo"
            />

            {mostrarPicker && (
                <div className="absolute top-full left-0 mt-3 z-50">
                    {/* Triangulito alineado a la izquierda */}
                    <div className="absolute -top-2 left-4 w-0 h-0 
                    border-l-8 border-r-8 border-b-8 
                    border-l-transparent border-r-transparent border-b-white 
                    drop-shadow-md"></div>

                    {/* Ventana flotante */}
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[250px] relative">
                        <ChromePicker
                            color={color}
                            disableAlpha={false}
                            onChange={(newColor) => {
                                const rgba = `rgba(${newColor.rgb.r}, ${newColor.rgb.g}, ${newColor.rgb.b}, ${newColor.rgb.a})`;
                                setColor(rgba);
                                onChange(seccion.id, rgba);
                            }}
                        />

                        <div className="grid grid-cols-6 gap-2 pt-3">
                            {/* Botón gotero como primera opción */}
                            {"EyeDropper" in window && (
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
                                    className="w-7 h-7 flex items-center justify-center rounded border bg-white hover:bg-gray-100 hover:scale-110 transition-transform shadow-sm"
                                    title="Seleccionar de pantalla"
                                >
                                    <Pipette className="w-4 h-4 text-gray-700" />
                                </button>
                            )}

                            {/* Paleta rápida */}
                            {coloresRapidos.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => {
                                        setColor(c);
                                        onChange(seccion.id, c);
                                    }}
                                    className={`w-7 h-7 rounded border hover:scale-110 transition-transform ${color === c ? "ring-2 ring-purple-500" : ""
                                        }`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>

                    </div>
                </div>
            )}



        </div>
    );
}
