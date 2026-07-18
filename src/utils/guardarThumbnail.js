// src/utils/guardarThumbnail.js
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import { readEditorRenderSnapshot } from "@/lib/editorSnapshotAdapter";
import { exportDashboardImageFromStage } from "@/utils/dashboardCanvasExport";

function resolveCountdownAuditStageSnapshot() {
  const renderSnapshot = readEditorRenderSnapshot();
  const objetos = Array.isArray(renderSnapshot?.objetos) ? renderSnapshot.objetos : [];
  const countdown = objetos.find((item) => item?.tipo === "countdown") || null;
  const secciones = Array.isArray(renderSnapshot?.secciones) ? renderSnapshot.secciones : [];
  const altoModo = countdown
    ? String(secciones.find((section) => section?.id === countdown?.seccionId)?.altoModo || "")
        .trim()
        .toLowerCase()
    : "";

  return {
    countdown,
    altoModo,
  };
}

/**
 * Genera y guarda un thumbnail de borrador para el dashboard.
 * La exportacion limpia del Stage pertenece a dashboardCanvasExport.
 */
export const guardarThumbnailDesdeStage = async ({ stageRef, uid, slug }) => {
  const stage = stageRef?.current;

  if (!stage || !slug || !uid) {
    console.warn("No se puede generar thumbnail: faltan datos");
    return;
  }

  // Evita capturar estados visuales transitorios de drag/resize.
  if (window._isDragging || window._grupoLider || window._resizeData?.isResizing) {
    return;
  }

  try {
    const dataUrl = await exportDashboardImageFromStage(stage, {
      pixelRatio: 1,
      mimeType: "image/webp",
      quality: 0.9,
    });

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.warn("Thumbnail invalido. Se aborta la subida.");
      return;
    }

    const storage = getStorage();
    const nombreArchivo = `thumbnails_borradores/${uid}/${slug}.webp`;
    const archivoRef = ref(storage, nombreArchivo);

    await uploadString(archivoRef, dataUrl.split(",")[1], "base64", {
      contentType: "image/webp",
    });

    const urlFinal = await getDownloadURL(archivoRef);

    const refDoc = doc(db, "borradores", slug);
    await updateDoc(refDoc, {
      thumbnailUrl: urlFinal,
      thumbnailUpdatedAt: serverTimestamp(),
    });

    const { countdown, altoModo } = resolveCountdownAuditStageSnapshot();
    if (countdown) {
      recordCountdownAuditSnapshot({
        countdown,
        stage: "draft-thumbnail-card",
        renderer: "raster-thumbnail",
        sourceDocument: "draft-thumbnail",
        viewport: "dashboard",
        wrapperScale: 1,
        usesRasterThumbnail: true,
        altoModo,
        sourceLabel: slug,
      });
    }
  } catch (error) {
    console.error("Error al generar o subir thumbnail:", error);
  }
};
