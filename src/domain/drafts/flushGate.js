const REQUEST_EVENT_NAME = "editor:draft-flush:request";
const RESULT_EVENT_NAME = "editor:draft-flush:result";

function normalizeText(value) {
  return String(value || "").trim();
}

function createRequestId() {
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `flush-${Date.now()}-${randomToken}`;
}

export function requestEditorDraftFlush({ slug, reason, timeoutMs = 6000 } = {}) {
  const safeSlug = normalizeText(slug);
  const safeReason = normalizeText(reason) || "manual-flush";
  const timeout = Number.isFinite(Number(timeoutMs))
    ? Math.max(1000, Math.round(Number(timeoutMs)))
    : 6000;

  if (!safeSlug) {
    return Promise.resolve({
      ok: false,
      reason: "missing-slug",
      error: "Falta slug para confirmar el guardado del borrador.",
    });
  }

  if (typeof window === "undefined") {
    return Promise.resolve({
      ok: false,
      reason: "no-window",
      error: "No hay una sesion de editor activa para confirmar el guardado.",
    });
  }

  return new Promise((resolve) => {
    const requestId = createRequestId();
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener(RESULT_EVENT_NAME, handleResultEvent);
    };

    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };

    const handleResultEvent = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      if (normalizeText(detail.requestId) !== requestId) return;
      if (normalizeText(detail.slug) !== safeSlug) return;

      const ok = detail.ok === true;
      finalize({
        ok,
        reason: normalizeText(detail.reason) || undefined,
        error: ok ? undefined : normalizeText(detail.error) || "No se pudo guardar el borrador.",
      });
    };

    timeoutId = setTimeout(() => {
      finalize({
        ok: false,
        reason: "timeout",
        error: "No se recibio confirmacion de guardado del editor a tiempo.",
      });
    }, timeout);

    window.addEventListener(RESULT_EVENT_NAME, handleResultEvent);

    window.dispatchEvent(
      new CustomEvent(REQUEST_EVENT_NAME, {
        detail: {
          requestId,
          slug: safeSlug,
          reason: safeReason,
        },
      })
    );
  });
}
