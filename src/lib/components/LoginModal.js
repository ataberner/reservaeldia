import { useState } from 'react';
import { useRouter } from 'next/navigation'; // 👈 Importar router
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/firebase'; // 👈 esto usa la instancia que ya exportaste


export default function LoginModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

 
  const router = useRouter(); // 👈 Inicializar router

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      onClose();
      router.push('/dashboard'); // 👈 Redirigir al dashboard
    } catch (err) {
      setError('Error con Google: ' + err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose();
      router.push('/dashboard'); // 👈 Redirigir al dashboard
    } catch (err) {
      setError('Credenciales incorrectas o usuario no registrado');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>×</button>
        <h2>Iniciar Sesión</h2>
        <form onSubmit={handleLogin}>
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
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary">Ingresar</button>
        </form>

        <button
          type="button"
          className="btn btn-outline-dark position-relative w-100 mt-3"
          onClick={handleGoogleLogin}
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '20px',
              height: '20px',
            }}
          />
          Usar Google
        </button>
      </div>
    </div>
  );
}
