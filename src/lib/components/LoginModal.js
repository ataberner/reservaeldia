import { useState } from "react";
import { useRouter } from "next/router";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/firebase";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import { sendVerificationEmailLocalized } from "@/lib/auth/emailVerification";
import {
  clearGoogleRedirectPending,
  formatGoogleAuthDebugContext,
  getGoogleAuthDebugContext,
  setGoogleRedirectPending,
  shouldUseGoogleRedirect,
} from "@/lib/auth/googleRedirectFlow";
import { getMyProfileStatusWithRetry } from "@/lib/auth/profileStatus";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POPUP_TO_REDIRECT_ERROR_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);
const POPUP_TIMEOUT_CODE = "auth/popup-timeout";
const REDIRECT_TIMEOUT_CODE = "auth/redirect-timeout";
const POPUP_SIGNIN_TIMEOUT_MS = 8000;
const REDIRECT_START_TIMEOUT_MS = 5000;

function mapAuthError(code) {
  switch (code) {
    case "auth/user-not-found":
      return "El usuario no existe. Prueba registrarte.";
    case "auth/wrong-password":
      return "La contrasena es incorrecta.";
    case "auth/invalid-email":
      return "El correo no es valido.";
    case "auth/popup-closed-by-user":
      return "Se cerro la ventana de Google.";
    case "auth/popup-blocked":
      return "El navegador bloqueo la ventana de Google. Intenta nuevamente.";
    case "auth/operation-not-supported-in-this-environment":
      return "Tu navegador no permite popup para Google. Intenta nuevamente.";
    case "auth/web-storage-unsupported":
      return "Tu navegador no permite almacenamiento local para autenticacion.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos.";
    case "auth/network-request-failed":
      return "Error de red. Verifica tu conexion.";
    case "auth/account-exists-with-different-credential":
      return "Este correo ya esta asociado a otro metodo de acceso.";
    case POPUP_TIMEOUT_CODE:
      return "Google no respondio desde la ventana emergente.";
    case REDIRECT_TIMEOUT_CODE:
      return "No pudimos abrir Google en este navegador.";
    default:
      return "No se pudo iniciar sesion. Intenta de nuevo.";
  }
}

function mapCallableError(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function splitDisplayName(displayName) {
  const clean = typeof displayName === "string"
    ? displayName.trim().replace(/\s+/g, " ")
    : "";

  if (!clean) return { nombre: "", apellido: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };

  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(" "),
  };
}

