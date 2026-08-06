const CHUNK_LOAD_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [^\s]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

const CHUNK_RECOVERY_STORAGE_PREFIX = "reservaeldia:chunk-recovery";

export const CHUNK_LOAD_RECOVERY_ACTION = "refresh-app";
export const CHUNK_LOAD_RECOVERY_MESSAGE =
  "Esta pestaña quedó abierta durante una actualización. Actualiza la aplicación para cargar la versión compatible.";

function readChunkLoadErrorText(error) {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";

  return [
    error.name,
    error.message,
    error.request,
    error.stack,
    error.cause?.name,
    error.cause?.message,
  ]
    .filter(Boolean)
    .join("\n");
}

export function isChunkLoadError(error) {
  const errorText = readChunkLoadErrorText(error);
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

function readActiveBuildId(browserWindow) {
  return String(browserWindow?.__NEXT_DATA__?.buildId || "unknown").trim() || "unknown";
}

export function requestChunkLoadRecoveryReload({
  browserWindow = typeof window !== "undefined" ? window : null,
} = {}) {
  if (!browserWindow?.location || typeof browserWindow.location.reload !== "function") {
    return {
      reloaded: false,
      reason: "browser-unavailable",
      buildId: "",
    };
  }

  const buildId = readActiveBuildId(browserWindow);
  const storageKey = `${CHUNK_RECOVERY_STORAGE_PREFIX}:${buildId}`;

  try {
    if (browserWindow.sessionStorage?.getItem(storageKey) === "1") {
      return {
        reloaded: false,
        reason: "already-attempted",
        buildId,
      };
    }
    browserWindow.sessionStorage?.setItem(storageKey, "1");
  } catch {
    // A blocked sessionStorage must not prevent the explicit recovery action.
  }

  browserWindow.location.reload();
  return {
    reloaded: true,
    reason: "reload-requested",
    buildId,
  };
}
