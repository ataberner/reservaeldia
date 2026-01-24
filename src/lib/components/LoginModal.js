import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/firebase';

function mapAuthError(code) {
  switch (code) {
    case 'auth/user-not-found':
      return 'El usuario no existe. Probá registrarte.';
    case 'auth/wrong-password':
      return 'La contraseña es incorrecta.';
    case 'auth/invalid-email':
      return 'El correo no es válido.';
    case 'auth/popup-closed-by-user':
      return 'Se cerró la ventana de Google.';
    default:
      return 'No se pudo iniciar sesión. Intentá de nuevo.';
  }
}

export default function LoginModal({ onClose, onGoToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const router = useRouter();

  const handleGoogleLogin = async () => {
    setError('');
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
      onClose?.();
      router.push('/dashboard');
    } catch (err) {
      setError(mapAuthError(err?.code));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose?.();
      router.push('/dashboard');
    } catch (err) {
      setError(mapAuthError(err?.code));
    }
  };

  const shouldSuggestRegister =
    error?.includes('registrarte') || error?.includes('no existe');

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>
          ×
        </button>

        <h2>Iniciar Sesión</h2>

        {/* Login con email / password */}
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

          {shouldSuggestRegister && (
            <button
              type="button"
              className="btn btn-outline-dark w-100 mt-2"
              onClick={() => {
                onClose?.();
                onGoToRegister?.();
              }}
            >
              Registrarme
            </button>
          )}

          <button type="submit" className="btn btn-primary w-100 mt-2">
            Ingresar
          </button>
        </form>

        {/* Login con Google */}
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

        {/* Switch manual */}
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-link"
            onClick={() => {
              onClose?.();
              onGoToRegister?.();
            }}
          >
            No tengo cuenta → Registrarme
          </button>
        </div>
      </div>
    </div>
  );
}
