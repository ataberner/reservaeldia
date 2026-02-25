// components/MiniToolbar.jsx
import React, { useEffect, useState } from "react";
import MiniToolbarTabTexto from "@/components/MiniToolbarTabTexto";
import MiniToolbarTabImagen from "@/components/MiniToolbarTabImagen";
import MiniToolbarTabContador from "@/components/MiniToolbarTabContador";
import MiniToolbarTabMenu from "@/components/MiniToolbarTabMenu";
import MiniToolbarTabEfectos from "@/components/MiniToolbarTabEfectos";


export default function MiniToolbar({
  botonActivo,
  onAgregarTitulo,
  onAgregarSubtitulo,
  onAgregarParrafo,
  onCrearPlantilla,
  onBorrarTodos,
  onAbrirModalSeccion,
  setMostrarGaleria,
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId: seccionProp,
  setImagenesSeleccionadas,
  onInsertarGaleria,
}) {

  // Estado interno sincronizado con 3 fuentes: prop -> evento global -> fallback por selección
  const [seccionActivaId, setSeccionActivaId] = useState(
    seccionProp || (typeof window !== "undefined" ? window._seccionActivaId : null)
  );

  // 1) Sync con la prop cuando cambie
  useEffect(() => {
    if (seccionProp) setSeccionActivaId(seccionProp);
  }, [seccionProp]);

  // Escuchar el evento global
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => setSeccionActivaId(e?.detail?.id ?? null);
    window.addEventListener("seccion-activa", handler);
    return () => window.removeEventListener("seccion-activa", handler);
  }, []);


  if (!botonActivo) return null;

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">

      {botonActivo === "texto" && (
        <MiniToolbarTabTexto
          onAgregarTitulo={onAgregarTitulo}
          onAgregarSubtitulo={onAgregarSubtitulo}
          onAgregarParrafo={onAgregarParrafo}
          seccionActivaId={seccionActivaId}
        />
      )}

      {botonActivo === "imagen" && (
        <MiniToolbarTabImagen
          abrirSelector={abrirSelector}
          imagenes={imagenes}
          imagenesEnProceso={imagenesEnProceso}
          cargarImagenes={cargarImagenes}
          borrarImagen={borrarImagen}
          hayMas={hayMas}
          cargando={cargando}
          seccionActivaId={seccionActivaId}
          setMostrarGaleria={setMostrarGaleria}
          onInsertarGaleria={onInsertarGaleria}
          setImagenesSeleccionadas={setImagenesSeleccionadas}
        />
      )}

      {botonActivo === "contador" && (
        <MiniToolbarTabContador />
      )}

      {botonActivo === "menu" && (
        <MiniToolbarTabMenu
          onAbrirModalSeccion={onAbrirModalSeccion}
          onCrearPlantilla={onCrearPlantilla}
          onBorrarTodos={onBorrarTodos}
        />
      )}

      {botonActivo === "efectos" && <MiniToolbarTabEfectos />}


    </div>
  );
}
