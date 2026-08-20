function normalizeErrorCode(error) {
  return String(error?.code || "")
    .trim()
    .toLowerCase()
    .replace(/^functions\//, "");
}

export function isRetryableTemplatePersistError(error) {
  const code = normalizeErrorCode(error);
  return (
    code === "internal" ||
    code === "unavailable" ||
    code === "deadline-exceeded"
  );
}
