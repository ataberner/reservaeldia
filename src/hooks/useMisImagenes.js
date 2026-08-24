import { useState } from "react";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
} from "firebase/firestore";
import imageCompression from "browser-image-compression";
import pica from "pica";
import { auth, db, storage } from "../firebase";
import {
  buildStorageAssetDescriptor,
  resolveStorageDownloadToken,
} from "@/domain/assets/storageAssetDescriptor";

const PAGE_SIZE = 12;

async function generarThumbnail(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const ratio = img.width / img.height;
      canvas.width = maxSize;
      canvas.height = maxSize / ratio;

      try {
        const picaInstance = pica();
        await picaInstance.resize(img, canvas);
        const blob = await picaInstance.toBlob(canvas, "image/webp", 0.8);
        resolve({ blob, img });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
  });
}

export default function useMisImagenes() {
  const [imagenes, setImagenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ultimaImagen, setUltimaImagen] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [imagenesEnProceso, setImagenesEnProceso] = useState([]);
  const uid = auth.currentUser?.uid;

  const cargarImagenes = async (reset = false) => {
    if (!uid) return;
    if (!reset && !hayMas) return;

    setCargando(true);
    try {
      const refCol = collection(db, "usuarios", uid, "imagenes");
      let imagesQuery = query(
        refCol,
        orderBy("fechaSubida", "desc"),
        limit(PAGE_SIZE)
      );

      if (!reset && ultimaImagen) {
        imagesQuery = query(
          refCol,
          orderBy("fechaSubida", "desc"),
          startAfter(ultimaImagen),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(imagesQuery);
      const nuevos = snapshot.docs.map((imageDoc) => ({
        id: imageDoc.id,
        ...imageDoc.data(),
      }));

      setImagenes((previous) => (reset ? nuevos : [...previous, ...nuevos]));
      if (snapshot.docs.length < PAGE_SIZE) {
        setHayMas(false);
      } else {
        setUltimaImagen(snapshot.docs[snapshot.docs.length - 1]);
      }
    } finally {
      setCargando(false);
    }
  };

  const subirImagen = async (archivoOriginal) => {
    if (!uid || !archivoOriginal) return undefined;

    const archivoComprimido = await imageCompression(archivoOriginal, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    });
    const fileName = `${Date.now()}_${archivoComprimido.name}`;
    setImagenesEnProceso((previous) => [...previous, fileName]);

    try {
      const { blob: thumbnailBlob, img } = await generarThumbnail(
        archivoComprimido
      );
      const sourceWidth = Number(img.naturalWidth || img.width || 0);
      const sourceHeight = Number(img.naturalHeight || img.height || 0);
      const imageRef = ref(storage, `usuarios/${uid}/imagenes/${fileName}`);
      const uploadResult = await uploadBytes(imageRef, archivoComprimido, {
        contentType: archivoComprimido.type || undefined,
        customMetadata: {
          sourceWidth: String(Math.max(1, Math.round(sourceWidth))),
          sourceHeight: String(Math.max(1, Math.round(sourceHeight))),
          uploadedFrom: "editor-media-library-v2",
        },
      });
      const url = await getDownloadURL(imageRef);

      const thumbRef = ref(
        storage,
        `usuarios/${uid}/thumbnails/${fileName}_thumb.webp`
      );
      await uploadBytes(thumbRef, thumbnailBlob);
      const thumbnailUrl = await getDownloadURL(thumbRef);

      const metadata = buildStorageAssetDescriptor({
        fileName,
        url,
        storagePath: imageRef.fullPath,
        storageGeneration: uploadResult?.metadata?.generation,
        storageDownloadToken: resolveStorageDownloadToken(url),
        thumbnailUrl,
        nombre: archivoComprimido.name,
        nombreCompleto: fileName,
        fechaSubida: serverTimestamp(),
        pesoKb: Math.round(archivoComprimido.size / 1024),
        width: sourceWidth,
        height: sourceHeight,
      });
      if (!metadata) {
        throw new Error("No se pudo construir la referencia de la imagen subida.");
      }

      const refCol = collection(db, "usuarios", uid, "imagenes");
      const imageDoc = await addDoc(refCol, metadata);
      const uploadedImage = { id: imageDoc.id, ...metadata };
      setImagenes((previous) => [uploadedImage, ...previous]);
      return uploadedImage;
    } finally {
      setImagenesEnProceso((previous) =>
        previous.filter((pendingFileName) => pendingFileName !== fileName)
      );
    }
  };

  const borrarImagen = async (image) => {
    if (!uid || !image?.fileName) return;

    const imageRef = ref(storage, `usuarios/${uid}/imagenes/${image.fileName}`);
    const thumbRef = ref(
      storage,
      `usuarios/${uid}/thumbnails/${image.fileName}_thumb.webp`
    );

    try {
      await Promise.all([deleteObject(imageRef), deleteObject(thumbRef)]);
    } catch (error) {
      console.error("Error borrando archivos de Storage:", error);
    }

    await deleteDoc(doc(db, "usuarios", uid, "imagenes", image.id));
    setImagenes((previous) =>
      previous.filter((currentImage) => currentImage.id !== image.id)
    );
  };

  return {
    imagenes,
    cargando,
    cargarImagenes,
    subirImagen,
    borrarImagen,
    hayMas,
    imagenesEnProceso,
  };
}
