// components/Editor.jsx
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function Editor({ id }) {
  const [invitacion, setInvitacion] = useState(null);

  useEffect(() => {
    const cargarInvitacion = async () => {
      const docRef = doc(db, 'invitaciones', id);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        setInvitacion({ id: snap.id, ...snap.data() });
      }
    };

    cargarInvitacion();
  }, [id]);

  const autosave = async (campo, valor) => {
    if (!invitacion) return;

    const nueva = {
      ...invitacion,
      contenido: {
        ...invitacion.contenido,
        [campo]: valor
      }
    };
    setInvitacion(nueva);

    await updateDoc(doc(db, 'invitaciones', id), {
      contenido: nueva.contenido,
      ultimaEdicion: serverTimestamp()
    });
  };

  if (!invitacion) return <p>Cargando editor...</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Editor de invitación</h2>
      <input
        type="text"
        value={invitacion.contenido.titulo || ''}
        onChange={(e) => autosave('titulo', e.target.value)}
        className="w-full p-2 border rounded text-xl"
        placeholder="Título de la invitación"
      />
      {/* Más campos editables después */}
    </div>
  );
}
