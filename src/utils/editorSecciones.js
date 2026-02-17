// src/utils/editorSecciones.js

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

/**
 * Borrar una seccion y sus objetos asociados.
 * La confirmacion de UX se resuelve en la capa de UI.
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

    console.log("Seccion borrada correctamente:", seccionId);
  } catch (error) {
    console.error("Error al borrar seccion:", error);
    alert("Ocurrio un error al borrar la seccion. Intentalo de nuevo.");
  }
};

/**
 * Mover una seccion hacia arriba o abajo en el orden.
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
    console.warn("Ya es la primera seccion");
    return;
  }

  if (direccion === "bajar" && indiceActual === seccionesOrdenadas.length - 1) {
    console.warn("Ya es la ultima seccion");
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

  // Fin de la animacion
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
    console.error("Error guardando orden de secciones:", error);
  }
};
