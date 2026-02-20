const PUBLIC_SLUG_REGEX = /^[a-z0-9][a-z0-9-_]{1,58}[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "login",
  "register",
  "settings",
  "support",
  "help",
  "pricing",
  "publicadas",
  "borradores",
  "i",
]);

export const PUBLIC_SLUG_AVAILABILITY_REASONS = Object.freeze({
  OK: "ok",
  INVALID_FORMAT: "invalid-format",
  RESERVED_WORD: "reserved-word",
  ALREADY_PUBLISHED: "already-published",
  TEMPORARILY_RESERVED: "temporarily-reserved",
});

export function normalizePublicSlug(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  let candidate = raw;

  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const iIndex = segments.indexOf("i");
    candidate = iIndex >= 0 && segments[iIndex + 1]
      ? segments[iIndex + 1]
      : segments[segments.length - 1] || "";
  } catch (_error) {
    const withoutQuery = raw.split(/[?#]/)[0] || raw;
    const normalizedPath = withoutQuery.replace(/^\/+|\/+$/g, "");
    if (normalizedPath.includes("/")) {
      const segments = normalizedPath.split("/").filter(Boolean);
      const iIndex = segments.indexOf("i");
      candidate = iIndex >= 0 && segments[iIndex + 1]
        ? segments[iIndex + 1]
        : segments[segments.length - 1] || "";
    } else {
      candidate = normalizedPath;
    }
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch (_error) {
    // noop
  }

  return candidate
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function validatePublicSlug(rawValue) {
  const normalizedSlug = normalizePublicSlug(rawValue);

  if (!normalizedSlug || !PUBLIC_SLUG_REGEX.test(normalizedSlug)) {
    return {
      normalizedSlug,
      isValid: false,
      reason: PUBLIC_SLUG_AVAILABILITY_REASONS.INVALID_FORMAT,
    };
  }

  if (RESERVED_SLUGS.has(normalizedSlug)) {
    return {
      normalizedSlug,
      isValid: false,
      reason: PUBLIC_SLUG_AVAILABILITY_REASONS.RESERVED_WORD,
    };
  }

  return {
    normalizedSlug,
    isValid: true,
    reason: PUBLIC_SLUG_AVAILABILITY_REASONS.OK,
  };
}

export function parseSlugFromPublicUrl(value) {
  const normalized = normalizePublicSlug(value);
  return normalized || null;
}
