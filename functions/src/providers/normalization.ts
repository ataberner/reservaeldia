import { createHash } from "crypto";
import {
  isProviderNavigationSlug,
  PROVIDER_ID_HASH_HEX_LENGTH,
  PROVIDER_ID_PREFIX,
} from "./config";
import {
  EmailNormalizationResult,
  NormalizedProviderUrl,
  PhoneNormalizationResult,
  PortalProviderRecord,
  ProviderUrlClassification,
} from "./types";

const EMAIL_PLACEHOLDERS = new Set(["tu@email.com"]);
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
]);

type ArgentinaLevel1 = {
  codigo: string;
  nombre: string;
  tipo: "provincia" | "ciudad_autonoma";
};

const ARGENTINA_LEVEL1_BY_NORMALIZED_NAME: Readonly<
  Record<string, ArgentinaLevel1>
> = Object.freeze({
  salta: { codigo: "AR-A", nombre: "Salta", tipo: "provincia" },
  "buenos aires": {
    codigo: "AR-B",
    nombre: "Provincia de Buenos Aires",
    tipo: "provincia",
  },
  "provincia de buenos aires": {
    codigo: "AR-B",
    nombre: "Provincia de Buenos Aires",
    tipo: "provincia",
  },
  caba: {
    codigo: "AR-C",
    nombre: "Ciudad Autónoma de Buenos Aires",
    tipo: "ciudad_autonoma",
  },
  "capital federal": {
    codigo: "AR-C",
    nombre: "Ciudad Autónoma de Buenos Aires",
    tipo: "ciudad_autonoma",
  },
  "ciudad autonoma de buenos aires": {
    codigo: "AR-C",
    nombre: "Ciudad Autónoma de Buenos Aires",
    tipo: "ciudad_autonoma",
  },
  "san luis": { codigo: "AR-D", nombre: "San Luis", tipo: "provincia" },
  "entre rios": {
    codigo: "AR-E",
    nombre: "Entre Ríos",
    tipo: "provincia",
  },
  "la rioja": { codigo: "AR-F", nombre: "La Rioja", tipo: "provincia" },
  "santiago del estero": {
    codigo: "AR-G",
    nombre: "Santiago del Estero",
    tipo: "provincia",
  },
  chaco: { codigo: "AR-H", nombre: "Chaco", tipo: "provincia" },
  "san juan": { codigo: "AR-J", nombre: "San Juan", tipo: "provincia" },
  catamarca: { codigo: "AR-K", nombre: "Catamarca", tipo: "provincia" },
  "la pampa": { codigo: "AR-L", nombre: "La Pampa", tipo: "provincia" },
  mendoza: { codigo: "AR-M", nombre: "Mendoza", tipo: "provincia" },
  misiones: { codigo: "AR-N", nombre: "Misiones", tipo: "provincia" },
  formosa: { codigo: "AR-P", nombre: "Formosa", tipo: "provincia" },
  neuquen: { codigo: "AR-Q", nombre: "Neuquén", tipo: "provincia" },
  "rio negro": { codigo: "AR-R", nombre: "Río Negro", tipo: "provincia" },
  "santa fe": { codigo: "AR-S", nombre: "Santa Fe", tipo: "provincia" },
  tucuman: { codigo: "AR-T", nombre: "Tucumán", tipo: "provincia" },
  chubut: { codigo: "AR-U", nombre: "Chubut", tipo: "provincia" },
  "tierra del fuego": {
    codigo: "AR-V",
    nombre: "Tierra del Fuego",
    tipo: "provincia",
  },
  corrientes: {
    codigo: "AR-W",
    nombre: "Corrientes",
    tipo: "provincia",
  },
  cordoba: { codigo: "AR-X", nombre: "Córdoba", tipo: "provincia" },
  jujuy: { codigo: "AR-Y", nombre: "Jujuy", tipo: "provincia" },
  "santa cruz": {
    codigo: "AR-Z",
    nombre: "Santa Cruz",
    tipo: "provincia",
  },
});

export function normalizeWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeSearchText(value: unknown): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugifyProviderValue(value: unknown): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeDecodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || hostname.includes("..")) return false;
  return hostname.split(".").every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
  );
}

