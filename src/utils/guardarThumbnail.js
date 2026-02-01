import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";

export const guardarThumbnailDesdeStage = async ({ stageRef, uid, slug }) => {
  const stage = stageRef?.current;

  if (!stage || !slug || !uid) {
    console.warn("⚠️ No se puede generar thumbnail: faltan datos");
    return;
  }

  // ✅ Buscar nodos marcados como UI
  const uiNodes = stage.find(".ui");
  const prev = uiNodes.map((n) => ({ node: n, visible: n.visible() }));

  // 🔍 DEBUG TEMPORAL (borralo cuando termines)
  // Te dice qué cosas se están exportando SIN estar marcadas como "ui"
  try {
    const transformers = stage.find("Transformer");
    console.log(
      "Transformers SIN ui:",
      transformers
        .filter((t) => !(t.name?.() || "").includes("ui"))
        .map((t) => ({ name: t.name?.(), visible: t.visible?.() }))
    );

    const rects = stage.find("Rect");
    const dashed = rects.filter((r) => Array.isArray(r.dash?.()) && r.dash().length);
    console.log(
      "Rects con dash SIN ui:",
      dashed
        .filter((r) => !((r.name?.() || "").includes("ui")))
        .map((r) => ({
          name: r.name?.(),
          stroke: r.stroke?.(),
          dash: r.dash?.(),
          visible: r.visible?.(),
        }))
    );

    const lines = stage.find("Line");
    console.log(
      "Lines SIN ui:",
      lines
        .filter((l) => !((l.name?.() || "").includes("ui")))
        .map((l) => ({
          name: l.name?.(),
          dash: l.dash?.(),
          stroke: l.stroke?.(),
          visible: l.visible?.(),
        }))
    );

    console.log("uiNodes encontrados:", uiNodes.length);
  } catch (e) {
    // Si algo falla en logs, no frenamos el guardado
    console.warn("⚠️ Debug de Konva falló (no bloqueante):", e);
  }

  try {
    // ✅ 1) Ocultar UI
    uiNodes.forEach((n) => n.visible(false));
    stage.draw();

    // ✅ 2) Esperar 1 frame para asegurar render consistente
    await new Promise((r) => requestAnimationFrame(r));

    // ✅ 3) Exportar thumbnail
    const dataUrl = stage.toDataURL({
      pixelRatio: 1,
      mimeType: "image/webp",
      quality: 0.9,
    });

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.warn("❌ Thumbnail inválido. Se aborta la subida.");
      return;
    }

    // ✅ 4) Subir a Storage
    const storage = getStorage();
    const nombreArchivo = `thumbnails_borradores/${uid}/${slug}.webp`;
    const archivoRef = ref(storage, nombreArchivo);

    await uploadString(archivoRef, dataUrl.split(",")[1], "base64", {
      contentType: "image/webp",
    });

    // ✅ 5) Obtener URL y guardar en Firestore
    const urlFinal = await getDownloadURL(archivoRef);

    const refDoc = doc(db, "borradores", slug);
    await updateDoc(refDoc, { thumbnailUrl: urlFinal });
  } catch (error) {
    console.error("❌ Error al generar o subir thumbnail:", error);
  } finally {
    // ✅ Restaurar UI sí o sí
    prev.forEach(({ node, visible }) => node.visible(visible));
    stage.draw();
  }
};
