import { classifyBrowserStorageError } from "./browserStorageErrors.js";

export const BROWSER_STORAGE_RECOVERY_EVENT = "browser-storage-recovery-change";

const INITIAL_STATE = Object.freeze({
  active: false,
  storageKind: null,
  reason: null,
  message: "",
  operation: null,
  module: null,
  phase: null,
  slug: null,
  firstOccurredAt: null,
  lastOccurredAt: null,
  repetitions: 0,
  classification: null,
});

let recoveryState = { ...INITIAL_STATE };

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, maxLen = 180) {
  const text = String(value || "").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function dispatchRecoveryState() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(BROWSER_STORAGE_RECOVERY_EVENT, {
        detail: getBrowserStorageRecoveryState(),
      })
    );
  } catch {
    // The recovery path must not create a second failure.
  }
}

export function getBrowserStorageRecoveryState() {
  return {
    ...recoveryState,
    classification:
      recoveryState.classification && typeof recoveryState.classification === "object"
        ? {
            ...recoveryState.classification,
            evidence: {
              ...(recoveryState.classification.evidence || {}),
            },
            normalized: {
              ...(recoveryState.classification.normalized || {}),
            },
          }
        : null,
  };
}

export function resetBrowserStorageRecoveryForTests() {
  recoveryState = { ...INITIAL_STATE };
}

export function markBrowserStorageFailure(errorLike, context = {}) {
  const classification = classifyBrowserStorageError(errorLike, context);
  if (!classification.isBrowserStorageError) {
    return {
      handled: false,
      classification,
      state: getBrowserStorageRecoveryState(),
    };
  }

  const occurredAt = nowIso();
  const previous = recoveryState.active ? recoveryState : null;
  const repetitions = previous ? Number(previous.repetitions || 1) + 1 : 1;

  recoveryState = {
    active: true,
    storageKind: "indexeddb",
    reason: classification.reason,
    message:
      normalizeText(classification.normalized?.message, 600) ||
      "Safari perdio temporalmente el acceso al almacenamiento local.",
    operation: normalizeText(context.operation),
    module: normalizeText(context.module),
    phase: normalizeText(context.phase),
    slug: normalizeText(context.slug || context.querySlug || context.activeSlug),
    firstOccurredAt: previous?.firstOccurredAt || occurredAt,
    lastOccurredAt: occurredAt,
    repetitions,
    classification,
  };

  dispatchRecoveryState();

  return {
    handled: true,
    classification,
    state: getBrowserStorageRecoveryState(),
  };
}

export function shouldStopBrowserStorageRetries(errorLike = null, context = {}) {
  if (recoveryState.active && recoveryState.reason === "indexeddb-connection-unavailable") {
    return true;
  }
  if (!errorLike) return false;
  return classifyBrowserStorageError(errorLike, context).connectionUnusable === true;
}

export function subscribeBrowserStorageRecovery(listener) {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const handleChange = (event) => {
    listener(event?.detail || getBrowserStorageRecoveryState());
  };

  window.addEventListener(BROWSER_STORAGE_RECOVERY_EVENT, handleChange);
  return () => {
    window.removeEventListener(BROWSER_STORAGE_RECOVERY_EVENT, handleChange);
  };
}
