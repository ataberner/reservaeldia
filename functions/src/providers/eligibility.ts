import {
  isProviderNavigationSlug,
  PROVIDER_SOURCE_HOST,
} from "./config";
import {
  normalizeOriginalProviderUrl,
  normalizeSearchText,
  normalizeWhitespace,
} from "./normalization";
import {
  MotivoDescarteProveedor,
  PortalProviderRecord,
  ProviderEligibilityResult,
} from "./types";

type EligibilityContext = {
  expectedHost?: string;
  isDuplicate?: boolean;
};

function hasUsefulProviderData(record: PortalProviderRecord): boolean {
  return [
    record.telefono,
    record.email,
    record.sitio_web,
    record.direccion,
    record.calle,
    record.localidad,
    record.tipo_schema,
  ].some((value) => Boolean(normalizeWhitespace(value)));
}

function hasGenericPortalIdentity(record: PortalProviderRecord): boolean {
  const name = normalizeSearchText(record.nombre);
  const compactName = name.replace(/[^a-z0-9]+/g, "");
  if (
    compactName === "portalcasamientos" ||
    compactName === "portalcasamientosargentina" ||
    compactName === "portalcasamientoscomar" ||
    compactName === "portalcasamientosargentinacomar"
  ) {
    return true;
  }

  const website = normalizeWhitespace(record.sitio_web).toLowerCase();
  const email = normalizeWhitespace(record.email).toLowerCase();
  const onlyPortalContacts =
    (website.includes("portalcasamientos.com.ar") ||
      email.includes("@portalcasamientos.com.ar")) &&
    !normalizeWhitespace(record.telefono) &&
    !normalizeWhitespace(record.direccion) &&
    !normalizeWhitespace(record.calle) &&
    !normalizeWhitespace(record.localidad);

  return onlyPortalContacts;
}

export function evaluateProviderEligibility(
  record: PortalProviderRecord,
  context: EligibilityContext = {}
): ProviderEligibilityResult {
  const reasons: ProviderEligibilityResult["reasons"] = [];
  const normalizedUrl = normalizeOriginalProviderUrl(record.pagina, {
    providerName: record.nombre,
  });
  const expectedHost = String(context.expectedHost || PROVIDER_SOURCE_HOST)
    .toLowerCase()
    .replace(/^www\./, "");

  const addReason = (
    code: MotivoDescarteProveedor,
    message: string
  ): void => {
    if (!reasons.some((reason) => reason.code === code)) {
      reasons.push({ code, message });
    }
  };

  if (!normalizedUrl) {
    addReason("invalid_url", "La URL original no es una URL HTTP(S) válida.");
    return { eligible: false, reasons, normalizedUrl: null };
  }

  if (normalizedUrl.hostname !== expectedHost) {
    addReason(
      "unexpected_origin",
      "La URL original no pertenece al dominio de origen esperado."
    );
  }

  if (context.isDuplicate === true) {
    addReason(
      "duplicate_url",
      "La URL original normalizada ya apareció antes en el archivo."
    );
  }

  const normalizedPath = normalizedUrl.pathname.toLowerCase().replace(/\/+$/, "");
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  if (isProviderNavigationSlug(normalizedUrl.sourceSlug)) {
    addReason(
      "navigation_or_region_page",
      "La URL corresponde a una página regional, provincial o de navegación."
    );
  } else if (pathSegments.length < 2) {
    addReason(
      "category_page",
      "La URL no tiene la estructura categoría/proveedor esperada."
    );
  }

  if (!normalizeWhitespace(record.nombre)) {
    addReason("missing_name", "El registro no tiene un nombre de proveedor.");
  }

  if (hasGenericPortalIdentity(record)) {
    addReason(
      "portal_record",
      "El registro contiene la identidad o datos genéricos del portal de origen."
    );
  }

  if (!hasUsefulProviderData(record)) {
    addReason(
      "insufficient_data",
      "El registro no contiene señales mínimas adicionales de un proveedor."
    );
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    normalizedUrl,
  };
}
