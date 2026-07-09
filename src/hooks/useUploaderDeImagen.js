// hooks/useUploaderDeImagen.js
import { useRef } from "react";

export default function useUploaderDeImagen(subirImagen) {
  const inputRef = useRef(null);

  const abrirSelector = () => {
    inputRef.current?.click();
  };

  const handleSeleccion = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return undefined;

    try {
      return await subirImagen(archivo);
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      } else if (e?.target) {
        e.target.value = "";
      }
    }
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
