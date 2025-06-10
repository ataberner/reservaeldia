// src/utils/imagenes.js
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

// Función para copiar una imagen ya subida del usuario al storage público
export async function subirImagenPublica(rutaOrigen) {
  const storage = getStorage();
  const extension = rutaOrigen.split(".").pop().split("?")[0];
  const nuevoNombre = `plantillas_secciones/img-${uuidv4()}.${extension}`;
  const origenRef = ref(storage, rutaOrigen);
  const destinoRef = ref(storage, nuevoNombre);

  // Descargar el archivo original como string base64
  const url = await getDownloadURL(origenRef);
  const response = await fetch(url);
  const blob = await response.blob();

  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      const base64Data = reader.result;
      await uploadString(destinoRef, base64Data.split(",")[1], "base64", {
        contentType: blob.type,
      });

      const nuevaUrl = await getDownloadURL(destinoRef);
      resolve(nuevaUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
