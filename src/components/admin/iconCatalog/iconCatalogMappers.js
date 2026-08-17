function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeSearchToken(value) {
  return normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeSearchLooseToken(value) {
  return normalizeSearchToken(value)
    .replace(/[-_./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchVariants(value) {
  const strict = normalizeSearchToken(value);
  const loose = normalizeSearchLooseToken(value);
  if (!strict && !loose) return [];

  const slug = loose ? loose.replace(/\s+/g, "-") : "";
  const compact = loose ? loose.replace(/\s+/g, "") : "";
  return unique([strict, loose, slug, compact]);
}

export function normalizeCategoryLabel(value) {
  const compact = normalizeString(value).replace(/\s+/g, " ").toLowerCase();
  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  return [];
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function toMillis(dateValue) {
  if (!(dateValue instanceof Date)) return 0;
  return Number(dateValue.getTime() || 0);
}

export function parseTimestamp(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value?.toDate === "function") {
    const next = value.toDate();
    return next instanceof Date && Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "number") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "string") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "object") {
    const maybeSeconds = Number(
      value.seconds ?? value._seconds ?? value.sec ?? value.s
    );
    const maybeNanos = Number(
      value.nanoseconds ?? value._nanoseconds ?? value.nanos ?? value.ns ?? 0
    );
    if (Number.isFinite(maybeSeconds)) {
      const millis = maybeSeconds * 1000 + Math.floor((maybeNanos || 0) / 1000000);
      const next = new Date(millis);
      return Number.isFinite(next.getTime()) ? next : null;
    }
  }

  return null;
}

export function parseKeywordsInput(value) {
  return unique(
    normalizeString(value)
      .split(",")
      .map((entry) => normalizeString(entry).toLowerCase())
      .filter(Boolean)
  );
}

export function parseCategoriesInput(value) {
  const source = Array.isArray(value)
    ? value
    : normalizeString(value).split(",");
  const out = [];
  const seen = new Set();

  for (const entry of source) {
    const normalized = normalizeCategoryLabel(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function normalizeValidationStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "passed" || normalized === "warning" || normalized === "rejected") {
    return normalized;
  }
  return null;
}

function normalizeIconStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (
    normalized === "active" ||
    normalized === "archived" ||
    normalized === "duplicate" ||
    normalized === "processing" ||
    normalized === "rejected"
  ) {
    return normalized;
  }
  return "active";
}

const VALIDATION_ISSUE_HELP = {
  ICON_SVG_FILE_TOO_LARGE_WARN: {
    problem: "El archivo es pesado y puede tardar mas en cargar, especialmente en celulares.",
    solution: "Optimiza el SVG para reducir su peso y vuelve a subirlo como un icono nuevo.",
  },
  ICON_SVG_FIXED_DIMENSIONS: {
    problem: "El archivo traia un tamaño fijo; el sistema ya lo ajusto para que pueda escalar correctamente.",
    solution: "No hace falta corregir este icono. En futuras exportaciones, guardalo sin ancho ni alto fijos.",
  },
  ICON_SVG_NON_SQUARE_VIEWBOX: {
    problem: "El dibujo tiene una proporcion rectangular. Se conservara, pero puede dejar espacio libre dentro del cuadro del icono.",
    solution: "Si queres que ocupe un cuadro completo, reexportalo con un area de dibujo cuadrada.",
  },
  ICON_SVG_NO_PATH_NODES: {
    problem: "El dibujo esta armado con figuras que el sistema conserva correctamente, aunque no sean trazados comunes.",
    solution: "No requiere cambios. Para quitar el aviso, podes convertir las figuras a trazados antes de exportar.",
  },
  ICON_SVG_FIXED_COLOR: {
    problem: "El icono conserva sus colores originales y no se podra recolorear desde el editor.",
    solution: "Podes activarlo tal como esta. Si queres cambiarle el color desde el editor, exporta una version de un solo color preparada para tomar el color elegido.",
  },
  ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR: {
    problem: "El icono tiene varios colores y el sistema los conservo para no alterar el diseño.",
    solution: "No hace falta corregirlo si debe seguir siendo multicolor. Si queres recolorearlo, crea y subi una version de un solo color.",
  },
  ICON_SVG_TEXT_REMOVED: {
    problem: "El archivo incluia texto adicional y el sistema lo quito para conservar solamente el dibujo del icono.",
    solution: "Revisa la vista previa. Si el dibujo esta completo, podes activar el icono sin hacer otros cambios.",
  },
  ICON_ASSET_STORAGE_PATH_MISSING: {
    problem: "El registro no tiene vinculado el archivo original, por lo que no puede validarse ni activarse.",
    solution: "Volve a subir el archivo como un icono nuevo y deja este registro archivado.",
  },
  ICON_ASSET_NOT_FOUND: {
    problem: "El archivo original ya no esta disponible, por lo que el icono no puede activarse.",
    solution: "Volve a subir el archivo como un icono nuevo y deja este registro archivado.",
  },
  ICON_ASSET_EMPTY_FILE: {
    problem: "El archivo esta vacio y no contiene un icono visible.",
    solution: "Exporta nuevamente el diseño, comproba que el archivo tenga contenido y volve a subirlo.",
  },
  ICON_ASSET_FORMAT_UNSUPPORTED: {
    problem: "El formato del archivo no es compatible con el editor.",
    solution: "Converti el archivo a SVG, PNG, JPG, WEBP o GIF y subilo como un icono nuevo.",
  },
  ICON_SVG_FILE_TOO_LARGE_HARD: {
    problem: "El SVG supera el tamaño maximo permitido y no puede activarse.",
    solution: "Simplifica u optimiza el dibujo para reducir el peso y volve a subirlo.",
  },
  ICON_SVG_CANONICAL_TOO_LARGE: {
    problem: "El dibujo sigue siendo demasiado pesado despues de prepararlo para el editor.",
    solution: "Reduce la cantidad de detalles y efectos del SVG, exportalo nuevamente y volve a subirlo.",
  },
  ICON_SVG_INVALID_XML: {
    problem: "El archivo SVG esta dañado o tiene una estructura incompleta.",
    solution: "Abrilo en la herramienta de diseño, exportalo otra vez como SVG y volve a subirlo.",
  },
  ICON_SVG_MISSING_ROOT: {
    problem: "El archivo no contiene un SVG valido.",
    solution: "Exporta nuevamente el diseño como SVG o usa PNG o WEBP y volve a subirlo.",
  },
  ICON_SVG_MISSING_VIEWBOX: {
    problem: "El archivo no define correctamente el area del dibujo y el editor no puede ubicarlo con seguridad.",
    solution: "Reexporta el SVG incluyendo el area de dibujo (viewBox) y volve a subirlo.",
  },
  ICON_SVG_EMPTY_GRAPHICS: {
    problem: "El archivo no contiene figuras que puedan mostrarse como icono.",
    solution: "Comproba que el diseño tenga formas visibles, exportalo nuevamente y volve a subirlo.",
  },
  ICON_SVG_EMPTY_RENDER: {
    problem: "El archivo contiene datos, pero el resultado final queda visualmente vacio.",
    solution: "Revisa que las figuras tengan relleno o borde visible, exporta nuevamente y volve a subirlo.",
  },
  ICON_SVG_RENDER_FAILED: {
    problem: "El sistema no pudo generar una version visual confiable de este SVG.",
    solution: "Simplifica el dibujo o exportalo como PNG o WEBP y volve a subirlo.",
  },
  ICON_SVG_STYLE_NORMALIZATION_MISMATCH: {
    problem: "El sistema pudo leer los estilos, pero no pudo confirmar que el resultado conserve exactamente el mismo aspecto.",
    solution: "Simplifica los estilos del SVG o usa PNG o WEBP para conservar el diseÃ±o sin cambios.",
  },
  ICON_SVG_STYLE_NORMALIZATION_FAILED: {
    problem: "El sistema no pudo comprobar de forma confiable el resultado de convertir los estilos del SVG.",
    solution: "Simplifica los estilos del SVG o usa PNG o WEBP y volve a subirlo.",
  },
  ICON_SVG_METADATA_NORMALIZATION_MISMATCH: {
    problem: "El archivo incluye datos internos del programa de diseño y, al quitarlos, la imagen no quedo exactamente igual.",
    solution: "Guarda una copia como SVG simple u optimizado, o usa PNG o WEBP para conservar el diseño sin cambios.",
  },
  ICON_SVG_METADATA_NORMALIZATION_FAILED: {
    problem: "El sistema no pudo confirmar que sea seguro quitar los datos internos del programa de diseño.",
    solution: "Guarda una copia como SVG simple u optimizado, o usa PNG o WEBP y volve a subirla.",
  },
};

const UNSAFE_SVG_ISSUE_CODES = new Set([
  "ICON_SVG_XML_DECLARATION_NOT_ALLOWED",
  "ICON_SVG_EVENT_HANDLER_NOT_ALLOWED",
  "ICON_SVG_UNSAFE_HREF",
  "ICON_SVG_EXTERNAL_REFERENCE_NOT_ALLOWED",
]);

const UNSUPPORTED_SVG_ISSUE_CODES = new Set([
  "ICON_SVG_UNSUPPORTED_ELEMENT",
  "ICON_SVG_UNSUPPORTED_STYLE",
  "ICON_SVG_UNSUPPORTED_ATTRIBUTE",
  "ICON_SVG_UNSUPPORTED_PAINT",
  "ICON_SVG_INVALID_TRANSFORM",
  "ICON_SVG_STYLE_NORMALIZATION_MISMATCH",
  "ICON_SVG_STYLE_NORMALIZATION_FAILED",
  "ICON_SVG_METADATA_NORMALIZATION_MISMATCH",
  "ICON_SVG_METADATA_NORMALIZATION_FAILED",
]);

const BROKEN_SVG_REFERENCE_CODES = new Set([
  "ICON_SVG_INVALID_ID",
  "ICON_SVG_UNRESOLVED_REFERENCE",
]);

function parseValidationIssue(issue) {
  if (typeof issue === "string") {
    const value = normalizeString(issue);
    const isCodeOnly = /^[A-Za-z][A-Za-z0-9_]+$/.test(value);
    return {
      code: isCodeOnly ? value.toUpperCase() : "",
      message: isCodeOnly ? "" : value,
    };
  }

  return {
    code: normalizeString(issue?.code).toUpperCase(),
    message: normalizeString(issue?.message),
  };
}

function inferValidationIssueHelp({ code, message, severity }) {
  const searchable = normalizeSearchToken(`${code} ${message}`);
  if (!searchable) return null;

  if (/multiple.*color|multiples.*color|multicolor/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR;
  }
  if (/fixed.*dimension|dimension.*fij|width.*height|ancho.*alto.*fij/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_FIXED_DIMENSIONS;
  }
  if (/non.*square|no.*cuadrad|proporcion.*rectangular/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_NON_SQUARE_VIEWBOX;
  }
  if (/no.*path|sin.*path|shapes|figuras.*trazad/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_NO_PATH_NODES;
  }
  if (/fixed.*color|color.*fij|colores.*propios|no.*recolore|currentcolor/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_FIXED_COLOR;
  }
  if (/storage.*path|storagepath|ruta.*archivo.*falt/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_ASSET_STORAGE_PATH_MISSING;
  }
  if (/asset.*not.*found|archivo.*no.*encontr|archivo.*no.*disponible/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_ASSET_NOT_FOUND;
  }
  if (/empty.*file|archivo.*vacio/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_ASSET_EMPTY_FILE;
  }
  if (/format.*unsupported|formato.*no.*soport|formato.*no.*compat/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_ASSET_FORMAT_UNSUPPORTED;
  }
  if (/canonical.*too.*large|representacion.*supera.*limite/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_CANONICAL_TOO_LARGE;
  }
  if (/too.*large|supera.*bytes|archivo.*pesad|rendimiento.*movil/.test(searchable)) {
    return severity === "warning"
      ? VALIDATION_ISSUE_HELP.ICON_SVG_FILE_TOO_LARGE_WARN
      : VALIDATION_ISSUE_HELP.ICON_SVG_FILE_TOO_LARGE_HARD;
  }
  if (/missing.*viewbox|viewbox.*valid|area.*dibujo.*falt/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_MISSING_VIEWBOX;
  }
  if (/invalid.*xml|parsear.*svg|estructura.*xml|nodo.*svg.*valid/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_INVALID_XML;
  }
  if (/empty.*graphics|sin.*geometr|no.*contiene.*figuras/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_EMPTY_GRAPHICS;
  }
  if (/empty.*render|pixel.*visible|visualmente.*vacio/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_EMPTY_RENDER;
  }
  if (/render.*failed|no.*pudo.*render/.test(searchable)) {
    return VALIDATION_ISSUE_HELP.ICON_SVG_RENDER_FAILED;
  }
  if (/doctype|entity|event.*handler|unsafe.*href|external.*reference|script|enlace.*extern/.test(searchable)) {
    return {
      problem: "El SVG incluye contenido externo o instrucciones que no son seguras para mostrar.",
      solution: "Exporta una copia limpia, sin enlaces, scripts ni contenido incrustado, y volve a subirla.",
    };
  }
  if (/unsupported.*element|unsupported.*style|unsupported.*attribute|unsupported.*paint|invalid.*transform|no.*soportad/.test(searchable)) {
    return {
      problem: "El SVG usa efectos o construcciones que el editor no puede reproducir fielmente.",
      solution: "Simplifica el diseño, convierte los efectos a formas basicas o exportalo como PNG o WEBP y volve a subirlo.",
    };
  }
  if (/invalid.*id|unresolved.*reference|referencia.*no.*existe/.test(searchable)) {
    return {
      problem: "Algunas partes internas del SVG estan incompletas o apuntan a elementos que no existen.",
      solution: "Reexporta el archivo desde el diseño original, preferentemente con las formas unificadas, y volve a subirlo.",
    };
  }

  return null;
}

function isSafeUserFacingIssueMessage(message) {
  const normalized = normalizeString(message);
  if (!normalized || normalized.length > 240) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(normalized)) return false;
  return !/internal|exception|stack|parser\s*x?\d|undefined|null pointer|at\s+\w+\s*\(/i.test(normalized);
}

function getValidationIssueHelp(issue, severity) {
  const { code, message } = parseValidationIssue(issue);
  if (VALIDATION_ISSUE_HELP[code]) return VALIDATION_ISSUE_HELP[code];

  if (UNSAFE_SVG_ISSUE_CODES.has(code)) {
    return {
      problem: "El SVG incluye contenido externo o instrucciones que no son seguras para mostrar.",
      solution: "Exporta una copia limpia, sin enlaces, scripts ni contenido incrustado, y volve a subirla.",
    };
  }

  if (UNSUPPORTED_SVG_ISSUE_CODES.has(code)) {
    return {
      problem: "El SVG usa efectos o construcciones que el editor no puede reproducir fielmente.",
      solution: "Simplifica el diseño, convierte los efectos a formas basicas o exportalo como PNG o WEBP y volve a subirlo.",
    };
  }

  if (BROKEN_SVG_REFERENCE_CODES.has(code)) {
    return {
      problem: "Algunas partes internas del SVG estan incompletas o apuntan a elementos que no existen.",
      solution: "Reexporta el archivo desde el diseño original, preferentemente con las formas unificadas, y volve a subirlo.",
    };
  }

  const inferred = inferValidationIssueHelp({ code, message, severity });
  if (inferred) return inferred;

  if (isSafeUserFacingIssueMessage(message)) {
    return {
      problem: message,
      solution: severity === "warning"
        ? "Corregi ese punto en el archivo original y volve a subirlo. Si el aviso dice que el sistema ya lo corrigio, no hace falta hacer nada."
        : "Corregi ese problema en el archivo original y volve a subirlo como un icono nuevo.",
    };
  }

  if (severity === "warning") {
    return {
      problem: "Este icono quedo marcado con una advertencia, pero el informe no guardo el motivo.",
      solution: "Presiona Rev para volver a analizarlo. Si el aviso sigue sin detalle, volve a subir el archivo.",
    };
  }

  return {
    problem: "Este icono no puede activarse, pero el informe no guardo el motivo del rechazo.",
    solution: "Presiona Rev para volver a analizarlo. Si sigue rechazado sin detalle, volve a subir el archivo.",
  };
}

function getWarningHelpFromChecks(checks) {
  if (!checks || typeof checks !== "object") return [];
  const entries = [];
  if (checks.hasFixedDimensions === true) {
    entries.push(VALIDATION_ISSUE_HELP.ICON_SVG_FIXED_DIMENSIONS);
  }
  if (checks.isSquare === false) {
    entries.push(VALIDATION_ISSUE_HELP.ICON_SVG_NON_SQUARE_VIEWBOX);
  }
  if (checks.hasPath === false && Number(checks.shapeNodeCount || 0) > 0) {
    entries.push(VALIDATION_ISSUE_HELP.ICON_SVG_NO_PATH_NODES);
  }
  if (normalizeString(checks.colorMode).toLowerCase() === "fixed") {
    entries.push(VALIDATION_ISSUE_HELP.ICON_SVG_FIXED_COLOR);
  }
  return dedupeIssueHelp(entries);
}

function dedupeIssueHelp(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.problem}|${entry.solution}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getIconCatalogIssueHelp(icon) {
  const status = normalizeString(icon?.status).toLowerCase();
  const validationStatus = normalizeString(icon?.validationStatus).toLowerCase();
  const archivedReason = normalizeString(icon?.archivedReason).toLowerCase();
  const errors = Array.isArray(icon?.validation?.errors) ? icon.validation.errors : [];
  const warnings = Array.isArray(icon?.validation?.warnings) ? icon.validation.warnings : [];
  const hasCurrentRenderableValidation =
    (validationStatus === "passed" || validationStatus === "warning") &&
    errors.length === 0;
  const isDuplicate =
    status === "duplicate" ||
    Boolean(normalizeString(icon?.duplicateOf)) ||
    (!hasCurrentRenderableValidation && archivedReason.includes("duplicate"));
  const isProcessing = status === "processing";
  const isRejected =
    status === "rejected" ||
    validationStatus === "rejected" ||
    errors.length > 0 ||
    (!hasCurrentRenderableValidation &&
      (archivedReason.includes("validation-rejected") ||
        archivedReason.includes("asset-not-found")));
  const hasWarning = validationStatus === "warning" || warnings.length > 0;

  if (!isDuplicate && !isProcessing && !isRejected && !hasWarning) return null;

  if (isDuplicate) {
    const originalId = normalizeString(icon?.duplicateOf);
    return {
      tone: "error",
      title: "No se puede activar",
      entries: [
        {
          problem: "Este archivo es igual a otro icono que ya existe en el catalogo.",
          solution: originalId
            ? `Usa el icono original (${originalId}) o subi un archivo realmente diferente.`
            : "Usa el icono original o subi un archivo realmente diferente.",
        },
      ],
    };
  }

  if (isProcessing) {
    return {
      tone: "processing",
      title: "Validacion en curso",
      entries: [
        {
          problem: "El archivo todavia se esta revisando y aun no esta listo para activarse.",
          solution: "Espera a que termine. Si sigue igual despues de varios minutos, presiona Rev para repetir la validacion.",
        },
      ],
    };
  }

  if (isRejected) {
    const entries = errors.length > 0
      ? errors.map((issue) => getValidationIssueHelp(issue, "error"))
      : [getValidationIssueHelp(null, "error")];
    return {
      tone: "error",
      title: "No se puede activar",
      entries: dedupeIssueHelp(entries),
    };
  }

  const checkEntries = getWarningHelpFromChecks(icon?.validation?.checks);
  const entries = warnings.length > 0
    ? warnings.map((issue) => getValidationIssueHelp(issue, "warning"))
    : checkEntries.length > 0
      ? checkEntries
      : [getValidationIssueHelp(null, "warning")];
  return {
    tone: "warning",
    title: "Advertencia",
    entries: dedupeIssueHelp(entries),
  };
}

function parsePriority(rawPriority, rawPopular) {
  const parsed = Number(rawPriority);
  if (Number.isFinite(parsed)) return Math.max(-9999, Math.min(9999, Math.round(parsed)));
  return rawPopular === true ? 1 : 0;
}

function parseUsesCount(doc) {
  const direct = Number(doc?.usesCount);
  if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
  const nested = Number(doc?.stats?.usesCount);
  if (Number.isFinite(nested)) return Math.max(0, Math.round(nested));
  return 0;
}

export function mapIconDocToViewModel(doc, source = "active") {
  const categories = parseCategoriesInput([
    ...toList(doc?.categorias),
    ...toList(doc?.categoria),
  ]);
  const keywords = unique([
    ...toList(doc?.keywords),
    ...toList(doc?.tags),
  ]);
  const status = normalizeIconStatus(doc?.status);
  const validationStatus = normalizeValidationStatus(doc?.validation?.status);
  const createdAt = parseTimestamp(doc?.creadoEn || doc?.creado || doc?.audit?.createdAt);
  const updatedAt = parseTimestamp(
    doc?.actualizadoEn ||
      doc?.audit?.updatedAt ||
      doc?.audit?.lastValidatedAt ||
      doc?.creadoEn ||
      doc?.creado
  );
  const priority = parsePriority(doc?.priority, doc?.popular);
  const categoria = categories[0] || "";

  return {
    id: normalizeString(doc?.id),
    source: source === "archived" ? "archived" : "active",
    isActive: source !== "archived" && status !== "archived",
    status,
    nombre: normalizeString(doc?.nombre || doc?.name || "Sin nombre"),
    categoria,
    categorias: categories,
    keywords,
    license: normalizeString(doc?.license || doc?.licencia || ""),
    priority,
    popular: doc?.popular === true || priority > 0,
    usesCount: parseUsesCount(doc),
    updatedAt,
    createdAt,
    validation: doc?.validation || null,
    validationStatus,
    quality: doc?.quality || null,
    url: normalizeString(doc?.url),
    storagePath: normalizeString(doc?.storagePath),
    assetType: normalizeString(doc?.assetType || "icon") || "icon",
    format: normalizeString(doc?.format || ""),
    archivedReason: normalizeString(doc?.archivedReason || ""),
    duplicateOf: normalizeString(doc?.duplicateOf || ""),
    searchTokens: Array.isArray(doc?.searchTokens) ? doc.searchTokens : [],
    raw: doc || {},
  };
}

export function buildSearchHaystack(icon) {
  const values = [
    icon?.id,
    icon?.nombre,
    icon?.categoria,
    ...(icon?.categorias || []),
    ...(icon?.keywords || []),
    ...(icon?.searchTokens || []),
    icon?.license,
    icon?.assetType,
    icon?.format,
  ];
  const tokens = values.flatMap((entry) => buildSearchVariants(entry));
  return unique(tokens).join(" ");
}

export function filterIcons(items, filters) {
  const list = Array.isArray(items) ? items : [];
  const search = normalizeSearchLooseToken(filters?.search || "");
  const searchVariants = buildSearchVariants(search);
  const category = normalizeSearchToken(filters?.category || "all");
  const status = normalizeSearchToken(filters?.status || "all");
  const health = normalizeSearchToken(filters?.health || "all");

  return list.filter((icon) => {
    if (search) {
      const haystack = buildSearchHaystack(icon);
      const matched = searchVariants.some((variant) => haystack.includes(variant));
      if (!matched) return false;
    }

    if (category && category !== "all") {
      const iconCategories = [
        normalizeSearchToken(icon?.categoria),
        ...(icon?.categorias || []).map((entry) => normalizeSearchToken(entry)),
      ].filter(Boolean);
      if (!iconCategories.includes(category)) return false;
    }

    if (status === "active" && !icon?.isActive) return false;
    if (status === "inactive" && icon?.isActive) return false;

    if (health === "warning" && icon?.validationStatus !== "warning") return false;
    if (
      health === "rejected" &&
      !(
        icon?.validationStatus === "rejected" ||
        icon?.status === "rejected" ||
        icon?.status === "duplicate"
      )
    ) {
      return false;
    }
    if (health === "processing" && icon?.status !== "processing") return false;

    return true;
  });
}

export function sortIcons(items, sortBy = "manual") {
  const list = Array.isArray(items) ? items.slice() : [];
  const normalizedSort = normalizeString(sortBy).toLowerCase();

  const compareByName = (left, right) =>
    normalizeString(left?.nombre).localeCompare(normalizeString(right?.nombre));
  const compareByUpdated = (left, right) => toMillis(right?.updatedAt) - toMillis(left?.updatedAt);
  const compareByCreated = (left, right) => toMillis(right?.createdAt) - toMillis(left?.createdAt);

  list.sort((left, right) => {
    if (normalizedSort === "most_used") {
      const usageDiff = Number(right?.usesCount || 0) - Number(left?.usesCount || 0);
      if (usageDiff !== 0) return usageDiff;
      const priorityDiff = Number(right?.priority || 0) - Number(left?.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      const updatedDiff = compareByUpdated(left, right);
      if (updatedDiff !== 0) return updatedDiff;
      return compareByName(left, right);
    }

    if (normalizedSort === "recent") {
      const updatedDiff = compareByUpdated(left, right);
      if (updatedDiff !== 0) return updatedDiff;
      const createdDiff = compareByCreated(left, right);
      if (createdDiff !== 0) return createdDiff;
      return compareByName(left, right);
    }

    const priorityDiff = Number(right?.priority || 0) - Number(left?.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    const usageDiff = Number(right?.usesCount || 0) - Number(left?.usesCount || 0);
    if (usageDiff !== 0) return usageDiff;
    const updatedDiff = compareByUpdated(left, right);
    if (updatedDiff !== 0) return updatedDiff;
    return compareByName(left, right);
  });

  return list;
}

export function formatDateTime(dateValue) {
  if (!(dateValue instanceof Date)) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(dateValue);
}
