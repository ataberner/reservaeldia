// components/RegisterModal.js
import { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { app } from '../firebase';

export default function RegisterModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const auth = getAuth(app);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      setError('Error al registrar usuario: ' + err.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>×</button>
        <h2>Crear Cuenta</h2>
        <form onSubmit={handleRegister}>
          <input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirmar Contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary">Registrarme</button>
        </form>
      </div>
    </div>
  );
}
