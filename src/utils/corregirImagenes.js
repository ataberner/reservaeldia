import { getDownloadURL, ref } from "firebase/storage";
import { getDocs, collection, updateDoc, doc } from "firebase/firestore";
import { auth, db, storage } from "../firebase";

export const corregirURLsInvalidas = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const refCol = collection(db, "usuarios", uid, "imagenes");
  const snap = await getDocs(refCol);

  for (const d of snap.docs) {
    const data = d.data();

    if (typeof data.url !== "string" || data.url.includes("[object Promise]")) {
      console.log("🔧 Corrigiendo imagen:", data.nombre || d.id);

      const fileName = data.fileName;
      const storageRef = ref(storage, `usuarios/${uid}/imagenes/${fileName}`);
      const thumbRef = ref(storage, `usuarios/${uid}/thumbnails/${fileName}_thumb.webp`);

      const newUrl = await getDownloadURL(storageRef);
      const newThumb = await getDownloadURL(thumbRef);

      await updateDoc(doc(db, "usuarios", uid, "imagenes", d.id), {
        url: newUrl,
        thumbnailUrl: newThumb,
      });

      console.log("✅ Imagen corregida:", fileName);
    }
  }

  console.log("✅ Corrección de imágenes finalizada");
};
