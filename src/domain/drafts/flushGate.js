import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorDraftFlushResultDetail,
  normalizeEditorDraftFlushRequestDetail,
  normalizeEditorDraftFlushResultDetail,
} from "../../lib/editorBridgeContracts.js";

export const DRAFT_FLUSH_REQUEST_EVENT = EDITOR_BRIDGE_EVENTS.DRAFT_FLUSH_REQUEST;
export const DRAFT_FLUSH_RESULT_EVENT = EDITOR_BRIDGE_EVENTS.DRAFT_FLUSH_RESULT;

function createRequestId() {
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `flush-${Date.now()}-${randomToken}`;
}

export const normalizeFlushRequestDetail = normalizeEditorDraftFlushRequestDetail;
export const normalizeFlushResultDetail = normalizeEditorDraftFlushResultDetail;
export const buildFlushResultDetail = buildEditorDraftFlushResultDetail;

export function createEditorDraftFlushRequester({
  eventTarget = typeof window !== "undefined" ? window : null,
  createEvent = (eventName, detail) => new CustomEvent(eventName, { detail }),
  createRequestIdFn = createRequestId,
  setTimer = (...args) => setTimeout(...args),
  clearTimer = (...args) => clearTimeout(...args),
} = {}) {
  return function requestEditorDraftFlush({ slug, reason, timeoutMs = 6000 } = {}) {
    const normalizedRequest = normalizeFlushRequestDetail({
      slug,
      reason,
    });
    const safeSlug = normalizedRequest.slug;
    const safeReason = normalizedRequest.reason;
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

    if (!eventTarget) {
      return Promise.resolve({
        ok: false,
        reason: "no-window",
        error: "No hay una sesion de editor activa para confirmar el guardado.",
      });
    }

    return new Promise((resolve) => {
      const requestId = createRequestIdFn();
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimer(timeoutId);
          timeoutId = null;
        }
        eventTarget.removeEventListener(DRAFT_FLUSH_RESULT_EVENT, handleResultEvent);
      };

      const finalize = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };

      const handleResultEvent = (event) => {
        const detail = normalizeFlushResultDetail(event?.detail);
        if (detail.requestId !== requestId) return;
        if (detail.slug !== safeSlug) return;

        finalize({
          ok: detail.ok,
          reason: detail.reason || undefined,
          error: detail.ok
            ? undefined
            : detail.error || "No se pudo guardar el borrador.",
        });
      };

      timeoutId = setTimer(() => {
        finalize({
          ok: false,
          reason: "timeout",
          error: "No se recibio confirmacion de guardado del editor a tiempo.",
        });
      }, timeout);

      eventTarget.addEventListener(DRAFT_FLUSH_RESULT_EVENT, handleResultEvent);
      eventTarget.dispatchEvent(
        createEvent(DRAFT_FLUSH_REQUEST_EVENT, {
          requestId,
          slug: safeSlug,
          reason: safeReason,
        })
      );
    });
  };
}

export function requestEditorDraftFlush(options = {}) {
  return createEditorDraftFlushRequester()(options);
}

export {
  DRAFT_FLUSH_REQUEST_EVENT as REQUEST_EVENT_NAME,
  DRAFT_FLUSH_RESULT_EVENT as RESULT_EVENT_NAME,
};
