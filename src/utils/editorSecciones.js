// src/utils/editorSecciones.js

import { buildSectionMutationWritePayload } from "@/components/editor/sections/sectionMutationPersistence";
import { persistEditorSessionPatch } from "@/components/editor/persistence/editorSessionPersistence";
import { canMutateSection } from "@/domain/editor/protectedSections";

/**
 * Borrar una seccion y sus objetos asociados.
 * La confirmacion de UX se resuelve en la capa de UI.
 */
export const borrarSeccion = async ({
  seccionId,
  secciones,
  objetos,
  slug,
  editorSession = null,
  seccionActivaId,
  setSecciones,
  setObjetos,
  setSeccionActivaId,
  validarPuntosLinea,
  ALTURA_PANTALLA_EDITOR,
  enqueueDraftWrite,
}) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) return;
  if (!canMutateSection(seccion)) return;

  try {
    const objetosFiltrados = objetos.filter((obj) => obj.seccionId !== seccionId);
    const seccionesFiltradas = secciones.filter((s) => s.id !== seccionId);

    setObjetos(objetosFiltrados);
    setSecciones(seccionesFiltradas);

    if (seccionId === seccionActivaId) {
      setSeccionActivaId(null);
    }

    const persistTask = async () => {
      const { payload } = buildSectionMutationWritePayload({
        secciones: seccionesFiltradas,
        objetos: objetosFiltrados,
        reason: "section-delete",
        includeObjetos: true,
        validarPuntosLinea,
        ALTURA_PANTALLA_EDITOR,
      });
      await persistEditorSessionPatch({
        session: editorSession,
        slug,
        patch: payload,
        reason: "section-delete",
      });
    };

    if (typeof enqueueDraftWrite === "function") {
      await enqueueDraftWrite(persistTask);
    } else {
      await persistTask();
    }

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
  editorSession = null,
  setSecciones,
  setSeccionesAnimando,
  validarPuntosLinea,
  ALTURA_PANTALLA_EDITOR,
  enqueueDraftWrite,
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
  if (!canMutateSection(seccionActual) || !canMutateSection(seccionDestino)) {
    return;
  }

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
    const persistTask = async () => {
      const { payload } = buildSectionMutationWritePayload({
        secciones: nuevasSecciones,
        reason: "section-reorder",
        validarPuntosLinea,
        ALTURA_PANTALLA_EDITOR,
      });
      await persistEditorSessionPatch({
        session: editorSession,
        slug,
        patch: payload,
        reason: "section-reorder",
      });
    };

    if (typeof enqueueDraftWrite === "function") {
      await enqueueDraftWrite(persistTask);
    } else {
      await persistTask();
    }
  } catch (error) {
    console.error("Error guardando orden de secciones:", error);
  }
};
