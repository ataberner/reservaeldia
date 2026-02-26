// src/utils/guardarThumbnail.js
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import Konva from "konva";

/**
 * Genera y guarda un thumbnail del Stage SIN hacer parpadear la UI del editor.
 * Estrategia:
 * - Clona el Stage en un contenedor offscreen (fuera de pantalla).
 * - Oculta los nodos `.ui` SOLO en el clon (Transformer, guías, handles, etc.).
 * - Exporta el thumbnail desde el clon.
 * - Destruye clon + contenedor.
 */
export const guardarThumbnailDesdeStage = async ({ stageRef, uid, slug }) => {
  const stage = stageRef?.current;

  if (!stage || !slug || !uid) {
    console.warn("⚠️ No se puede generar thumbnail: faltan datos");
    return;
  }

  // ✅ (Opcional pero recomendable) no generar en medio de drag/resize
  if (window._isDragging || window._grupoLider || window._resizeData?.isResizing) {
    return;
  }

  // ✅ Contenedor offscreen (NO afecta el canvas visible)
  const off = document.createElement("div");
  off.style.position = "fixed";
  off.style.left = "-10000px";
  off.style.top = "-10000px";
  off.style.width = `${stage.width()}px`;
  off.style.height = `${stage.height()}px`;
  off.style.opacity = "0";
  off.style.pointerEvents = "none";
  document.body.appendChild(off);

  // ✅ Stage clon (offscreen)
  const stageClone = new Konva.Stage({
    container: off,
    width: stage.width(),
    height: stage.height(),
    listening: false,
  });

  try {
    // ✅ Clonar layers completos (contenido + UI) al stageClone
    stage.getChildren().forEach((layer) => {
      // clone profundo del layer + children
      const layerClone = layer.clone({ listening: false });
      stageClone.add(layerClone);
    });

    // ✅ Ocultar SOLO en el clon los nodos marcados como UI
    const uiNodes = stageClone.find(".ui");
    uiNodes.forEach((n) => n.visible(false));

    // (Opcional) logs de debug si querés comprobar qué se oculta
    if (window.__DBG_TR) {
      console.log("[THUMB] uiNodes ocultos en CLON:", uiNodes.length);
    }

    // Dibujar el clon
    stageClone.draw();

    // ✅ Esperar 1 frame para asegurar render consistente del clon
    await new Promise((r) => requestAnimationFrame(r));

    // ✅ Exportar thumbnail desde el clon
    const dataUrl = stageClone.toDataURL({
      pixelRatio: 1,
      mimeType: "image/webp",
      quality: 0.9,
    });

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.warn("❌ Thumbnail inválido. Se aborta la subida.");
      return;
    }

    // ✅ Subir a Storage
    const storage = getStorage();
    const nombreArchivo = `thumbnails_borradores/${uid}/${slug}.webp`;
    const archivoRef = ref(storage, nombreArchivo);

    await uploadString(archivoRef, dataUrl.split(",")[1], "base64", {
      contentType: "image/webp",
    });

    // ✅ Guardar URL en Firestore
    const urlFinal = await getDownloadURL(archivoRef);

    const refDoc = doc(db, "borradores", slug);
    await updateDoc(refDoc, {
      thumbnailUrl: urlFinal,
      thumbnailUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("❌ Error al generar o subir thumbnail:", error);
  } finally {
    // ✅ Limpieza total
    try {
      stageClone.destroy();
    } catch {}
    try {
      off.remove();
    } catch {}
  }
};
