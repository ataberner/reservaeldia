// hooks/useUploaderDeImagen.js
import { useRef } from "react";

export default function useUploaderDeImagen(subirImagen) {
  const inputRef = useRef(null);

  const abrirSelector = () => {
    inputRef.current?.click();
  };

  const handleSeleccion = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    // 🔹 1. Subir a Firebase
    const url = await subirImagen(archivo);

    // 🔹 2. Limpiar input
    if (inputRef.current) inputRef.current.value = null;

    // 🔹 3. Retornar la URL
    return url;
  };

  const componenteInput = (
    <input
      type="file"
      accept="image/*"
      ref={inputRef}
      onChange={handleSeleccion}
      style={{ display: "none" }}
    />
  );

  return { abrirSelector, componenteInput, handleSeleccion };
}
