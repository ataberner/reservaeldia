// src/utils/editorSecciones.js

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

/**
 * 🗑️ Borrar sección y sus objetos asociados
 */
export const borrarSeccion = async ({
  seccionId,
  secciones,
  objetos,
  slug,
  seccionActivaId,
  setSecciones,
  setObjetos,
  setSeccionActivaId,
}) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) return;

  const confirmar = confirm(
    `¿Estás seguro de que querés borrar la sección "${seccion.tipo || 'sin nombre'}"?
Se eliminarán todos los elementos que contiene.
Esta acción no se puede deshacer.`
  );

  if (!confirmar) return;

  try {
    const objetosFiltrados = objetos.filter((obj) => obj.seccionId !== seccionId);
    const seccionesFiltradas = secciones.filter((s) => s.id !== seccionId);

    setObjetos(objetosFiltrados);
    setSecciones(seccionesFiltradas);

    if (seccionId === seccionActivaId) {
      setSeccionActivaId(null);
    }

    const ref = doc(db, "borradores", slug);
    await updateDoc(ref, {
      objetos: objetosFiltrados,
      secciones: seccionesFiltradas,
      ultimaEdicion: serverTimestamp(),
    });

    console.log("✅ Sección borrada correctamente:", seccionId);
  } catch (error) {
    console.error("❌ Error al borrar sección:", error);
    alert("Ocurrió un error al borrar la sección. Inténtalo de nuevo.");
  }
};




/**
 * 🔁 Mover una sección hacia arriba o abajo en el orden
 */
export const moverSeccion = async ({
  seccionId,
  direccion, // 'subir' o 'bajar'
  secciones,
  slug,
  setSecciones,
  setSeccionesAnimando,
}) => {
  const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);
  const indiceActual = seccionesOrdenadas.findIndex((s) => s.id === seccionId);

  if (direccion === "subir" && indiceActual === 0) {
    console.warn("❌ Ya es la primera sección");
    return;
  }

  if (direccion === "bajar" && indiceActual === seccionesOrdenadas.length - 1) {
    console.warn("❌ Ya es la última sección");
    return;
  }

  const indiceDestino = direccion === "subir" ? indiceActual - 1 : indiceActual + 1;
  const seccionActual = seccionesOrdenadas[indiceActual];
  const seccionDestino = seccionesOrdenadas[indiceDestino];

  // Animar
  setSeccionesAnimando([seccionActual.id, seccionDestino.id]);

  // Intercambiar el campo `orden`
  const nuevasSecciones = secciones.map((s) => {
    if (s.id === seccionActual.id) return { ...s, orden: seccionDestino.orden };
    if (s.id === seccionDestino.id) return { ...s, orden: seccionActual.orden };
    return s;
  });

  setSecciones(nuevasSecciones);

  // Fin de la animación
  setTimeout(() => {
    setSeccionesAnimando([]);
  }, 500);

  // Guardar en Firestore
  try {
    const ref = doc(db, "borradores", slug);
    await updateDoc(ref, {
      secciones: nuevasSecciones,
      ultimaEdicion: serverTimestamp(),
    });
  } catch (error) {
    console.error("❌ Error guardando orden de secciones:", error);
  }
};