export function normalizeOriginalProviderUrl(
  value: unknown,
  evidence: { providerName?: unknown } = {}
): NormalizedProviderUrl | null {
  const original = normalizeWhitespace(value);
  if (!original) return null;

  try {
    const parsed = new URL(original);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!isValidHostname(hostname)) return null;

    let pathname = parsed.pathname || "/";
    pathname = pathname === "/" ? "" : pathname.replace(/\/+$/g, "");
    const normalized = `${parsed.protocol}//${hostname}${
      parsed.port ? `:${parsed.port}` : ""
    }${pathname}`;
    const segments = pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => safeDecodePathSegment(segment));
    const sourceSlug = segments.length
      ? slugifyProviderValue(segments[segments.length - 1])
      : null;
    const categorySlug =
      segments.length >= 2 ? slugifyProviderValue(segments[segments.length - 2]) : null;
    const externalIdMatch = sourceSlug?.match(/^(.+)-([a-z0-9]{5})$/i);
    const externalIdCandidate = externalIdMatch?.[2]?.toLowerCase() || null;
    const providerSlugCandidate =
      externalIdMatch?.[1]?.replace(/^-+|-+$/g, "") || null;
    const normalizedProviderName = slugifyProviderValue(evidence.providerName);
    const hasTechnicalTokenEvidence = Boolean(
      externalIdCandidate &&
        (/\d/.test(externalIdCandidate) ||
          !/[aeiou]/.test(externalIdCandidate) ||
          (normalizedProviderName &&
            normalizedProviderName === providerSlugCandidate))
    );
    const hasProviderDetailEvidence = Boolean(
      segments.length >= 2 &&
        categorySlug &&
        sourceSlug &&
        !isProviderNavigationSlug(sourceSlug) &&
        providerSlugCandidate &&
        hasTechnicalTokenEvidence
    );
    const externalId = hasProviderDetailEvidence
      ? externalIdCandidate
      : null;
    const slug = sourceSlug
      ? externalId
        ? providerSlugCandidate || sourceSlug
        : sourceSlug
      : null;

    return {
      original,
      normalized,
      hostname,
      pathname: pathname || "/",
      categorySlug,
      sourceSlug,
      slug,
      externalId,
    };
  } catch {
    return null;
  }
}

export function createProviderDocumentId(normalizedUrl: string): string {
  const normalized = normalizeWhitespace(normalizedUrl);
  if (!normalized) {
    throw new Error("A normalized provider URL is required to build the document ID.");
  }
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `${PROVIDER_ID_PREFIX}${hash.slice(0, PROVIDER_ID_HASH_HEX_LENGTH)}`;
}

export function normalizeEmails(value: unknown): EmailNormalizationResult {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return { principal: null, alternativos: [], invalidos: [] };
  }

  const valid: string[] = [];
  const invalidos: EmailNormalizationResult["invalidos"] = [];
  const seen = new Set<string>();

  for (const part of raw.split(/[|,;]/g)) {
    const email = normalizeWhitespace(part).toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    if (EMAIL_PLACEHOLDERS.has(email)) {
      invalidos.push({ value: email, reason: "placeholder" });
      continue;
    }
    if (!EMAIL_PATTERN.test(email)) {
      invalidos.push({ value: email, reason: "invalid" });
      continue;
    }
    valid.push(email);
  }

  return {
    principal: valid[0] || null,
    alternativos: valid.slice(1),
    invalidos,
  };
}

export function normalizePhone(
  value: unknown,
  countryCode: unknown
): PhoneNormalizationResult {
  const original =
    value === null || value === undefined ? "" : String(value).trim();
  if (!original) {
    return {
      original: null,
      normalized: null,
      status: "missing",
      removedLeadingExcelApostrophe: false,
    };
  }

  const removedLeadingExcelApostrophe = original.startsWith("'");
  const normalizationInput = removedLeadingExcelApostrophe
    ? original.slice(1)
    : original;

  if (
    /[a-z]/i.test(normalizationInput) ||
    !/^[+()0-9.\-\s]+$/.test(normalizationInput)
  ) {
    return {
      original,
      normalized: null,
      status: "invalid",
      removedLeadingExcelApostrophe,
    };
  }

  const hasLeadingPlus = normalizationInput.trim().startsWith("+");
  const digits = normalizationInput.replace(/\D/g, "");
  if (hasLeadingPlus) {
    if (/^[1-9]\d{7,14}$/.test(digits)) {
      return {
        original,
        normalized: `+${digits}`,
        status: "normalized",
        removedLeadingExcelApostrophe,
      };
    }
    return {
      original,
      normalized: null,
      status: "invalid",
      removedLeadingExcelApostrophe,
    };
  }

  const normalizedCountry = normalizeWhitespace(countryCode).toUpperCase();
  if (normalizedCountry === "AR" && /^\d{10}$/.test(digits)) {
    return {
      original,
      normalized: `+54${digits}`,
      status: "normalized",
      removedLeadingExcelApostrophe,
    };
  }

  return {
    original,
    normalized: null,
    status: /^\d{6,15}$/.test(digits) ? "unsafe_local_format" : "invalid",
    removedLeadingExcelApostrophe,
  };
}

