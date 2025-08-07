import { useState } from "react";
import {
  getDownloadURL,
  ref,
  deleteObject,
  uploadBytes,
} from "firebase/storage";
import {
  collection,
  deleteDoc,
  doc,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  limit,
  startAfter,
} from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import imageCompression from "browser-image-compression";
import pica from "pica";

const generarThumbnail = async (file, maxSize = 200) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

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
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = reject;
  });
};

const PAGE_SIZE = 12;

export default function useMisImagenes() {
  const [imagenes, setImagenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ultimaImagen, setUltimaImagen] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const uid = auth.currentUser?.uid;
  const [imagenesEnProceso, setImagenesEnProceso] = useState([]);

  const cargarImagenes = async (reset = false) => {
    if (!uid) return;
    if (!reset && !hayMas) return;

    setCargando(true);

    const refCol = collection(db, "usuarios", uid, "imagenes");
    let q = query(refCol, orderBy("fechaSubida", "desc"), limit(PAGE_SIZE));

    if (!reset && ultimaImagen) {
      q = query(refCol, orderBy("fechaSubida", "desc"), startAfter(ultimaImagen), limit(PAGE_SIZE));
    }

    const snap = await getDocs(q);
    const nuevos = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (reset) {
      setImagenes(nuevos);
    } else {
      setImagenes((prev) => [...prev, ...nuevos]);
    }

    if (snap.docs.length < PAGE_SIZE) {
      setHayMas(false);
    } else {
      setUltimaImagen(snap.docs[snap.docs.length - 1]);
    }

    setCargando(false);
  };

  const subirImagen = async (archivoOriginal) => {
  if (!uid || !archivoOriginal) return;

  // 1️⃣ Comprimir imagen
  const archivoComprimido = await imageCompression(archivoOriginal, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
  });

  const timestamp = Date.now();
  const fileName = `${timestamp}_${archivoComprimido.name}`;
  setImagenesEnProceso((prev) => [...prev, fileName]);

  // 2️⃣ Subir imagen principal a Storage
  const storageRef = ref(storage, `usuarios/${uid}/imagenes/${fileName}`);
  await uploadBytes(storageRef, archivoComprimido);

  // Obtener URL principal para usar en canvas o galería
  const url = await getDownloadURL(storageRef);

  // 3️⃣ Generar thumbnail y subirlo
  const { blob: thumbnailBlob, img } = await generarThumbnail(archivoComprimido);
  const thumbRef = ref(storage, `usuarios/${uid}/thumbnails/${fileName}_thumb.webp`);
  await uploadBytes(thumbRef, thumbnailBlob);
  const thumbUrl = await getDownloadURL(thumbRef);

  // 4️⃣ Guardar metadata en Firestore
  const metadata = {
    fileName,
    url,                     // URL de la imagen principal
    thumbnailUrl: thumbUrl,  // URL del thumbnail
    nombre: archivoComprimido.name,
    nombreCompleto: fileName,
    fechaSubida: serverTimestamp(),
    pesoKb: Math.round(archivoComprimido.size / 1024),
    ancho: img.width,
    alto: img.height,
  };

  const refCol = collection(db, "usuarios", uid, "imagenes");
  const docRef = await addDoc(refCol, metadata);
  const nuevoId = docRef.id;

  // 5️⃣ Actualizar estado en galería
  setImagenes((prev) => [{ id: nuevoId, ...metadata }, ...prev]);
  setImagenesEnProceso((prev) => prev.filter((f) => f !== fileName));

  // 6️⃣ Retornar URL principal para que useUploaderDeImagen la use
  return url;
};


  const borrarImagen = async (img) => {
    if (!uid || !img?.fileName) return;

    const refOriginal = ref(storage, `usuarios/${uid}/imagenes/${img.fileName}`);
    const refThumb = ref(storage, `usuarios/${uid}/thumbnails/${img.fileName}_thumb.webp`);

    try {
      await Promise.all([deleteObject(refOriginal), deleteObject(refThumb)]);
    } catch (err) {
      console.error("Error borrando archivos de Storage:", err);
    }

    const docRef = doc(db, "usuarios", uid, "imagenes", img.id);
    await deleteDoc(docRef);

    setImagenes((prev) => prev.filter((i) => i.id !== img.id));
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
