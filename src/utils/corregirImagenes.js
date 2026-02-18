import { getDownloadURL, ref } from "firebase/storage";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { auth, db, storage } from "../firebase";

export const corregirURLsInvalidas = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const refCol = collection(db, "usuarios", uid, "imagenes");
  const snap = await getDocs(refCol);
  let cantidadCorregida = 0;

  for (const item of snap.docs) {
    const data = item.data();
    const urlInvalida =
      typeof data.url !== "string" || data.url.includes("[object Promise]");

    if (!urlInvalida) continue;

    const fileName = data.fileName;
    if (!fileName) continue;

    const storageRef = ref(storage, `usuarios/${uid}/imagenes/${fileName}`);
    const thumbRef = ref(storage, `usuarios/${uid}/thumbnails/${fileName}_thumb.webp`);
    const newUrl = await getDownloadURL(storageRef);
    const newThumb = await getDownloadURL(thumbRef);

    await updateDoc(doc(db, "usuarios", uid, "imagenes", item.id), {
      url: newUrl,
      thumbnailUrl: newThumb,
    });

    cantidadCorregida += 1;
  }

  if (cantidadCorregida > 0) {
    console.log(`[imagenes] Correccion finalizada. Total: ${cantidadCorregida}`);
  }
};
