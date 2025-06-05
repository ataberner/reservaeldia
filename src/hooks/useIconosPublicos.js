// src/hooks/useIconosPublicos.js
import { useEffect, useState } from "react";
import { list, ref, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase"; // asegurate de tener la instancia de Firestore exportada desde ahí


export default function useIconosPublicos() {
  const [iconos, setIconos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [token, setToken] = useState(undefined); // paginación
  const [hayMas, setHayMas] = useState(true);
  const [populares, setPopulares] = useState([]);


useEffect(() => {
  cargarPopulares().then(setPopulares);
}, []);


  async function cargarPorCategoria(nombreCategoria) {
  const q = query(
    collection(db, "iconos"),
    where("categoria", "==", nombreCategoria),
   // orderBy("creado", "desc"), // opcional
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    src: doc.data().src || doc.data().url || "",
 }));
}


async function cargarPopulares() {
  const q = query(
    collection(db, "iconos"),
    where("popular", "==", true),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    src: doc.data().src || doc.data().url || "", // compatibilidad
  }));
}



  const cargarMas = async () => {
    if (cargando || !hayMas) return;
    setCargando(true);

    const folderRef = ref(storage, "iconos");
    const res = await list(folderRef, { maxResults: 30, pageToken: token });

    const nuevos = await Promise.all(
      res.items.map(async (item) => {
        const url = await getDownloadURL(item);
        return {
          id: item.name,
          src: url,
          tipo: item.name.endsWith(".gif") ? "gif" : "icono",
        };
      })
    );

    setIconos((prev) => [...prev, ...nuevos]);
    setToken(res.nextPageToken || null);
    setHayMas(!!res.nextPageToken);
    setCargando(false);
  };

  useEffect(() => {
    cargarMas(); // primera carga automática
  }, []);

  return {
  iconos,
  populares,
  cargarMas,
  cargando,
  hayMas,
  cargarPorCategoria, 
};

}
