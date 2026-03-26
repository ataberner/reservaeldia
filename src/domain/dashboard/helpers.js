function normalizeText(value) {
  return String(value || "").trim();
}

export function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

export function trimText(value, max = 1000) {
  if (value === null || typeof value === "undefined") return null;
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function getFirstQueryValue(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const firstString = value.find((item) => typeof item === "string");
  return typeof firstString === "string" ? firstString : null;
}

export function decodeURIComponentSafe(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function delay(ms) {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return new Promise((resolve) => {
    setTimeout(resolve, safeMs);
  });
}

export function sanitizeUidValue(rawUid) {
  const safeUid = normalizeText(rawUid);
  return /^[A-Za-z0-9:_-]{6,128}$/.test(safeUid) ? safeUid : "";
}

export function isTruthyQueryFlag(value) {
  const normalized = normalizeText(getFirstQueryValue(value)).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function splitDisplayName(displayName) {
  const clean =
    typeof displayName === "string"
      ? displayName.trim().replace(/\s+/g, " ")
      : "";

  if (!clean) return { nombre: "", apellido: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };

  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(" "),
  };
}

export { normalizeText };
