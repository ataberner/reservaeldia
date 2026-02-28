// components/MiniToolbar.jsx
import React, { useEffect, useState } from "react";
import MiniToolbarTabTexto from "@/components/MiniToolbarTabTexto";
import MiniToolbarTabImagen from "@/components/MiniToolbarTabImagen";
import MiniToolbarTabContador from "@/components/MiniToolbarTabContador";
import MiniToolbarTabMenu from "@/components/MiniToolbarTabMenu";
import MiniToolbarTabEfectos from "@/components/MiniToolbarTabEfectos";
import MiniToolbarTabRsvp from "@/components/MiniToolbarTabRsvp";


export default function MiniToolbar({
  botonActivo,
  onAgregarTitulo,
  onAgregarSubtitulo,
  onAgregarParrafo,
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
  rsvpForcePresetSelection,
  onRsvpPresetSelectionComplete,
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


  // El panel de "forma" se renderiza aparte (PanelDeFormas).
  // Evitamos montar un contenedor vacío con h-full que ocupa espacio en el sidebar.
  if (!botonActivo || botonActivo === "forma") return null;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">

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
        <MiniToolbarTabMenu />
      )}

      {botonActivo === "efectos" && <MiniToolbarTabEfectos />}

      {botonActivo === "rsvp" && (
        <MiniToolbarTabRsvp
          forcePresetSelection={rsvpForcePresetSelection}
          onPresetSelectionComplete={onRsvpPresetSelectionComplete}
        />
      )}


    </div>
  );
}
