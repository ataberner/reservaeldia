import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * 🖼️ Sube una imagen al bucket público (sin token) y devuelve la URL
 */
export const subirImagenPublica = async (rutaInternaStorage) => {
  if (!rutaInternaStorage) throw new Error("No se recibió ruta de imagen");

  const storage = getStorage();
  const archivoRef = ref(storage, rutaInternaStorage);

  // 🔥 Descargar el archivo original
  const urlOriginal = await getDownloadURL(archivoRef);
  const response = await fetch(urlOriginal, { mode: "cors" });
  const blob = await response.blob();

  const extension = blob.type.split("/")[1] || "jpg";
  const nombreNuevo = `public/${Date.now()}.${extension}`;
  const refNuevo = ref(storage, nombreNuevo);

  await uploadBytes(refNuevo, blob, {
    customMetadata: { firebaseStorageDownloadTokens: null },
  });

  return await getDownloadURL(refNuevo);
};
