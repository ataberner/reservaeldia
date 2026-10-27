import { useEffect, useRef, useState } from "react";
import { ArrowRight, Heart, PenTool, X } from "lucide-react";
import assistanceContract from "../../../shared/profileDesignAssistance.cjs";
import styles from "./ProfileCompletionModal.module.css";

const { validateDesignAssistance, readDesignAssistance } = assistanceContract;
const EMPTY_PROFILE = Object.freeze({});

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
  title = "Completá tu perfil",
  subtitle = "Un último paso para empezar a crear tu invitación.",
  initialValues = EMPTY_PROFILE,
  mandatory = true,
  submitLabel = "Guardar y continuar",
  onSubmit,
  onClose,
}) {
  const initialName = initialValues?.nombre || "";
  const initialSurname = initialValues?.apellido || "";
  const initialFullName = initialValues?.nombreCompleto || "";
  const initialBirthDate = initialValues?.fechaNacimiento || "";
  const initialAssistance = readDesignAssistance(initialValues?.designAssistance);
  const [nombre, setNombre] = useState(initialName || splitDisplayName(initialFullName).nombre);
  const [apellido, setApellido] = useState(initialSurname || splitDisplayName(initialFullName).apellido);
  const [fechaNacimiento, setFechaNacimiento] = useState(initialBirthDate);
  const [assistanceRequested, setAssistanceRequested] = useState(initialAssistance.requested);
  const [whatsapp, setWhatsapp] = useState(initialAssistance.whatsapp || "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const names = splitDisplayName(initialFullName);
    setNombre(initialName || names.nombre);
    setApellido(initialSurname || names.apellido);
    setFechaNacimiento(initialBirthDate);
    setAssistanceRequested(initialAssistance.requested);
    setWhatsapp(initialAssistance.whatsapp || "");
    setFieldErrors({});
    setError("");
  }, [visible, initialName, initialSurname, initialFullName, initialBirthDate,
    initialAssistance.requested, initialAssistance.whatsapp]);

  useEffect(() => {
    if (!visible) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [visible]);

  if (!visible) return null;

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && !mandatory && !saving) onClose?.();
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll(
      'input:not(:disabled), button:not(:disabled), [tabindex="0"]'
    )];
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || typeof onSubmit !== "function") return;
    const assistance = validateDesignAssistance({ requested: assistanceRequested, whatsapp });
    const nextErrors = {
      nombre: validateNombre(nombre, "Nombre"),
      apellido: validateNombre(apellido, "Apellido"),
      fechaNacimiento: validateFechaNacimiento(fechaNacimiento),
      whatsapp: assistance.error,
    };
    setFieldErrors(nextErrors);
    setError("");
    const invalid = Object.keys(nextErrors).find((key) => nextErrors[key]);
    if (invalid) {
      dialogRef.current?.querySelector("#profile-" + invalid)?.focus();
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({
        nombre: nombre.trim().replace(/\s+/g, " "),
        apellido: apellido.trim().replace(/\s+/g, " "),
        fechaNacimiento: fechaNacimiento.trim(),
        designAssistance: assistance.value,
      });
    } catch (submitError) {
      setError(mapError(submitError, "No se pudo guardar el perfil."));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true"
        aria-labelledby="profile-title" aria-describedby="profile-subtitle"
        ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown}>
        {!mandatory && typeof onClose === "function" && (
          <button className={styles.close} onClick={onClose} disabled={saving}
            type="button" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
        )}
        <div className={styles.welcome}><Heart size={25} aria-hidden="true" /> Te damos la bienvenida</div>
        <h2 id="profile-title" className={styles.title}>{title}</h2>
        <p id="profile-subtitle" className={styles.subtitle}>{subtitle}</p>
        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <fieldset disabled={saving} className={styles.fields}>
            <div className={styles.nameRow}>
              <div className={styles.inputGroup}>
                <label htmlFor="profile-nombre">Nombre</label>
                <input id="profile-nombre" type="text" value={nombre}
                  onChange={(event) => setNombre(event.target.value)} autoComplete="given-name"
                  maxLength={60} required aria-invalid={Boolean(fieldErrors.nombre)}
                  aria-describedby={fieldErrors.nombre ? "profile-nombre-error" : undefined} />
                {fieldErrors.nombre && <p className={styles.fieldError} id="profile-nombre-error">{fieldErrors.nombre}</p>}
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="profile-apellido">Apellido</label>
                <input id="profile-apellido" type="text" value={apellido}
                  onChange={(event) => setApellido(event.target.value)} autoComplete="family-name"
                  maxLength={60} required aria-invalid={Boolean(fieldErrors.apellido)}
                  aria-describedby={fieldErrors.apellido ? "profile-apellido-error" : undefined} />
                {fieldErrors.apellido && <p className={styles.fieldError} id="profile-apellido-error">{fieldErrors.apellido}</p>}
              </div>
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="profile-fechaNacimiento">Fecha de nacimiento</label>
              <input id="profile-fechaNacimiento" type="date" value={fechaNacimiento}
                onChange={(event) => setFechaNacimiento(event.target.value)} autoComplete="bday"
                required aria-invalid={Boolean(fieldErrors.fechaNacimiento)}
                aria-describedby={fieldErrors.fechaNacimiento ? "profile-fechaNacimiento-error" : undefined} />
              {fieldErrors.fechaNacimiento && <p className={styles.fieldError} id="profile-fechaNacimiento-error">{fieldErrors.fechaNacimiento}</p>}
            </div>
            <section className={styles.assistance} aria-labelledby="profile-assistance-title">
              <div className={styles.assistanceHeading}>
                <PenTool size={24} aria-hidden="true" />
                <h3 id="profile-assistance-title">Tu invitación, con ayuda experta</h3>
                <span className={styles.optionalBadge}>Opcional</span>
              </div>
              <p className={styles.assistanceCopy}>Nuestro equipo de diseñadores puede ayudarte con el diseño y la personalización de tu invitación, sin costo adicional. Si preferís hacerlo por tu cuenta, tenés todas las herramientas disponibles en el editor.</p>
              <label className={styles.checkboxLabel} htmlFor="profile-assistance">
                <input id="profile-assistance" type="checkbox" checked={assistanceRequested}
                  onChange={(event) => {
                    setAssistanceRequested(event.target.checked);
                    setFieldErrors((previous) => ({ ...previous, whatsapp: "" }));
                  }}
                  aria-controls="profile-whatsapp-fields" aria-expanded={assistanceRequested} />
                <span>Quiero que me contacten para recibir asistencia</span>
              </label>
              {assistanceRequested && (
                <div id="profile-whatsapp-fields" className={styles.phoneFields}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="profile-whatsapp">Tu WhatsApp <span className={styles.optional}>(opcional)</span></label>
                    <input id="profile-whatsapp" type="tel" inputMode="tel" autoComplete="tel"
                      placeholder="Ej. +54 9 11 1234 5678" value={whatsapp} maxLength={40}
                      onChange={(event) => {
                        setWhatsapp(event.target.value);
                        setFieldErrors((previous) => ({ ...previous, whatsapp: "" }));
                      }}
                      aria-invalid={Boolean(fieldErrors.whatsapp)}
                      aria-describedby={fieldErrors.whatsapp ? "profile-whatsapp-hint profile-whatsapp-error" : "profile-whatsapp-hint"} />
                    {fieldErrors.whatsapp && <p id="profile-whatsapp-error" className={styles.fieldError}>{fieldErrors.whatsapp}</p>}
                  </div>
                  <p id="profile-whatsapp-hint" className={styles.phoneHint}>Por WhatsApp podemos conversar de forma más ágil y acompañarte mejor.</p>
                </div>
              )}
            </section>
          </fieldset>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submit} disabled={saving} aria-busy={saving}>
            {saving ? "Guardando..." : submitLabel}
            {!saving && <ArrowRight size={18} aria-hidden="true" />}
          </button>
          <p className={styles.footnote}>Pedir asistencia es opcional. Podés seguir por tu cuenta.</p>
        </form>
      </div>
    </div>
  );
}
