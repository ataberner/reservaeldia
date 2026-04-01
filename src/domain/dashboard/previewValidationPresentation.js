const FALLBACK_PUBLISH_BLOCKING_MESSAGE =
  "Hay contratos de render que todavia no son seguros para publicar.";
const PENDING_NOTICE_MESSAGE = "Revisando detalles antes de publicar...";
const FALLBACK_WARNING_NOTICE = "Hay algo para revisar antes de publicar.";
const FALLBACK_BLOCKING_NOTICE =
  "Hay algo pendiente que impide publicar por ahora.";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isGroupIssue(code) {
  return normalizeText(code).toLowerCase().startsWith("group-");
}

function mapValidationIssueText(code, severity) {
  switch (normalizeText(code).toLowerCase()) {
    case "rsvp-missing-root-config":
      return "Completa la configuracion de Confirmar asistencia para que este boton funcione al publicar.";
    case "rsvp-disabled-with-button":
      return "Activa Confirmar asistencia para poder publicar este boton.";
    case "gift-missing-root-config":
      return "Completa la configuracion de regalos para que este boton funcione al publicar.";
    case "gift-disabled-with-button":
      return "Activa regalos para poder publicar este boton.";
    case "gift-no-usable-methods":
      return "Agrega al menos una opcion de regalo visible y completa.";
    case "gift-modal-field-incomplete":
      return "Hay datos de regalos visibles que todavia faltan completar.";
    case "functional-cta-link-ignored":
      return "Este boton tiene un enlace extra que no se usara al publicar.";
    case "pantalla-ynorm-missing":
    case "pantalla-ynorm-drift":
      return "La posicion de un elemento puede cambiar un poco al publicar.";
    case "fullbleed-editor-drift":
      return "Esta parte puede verse un poco distinta en la invitacion publicada.";
    case "legacy-countdown-schema-v1-frozen":
    case "legacy-icono-svg-frozen":
    case "countdown-target-compat-alias":
      return "Este elemento usa una configuracion anterior. Sigue funcionando, pero conviene revisarla.";
    case "image-asset-unresolved":
    case "icon-asset-unresolved":
    case "gallery-media-unresolved":
    case "countdown-frame-unresolved":
    case "section-background-unresolved":
    case "section-decoration-unresolved":
      return "Todavia falta preparar una imagen o recurso antes de publicar.";
    case "image-crop-not-materialized":
      return "Hay un recorte de imagen que todavia no puede publicarse como se ve en el editor.";
    case "missing-section-reference":
    case "shape-figure-unsupported-for-publish":
      return "Hay un elemento pendiente que impide publicar esta invitacion.";
    default:
      if (isGroupIssue(code)) {
        return severity === "warning"
          ? FALLBACK_WARNING_NOTICE
          : "Hay un elemento pendiente que impide publicar esta invitacion.";
      }

      return severity === "warning"
        ? FALLBACK_WARNING_NOTICE
        : FALLBACK_BLOCKING_NOTICE;
  }
}

function mapPublishErrorText(publishError) {
  const safeError = normalizeText(publishError);
  const comparableError = normalizeComparableText(safeError);

  if (!safeError) return "";

  if (comparableError === normalizeComparableText("No se pudo sincronizar")) {
    return "No pudimos actualizar los ultimos cambios. Intenta nuevamente.";
  }

  if (
    comparableError ===
    normalizeComparableText(
      "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente."
    )
  ) {
    return "Cierra el texto que estas editando y vuelve a intentar.";
  }

  if (
    comparableError ===
    normalizeComparableText(
      "No se pudo validar la compatibilidad de publish. Intenta nuevamente."
    )
  ) {
    return "No pudimos revisar la invitacion antes de publicar. Intenta nuevamente.";
  }

  if (
    comparableError ===
    normalizeComparableText(
      "La publicacion anterior finalizo su vigencia. Puedes publicar nuevamente como nueva."
    )
  ) {
    return "La publicacion anterior ya termino. Puedes volver a publicarla como nueva.";
  }

  return safeError;
}

