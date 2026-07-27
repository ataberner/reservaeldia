export const ESTADOS_PROVEEDOR = [
  "importado",
  "borrador",
  "pendiente_revision",
  "publicado",
  "pausado",
  "rechazado",
  "eliminado",
] as const;

export type EstadoProveedor = (typeof ESTADOS_PROVEEDOR)[number];

export const ESTADOS_VALIDACION_PROVEEDOR = [
  "no_validado",
  "pendiente",
  "validado",
  "rechazado",
  "suspendido",
] as const;

export type EstadoValidacionProveedor =
  (typeof ESTADOS_VALIDACION_PROVEEDOR)[number];

export const MOTIVOS_REVISION_PROVEEDOR = [
  "posible_duplicado_nombre",
  "categoria_contenedora_novias",
  "categoria_contenedora_experiencias_adicionales",
  "categoria_ambigua",
  "sin_id_externo",
  "ubicacion_incompleta",
  "contacto_dudoso",
] as const;

export type MotivoRevisionProveedor =
  (typeof MOTIVOS_REVISION_PROVEEDOR)[number];

/**
 * Structural read contract. It keeps documents read from Firestore compatible
 * without importing or instantiating a specific Firebase Admin package.
 */
export type FirestoreTimestampLike = {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
};

export type ProviderTimestampValue = Date | FirestoreTimestampLike;

export type RevisionManualProveedor<
  TTimestamp = ProviderTimestampValue
> = {
  requerida: boolean;
  motivos: MotivoRevisionProveedor[];
  revisadaEn: TTimestamp | null;
  revisadaPor: string | null;
  notas: string | null;
};

export type ImagenProveedor<TTimestamp = ProviderTimestampValue> = {
  id: string;
  tipo: "portada" | "galeria";
  storagePath: string;
  url: string | null;
  urlOriginal: string | null;
  alt: string;
  orden: number;
  ancho: number | null;
  alto: number | null;
  mimeType: string | null;
  formato: string | null;
  tamanioBytes: number | null;
  importadaEn: TTimestamp | null;
};

export type Proveedor<TTimestamp = ProviderTimestampValue> = {
  schemaVersion: number;

  nombre: string;
  nombreNormalizado: string;
  slug: string;

  categoriaPrincipalId: string | null;
  categoriaIds: string[];

  descripcion: string;
  descripcionCorta: string;

  contacto: {
    telefonoOriginal: string | null;
    telefonoNormalizado: string | null;
    whatsapp: string | null;
    email: string | null;
    emailsAlternativos: string[];
    sitioWeb: string | null;
  };

  redesSociales: {
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
    youtube: string | null;
    pinterest: string | null;
    linkedin: string | null;
    linktree: string | null;
    otras: Array<{ tipo: string; url: string }>;
  };

  ubicacion: {
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

    coordenadas: {
      latitud: number;
      longitud: number;
    } | null;
  };

  imagenes: {
    portada: ImagenProveedor<TTimestamp> | null;
    galeria: ImagenProveedor<TTimestamp>[];
  };

  estado: EstadoProveedor;
  activo: boolean;
  visible: boolean;

  validacion: {
    estado: EstadoValidacionProveedor;
    metodo: string | null;
    validadoEn: TTimestamp | null;
    validadoPor: string | null;
  };

  propietario: {
    reclamado: boolean;
    userId: string | null;
    reclamadoEn: TTimestamp | null;
  };

  revisionManual: RevisionManualProveedor<TTimestamp>;

  fuente: {
    tipo: "importacion" | "manual" | "proveedor";
    sitio: string | null;
    origen: string | null;
    urlOriginal: string | null;
    urlOriginalNormalizada: string | null;
    idExterno: string | null;
    categoriaOriginal: string | null;
    tipoSchemaOriginal: string | null;
    fuenteExtraccionOriginal: string | null;
    versionArchivoOrigen: number | null;
    fechaArchivoOrigen: string | null;
    motivoArchivoOrigen: string | null;
    archivoOrigen: string | null;
    importadoEn: TTimestamp | null;
  };

  importacion: {
    version: number;
    datosImportados: boolean;
    descripcionImportada: boolean;
    portadaImportada: boolean;
    galeriaImportada: boolean;
    cantidadImagenes: number;
    ultimoIntentoEn: TTimestamp | null;
    ultimoError: string | null;
    completadaEn: TTimestamp | null;
  };

  creadoEn: TTimestamp;
  actualizadoEn: TTimestamp;
  publicadoEn: TTimestamp | null;
};

