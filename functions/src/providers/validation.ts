import {
  CategoriaProveedor,
  ESTADOS_PROVEEDOR,
  ESTADOS_VALIDACION_PROVEEDOR,
  MOTIVOS_REVISION_PROVEEDOR,
  PortalProviderSourceFile,
  Proveedor,
  RuntimeValidationIssue,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestampValue(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (!isRecord(value)) return false;
  return (
    typeof value.toDate === "function" &&
    (typeof value.toMillis === "function" ||
      (typeof value.seconds === "number" &&
        typeof value.nanoseconds === "number"))
  );
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isE164OrNull(value: unknown): boolean {
  return value === null || (
    typeof value === "string" &&
    /^\+[1-9]\d{7,14}$/.test(value)
  );
}

function push(
  issues: RuntimeValidationIssue[],
  condition: boolean,
  path: string,
  message: string
): void {
  if (!condition) issues.push({ path, message });
}

function validateImage(
  value: unknown,
  path: string,
  issues: RuntimeValidationIssue[]
): void {
  push(issues, isRecord(value), path, "Debe ser un objeto.");
  if (!isRecord(value)) return;
  push(issues, typeof value.id === "string" && value.id.length > 0, `${path}.id`, "Debe ser un string no vacío.");
  push(issues, value.tipo === "portada" || value.tipo === "galeria", `${path}.tipo`, "Tipo de imagen inválido.");
  push(issues, typeof value.storagePath === "string" && value.storagePath.startsWith("proveedores/"), `${path}.storagePath`, "Ruta de Storage inválida.");
  push(issues, isStringOrNull(value.url), `${path}.url`, "Debe ser string o null.");
  push(issues, isStringOrNull(value.urlOriginal), `${path}.urlOriginal`, "Debe ser string o null.");
  push(issues, typeof value.alt === "string", `${path}.alt`, "Debe ser string.");
  push(issues, Number.isInteger(value.orden) && Number(value.orden) >= 0, `${path}.orden`, "Debe ser un entero no negativo.");
  for (const field of ["ancho", "alto", "tamanioBytes"]) {
    const fieldValue = value[field];
    push(
      issues,
      fieldValue === null ||
        (typeof fieldValue === "number" && Number.isFinite(fieldValue) && fieldValue >= 0),
      `${path}.${field}`,
      "Debe ser un número no negativo o null."
    );
  }
  push(issues, isStringOrNull(value.mimeType), `${path}.mimeType`, "Debe ser string o null.");
  push(issues, isStringOrNull(value.formato), `${path}.formato`, "Debe ser string o null.");
  push(
    issues,
    value.importadaEn === null || isTimestampValue(value.importadaEn),
    `${path}.importadaEn`,
    "Debe ser Date, Timestamp o null."
  );
}

export function validateProveedor(value: unknown): RuntimeValidationIssue[] {
  const issues: RuntimeValidationIssue[] = [];
  push(issues, isRecord(value), "$", "El proveedor debe ser un objeto.");
  if (!isRecord(value)) return issues;

  push(issues, Number.isInteger(value.schemaVersion) && Number(value.schemaVersion) >= 1, "schemaVersion", "Debe ser un entero positivo.");
  for (const field of ["nombre", "nombreNormalizado", "slug", "descripcion", "descripcionCorta"]) {
    push(issues, typeof value[field] === "string", field, "Debe ser string.");
  }
  push(issues, typeof value.nombre === "string" && value.nombre.trim().length > 0, "nombre", "No puede estar vacío.");
  push(issues, typeof value.slug === "string" && value.slug.trim().length > 0, "slug", "No puede estar vacío.");
  push(issues, isStringOrNull(value.categoriaPrincipalId), "categoriaPrincipalId", "Debe ser string o null.");
  push(issues, Array.isArray(value.categoriaIds) && value.categoriaIds.every((entry) => typeof entry === "string"), "categoriaIds", "Debe ser un array de strings.");

  const contacto = value.contacto;
  push(issues, isRecord(contacto), "contacto", "Debe ser un objeto.");
  if (isRecord(contacto)) {
    for (const field of ["telefonoOriginal", "telefonoNormalizado", "whatsapp", "email", "sitioWeb"]) {
      push(issues, isStringOrNull(contacto[field]), `contacto.${field}`, "Debe ser string o null.");
    }
    push(
      issues,
      isE164OrNull(contacto.telefonoNormalizado),
      "contacto.telefonoNormalizado",
      "Debe usar formato E.164 seguro o ser null."
    );
    push(
      issues,
      isE164OrNull(contacto.whatsapp),
      "contacto.whatsapp",
      "Debe usar formato E.164 seguro o ser null."
    );
    if (contacto.telefonoNormalizado !== null) {
      push(
        issues,
        typeof contacto.telefonoOriginal === "string" &&
          contacto.telefonoOriginal.trim().length > 0,
        "contacto.telefonoOriginal",
        "Debe conservar el valor original cuando existe un teléfono normalizado."
      );
    }
    push(issues, Array.isArray(contacto.emailsAlternativos) && contacto.emailsAlternativos.every((entry) => typeof entry === "string"), "contacto.emailsAlternativos", "Debe ser un array de strings.");
  }

  const redes = value.redesSociales;
  push(issues, isRecord(redes), "redesSociales", "Debe ser un objeto.");
  if (isRecord(redes)) {
    for (const field of ["instagram", "facebook", "tiktok", "youtube", "pinterest", "linkedin", "linktree"]) {
      push(issues, isStringOrNull(redes[field]), `redesSociales.${field}`, "Debe ser string o null.");
    }
    push(
      issues,
      Array.isArray(redes.otras) &&
        redes.otras.every(
          (entry) =>
            isRecord(entry) &&
            typeof entry.tipo === "string" &&
            entry.tipo.length > 0 &&
            typeof entry.url === "string" &&
            entry.url.length > 0
        ),
      "redesSociales.otras",
      "Debe contener pares tipo/url no vacíos."
    );
  }

  const ubicacion = value.ubicacion;
  push(issues, isRecord(ubicacion), "ubicacion", "Debe ser un objeto.");
  if (isRecord(ubicacion)) {
    for (const field of [
      "direccionOriginal",
      "direccionCompleta",
      "calle",
      "numero",
      "codigoPostal",
      "ciudad",
      "nivel1Codigo",
      "nivel1Nombre",
      "nivel1Tipo",
      "nivel2Codigo",
      "nivel2Nombre",
      "nivel2Tipo",
      "paisCodigo",
      "paisNombre",
      "regionMetropolitana",
      "subregionMetropolitana",
    ]) {
      push(issues, isStringOrNull(ubicacion[field]), `ubicacion.${field}`, "Debe ser string o null.");
    }
    push(
      issues,
      ubicacion.paisCodigo === null ||
        (typeof ubicacion.paisCodigo === "string" &&
          /^[A-Z]{2}$/.test(ubicacion.paisCodigo)),
      "ubicacion.paisCodigo",
      "Debe ser ISO 3166-1 alpha-2 o null."
    );
    if (ubicacion.coordenadas !== null) {
      push(issues, isRecord(ubicacion.coordenadas), "ubicacion.coordenadas", "Debe ser objeto o null.");
      if (isRecord(ubicacion.coordenadas)) {
        const lat = ubicacion.coordenadas.latitud;
        const lng = ubicacion.coordenadas.longitud;
        push(issues, typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90, "ubicacion.coordenadas.latitud", "Latitud inválida.");
        push(issues, typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180, "ubicacion.coordenadas.longitud", "Longitud inválida.");
      }
    }
  }

  const imagenes = value.imagenes;
  push(issues, isRecord(imagenes), "imagenes", "Debe ser un objeto.");
  if (isRecord(imagenes)) {
    if (imagenes.portada !== null) validateImage(imagenes.portada, "imagenes.portada", issues);
    push(issues, Array.isArray(imagenes.galeria), "imagenes.galeria", "Debe ser un array.");
    if (Array.isArray(imagenes.galeria)) {
      imagenes.galeria.forEach((image, index) =>
        validateImage(image, `imagenes.galeria[${index}]`, issues)
      );
    }
  }

  push(issues, typeof value.estado === "string" && ESTADOS_PROVEEDOR.includes(value.estado as never), "estado", "Estado inválido.");
  push(issues, typeof value.activo === "boolean", "activo", "Debe ser boolean.");
  push(issues, typeof value.visible === "boolean", "visible", "Debe ser boolean.");
  if (value.visible === true) {
    push(
      issues,
      value.estado === "publicado" && value.activo === true,
      "visible",
      "Un proveedor visible debe estar publicado y activo."
    );
  }

  const validacion = value.validacion;
  push(issues, isRecord(validacion), "validacion", "Debe ser un objeto.");
  if (isRecord(validacion)) {
    push(issues, typeof validacion.estado === "string" && ESTADOS_VALIDACION_PROVEEDOR.includes(validacion.estado as never), "validacion.estado", "Estado inválido.");
    push(issues, isStringOrNull(validacion.metodo), "validacion.metodo", "Debe ser string o null.");
    push(issues, validacion.validadoEn === null || isTimestampValue(validacion.validadoEn), "validacion.validadoEn", "Debe ser Date, Timestamp o null.");
    push(issues, isStringOrNull(validacion.validadoPor), "validacion.validadoPor", "Debe ser string o null.");
  }

  const propietario = value.propietario;
  push(issues, isRecord(propietario), "propietario", "Debe ser un objeto.");
  if (isRecord(propietario)) {
    push(issues, typeof propietario.reclamado === "boolean", "propietario.reclamado", "Debe ser boolean.");
    push(issues, isStringOrNull(propietario.userId), "propietario.userId", "Debe ser string o null.");
    push(issues, propietario.reclamadoEn === null || isTimestampValue(propietario.reclamadoEn), "propietario.reclamadoEn", "Debe ser Date, Timestamp o null.");
    if (propietario.reclamado === false) {
      push(issues, propietario.userId === null && propietario.reclamadoEn === null, "propietario", "Un perfil no reclamado no puede tener propietario ni fecha.");
    }
  }

  const revisionManual = value.revisionManual;
  push(issues, isRecord(revisionManual), "revisionManual", "Debe ser un objeto.");
  if (isRecord(revisionManual)) {
    push(
      issues,
      typeof revisionManual.requerida === "boolean",
      "revisionManual.requerida",
      "Debe ser boolean."
    );
    const motivosValidos =
      Array.isArray(revisionManual.motivos) &&
      revisionManual.motivos.every(
        (motivo) =>
          typeof motivo === "string" &&
          MOTIVOS_REVISION_PROVEEDOR.includes(motivo as never)
      );
    push(
      issues,
      motivosValidos,
      "revisionManual.motivos",
      "Debe ser un array de motivos de revisión válidos."
    );
    if (Array.isArray(revisionManual.motivos)) {
      push(
        issues,
        new Set(revisionManual.motivos).size === revisionManual.motivos.length,
        "revisionManual.motivos",
        "No puede contener motivos duplicados."
      );
      push(
        issues,
        revisionManual.requerida === (revisionManual.motivos.length > 0),
        "revisionManual",
        "requerida debe coincidir con la presencia de motivos."
      );
    }
    push(
      issues,
      revisionManual.revisadaEn === null ||
        isTimestampValue(revisionManual.revisadaEn),
      "revisionManual.revisadaEn",
      "Debe ser Date, Timestamp o null."
    );
    push(
      issues,
      isStringOrNull(revisionManual.revisadaPor),
      "revisionManual.revisadaPor",
      "Debe ser string o null."
    );
    push(
      issues,
      isStringOrNull(revisionManual.notas),
      "revisionManual.notas",
      "Debe ser string o null."
    );
  }

  const fuente = value.fuente;
  push(issues, isRecord(fuente), "fuente", "Debe ser un objeto.");
  if (isRecord(fuente)) {
    push(issues, fuente.tipo === "importacion" || fuente.tipo === "manual" || fuente.tipo === "proveedor", "fuente.tipo", "Tipo de fuente inválido.");
    for (const field of [
      "sitio",
      "origen",
      "urlOriginal",
      "urlOriginalNormalizada",
      "idExterno",
      "categoriaOriginal",
      "tipoSchemaOriginal",
      "fuenteExtraccionOriginal",
      "fechaArchivoOrigen",
      "motivoArchivoOrigen",
      "archivoOrigen",
    ]) {
      push(issues, isStringOrNull(fuente[field]), `fuente.${field}`, "Debe ser string o null.");
    }
    push(issues, fuente.versionArchivoOrigen === null || Number.isInteger(fuente.versionArchivoOrigen), "fuente.versionArchivoOrigen", "Debe ser entero o null.");
    push(issues, fuente.importadoEn === null || isTimestampValue(fuente.importadoEn), "fuente.importadoEn", "Debe ser Date, Timestamp o null.");
  }
  if (
    isRecord(contacto) &&
    isRecord(fuente) &&
    fuente.tipo === "importacion"
  ) {
    push(
      issues,
      contacto.whatsapp === contacto.telefonoNormalizado,
      "contacto.whatsapp",
      "En una importación debe coincidir con telefonoNormalizado o ser null junto con él."
    );
  }

  const importacion = value.importacion;
  push(issues, isRecord(importacion), "importacion", "Debe ser un objeto.");
  if (isRecord(importacion)) {
    push(issues, Number.isInteger(importacion.version) && Number(importacion.version) >= 1, "importacion.version", "Debe ser un entero positivo.");
    for (const field of [
      "datosImportados",
      "descripcionImportada",
      "portadaImportada",
      "galeriaImportada",
    ]) {
      push(issues, typeof importacion[field] === "boolean", `importacion.${field}`, "Debe ser boolean.");
    }
    push(issues, Number.isInteger(importacion.cantidadImagenes) && Number(importacion.cantidadImagenes) >= 0, "importacion.cantidadImagenes", "Debe ser entero no negativo.");
    push(issues, importacion.ultimoIntentoEn === null || isTimestampValue(importacion.ultimoIntentoEn), "importacion.ultimoIntentoEn", "Debe ser Date, Timestamp o null.");
    push(issues, isStringOrNull(importacion.ultimoError), "importacion.ultimoError", "Debe ser string o null.");
    push(issues, importacion.completadaEn === null || isTimestampValue(importacion.completadaEn), "importacion.completadaEn", "Debe ser Date, Timestamp o null.");
  }

  push(issues, isTimestampValue(value.creadoEn), "creadoEn", "Debe ser Date o Timestamp.");
  push(issues, isTimestampValue(value.actualizadoEn), "actualizadoEn", "Debe ser Date o Timestamp.");
  push(issues, value.publicadoEn === null || isTimestampValue(value.publicadoEn), "publicadoEn", "Debe ser Date, Timestamp o null.");

  return issues;
}

export function assertValidProveedor(value: unknown): asserts value is Proveedor {
  const issues = validateProveedor(value);
  if (issues.length > 0) {
    const summary = issues
      .slice(0, 8)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid provider document: ${summary}`);
  }
}

export function validateCategoriaProveedor(
  value: unknown
): RuntimeValidationIssue[] {
  const issues: RuntimeValidationIssue[] = [];
  push(
    issues,
    isRecord(value),
    "$",
    "La categoría de proveedor debe ser un objeto."
  );
  if (!isRecord(value)) return issues;

  push(
    issues,
    typeof value.nombre === "string" &&
      value.nombre.trim().length > 0,
    "nombre",
    "Debe ser un string no vacío."
  );
  push(
    issues,
    typeof value.slug === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug),
    "slug",
    "Debe ser un slug no vacío en minúsculas."
  );
  push(
    issues,
    typeof value.descripcion === "string",
    "descripcion",
    "Debe ser string."
  );
  push(
    issues,
    typeof value.activa === "boolean",
    "activa",
    "Debe ser boolean."
  );
  push(
    issues,
    Number.isInteger(value.orden) && Number(value.orden) >= 0,
    "orden",
    "Debe ser un entero no negativo."
  );
  push(
    issues,
    isStringOrNull(value.icono),
    "icono",
    "Debe ser string o null."
  );
  push(
    issues,
    isStringOrNull(value.categoriaPadreId),
    "categoriaPadreId",
    "Debe ser string o null."
  );
  push(
    issues,
    isTimestampValue(value.creadoEn),
    "creadoEn",
    "Debe ser Date o Timestamp."
  );
  push(
    issues,
    isTimestampValue(value.actualizadoEn),
    "actualizadoEn",
    "Debe ser Date o Timestamp."
  );

  return issues;
}

export function assertValidCategoriaProveedor(
  value: unknown
): asserts value is CategoriaProveedor {
  const issues = validateCategoriaProveedor(value);
  if (issues.length > 0) {
    const summary = issues
      .slice(0, 8)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid provider category document: ${summary}`);
  }
}

export function parseProviderSourceFile(
  value: unknown
): PortalProviderSourceFile {
  if (!isRecord(value)) {
    throw new Error("El archivo de proveedores debe contener un objeto JSON.");
  }
  if (!Array.isArray(value.results)) {
    throw new Error("El archivo de proveedores debe contener un array results.");
  }
  if (
    value.version !== undefined &&
    value.version !== null &&
    !Number.isInteger(value.version)
  ) {
    throw new Error("version debe ser un entero o null.");
  }

  const results = value.results.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`results[${index}] debe ser un objeto.`);
    }
    return entry;
  });

  return {
    version: Number.isInteger(value.version) ? Number(value.version) : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    reason: typeof value.reason === "string" ? value.reason : null,
    origin: typeof value.origin === "string" ? value.origin : null,
    providerUrls: Array.isArray(value.providerUrls) ? value.providerUrls : [],
    results,
  };
}
