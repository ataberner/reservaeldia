import { useRef } from "react";
import useMisImagenes from "./useMisImagenes";


export default function useUploaderDeImagen(subirImagen) {
  const inputRef = useRef(null);

  const abrirSelector = () => {
    inputRef.current?.click();
  };

  const handleSeleccion = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    window.dispatchEvent(new CustomEvent("imagen-subiendo"));
    await subirImagen(archivo); // 👉 ahora usa el mismo subirImagen

    if (inputRef.current) inputRef.current.value = null;

    window.dispatchEvent(new CustomEvent("imagen-subida"));
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

  return { abrirSelector, componenteInput };
}