function mapPublishSuccessText(publishSuccess) {
  const safeSuccess = normalizeText(publishSuccess);
  const comparableSuccess = normalizeComparableText(safeSuccess);

  if (!safeSuccess) return "";

  if (
    comparableSuccess ===
    normalizeComparableText("Invitacion publicada correctamente.")
  ) {
    return "Invitacion publicada correctamente.";
  }

  if (
    comparableSuccess ===
    normalizeComparableText("Invitacion actualizada correctamente.")
  ) {
    return "Invitacion actualizada correctamente.";
  }

  return safeSuccess;
}

function shouldSuppressPublishError(publishError, validation) {
  const safeError = normalizeText(publishError);
  const blockers = Array.isArray(validation?.blockers) ? validation.blockers : [];

  if (!safeError || blockers.length === 0) return false;

  const comparableError = normalizeComparableText(safeError);
  const comparableBlockingSummary = normalizeComparableText(
    validation?.summary?.blockingMessage
  );

  if (comparableBlockingSummary && comparableError === comparableBlockingSummary) {
    return true;
  }

  if (
    comparableError === normalizeComparableText(FALLBACK_PUBLISH_BLOCKING_MESSAGE)
  ) {
    return true;
  }

  return comparableError.startsWith(
    normalizeComparableText("No se puede publicar todavia:")
  );
}

function dedupeNotices(notices) {
  const deduped = new Map();

  notices.forEach((notice) => {
    const text = normalizeText(notice?.text);
    const severity = normalizeText(notice?.severity);
    if (!text || !severity) return;

    const key = `${severity}|${text}`;
    const existing = deduped.get(key);

    if (existing) {
      existing.count += Number(notice?.count) || 1;
      return;
    }

    deduped.set(key, {
      id: key,
      severity,
      text,
      count: Number(notice?.count) || 1,
      source: normalizeText(notice?.source) || "unknown",
    });
  });

  return Array.from(deduped.values());
}

function sortNotices(notices) {
  const severityOrder = Object.freeze({
    pending: 0,
    error: 1,
    warning: 2,
    success: 3,
  });

  return [...notices].sort((left, right) => {
    const leftOrder = severityOrder[left?.severity] ?? 99;
    const rightOrder = severityOrder[right?.severity] ?? 99;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left?.text || "").localeCompare(String(right?.text || ""), "es");
  });
}

export function buildPreviewPublishNoticePresentation({
  validation,
  pending = false,
  publishError = "",
  publishSuccess = "",
} = {}) {
  const successText = mapPublishSuccessText(publishSuccess);

  if (successText) {
    return {
      notices: [
        {
          id: `success|${successText}`,
          severity: "success",
          text: successText,
          count: 1,
          source: "publish-success",
        },
      ],
    };
  }

  const notices = [];
  const blockers = Array.isArray(validation?.blockers) ? validation.blockers : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];

  if (pending) {
    notices.push({
      id: "pending",
      severity: "pending",
      text: PENDING_NOTICE_MESSAGE,
      count: 1,
      source: "publish-pending",
    });
  }

  blockers.forEach((issue) => {
    notices.push({
      severity: "error",
      text: mapValidationIssueText(issue?.code, "error"),
      count: 1,
      source: "validation-blocker",
    });
  });

  warnings.forEach((issue) => {
    notices.push({
      severity: "warning",
      text: mapValidationIssueText(issue?.code, "warning"),
      count: 1,
      source: "validation-warning",
    });
  });

  const errorText = mapPublishErrorText(publishError);
  if (errorText && !shouldSuppressPublishError(publishError, validation)) {
    notices.push({
      severity: "error",
      text: errorText,
      count: 1,
      source: "publish-error",
    });
  }

  return {
    notices: sortNotices(dedupeNotices(notices)),
  };
}