function signInWithPopupWithTimeout(timeoutMs, provider) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({ code: POPUP_TIMEOUT_CODE });
    }, timeoutMs);

    signInWithPopup(auth, provider)
      .then((result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function signInWithRedirectWithTimeout(timeoutMs, provider) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({ code: REDIRECT_TIMEOUT_CODE });
    }, timeoutMs);

    signInWithRedirect(auth, provider)
      .then((result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

export default function LoginModal({ onClose, onGoToRegister, onAuthNotice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileInitialValues, setProfileInitialValues] = useState({
    nombre: "",
    apellido: "",
    fechaNacimiento: "",
  });
  const [profileSource, setProfileSource] = useState("profile-completion");

  const router = useRouter();

  const getMyProfileStatusCallable = httpsCallable(functions, "getMyProfileStatus");
  const upsertUserProfileCallable = httpsCallable(functions, "upsertUserProfile");

  const openProfileModal = (statusData, user, source) => {
    const fallbackNames = splitDisplayName(
      statusData?.profile?.nombreCompleto || user?.displayName || ""
    );

    setProfileInitialValues({
      nombre: statusData?.profile?.nombre || fallbackNames.nombre || "",
      apellido: statusData?.profile?.apellido || fallbackNames.apellido || "",
      fechaNacimiento: statusData?.profile?.fechaNacimiento || "",
      nombreCompleto:
        statusData?.profile?.nombreCompleto || user?.displayName || "",
    });
    setProfileSource(source);
    setShowProfileCompletion(true);
  };

  const continueAfterAuth = async (user, source) => {
    const statusData = await getMyProfileStatusWithRetry({
      callable: getMyProfileStatusCallable,
      user,
    });

    if (statusData.profileComplete === true) {
      onClose?.();
      router.push("/dashboard");
      return;
    }

    openProfileModal(statusData, user, source);
  };

  const validateLogin = () => {
    const nextErrors = {};
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      nextErrors.email = "Ingresa tu correo.";
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      nextErrors.email = "Correo invalido.";
    }

    if (!password) {
      nextErrors.password = "Ingresa tu contrasena.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleGoogleLogin = async () => {
    setError("");
    setInfo("");
    setNeedsVerification(false);
    setLoadingGoogle(true);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const debugContext = getGoogleAuthDebugContext();
    const debugLabel = formatGoogleAuthDebugContext(debugContext);
    const prefersRedirect = shouldUseGoogleRedirect();

    const canFallbackFromPopupTimeout =
      debugContext.mobile && !debugContext.inApp && !debugContext.standalone;

    const startRedirect = async (reason) => {
      setGoogleRedirectPending();
      try {
        await signInWithRedirectWithTimeout(REDIRECT_START_TIMEOUT_MS, provider);
      } catch (redirectStartError) {
        clearGoogleRedirectPending();
        throw redirectStartError;
      }
    };

    try {
      if (prefersRedirect) {
        await startRedirect("preferred");
        return;
      }

      const credentials = canFallbackFromPopupTimeout
        ? await signInWithPopupWithTimeout(POPUP_SIGNIN_TIMEOUT_MS, provider)
        : await signInWithPopup(auth, provider);
      await continueAfterAuth(credentials.user, "google-login");
    } catch (err) {
      const code = err?.code || "unknown";
      console.error("[GoogleAuth][Login] Error", {
        code,
        ...debugContext,
      });

      if (code === POPUP_TIMEOUT_CODE && canFallbackFromPopupTimeout) {
        try {
          await startRedirect(`popup-timeout:${POPUP_SIGNIN_TIMEOUT_MS}`);
          return;
        } catch (redirectError) {
          const redirectCode = redirectError?.code || "unknown";
          console.error("[GoogleAuth][Login] Redirect timeout fallback error", {
            code: redirectCode,
            ...debugContext,
          });
          setError(
            `${mapAuthError(redirectError?.code)} [debug: popup-timeout->${redirectCode}; ${debugLabel}]`
          );
          setInfo(
            "Si vuelve a pasar, intenta abrir en Chrome/Safari normal (no navegador interno)."
          );
          return;
        }
      }

      if (POPUP_TO_REDIRECT_ERROR_CODES.has(code)) {
        try {
          await startRedirect(`popup-fallback:${code}`);
          return;
        } catch (redirectError) {
          const redirectCode = redirectError?.code || "unknown";
          console.error("[GoogleAuth][Login] Redirect fallback error", {
            code: redirectCode,
            ...debugContext,
          });
          setError(
            `${mapAuthError(redirectError?.code)} [debug: ${redirectCode}; ${debugLabel}]`
          );
          return;
        }
      }
      setError(`${mapAuthError(err?.code)} [debug: ${code}; ${debugLabel}]`);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    setNeedsVerification(false);

    if (!validateLogin()) return;

    setLoadingEmail(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const credentials = await signInWithEmailAndPassword(auth, cleanEmail, password);

      if (!credentials.user.emailVerified) {
        try {
          await sendVerificationEmailLocalized(auth, credentials.user);
        } catch (verificationError) {
          console.error("No se pudo enviar verificacion inicial:", verificationError);
        }

        await signOut(auth);
        const verificationMessage =
          "Tu correo aun no esta verificado. Revisalo y vuelve a iniciar sesion.";
        setNeedsVerification(true);
        setInfo(verificationMessage);
        onAuthNotice?.(verificationMessage);
        return;
      }

      await continueAfterAuth(credentials.user, "profile-completion");
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setInfo("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setFieldErrors((prev) => ({ ...prev, email: "Ingresa tu correo." }));
      setError("Ingresa tu correo para recuperar la contrasena.");
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setFieldErrors((prev) => ({ ...prev, email: "Correo invalido." }));
      setError("El correo no tiene formato valido.");
      return;
    }

    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfo("Te enviamos un correo para recuperar la contrasena.");
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setSendingReset(false);
    }
  };

  const handleResendVerification = async () => {
    setError("");
    setInfo("");

    if (!validateLogin()) return;

    setSendingVerification(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const credentials = await signInWithEmailAndPassword(auth, cleanEmail, password);

      if (credentials.user.emailVerified) {
        await signOut(auth);
        const alreadyVerifiedMessage =
          "Tu correo ya esta verificado. Puedes ingresar nuevamente.";
        setNeedsVerification(false);
        setInfo(alreadyVerifiedMessage);
        onAuthNotice?.(alreadyVerifiedMessage);
        return;
      }

      await sendVerificationEmailLocalized(auth, credentials.user);
      await signOut(auth);

      const resendMessage = "Te reenviamos el correo de verificacion.";
      setNeedsVerification(true);
      setInfo(resendMessage);
      onAuthNotice?.(resendMessage);
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setSendingVerification(false);
    }
  };

  const handleProfileSubmit = async (payload) => {
    try {
      await upsertUserProfileCallable({
        ...payload,
        source: profileSource,
      });
      setShowProfileCompletion(false);
      onClose?.();
      router.push("/dashboard");
    } catch (submitError) {
      throw new Error(
        mapCallableError(submitError, "No se pudo completar tu perfil.")
      );
    }
  };

  const shouldSuggestRegister =
    error?.includes("registrarte") || error?.includes("no existe");

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-content auth-modal">
          <button className="close-btn" onClick={onClose} type="button">
            x
          </button>

          <h2>Iniciar sesion</h2>
          <p className="auth-modal-subtitle">
            Ingresa con tu correo o con Google.
          </p>

          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-input-group">
              <label htmlFor="login-email">Correo</label>
              <input
                id="login-email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: "" }));
                }}
                autoComplete="email"
                className={fieldErrors.email ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
            </div>

            <div className="auth-input-group">
              <label htmlFor="login-password">Contrasena</label>
              <div className="auth-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Tu contrasena"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  autoComplete="current-password"
                  className={fieldErrors.password ? "auth-input-error" : ""}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="field-error">{fieldErrors.password}</p>
              )}
            </div>

            <div className="auth-inline-actions">
              <button
                type="button"
                className="btn btn-link p-0 auth-link-btn"
                onClick={handleForgotPassword}
                disabled={sendingReset}
              >
                {sendingReset ? "Enviando..." : "Olvide mi contrasena"}
              </button>
            </div>

            {error && <p className="error">{error}</p>}
            {info && (
              <p className={`auth-status ${needsVerification ? "warning" : "success"}`}>
                {info}
              </p>
            )}

            {needsVerification && (
              <button
                type="button"
                className="btn btn-outline-dark w-100 mt-2 auth-secondary-btn"
                onClick={handleResendVerification}
                disabled={sendingVerification}
              >
                {sendingVerification ? "Reenviando..." : "Reenviar verificacion"}
              </button>
            )}

            {shouldSuggestRegister && (
              <button
                type="button"
                className="btn btn-outline-dark w-100 mt-2 auth-secondary-btn"
                onClick={() => {
                  onClose?.();
                  onGoToRegister?.();
                }}
              >
                Registrarme
              </button>
            )}

            <button
              type="submit"
              className="btn btn-primary w-100 mt-2 auth-primary-btn"
              disabled={loadingEmail}
            >
              {loadingEmail ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <div className="auth-separator">o</div>

          <button
            type="button"
            className="btn btn-outline-dark position-relative w-100 auth-google-btn"
            onClick={handleGoogleLogin}
            disabled={loadingGoogle}
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
            {loadingGoogle ? "Conectando..." : "Usar Google"}
          </button>

          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button
              type="button"
              className="btn btn-link auth-link-btn"
              onClick={() => {
                onClose?.();
                onGoToRegister?.();
              }}
            >
              No tengo cuenta - Registrarme
            </button>
          </div>
        </div>
      </div>

      <ProfileCompletionModal
        visible={showProfileCompletion}
        mandatory
        title="Completa tu perfil"
        subtitle="Antes de continuar necesitamos nombre, apellido y fecha de nacimiento."
        initialValues={profileInitialValues}
        submitLabel="Guardar y continuar"
        onSubmit={handleProfileSubmit}
      />
    </>
  );
}
