import { isDeepStrictEqual } from "node:util";

function rejectOriginal(error, reason) {
  // Preserve the transport error identity/message. Diagnostics contain only a
  // fixed reason code; document fields, owner/session values and read failures
  // may contain data that must not be copied into logs.
  try {
    Object.defineProperty(error, "seedVerification", {
      value: { verified: false, reason }, configurable: true, enumerable: true,
    });
  } catch {
    // Frozen errors and non-object rejection values must still be preserved.
  }
  throw error;
}

// Test infrastructure only: recognize an ambiguously completed seed write.
// The caller supplies one bounded, read-only REST callback. This helper never
// retries a write or accepts partial/coerced fields or equivalent timestamps.
export async function verifySeedAfterTimeout({
  error, readDocument, expectedFields, owner, sessionCreatedAt,
}) {
  if (error?.name !== "TimeoutError" && error?.name !== "AbortError") throw error;
  if (typeof readDocument !== "function" ||
      typeof owner !== "string" || !owner ||
      typeof sessionCreatedAt !== "string" || !sessionCreatedAt ||
      !expectedFields || typeof expectedFields !== "object" || Array.isArray(expectedFields)) {
    rejectOriginal(error, "invalid-verification-context");
  }

  let document;
  try {
    document = await readDocument();
  } catch {
    rejectOriginal(error, "read-failed");
  }
  if (!document?.fields || typeof document.fields !== "object" || Array.isArray(document.fields)) {
    rejectOriginal(error, "missing-document-fields");
  }
  if (document.fields.dragPerfFixtureOwner?.stringValue !== owner) {
    rejectOriginal(error, "owner-mismatch");
  }
  if (document.fields.dragPerfSessionCreatedAt?.stringValue !== sessionCreatedAt) {
    rejectOriginal(error, "session-mismatch");
  }
  if (!isDeepStrictEqual(document.fields, expectedFields)) {
    rejectOriginal(error, "fields-mismatch");
  }
  return { verified: true, reason: "applied-after-timeout" };
}
