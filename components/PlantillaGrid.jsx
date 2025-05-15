// components/PlantillaGrid.jsx
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'next/router';
import { db } from '../firebase';

export default function PlantillaGrid({ tipo, onInvitacionCreada, onSeleccionarPlantilla }) {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter(); // ✅ esto va arriba
  const auth = getAuth();     // ✅ también arriba

  // 🔁 traer las plantillas del tipo seleccionado
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

  // ✅ funcion crear invitacion desde plantilla
  const crearInvitacionDesdePlantilla = async (plantilla) => {
    const user = auth.currentUser;

    if (!user) {
      alert('Debés estar logueado para crear una invitación.');
      return;
    }

    try {
      const nuevaInvitacion = {
        userId: user.uid,
        plantillaId: plantilla.id,
        tipo: plantilla.tipo,
        nombre: `Invitación basada en ${plantilla.nombre}`,
        contenido: plantilla.contenido,
        ultimaEdicion: serverTimestamp()
      };

     const docRef = await addDoc(collection(db, 'invitaciones'), nuevaInvitacion);
if (typeof onInvitacionCreada === 'function') {
  onInvitacionCreada(docRef.id);
}

    } catch (error) {
      console.error('Error al crear la invitación:', error);
      alert('Ocurrió un error al crear la invitación.');
    }
  };

  // 👇 JSX (interfaz)
  if (loading) return <p>Cargando plantillas...</p>;
  if (plantillas.length === 0) return <p>No hay plantillas para este tipo aún.</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Elegí un diseño de {tipo}</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {plantillas.map((plantilla) => (
          <div
            key={plantilla.id}
            className="plantilla-card"
            
                    onClick={async () => {
                      const user = auth.currentUser;
                      if (!user) {
                        alert('Debés estar logueado para crear una invitación.');
                        return;
                      }

                      const timestamp = Date.now();
                      const slug = `${user.uid}__${plantilla.id}__${timestamp}`; // ← nuevo formato

                      try {
                        const res = await fetch('/api/copiar-plantilla', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ plantillaId: plantilla.id, slug })
                        });

                        if (res.ok) {
                          onSeleccionarPlantilla(slug); // carga el iframe con el slug nuevo
                        } else {
                          const error = await res.json();
                          alert('Error: ' + error.error);
                        }
                      } catch (err) {
                        console.error(err);
                        alert('Error al crear la invitación.');
                      }
                    }}
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
