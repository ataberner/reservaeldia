import { useEffect, useState } from "react";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

function mapError(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function validateNombre(value, label) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return `${label} es obligatorio.`;
  if (clean.length < 2 || clean.length > 60) {
    return `${label} debe tener entre 2 y 60 caracteres.`;
  }
  return "";
}

function validateFechaNacimiento(value) {
  const clean = value.trim();
  if (!clean) return "Fecha de nacimiento es obligatoria.";
  if (!DATE_REGEX.test(clean)) return "Usa formato YYYY-MM-DD.";

  const [year, month, day] = clean.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const validDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!validDate) return "Fecha de nacimiento invalida.";

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  if (date.getTime() > today.getTime()) {
    return "Fecha de nacimiento no puede ser futura.";
  }

  return "";
}

export default function ProfileCompletionModal({
  visible = true,
  title = "Completa tu perfil",
  subtitle = "Necesitamos tus datos para continuar.",
  initialValues = {},
  mandatory = true,
  submitLabel = "Guardar y continuar",
  onSubmit,
  onClose,
}) {
  const fallbackNames = splitDisplayName(initialValues?.nombreCompleto || "");
  const [nombre, setNombre] = useState(
    initialValues?.nombre || fallbackNames.nombre || ""
  );
  const [apellido, setApellido] = useState(
    initialValues?.apellido || fallbackNames.apellido || ""
  );
  const [fechaNacimiento, setFechaNacimiento] = useState(
    initialValues?.fechaNacimiento || ""
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const names = splitDisplayName(initialValues?.nombreCompleto || "");
    setNombre(initialValues?.nombre || names.nombre || "");
    setApellido(initialValues?.apellido || names.apellido || "");
    setFechaNacimiento(initialValues?.fechaNacimiento || "");
    setFieldErrors({});
    setError("");
    setSaving(false);
  }, [initialValues, visible]);

  if (!visible) return null;

  const runValidation = () => {
    const nextErrors = {};
    const nombreError = validateNombre(nombre, "Nombre");
    const apellidoError = validateNombre(apellido, "Apellido");
    const birthError = validateFechaNacimiento(fechaNacimiento);

    if (nombreError) nextErrors.nombre = nombreError;
    if (apellidoError) nextErrors.apellido = apellidoError;
    if (birthError) nextErrors.fechaNacimiento = birthError;

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!runValidation()) return;
    if (typeof onSubmit !== "function") return;

    setSaving(true);

    try {
      await onSubmit({
        nombre: nombre.trim().replace(/\s+/g, " "),
        apellido: apellido.trim().replace(/\s+/g, " "),
        fechaNacimiento: fechaNacimiento.trim(),
      });
    } catch (submitError) {
      setError(mapError(submitError, "No se pudo guardar el perfil."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content auth-modal profile-modal">
        {!mandatory && typeof onClose === "function" && (
          <button className="close-btn" onClick={onClose} type="button">
            x
          </button>
        )}

        <h2>{title}</h2>
        <p className="auth-modal-subtitle">{subtitle}</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="profile-form-grid">
            <div className="auth-input-group">
              <label htmlFor="profile-nombre">Nombre</label>
              <input
                id="profile-nombre"
                type="text"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                autoComplete="given-name"
                className={fieldErrors.nombre ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.nombre && (
                <p className="field-error">{fieldErrors.nombre}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="profile-apellido">Apellido</label>
              <input
                id="profile-apellido"
                type="text"
                value={apellido}
                onChange={(event) => setApellido(event.target.value)}
                autoComplete="family-name"
                className={fieldErrors.apellido ? "auth-input-error" : ""}
                required
              />
              {fieldErrors.apellido && (
                <p className="field-error">{fieldErrors.apellido}</p>
              )}
            </div>
          </div>

          <div className="auth-input-group">
            <label htmlFor="profile-fechaNacimiento">Fecha de nacimiento</label>
            <input
              id="profile-fechaNacimiento"
              type="date"
              value={fechaNacimiento}
              onChange={(event) => setFechaNacimiento(event.target.value)}
              className={fieldErrors.fechaNacimiento ? "auth-input-error" : ""}
              required
            />
            {fieldErrors.fechaNacimiento && (
              <p className="field-error">{fieldErrors.fechaNacimiento}</p>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary w-100 mt-2 auth-primary-btn"
            disabled={saving}
          >
            {saving ? "Guardando..." : submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
