import { useState } from "react";
import { useRouter } from "next/router";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
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
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
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
    case "auth/email-already-in-use":
      return "Ese correo ya esta registrado. Prueba iniciar sesion.";
    case "auth/invalid-email":
      return "El correo no es valido.";
    case "auth/weak-password":
      return "La contrasena es muy debil. Usa al menos 6 caracteres.";
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
      return "No se pudo completar el registro. Intenta de nuevo.";
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

function isValidDate(value) {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  const validDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!validDate) return false;

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  return date.getTime() <= today.getTime();
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

export default function RegisterModal({ onClose, onGoToLogin, onAuthNotice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileInitialValues, setProfileInitialValues] = useState({
    nombre: "",
    apellido: "",
    fechaNacimiento: "",
  });
  const [profileSource, setProfileSource] = useState("google-login");

  const router = useRouter();

  const upsertUserProfileCallable = httpsCallable(functions, "upsertUserProfile");
  const getMyProfileStatusCallable = httpsCallable(functions, "getMyProfileStatus");

  const validateForm = () => {
    const nextErrors = {};

    const cleanEmail = email.trim().toLowerCase();
    const cleanNombre = nombre.trim().replace(/\s+/g, " ");
    const cleanApellido = apellido.trim().replace(/\s+/g, " ");
    const cleanBirthDate = fechaNacimiento.trim();

    if (!cleanEmail) {
      nextErrors.email = "Ingresa tu correo.";
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      nextErrors.email = "Correo invalido.";
    }

    if (!cleanNombre) {
      nextErrors.nombre = "Nombre es obligatorio.";
    } else if (cleanNombre.length < 2 || cleanNombre.length > 60) {
      nextErrors.nombre = "Nombre debe tener entre 2 y 60 caracteres.";
    }

    if (!cleanApellido) {
      nextErrors.apellido = "Apellido es obligatorio.";
    } else if (cleanApellido.length < 2 || cleanApellido.length > 60) {
      nextErrors.apellido = "Apellido debe tener entre 2 y 60 caracteres.";
    }

    if (!cleanBirthDate) {
      nextErrors.fechaNacimiento = "Fecha de nacimiento es obligatoria.";
    } else if (!isValidDate(cleanBirthDate)) {
      nextErrors.fechaNacimiento = "Fecha de nacimiento invalida.";
    }

    if (!password) {
      nextErrors.password = "Ingresa una contrasena.";
    } else if (password.length < 6) {
      nextErrors.password = "La contrasena debe tener al menos 6 caracteres.";
    }

    if (!confirm) {
      nextErrors.confirm = "Confirma tu contrasena.";
    } else if (password !== confirm) {
      nextErrors.confirm = "Las contrasenas no coinciden.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const continueGoogleFlow = async (user) => {
    const statusData = await getMyProfileStatusWithRetry({
      callable: getMyProfileStatusCallable,
      user,
    });

    if (statusData.profileComplete === true) {
      onClose?.();
      router.push("/dashboard");
      return;
    }

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
    setProfileSource("google-login");
    setShowProfileCompletion(true);
  };

  const handleGoogleRegister = async () => {
    setError("");
    setInfo("");
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
      await continueGoogleFlow(credentials.user);
    } catch (err) {
      const code = err?.code || "unknown";
      console.error("[GoogleAuth][Register] Error", {
        code,
        ...debugContext,
      });

      if (code === POPUP_TIMEOUT_CODE && canFallbackFromPopupTimeout) {
        try {
          await startRedirect(`popup-timeout:${POPUP_SIGNIN_TIMEOUT_MS}`);
          return;
        } catch (redirectError) {
          const redirectCode = redirectError?.code || "unknown";
          console.error("[GoogleAuth][Register] Redirect timeout fallback error", {
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
          console.error("[GoogleAuth][Register] Redirect fallback error", {
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

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    setVerificationPending(false);

    if (!validateForm()) return;

    setLoadingEmail(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanNombre = nombre.trim().replace(/\s+/g, " ");
      const cleanApellido = apellido.trim().replace(/\s+/g, " ");
      const cleanBirthDate = fechaNacimiento.trim();

      const credentials = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      await upsertUserProfileCallable({
        nombre: cleanNombre,
        apellido: cleanApellido,
        fechaNacimiento: cleanBirthDate,
        source: "email-register",
      });

      await sendVerificationEmailLocalized(auth, credentials.user);
      await signOut(auth);

      const successMessage =
        "Cuenta creada. Te enviamos un correo de verificacion. Revisa tu bandeja (y spam) y verificalo antes de ingresar.";
      setVerificationPending(true);
      setInfo(successMessage);
      onAuthNotice?.(successMessage);
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleResendVerification = async () => {
    setError("");
    setInfo("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Para reenviar verificacion ingresa correo y contrasena.");
      return;
    }

    setSendingVerification(true);
    try {
      const credentials = await signInWithEmailAndPassword(auth, cleanEmail, password);

      if (credentials.user.emailVerified) {
        await signOut(auth);
        const alreadyVerifiedMessage =
          "Tu correo ya esta verificado. Ya puedes iniciar sesion.";
        setVerificationPending(false);
        setInfo(alreadyVerifiedMessage);
        onAuthNotice?.(alreadyVerifiedMessage);
        return;
      }

      await sendVerificationEmailLocalized(auth, credentials.user);
      await signOut(auth);

      const resendMessage = "Te reenviamos el correo de verificacion.";
      setVerificationPending(true);
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

  const wantsLogin =
    error?.includes("ya esta registrado") ||
    error?.includes("email-already-in-use");
  const isGoogleAuthDebugError =
    typeof error === "string" && error.includes("[debug:");

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-content auth-modal register-modal">
          <button className="close-btn" onClick={onClose} type="button">
            x
          </button>

          <h2>Crear cuenta</h2>
          <p className="auth-modal-subtitle">
            Completa tus datos para registrarte.
          </p>

          <form onSubmit={handleRegister} className="auth-form">
            <div className="register-form-grid">
            <div className="auth-input-group">
              <label htmlFor="register-nombre">Nombre</label>
              <input
                id="register-nombre"
                type="text"
                value={nombre}
                onChange={(event) => {
                  setNombre(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, nombre: "" }));
                }}
                autoComplete="given-name"
                className={fieldErrors.nombre ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.nombre && (
                <p className="field-error">{fieldErrors.nombre}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="register-apellido">Apellido</label>
              <input
                id="register-apellido"
                type="text"
                value={apellido}
                onChange={(event) => {
                  setApellido(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, apellido: "" }));
                }}
                autoComplete="family-name"
                className={fieldErrors.apellido ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.apellido && (
                <p className="field-error">{fieldErrors.apellido}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="register-birthdate">Fecha de nacimiento</label>
              <input
                id="register-birthdate"
                type="date"
                value={fechaNacimiento}
                onChange={(event) => {
                  setFechaNacimiento(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, fechaNacimiento: "" }));
                }}
                className={fieldErrors.fechaNacimiento ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.fechaNacimiento && (
                <p className="field-error">{fieldErrors.fechaNacimiento}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="register-email">Correo</label>
              <input
                id="register-email"
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
              <label htmlFor="register-password">Contrasena</label>
              <div className="auth-password-wrap">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  autoComplete="new-password"
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

            <div className="auth-input-group">
              <label htmlFor="register-confirm">Confirmar contrasena</label>
              <div className="auth-password-wrap">
                <input
                  id="register-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirm: "" }));
                  }}
                  autoComplete="new-password"
                  className={fieldErrors.confirm ? "auth-input-error" : ""}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowConfirm((prev) => !prev)}
                >
                  {showConfirm ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {fieldErrors.confirm && (
                <p className="field-error">{fieldErrors.confirm}</p>
              )}
            </div>
            </div>

            {error && (
              <p className={`error ${isGoogleAuthDebugError ? "google-auth-failure" : ""}`}>
                {isGoogleAuthDebugError && (
                  <img
                    src="/assets/img/google-auth-fail-logo.svg"
                    alt="Diagnostico Google"
                    className="google-auth-failure-logo"
                  />
                )}
                <span>{error}</span>
              </p>
            )}
            {info && (
              <p className={`auth-status ${verificationPending ? "warning" : "success"}`}>
                {info}
              </p>
            )}

            {verificationPending && (
              <button
                type="button"
                className="btn btn-outline-dark w-100 mt-2 auth-secondary-btn"
                onClick={handleResendVerification}
                disabled={sendingVerification}
              >
                {sendingVerification ? "Reenviando..." : "Reenviar verificacion"}
              </button>
            )}

            {wantsLogin && (
              <button
                type="button"
                className="btn btn-outline-dark w-100 mt-2 auth-secondary-btn"
                onClick={() => {
                  onClose?.();
                  onGoToLogin?.();
                }}
              >
                Ir a iniciar sesion
              </button>
            )}

            <button
              type="submit"
              className="btn btn-primary w-100 mt-2 auth-primary-btn"
              disabled={loadingEmail}
            >
              {loadingEmail ? "Registrando..." : "Registrarme"}
            </button>
          </form>

          <div className="auth-separator">o</div>

          <button
            type="button"
            className="btn btn-outline-dark position-relative w-100 auth-google-btn"
            onClick={handleGoogleRegister}
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
                onGoToLogin?.();
              }}
            >
              Ya tengo cuenta - Iniciar sesion
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