function hostnameMatches(hostname: string, expected: string): boolean {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function pathExtension(pathname: string): string {
  const fileName = pathname.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

export function classifyProviderUrl(value: unknown): ProviderUrlClassification {
  const original = normalizeWhitespace(value);
  if (!original) return { tipo: "invalid", original: null, hostname: null };

  try {
    const parsed = new URL(original);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return { tipo: "invalid", original, hostname: null };
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!isValidHostname(hostname)) {
      return { tipo: "invalid", original, hostname: null };
    }

    if (hostnameMatches(hostname, "instagram.com")) {
      return { tipo: "instagram", original, hostname };
    }
    if (hostnameMatches(hostname, "facebook.com") || hostname === "fb.com") {
      return { tipo: "facebook", original, hostname };
    }
    if (hostnameMatches(hostname, "tiktok.com")) {
      return { tipo: "tiktok", original, hostname };
    }
    if (
      hostnameMatches(hostname, "youtube.com") ||
      hostname === "youtu.be"
    ) {
      return { tipo: "youtube", original, hostname };
    }
    if (hostnameMatches(hostname, "pinterest.com") || hostname === "pin.it") {
      return { tipo: "pinterest", original, hostname };
    }
    if (hostnameMatches(hostname, "linkedin.com")) {
      return { tipo: "linkedin", original, hostname };
    }
    if (
      hostnameMatches(hostname, "linktr.ee") ||
      hostnameMatches(hostname, "linktree.com")
    ) {
      return { tipo: "linktree", original, hostname };
    }
    if (hostnameMatches(hostname, "portalcasamientos.com.ar")) {
      return { tipo: "portal_media", original, hostname };
    }
    if (hostnameMatches(hostname, "canva.com")) {
      return { tipo: "canva", original, hostname };
    }
    if (
      (hostname === "google.com" || hostname.startsWith("google.")) &&
      parsed.pathname.toLowerCase().startsWith("/search")
    ) {
      return { tipo: "google_search", original, hostname };
    }
    if (IMAGE_EXTENSIONS.has(pathExtension(parsed.pathname))) {
      return { tipo: "image", original, hostname };
    }
    if (
      hostnameMatches(hostname, "drive.google.com") ||
      hostnameMatches(hostname, "docs.google.com") ||
      hostnameMatches(hostname, "maps.google.com") ||
      hostname === "bit.ly" ||
      hostname === "tinyurl.com" ||
      hostname === "wa.me"
    ) {
      return { tipo: "doubtful", original, hostname };
    }

    return { tipo: "website", original, hostname };
  } catch {
    return { tipo: "invalid", original, hostname: null };
  }
}

function nullableText(value: unknown): string | null {
  return normalizeWhitespace(value) || null;
}

function normalizeCountryCode(value: unknown): string | null {
  const normalized = normalizeWhitespace(value).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function splitStreetAndNumber(value: unknown): {
  street: string | null;
  number: string | null;
} {
  const original = normalizeWhitespace(value);
  if (!original) return { street: null, number: null };
  const match = original.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  if (!match) return { street: original, number: null };
  return {
    street: normalizeWhitespace(match[1]) || null,
    number: match[2],
  };
}

function isMeaningfulAddress(value: string | null, countryCode: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeSearchText(value);
  if (!normalized) return false;
  return !(
    normalized === normalizeSearchText(countryCode) ||
    normalized === "argentina"
  );
}

export function mapProviderLocation(record: PortalProviderRecord): {
  direccionOriginal: string | null;
  direccionCompleta: string | null;
  calle: string | null;
  numero: string | null;
  codigoPostal: string | null;
  ciudad: string | null;
  nivel1Codigo: string | null;
  nivel1Nombre: string | null;
  nivel1Tipo: string | null;
  nivel2Codigo: string | null;
  nivel2Nombre: string | null;
  nivel2Tipo: string | null;
  paisCodigo: string | null;
  paisNombre: string | null;
  regionMetropolitana: string | null;
  subregionMetropolitana: string | null;
  coordenadas: null;
} {
  const paisCodigo = normalizeCountryCode(record.pais);
  const provinciaOriginal = nullableText(record.provincia);
  const normalizedProvinceName = provinciaOriginal
    ? normalizeSearchText(provinciaOriginal)
    : "";
  const argentinaLevel1 =
    paisCodigo === "AR" && normalizedProvinceName
      ? ARGENTINA_LEVEL1_BY_NORMALIZED_NAME[normalizedProvinceName] ||
        ARGENTINA_LEVEL1_BY_NORMALIZED_NAME[
          normalizedProvinceName.replace(/^provincia de /, "")
        ] ||
        null
      : null;
  const direccionOriginal = nullableText(record.direccion);
  const street = splitStreetAndNumber(record.calle);

  return {
    direccionOriginal,
    direccionCompleta: isMeaningfulAddress(direccionOriginal, paisCodigo)
      ? direccionOriginal
      : null,
    calle: street.street,
    numero: street.number,
    codigoPostal: nullableText(record.codigo_postal),
    ciudad: nullableText(record.localidad),
    nivel1Codigo: argentinaLevel1?.codigo || null,
    nivel1Nombre: argentinaLevel1?.nombre || provinciaOriginal,
    nivel1Tipo: argentinaLevel1?.tipo || null,
    nivel2Codigo: null,
    nivel2Nombre: null,
    nivel2Tipo: null,
    paisCodigo,
    paisNombre: paisCodigo === "AR" ? "Argentina" : null,
    regionMetropolitana: null,
    subregionMetropolitana: null,
    coordenadas: null,
  };
}
