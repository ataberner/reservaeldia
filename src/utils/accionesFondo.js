// src/utils/accionesFondo.js

/**
 * 🎨 Reemplazar imagen seleccionada como fondo de sección
 */
export const reemplazarFondoSeccion = ({
  elementoImagen,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  setMostrarPanelZ,
}) => {
  if (!elementoImagen || elementoImagen.tipo !== "imagen") {
    console.warn("❌ El elemento no es una imagen válida");
    return;
  }

  if (!elementoImagen.seccionId) {
    console.warn("❌ La imagen no tiene sección asignada");
    return;
  }

  try {
    console.log("🎨 Convirtiendo imagen a fondo de sección:", elementoImagen.id);

    const seccionesActualizadas = secciones.map((seccion) =>
      seccion.id === elementoImagen.seccionId
        ? {
            ...seccion,
            fondo: "#ffffff",
            fondoTipo: "imagen",
            fondoImagen: elementoImagen.src,
            fondoImagenOffsetX: 0,
            fondoImagenOffsetY: 0,
            fondoImagenDraggable: true,
          }
        : seccion
    );

    const objetosFiltrados = objetos.filter((obj) => obj.id !== elementoImagen.id);

    setSecciones(seccionesActualizadas);
    setObjetos(objetosFiltrados);
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    console.log("✅ Fondo de sección actualizado con imagen");
  } catch (error) {
    console.error("❌ Error al reemplazar fondo de sección:", error);
    alert("Ocurrió un error al cambiar el fondo. Inténtalo de nuevo.");
  }
};


/**
 * 🔄 Desanclar imagen de fondo y convertirla en objeto editable
 */
export const desanclarImagenDeFondo = ({
  seccionId,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
}) => {
  const seccion = secciones.find(s => s.id === seccionId);
  if (!seccion || seccion.fondoTipo !== "imagen") {
    console.warn("❌ La sección no tiene imagen de fondo para desanclar");
    return;
  }

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = seccion.fondoImagen;

    img.onload = () => {
      const finalWidth = img.naturalWidth || img.width;
      const finalHeight = img.naturalHeight || img.height;

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

      console.log("✅ Imagen desanclada con tamaño real");
    };

    img.onerror = () => {
      console.warn("⚠️ No se pudo cargar la imagen, usando tamaño por defecto");

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

      console.log("✅ Imagen desanclada con tamaño por defecto");
    };
  } catch (error) {
    console.error("❌ Error al desanclar imagen:", error);
    alert("Ocurrió un error al desanclar la imagen.");
  }
};

// 🧼 Helper para limpiar campos de imagen de fondo de una sección
function limpiarFondoImagen(secciones, seccionId) {
  return secciones.map(s => {
    if (s.id !== seccionId) return s;

    const limpio = { ...s, fondo: "#ffffff" };
    delete limpio.fondoTipo;
    delete limpio.fondoImagen;
    delete limpio.fondoImagenOffsetX;
    delete limpio.fondoImagenOffsetY;
    delete limpio.fondoImagenDraggable;
    return limpio;
  });
}