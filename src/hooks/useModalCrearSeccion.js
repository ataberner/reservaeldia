// src/hooks/useModalCrearSeccion.js
import { useState, useCallback } from "react";

export default function useModalCrearSeccion() {
  const [visible, setVisible] = useState(false);
  const [datos, setDatos] = useState(null);

  const abrir = useCallback(() => setVisible(true), []);
  const cerrar = useCallback(() => setVisible(false), []);

  const confirmar = useCallback((datosSeleccionados) => {
    setDatos(datosSeleccionados);
    window.dispatchEvent(new CustomEvent("crear-seccion", { detail: datosSeleccionados }));
  }, []);

  return {
    visible,
    abrir,
    cerrar,
    datos,
    onConfirmar: confirmar,
  };
}