export type ProveedorEscritura = Proveedor<Date>;
export type ProveedorFirestore = Proveedor<FirestoreTimestampLike>;

export type CategoriaProveedor<TTimestamp = ProviderTimestampValue> = {
  nombre: string;
  slug: string;
  descripcion: string;
  activa: boolean;
  orden: number;
  icono: string | null;
  categoriaPadreId: string | null;
  creadoEn: TTimestamp;
  actualizadoEn: TTimestamp;
};

export type PortalProviderRecord = {
  categoria?: unknown;
  nombre?: unknown;
  pagina?: unknown;
  sitio_web?: unknown;
  telefono?: unknown;
  email?: unknown;
  direccion?: unknown;
  calle?: unknown;
  localidad?: unknown;
  provincia?: unknown;
  codigo_postal?: unknown;
  pais?: unknown;
  tipo_schema?: unknown;
  fuente_extraccion?: unknown;
  [key: string]: unknown;
};

export type PortalProviderSourceFile = {
  version: number | null;
  createdAt: string | null;
  reason: string | null;
  origin: string | null;
  providerUrls: unknown[];
  results: PortalProviderRecord[];
};

export type NormalizedProviderUrl = {
  original: string;
  normalized: string;
  hostname: string;
  pathname: string;
  categorySlug: string | null;
  sourceSlug: string | null;
  slug: string | null;
  externalId: string | null;
};

export type EmailNormalizationResult = {
  principal: string | null;
  alternativos: string[];
  invalidos: Array<{
    value: string;
    reason: "placeholder" | "invalid";
  }>;
};

export type PhoneNormalizationResult = {
  original: string | null;
  normalized: string | null;
  status: "missing" | "normalized" | "invalid" | "unsafe_local_format";
  removedLeadingExcelApostrophe: boolean;
};

export const TIPOS_URL_PROVEEDOR = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "linktree",
  "website",
  "image",
  "portal_media",
  "canva",
  "google_search",
  "doubtful",
  "invalid",
] as const;

export type TipoUrlProveedor = (typeof TIPOS_URL_PROVEEDOR)[number];

export type ProviderUrlClassification = {
  tipo: TipoUrlProveedor;
  original: string | null;
  hostname: string | null;
};

export const MOTIVOS_DESCARTE_PROVEEDOR = [
  "invalid_url",
  "unexpected_origin",
  "duplicate_url",
  "navigation_or_region_page",
  "category_page",
  "missing_name",
  "portal_record",
  "insufficient_data",
] as const;

export type MotivoDescarteProveedor =
  (typeof MOTIVOS_DESCARTE_PROVEEDOR)[number];

export type ProviderEligibilityResult = {
  eligible: boolean;
  reasons: Array<{
    code: MotivoDescarteProveedor;
    message: string;
  }>;
  normalizedUrl: NormalizedProviderUrl | null;
};

export type ProviderMappingDiagnostics = {
  invalidEmailCount: number;
  phoneStatus: PhoneNormalizationResult["status"];
  websiteClassification: TipoUrlProveedor | null;
  originalCategory: string | null;
  mappedCategoryId: string | null;
  manualReviewReasons: MotivoRevisionProveedor[];
};

export type MappedProviderRecord = {
  id: string;
  document: ProveedorEscritura;
  diagnostics: ProviderMappingDiagnostics;
};

export type RuntimeValidationIssue = {
  path: string;
  message: string;
};
