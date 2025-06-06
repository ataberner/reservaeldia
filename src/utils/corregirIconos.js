// src/utils/corregirIconos.js
import { getDownloadURL, ref } from "firebase/storage";
import { getDocs, updateDoc, doc, collection } from "firebase/firestore";
import { db, storage } from "../firebase";

export const corregirIconosEnBorradores = async () => {
  const snapshot = await getDocs(collection(db, "borradores"));

  for (const d of snapshot.docs) {
    const data = d.data();
    if (!data?.objetos || !Array.isArray(data.objetos)) continue;

    let cambios = false;

    const nuevosObjetos = await Promise.all(
      data.objetos.map(async (obj) => {
        if (
          (obj.tipo === "icono" || obj.tipo === "imagen") &&
          obj.src &&
          !obj.src.startsWith("http")
        ) {
          try {
            const url = await getDownloadURL(ref(storage, obj.src));
            cambios = true;
            return { ...obj, src: url };
          } catch (err) {
            console.warn("❌ No se pudo obtener URL de", obj.src);
            return obj;
          }
        }
        return obj;
      })
    );

    if (cambios) {
      await updateDoc(doc(db, "borradores", d.id), {
        objetos: nuevosObjetos,
      });
      console.log("✅ Borrador corregido:", d.id);
    }
  }

  console.log("🎉 Corrección de íconos finalizada");
};
