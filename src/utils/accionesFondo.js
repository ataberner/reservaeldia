import {
  addBackgroundDecorationFromImageObject,
  applySectionBaseImage,
  buildImageObjectFromBackgroundDecoration,
  clearSectionBaseImage,
  findBackgroundDecoration,
  removeBackgroundDecoration,
} from "@/domain/sections/backgrounds";

function closeFloatingMenu(closePanel) {
  if (typeof closePanel === "function") {
    closePanel(false);
  }
}

/**
 * Reemplaza una imagen seleccionada como fondo base de la seccion.
 */
export const reemplazarFondoSeccion = ({
  elementoImagen,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  setSeccionActivaId,
  setSectionDecorationEdit,
  setMostrarPanelZ,
}) => {
  if (!elementoImagen || elementoImagen.tipo !== "imagen") {
    console.warn("El elemento no es una imagen valida");
    return;
  }

  if (!elementoImagen.seccionId) {
    console.warn("La imagen no tiene seccion asignada");
    return;
  }

  try {
    const seccionesActualizadas = applySectionBaseImage(
      secciones.map((seccion) =>
        seccion.id === elementoImagen.seccionId
          ? { ...seccion, fondo: "#ffffff" }
          : seccion
      ),
      elementoImagen.seccionId,
      elementoImagen.src
    );

    const objetosFiltrados = objetos.filter((obj) => obj.id !== elementoImagen.id);

    setSecciones(seccionesActualizadas);
    setObjetos(objetosFiltrados);
    setElementosSeleccionados([]);
    setSeccionActivaId?.(elementoImagen.seccionId);
    setSectionDecorationEdit?.(null);
    closeFloatingMenu(setMostrarPanelZ);
  } catch (error) {
    console.error("Error al reemplazar fondo de seccion:", error);
    alert("Ocurrio un error al cambiar el fondo. Intentalo de nuevo.");
  }
};

/**
 * Mueve una imagen del canvas al sistema especial de decoraciones del fondo.
 */
export const convertirImagenEnDecoracionFondo = ({
  elementoImagen,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  setSeccionActivaId,
  setSectionDecorationEdit,
  setMostrarPanelZ,
}) => {
  if (!elementoImagen || elementoImagen.tipo !== "imagen") {
    console.warn("El elemento no es una imagen valida");
    return;
  }

  if (!elementoImagen.seccionId) {
    console.warn("La imagen no tiene seccion asignada");
    return;
  }

  try {
    const result = addBackgroundDecorationFromImageObject(secciones, elementoImagen, 800);
    if (!result?.decorationId || !Array.isArray(result.sections)) {
      return;
    }

    setSecciones(result.sections);
    setObjetos(objetos.filter((obj) => obj.id !== elementoImagen.id));
    setElementosSeleccionados([]);
    setSeccionActivaId?.(result.sectionId);
    setSectionDecorationEdit?.({
      sectionId: result.sectionId,
      decorationId: result.decorationId,
      overlayReady: false,
    });
    closeFloatingMenu(setMostrarPanelZ);
  } catch (error) {
    console.error("Error al convertir la imagen en decoracion del fondo:", error);
    alert("Ocurrio un error al mover la imagen al fondo. Intentalo de nuevo.");
  }
};

/**
 * Convierte una decoracion del fondo en una imagen editable del canvas.
 */
export const convertirDecoracionFondoEnImagen = ({
  seccionId,
  decorationId,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  setSectionDecorationEdit,
  setSeccionActivaId,
}) => {
  const seccion = (Array.isArray(secciones) ? secciones : []).find((item) => item?.id === seccionId);
  if (!seccion) {
    console.warn("No se encontro la seccion de la decoracion");
    return;
  }

  const decoration = findBackgroundDecoration(seccion, decorationId, {
    sectionHeight: seccion.altura,
  });
  if (!decoration) {
    console.warn("No se encontro la decoracion del fondo");
    return;
  }

  const nuevoElementoImagen = buildImageObjectFromBackgroundDecoration(decoration, {
    sectionId: seccionId,
    sectionHeight: seccion.altura,
    canvasWidth: 800,
  });

  if (!nuevoElementoImagen) {
    console.warn("No se pudo reconstruir la imagen desde la decoracion");
    return;
  }

  const seccionesActualizadas = removeBackgroundDecoration(secciones, seccionId, decorationId);
  const objetosActualizados = [...(Array.isArray(objetos) ? objetos : []), nuevoElementoImagen];

  setSecciones(seccionesActualizadas);
  setObjetos(objetosActualizados);
  setElementosSeleccionados([nuevoElementoImagen.id]);
  setSectionDecorationEdit?.((previous) => {
    if (
      previous?.sectionId === seccionId &&
      previous?.decorationId === decorationId
    ) {
      return null;
    }
    return previous;
  });
  setSeccionActivaId?.(seccionId);
};

/**
 * Desancla la imagen base de una seccion y la devuelve como imagen editable.
 */
export const desanclarImagenDeFondo = ({
  seccionId,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
}) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion || seccion.fondoTipo !== "imagen") {
    console.warn("La seccion no tiene imagen de fondo para desanclar");
    return;
  }

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = seccion.fondoImagen;

    img.onload = () => {
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      const maxWidth = 450;
      const scale = Math.min(1, maxWidth / originalWidth);

      const finalWidth = originalWidth * scale;
      const finalHeight = originalHeight * scale;

      const nuevoElementoImagen = {
        id: `img-fondo-${Date.now()}`,
        tipo: "imagen",
        src: seccion.fondoImagen,
        x: Math.max(0, (800 - finalWidth) / 2),
        y: 50,
        width: finalWidth,
        height: finalHeight,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        seccionId,
      };

      const seccionesActualizadas = limpiarFondoImagen(secciones, seccionId);
      const objetosActualizados = [...objetos, nuevoElementoImagen];

      setSecciones(seccionesActualizadas);
      setObjetos(objetosActualizados);
      setElementosSeleccionados([nuevoElementoImagen.id]);
    };

    img.onerror = () => {
      const nuevoElementoImagen = {
        id: `img-fondo-${Date.now()}`,
        tipo: "imagen",
        src: seccion.fondoImagen,
        x: 100,
        y: 50,
        width: 600,
        height: 400,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        seccionId,
      };

      const seccionesActualizadas = limpiarFondoImagen(secciones, seccionId);
      const objetosActualizados = [...objetos, nuevoElementoImagen];

      setSecciones(seccionesActualizadas);
      setObjetos(objetosActualizados);
      setElementosSeleccionados([nuevoElementoImagen.id]);
    };
  } catch (error) {
    console.error("Error al desanclar imagen:", error);
    alert("Ocurrio un error al desanclar la imagen.");
  }
};

function limpiarFondoImagen(secciones, seccionId) {
  return secciones.map((seccion) =>
    seccion.id !== seccionId ? seccion : { ...clearSectionBaseImage(seccion), fondo: "#ffffff" }
  );
}
