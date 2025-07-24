import { useCallback } from "react";
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// 🎨 Hook que encapsula toda la lógica de fondo de sección
export default function useFondoDeSeccion({
  secciones,
  setSecciones,
  objetos,
  setObjetos,
  setElementosSeleccionados,
  setMostrarPanelZ,
}) {
  const uid = getAuth().currentUser?.uid;

  // ✅ Subir imagen a carpeta publica sin token
  const convertirAFondoPublico = async (urlOriginal) => {
    const response = await fetch(urlOriginal, { mode: "cors" });
    const blob = await response.blob();

    const extension = blob.type.split("/")[1] || "jpg";
    const nombre = `fondos_publicos/${uid}/fondo-${Date.now()}.${extension}`;
    const storage = getStorage();
    const refNueva = ref(storage, nombre);

    await uploadBytes(refNueva, blob, {
      customMetadata: { firebaseStorageDownloadTokens: null },
    });

    return await getDownloadURL(refNueva);
  };

  // 🎨 Reemplazar imagen por fondo de sección
  const reemplazarFondoSeccion = async (elementoImagen) => {
    if (!elementoImagen || elementoImagen.tipo !== "imagen") return;
    if (!elementoImagen.seccionId) return;

    try {
      const urlPublica = await convertirAFondoPublico(elementoImagen.src);

      const nuevasSecciones = secciones.map((seccion) =>
        seccion.id === elementoImagen.seccionId
          ? {
              ...seccion,
              fondo: "#ffffff",
              fondoTipo: "imagen",
              fondoImagen: urlPublica,
              fondoImagenOffsetX: 0,
              fondoImagenOffsetY: 0,
              fondoImagenDraggable: true,
            }
          : seccion
      );

      setSecciones(nuevasSecciones);
      setObjetos((prev) => prev.filter((o) => o.id !== elementoImagen.id));
      setElementosSeleccionados([]);
      setMostrarPanelZ(false);
    } catch (error) {
      console.error("❌ Error al reemplazar fondo de sección:", error);
      alert("Ocurrió un error al cambiar el fondo. Inténtalo de nuevo.");
    }
  };

  // 🔄 Desanclar fondo y convertirlo en objeto editable
  const desanclarImagenDeFondo = async (seccionId) => {
    const seccion = secciones.find((s) => s.id === seccionId);
    if (!seccion || seccion.fondoTipo !== "imagen") return;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = seccion.fondoImagen;

      img.onload = () => {
        const finalWidth = img.naturalWidth || img.width;
        const finalHeight = img.naturalHeight || img.height;
        const posicionX = Math.max(0, (800 - finalWidth) / 2);
        const posicionY = 50;

        const nuevoElementoImagen = {
          id: `img-fondo-${Date.now()}`,
          tipo: "imagen",
          src: seccion.fondoImagen,
          x: posicionX,
          y: posicionY,
          width: finalWidth,
          height: finalHeight,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          seccionId,
        };

        const seccionesActualizadas = secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                fondo: "#ffffff",
              }
            : s
        );

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

        const seccionesActualizadas = secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                fondo: "#ffffff",
              }
            : s
        );

        const objetosActualizados = [...objetos, nuevoElementoImagen];
        setSecciones(seccionesActualizadas);
        setObjetos(objetosActualizados);
        setElementosSeleccionados([nuevoElementoImagen.id]);
      };
    } catch (error) {
      console.error("❌ Error al desanclar imagen de fondo:", error);
      alert("Ocurrió un error al desanclar la imagen.");
    }
  };

  // 🎨 Cambiar color de fondo (limpiando cualquier imagen anterior)
  const cambiarColorFondoSeccion = useCallback(
    (seccionId, nuevoColor) => {
      const nuevas = secciones.map((s) => {
        if (s.id !== seccionId) return s;

        const limpia = { ...s, fondo: nuevoColor };
        delete limpia.fondoTipo;
        delete limpia.fondoImagen;
        delete limpia.fondoImagenOffsetX;
        delete limpia.fondoImagenOffsetY;
        delete limpia.fondoImagenDraggable;

        return limpia;
      });

      setSecciones(nuevas);
    },
    [secciones, setSecciones]
  );

  return {
    reemplazarFondoSeccion,
    desanclarImagenDeFondo,
    cambiarColorFondoSeccion,
  };
}
