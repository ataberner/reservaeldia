// components/PlantillaGrid.jsx
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';

export default function PlantillaGrid({ tipo, onSeleccionarPlantilla }) {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();

  // 🔁 Traer las plantillas del tipo seleccionado
  useEffect(() => {
    const fetchPlantillas = async () => {
      try {
        const q = query(collection(db, 'plantillas'), where('tipo', '==', tipo));
        const querySnapshot = await getDocs(q);
        const resultado = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPlantillas(resultado);
      } catch (error) {
        console.error('Error al traer plantillas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlantillas();
  }, [tipo]);

  // ✅ Crear copia física + registro en Firestore
  const manejarSeleccion = async (plantilla) => {
    const user = auth.currentUser;
    if (!user) {
      alert('Debés estar logueado para crear una invitación.');
      return;
    }

    const timestamp = Date.now();
    const slug = `${user.uid}__${plantilla.id}__${timestamp}`;

    console.log('➡️ Enviando a Netlify:', { plantillaId: plantilla.id, slug });

    try {
      // 1. Copiar archivos físicos de la plantilla
      const res = await fetch('/.netlify/functions/copiar-plantilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantillaId: plantilla.id, slug })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error desconocido');
      }

      // 2. Guardar referencia en Firestore (colección: borradores)
      const ref = doc(db, 'borradores', slug);
      await setDoc(ref, {
        userId: user.uid,
        plantilla: plantilla.id,
        creadoEn: serverTimestamp(),
        estado: 'activo',
        datos: {
          nombres: '',
          fecha: '',
          hora: '',
          ubicacion: '',
          colores: {
            primario: '#dab485',
            secundario: '#a4bb8f',
          }
        }
      });

      // 3. Mostrar iframe de edición
      onSeleccionarPlantilla(slug);

    } catch (err) {
      console.error('Error en la copia:', err);
      alert(`Error: ${err.message}`);
    }
  };

  // 👇 Renderizado
  if (loading) return <p>Cargando plantillas...</p>;
  if (plantillas.length === 0) return <p>No hay plantillas disponibles.</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Elegí un diseño de {tipo}</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {plantillas.map((plantilla) => (
          <div
            key={plantilla.id}
            className="plantilla-card cursor-pointer hover:scale-105 transition"
            onClick={() => manejarSeleccion(plantilla)}
          >
            {plantilla.portada && (
              <img src={plantilla.portada} alt={plantilla.nombre} className="w-full h-48 object-cover" />
            )}
            <div className="p-4">
              <h3 className="font-medium text-lg">{plantilla.nombre}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
