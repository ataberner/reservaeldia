// components/RegisterModal.js
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/firebase";

function mapAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Ese correo ya está registrado. Probá iniciar sesión.";
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/weak-password":
      return "La contraseña es muy débil. Usá al menos 6 caracteres.";
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de Google.";
    default:
      return "No se pudo completar el registro. Intentá de nuevo.";
  }
}

export default function RegisterModal({ onClose, onGoToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const router = useRouter();

  const handleGoogleRegister = async () => {
    setError("");
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
      onClose?.();
      router.push("/dashboard");
    } catch (err) {
      setError(mapAuthError(err?.code) + (err?.code ? ` (${err.code})` : ""));
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      onClose?.();
      router.push("/dashboard");
    } catch (err) {
      // Mensaje claro + si es mail ya usado, ofrecemos pasar al login
      const msg = mapAuthError(err?.code);
      setError(msg + (err?.code ? ` (${err.code})` : ""));
    }
  };

  const wantsLogin =
    error?.includes("ya está registrado") || error?.includes("email-already-in-use");

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>×</button>

        <h2>Crear Cuenta</h2>

        {/* ✅ Registro con email/pass */}
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

          {wantsLogin && (
            <button
              type="button"
              className="btn btn-outline-dark w-100 mt-2"
              onClick={() => {
                onClose?.();
                onGoToLogin?.();
              }}
            >
              Ir a Iniciar Sesión
            </button>
          )}

          <button type="submit" className="btn btn-primary w-100 mt-2">
            Registrarme
          </button>
        </form>

        {/* ✅ Registro con Google */}
        <button
          type="button"
          className="btn btn-outline-dark position-relative w-100 mt-3"
          onClick={handleGoogleRegister}
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              width: "20px",
              height: "20px",
            }}
          />
          Usar Google
        </button>

        {/* Link suave para alternar aunque no haya error */}
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button
            type="button"
            className="btn btn-link"
            onClick={() => {
              onClose?.();
              onGoToLogin?.();
            }}
          >
            Ya tengo cuenta → Iniciar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
