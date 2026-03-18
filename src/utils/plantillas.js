// src/utils/plantillas.js
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { getAuth } from "firebase/auth";
import { subirImagenPublica } from "@/utils/subirImagenPublica";
import {
  buildSectionDecorationsPayload,
  normalizeSectionBackgroundModel,
} from "@/domain/sections/backgrounds";

/**
 * 💾 Guarda una sección como plantilla en Firestore
 */
export const guardarSeccionComoPlantilla = async ({
  seccionId,
  secciones,
  objetos,
  refrescarPlantillasDeSeccion,
}) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) {
    alert("No se encontró la sección.");
    return;
  }

  const objetosDeEsaSeccion = objetos.filter((obj) => obj.seccionId === seccionId);

  const user = getAuth().currentUser;
  if (!user) {
    alert("⚠️ No estás logueado. No se puede guardar la plantilla.");
    return;
  }

  const objetosFinales = await Promise.all(
    objetosDeEsaSeccion.map(async (obj) => {
      if (obj.tipo === "imagen" && obj.src?.startsWith("user_uploads/")) {
        const nuevaUrl = await subirImagenPublica(obj.src);
        return { ...obj, src: nuevaUrl };
      }
      return obj;
    })
  );

  const nombre = prompt("Nombre de la plantilla:");
  if (!nombre) return;

  const backgroundModel = normalizeSectionBackgroundModel(seccion, {
    sectionHeight: seccion.altura,
  });

  const plantilla = {
    nombre,
    altura: seccion.altura,
    fondo: seccion.fondo,
    fondoTipo: seccion.fondoTipo || null,
    fondoImagen: seccion.fondoImagen || null,
    fondoImagenOffsetX: Number.isFinite(Number(seccion.fondoImagenOffsetX))
      ? Number(seccion.fondoImagenOffsetX)
      : 0,
    fondoImagenOffsetY: Number.isFinite(Number(seccion.fondoImagenOffsetY))
      ? Number(seccion.fondoImagenOffsetY)
      : 0,
    altoModo: seccion.altoModo || "fijo",
    alturaFijoBackup: Number.isFinite(Number(seccion.alturaFijoBackup))
      ? Number(seccion.alturaFijoBackup)
      : null,
    decoracionesFondo: buildSectionDecorationsPayload(
      {
        items: backgroundModel.decoraciones,
        parallax: backgroundModel.parallax,
      },
      {
        sectionHeight: seccion.altura,
      }
    ),
    tipo: seccion.tipo,
    objetos: objetosFinales,
  };

  const ref = collection(db, "plantillas_secciones");
  await addDoc(ref, plantilla);

  if (refrescarPlantillasDeSeccion) {
    await refrescarPlantillasDeSeccion();
  }

  alert("✅ Plantilla guardada correctamente");
};
