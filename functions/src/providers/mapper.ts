import {
  mapProviderCategory,
  PROVIDER_IMPORT_VERSION,
  PROVIDER_SCHEMA_VERSION,
  PROVIDER_SOURCE_HOST,
} from "./config";
import {
  classifyProviderUrl,
  createProviderDocumentId,
  mapProviderLocation,
  normalizeEmails,
  normalizeOriginalProviderUrl,
  normalizePhone,
  normalizeSearchText,
  normalizeWhitespace,
} from "./normalization";
import {
  MappedProviderRecord,
  PortalProviderRecord,
  PortalProviderSourceFile,
  ProveedorEscritura,
  MotivoRevisionProveedor,
  ProviderUrlClassification,
} from "./types";
import {
  buildProviderManualReview,
  buildProviderManualReviewReasons,
} from "./review";
import { assertValidProveedor } from "./validation";

type MappingContext = {
  sourceFile: PortalProviderSourceFile;
  sourceFileName: string;
  dateFactory?: () => Date;
  manualReviewReasons?: readonly MotivoRevisionProveedor[];
};

function nullableText(value: unknown): string | null {
  return normalizeWhitespace(value) || null;
}

function buildUrlFields(classification: ProviderUrlClassification): {
  sitioWeb: string | null;
  redesSociales: ProveedorEscritura["redesSociales"];
} {
  const redesSociales: ProveedorEscritura["redesSociales"] = {
    instagram: null,
    facebook: null,
    tiktok: null,
    youtube: null,
    pinterest: null,
    linkedin: null,
    linktree: null,
    otras: [],
  };

  const original = classification.original;
  if (!original) {
    return { sitioWeb: null, redesSociales };
  }

  if (
    classification.tipo === "instagram" ||
    classification.tipo === "facebook" ||
    classification.tipo === "tiktok" ||
    classification.tipo === "youtube" ||
    classification.tipo === "pinterest" ||
    classification.tipo === "linkedin" ||
    classification.tipo === "linktree"
  ) {
    redesSociales[classification.tipo] = original;
    return { sitioWeb: null, redesSociales };
  }

  if (classification.tipo === "website") {
    return { sitioWeb: original, redesSociales };
  }

  const otherTypeByClassification: Record<string, string> = {
    image: "imagen_original",
    portal_media: "medio_portal_origen",
    canva: "canva",
    google_search: "busqueda_google",
    doubtful: "url_dudosa",
    invalid: "valor_original_invalido",
  };
  redesSociales.otras.push({
    tipo: otherTypeByClassification[classification.tipo] || "otra",
    url: original,
  });
  return { sitioWeb: null, redesSociales };
}

export function mapPortalProviderRecord(
  record: PortalProviderRecord,
  context: MappingContext
): MappedProviderRecord {
  const normalizedUrl = normalizeOriginalProviderUrl(record.pagina, {
    providerName: record.nombre,
  });
  if (!normalizedUrl || !normalizedUrl.slug) {
    throw new Error("Cannot map a provider without a valid normalized source URL and slug.");
  }
  const nombre = normalizeWhitespace(record.nombre);
  if (!nombre) {
    throw new Error("Cannot map a provider without a name.");
  }

  const dateFactory = context.dateFactory || (() => new Date());
  const producedDate = dateFactory();
  if (
    !(producedDate instanceof Date) ||
    Number.isNaN(producedDate.getTime())
  ) {
    throw new Error("dateFactory must return a valid native Date.");
  }
  const now = new Date(producedDate.getTime());
  const emails = normalizeEmails(record.email);
  const phone = normalizePhone(record.telefono, record.pais);
  const websiteClassification = classifyProviderUrl(record.sitio_web);
  const urlFields = buildUrlFields(websiteClassification);
  const originalCategory =
    nullableText(record.categoria) || normalizedUrl.categorySlug;
  const categoryMapping = mapProviderCategory(originalCategory);
  const providerId = createProviderDocumentId(normalizedUrl.normalized);
  const manualReviewReasons = buildProviderManualReviewReasons({
    originalCategory,
    externalId: normalizedUrl.externalId,
    additionalReasons: context.manualReviewReasons,
  });

  const document: ProveedorEscritura = {
    schemaVersion: PROVIDER_SCHEMA_VERSION,
    nombre,
    nombreNormalizado: normalizeSearchText(nombre),
    slug: normalizedUrl.slug,
    categoriaPrincipalId: categoryMapping?.categoriaId || null,
    categoriaIds: categoryMapping ? [categoryMapping.categoriaId] : [],
    descripcion: "",
    descripcionCorta: "",
    contacto: {
      telefonoOriginal: phone.original,
      telefonoNormalizado: phone.normalized,
      whatsapp: phone.normalized,
      email: emails.principal,
      emailsAlternativos: emails.alternativos,
      sitioWeb: urlFields.sitioWeb,
    },
    redesSociales: urlFields.redesSociales,
    ubicacion: mapProviderLocation(record),
    imagenes: {
      portada: null,
      galeria: [],
    },
    estado: "importado",
    activo: true,
    visible: false,
    validacion: {
      estado: "no_validado",
      metodo: null,
      validadoEn: null,
      validadoPor: null,
    },
    propietario: {
      reclamado: false,
      userId: null,
      reclamadoEn: null,
    },
    revisionManual: buildProviderManualReview(manualReviewReasons),
    fuente: {
      tipo: "importacion",
      sitio: PROVIDER_SOURCE_HOST,
      origen: context.sourceFile.origin,
      urlOriginal: normalizedUrl.original,
      urlOriginalNormalizada: normalizedUrl.normalized,
      idExterno: normalizedUrl.externalId,
      categoriaOriginal: originalCategory,
      tipoSchemaOriginal: nullableText(record.tipo_schema),
      fuenteExtraccionOriginal: nullableText(record.fuente_extraccion),
      versionArchivoOrigen: context.sourceFile.version,
      fechaArchivoOrigen: context.sourceFile.createdAt,
      motivoArchivoOrigen: context.sourceFile.reason,
      archivoOrigen: normalizeWhitespace(context.sourceFileName) || null,
      importadoEn: now,
    },
    importacion: {
      version: PROVIDER_IMPORT_VERSION,
      datosImportados: true,
      descripcionImportada: false,
      portadaImportada: false,
      galeriaImportada: false,
      cantidadImagenes: 0,
      ultimoIntentoEn: null,
      ultimoError: null,
      completadaEn: null,
    },
    creadoEn: now,
    actualizadoEn: now,
    publicadoEn: null,
  };

  assertValidProveedor(document);

  return {
    id: providerId,
    document,
    diagnostics: {
      invalidEmailCount: emails.invalidos.length,
      phoneStatus: phone.status,
      websiteClassification:
        websiteClassification.original === null
          ? null
          : websiteClassification.tipo,
      originalCategory,
      mappedCategoryId: categoryMapping?.categoriaId || null,
      manualReviewReasons,
    },
  };
}
