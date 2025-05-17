// components/Dashboard.js
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../firebase';

export default function Dashboard() {
  const [borradores, setBorradores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBorradores = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) return;

        const q = query(
          collection(db, 'borradores'),
          where('userId', '==', user.uid)
        );

        const querySnapshot = await getDocs(q);
        const resultados = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        setBorradores(resultados);
      } catch (err) {
        console.error('Error al cargar borradores:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBorradores();
  }, []);

  if (loading) return <p>Cargando borradores...</p>;

  return (
    <div>
      <h2>Tus Invitaciones</h2>
      {borradores.length === 0 ? (
        <p>No tenés invitaciones aún.</p>
      ) : (
        <ul>
          {borradores.map(b => (
            <li key={b.id}>
              <strong>{b.slug}</strong> – Estado: {b.estado}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
