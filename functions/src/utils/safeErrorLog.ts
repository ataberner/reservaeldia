/** SDK errors may carry authorization headers, signed URLs and request bodies.
 * Deliberately omit messages, stacks, codes and nested objects from logs.
 */
export function summarizeErrorForLog(error: unknown): {
  errorType: "error" | "unknown";
  status?: number;
} {
  const summary: { errorType: "error" | "unknown"; status?: number } = {
    errorType: error instanceof Error ? "error" : "unknown",
  };
  if (error && typeof error === "object") {
    // Read only own data properties: getters/toJSON/toString are untrusted too.
    for (const key of ["status", "statusCode", "code"]) {
      const descriptor = Object.getOwnPropertyDescriptor(error, key);
      const status: unknown = descriptor?.value;
      if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
        summary.status = status;
        break;
      }
    }
  }
  return summary;
}
