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

export type PublicSlugAvailabilityReason =
  | "ok"
  | "invalid-format"
  | "reserved-word"
  | "already-published"
  | "temporarily-reserved";

export type PublicSlugValidationResult = {
  normalizedSlug: string;
  isValid: boolean;
  reason: Extract<PublicSlugAvailabilityReason, "ok" | "invalid-format" | "reserved-word">;
};

export function normalizePublicSlug(rawValue: unknown): string {
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
  } catch {
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
  } catch {
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

export function validatePublicSlug(rawValue: unknown): PublicSlugValidationResult {
  const normalizedSlug = normalizePublicSlug(rawValue);

  if (!normalizedSlug || !PUBLIC_SLUG_REGEX.test(normalizedSlug)) {
    return {
      normalizedSlug,
      isValid: false,
      reason: "invalid-format",
    };
  }

  if (RESERVED_SLUGS.has(normalizedSlug)) {
    return {
      normalizedSlug,
      isValid: false,
      reason: "reserved-word",
    };
  }

  return {
    normalizedSlug,
    isValid: true,
    reason: "ok",
  };
}

export function isPublicSlugReservedWord(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
