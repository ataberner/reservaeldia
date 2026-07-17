const INDEXED_DB_MESSAGE_PATTERNS = [
  /connection to indexed database server lost/i,
  /internal error was encountered in the indexed database server/i,
  /indexeddb/i,
  /indexed database/i,
  /indexed db/i,
];

const STORAGE_CONTEXT_PATTERNS = [
  /indexeddb/i,
  /indexed database/i,
  /indexed db/i,
  /\bidb\b/i,
  /firestore.*persistence/i,
  /firebase.*persistence/i,
  /auth.*persistence/i,
];

const RECOVERABLE_INDEXED_DB_NAMES = new Set([
  "AbortError",
  "UnknownError",
  "InvalidStateError",
]);

function collectTokens(value, acc = [], depth = 0) {
  if (value == null || depth > 4) return acc;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    acc.push(String(value));
    return acc;
  }

  if (value instanceof Error) {
    if (value.name) acc.push(String(value.name));
    if (value.message) acc.push(String(value.message));
    if (value.stack) acc.push(String(value.stack));
    if (value.code) acc.push(String(value.code));
    if (value.cause) collectTokens(value.cause, acc, depth + 1);
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTokens(item, acc, depth + 1));
    return acc;
  }

  if (typeof value === "object") {
    [
      value.name,
      value.message,
      value.stack,
      value.code,
      value.details,
      value.reason,
      value.error,
      value.cause,
      value.operation,
      value.module,
      value.phase,
    ].forEach((item) => collectTokens(item, acc, depth + 1));
  }

  return acc;
}

function normalizeErrorName(errorLike) {
  const name =
    errorLike?.name ||
    errorLike?.reason?.name ||
    errorLike?.error?.name ||
    errorLike?.cause?.name ||
    "";
  return typeof name === "string" ? name.trim() : "";
}

function normalizeErrorMessage(errorLike) {
  if (typeof errorLike === "string") return errorLike;
  const message =
    errorLike?.message ||
    errorLike?.reason?.message ||
    errorLike?.error?.message ||
    errorLike?.cause?.message ||
    "";
  return typeof message === "string" ? message.trim() : "";
}

function matchesAny(patterns, value) {
  return patterns.some((pattern) => pattern.test(value));
}

export function normalizeBrowserStorageError(errorLike) {
  const tokens = collectTokens(errorLike);
  const haystack = tokens.join("\n");
  return {
    name: normalizeErrorName(errorLike) || "UnknownError",
    message: normalizeErrorMessage(errorLike),
    haystack,
  };
}

export function classifyBrowserStorageError(errorLike, context = {}) {
  const normalized = normalizeBrowserStorageError(errorLike);
  const contextTokens = collectTokens(context);
  const haystack = [normalized.haystack, ...contextTokens].join("\n");
  const exactIndexedDbMessage = matchesAny(
    INDEXED_DB_MESSAGE_PATTERNS.slice(0, 2),
    haystack
  );
  const hasIndexedDbEvidence = matchesAny(INDEXED_DB_MESSAGE_PATTERNS, haystack);
  const hasStorageContext = matchesAny(STORAGE_CONTEXT_PATTERNS, haystack);
  const hasRecoverableName = RECOVERABLE_INDEXED_DB_NAMES.has(normalized.name);
  const isIndexedDbConnectionFailure =
    exactIndexedDbMessage ||
    (hasRecoverableName && (hasIndexedDbEvidence || hasStorageContext));

  return {
    isBrowserStorageError: isIndexedDbConnectionFailure,
    isIndexedDbError: isIndexedDbConnectionFailure,
    recoverable: isIndexedDbConnectionFailure,
    connectionUnusable: isIndexedDbConnectionFailure,
    reason: isIndexedDbConnectionFailure ? "indexeddb-connection-unavailable" : "unrelated",
    evidence: {
      exactIndexedDbMessage,
      hasIndexedDbEvidence,
      hasStorageContext,
      errorName: normalized.name,
    },
    normalized,
  };
}

export function isRecoverableIndexedDbError(errorLike, context = {}) {
  return classifyBrowserStorageError(errorLike, context).isIndexedDbError;
}
