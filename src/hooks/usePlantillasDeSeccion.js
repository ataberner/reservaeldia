// src/hooks/usePlantillasDeSeccion.js
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebase";

export default function usePlantillasDeSeccion() {
  const [plantillas, setPlantillas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarPlantillas = useCallback(async () => {
    setCargando(true);
    try {
      const snapshot = await getDocs(collection(db, "plantillas_secciones"));
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlantillas(docs);
    } catch (error) {
      console.error("❌ Error al cargar plantillas de sección", error);
      setPlantillas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarPlantillas();
  }, [cargarPlantillas]);

  return { plantillas, cargando, refrescar: cargarPlantillas };
}
