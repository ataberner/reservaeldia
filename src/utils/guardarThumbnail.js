/**
 * 🔹 guardarThumbnailDesdeStage
 * 
 * Esta función genera una miniatura (thumbnail) del canvas de edición usando el objeto <Stage /> de Konva.
 * La imagen se exporta como WebP (liviana y moderna), se sube a Firebase Storage en una carpeta pública,
 * y se guarda su URL en el documento correspondiente de Firestore.
 * 
 * Esto permite mostrar una vista previa en las tarjetas del dashboard.
 * 
 * Parámetros esperados:
 * - stageRef: referencia al objeto <Stage /> de Konva.
 * - uid: ID del usuario actual (no se usa más en el path).
 * - slug: identificador único del borrador (usado como nombre del archivo).
 * 
 * 📁 Ruta en Storage: /plantillas_thumbnails/<slug>.webp
 * 🔓 Asegurate de tener reglas públicas de lectura para esta carpeta.
 */

import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase"; // Ajustá si tu alias es distinto

export const guardarThumbnailDesdeStage = async ({ stageRef, uid, slug }) => {
  if (!stageRef?.current || !slug) {
    console.warn("⚠️ No se puede generar thumbnail: faltan datos");
    return;
  }

  try {
    // 🎨 Generar imagen WebP a partir del canvas (más liviana que JPEG)
    const dataUrl = stageRef.current.toDataURL({
      pixelRatio: 0.5,
      mimeType: "image/webp",
      quality: 0.9,
    });

    // Validar que sea una imagen
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.warn("❌ Thumbnail inválido. Se aborta la subida.");
      return;
    }

    // ☁️ Subir a carpeta pública
    const storage = getStorage();
    const nombreArchivo = `thumbnails_borradores/${uid}/${slug}.webp`;
    const archivoRef = ref(storage, nombreArchivo);
    await uploadString(archivoRef, dataUrl.split(",")[1], "base64", {
      contentType: "image/webp",
    });

    // 🔗 Obtener URL pública
    const urlFinal = await getDownloadURL(archivoRef);

    // 📝 Guardar en Firestore
    const refDoc = doc(db, "borradores", slug);
    await updateDoc(refDoc, { thumbnailUrl: urlFinal });

    console.log("✅ Thumbnail guardado en:", urlFinal);
  } catch (error) {
    console.error("❌ Error al generar o subir thumbnail:", error);
  }
};
