import { requestEditorDraftFlush } from "./flushGate.js";
import { normalizeEditorSession } from "./session.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function buildCriticalFlushFailureMessage(result, sessionKind) {
  const detail = normalizeText(result?.error || result?.reason);
  const sourceLabel = sessionKind === "template" ? "la plantilla" : "el borrador";

  if (detail) {
    return `No se pudo confirmar el guardado reciente de ${sourceLabel} (${detail}). Intenta nuevamente.`;
  }

  return `No se pudo confirmar el guardado reciente de ${sourceLabel}. Intenta nuevamente.`;
}

export async function flushEditorPersistenceBeforeCriticalAction({
  slug,
  reason,
  editorMode,
  editorSession,
  directFlush = null,
  requestFlush = requestEditorDraftFlush,
  captureSnapshot = null,
} = {}) {
  const session = normalizeEditorSession(editorSession, slug);
  const safeSlug = normalizeText(session.id || slug);

  if (!safeSlug || editorMode !== "konva") {
    return {
      ok: true,
      skipped: true,
      slug: safeSlug,
      sessionKind: session.kind,
      transport: "none",
      compatibilitySnapshot: null,
    };
  }

  const useDirectTransport =
    session.kind === "template" && typeof directFlush === "function";
  const transport = useDirectTransport ? "direct-bridge" : "window-event";
  let result;

  if (useDirectTransport) {
    try {
      result = await directFlush({ reason });
    } catch (flushError) {
      result = {
        ok: false,
        reason: "direct-flush-failed",
        error: getErrorMessage(
          flushError,
          "No se pudo ejecutar el guardado inmediato de la plantilla."
        ),
      };
    }
  } else {
    try {
      result = await requestFlush({
        slug: safeSlug,
        reason,
        timeoutMs: 6000,
      });
    } catch (flushError) {
      result = {
        ok: false,
        reason: "request-flush-failed",
        error: getErrorMessage(
          flushError,
          "No se pudo solicitar el guardado inmediato del borrador."
        ),
      };
    }
  }

  if (result?.ok === true) {
    const compatibilitySnapshot =
      typeof captureSnapshot === "function" ? captureSnapshot() : null;

    return {
      ok: true,
      slug: safeSlug,
      sessionKind: session.kind,
      transport,
      skipped: false,
      reason: normalizeText(result.reason) || undefined,
      compatibilitySnapshot:
        compatibilitySnapshot && typeof compatibilitySnapshot === "object"
          ? compatibilitySnapshot
          : null,
    };
  }

  return {
    ok: false,
    slug: safeSlug,
    sessionKind: session.kind,
    transport,
    skipped: false,
    reason: normalizeText(result?.reason) || undefined,
    error: buildCriticalFlushFailureMessage(result, session.kind),
    rawResult: result && typeof result === "object" ? result : null,
    compatibilitySnapshot: null,
  };
}
