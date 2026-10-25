import { PROVIDER_CATEGORY_CATALOG } from "./config";
import { normalizePhone, normalizeSearchText } from "./normalization";
import type { ImagenProveedor, Proveedor, ProviderTimestampValue } from "./types";

export const PROVIDER_BETA_CONFIG_PATH = "app_config/proveedoresBeta";
export const PROVIDER_INVITATION_VALIDITY_DAYS = 7;
export const VENUE_CATEGORY_IDS = ["salones-fiestas", "quintas", "estancias", "hoteles", "restaurantes"];
export const PROVIDER_SERVICES = [
  { id: "fotografia", nombre: "Fotografía", categoriaIds: ["foto-video"] },
  { id: "video", nombre: "Video", categoriaIds: ["foto-video"] },
  { id: "maquillaje", nombre: "Maquillaje", categoriaIds: ["belleza-novias"] },
  { id: "peinado", nombre: "Peinado", categoriaIds: ["belleza-novias"] },
  { id: "musica-en-vivo", nombre: "Música en vivo", categoriaIds: ["musica-bodas"] },
  { id: "dj", nombre: "DJ", categoriaIds: ["tecnica-dj"] },
  { id: "sonido", nombre: "Sonido", categoriaIds: ["tecnica-dj"] },
  { id: "iluminacion", nombre: "Iluminación", categoriaIds: ["tecnica-dj"] },
  { id: "ceremonia", nombre: "Espacio para ceremonia", categoriaIds: VENUE_CATEGORY_IDS },
  { id: "recepcion", nombre: "Espacio para recepción", categoriaIds: VENUE_CATEGORY_IDS },
] as const;
export const PROVIDER_VENUE_FEATURES = [
  { id: "estacionamiento", nombre: "Estacionamiento" },
  { id: "accesibilidad", nombre: "Accesibilidad" },
  { id: "alojamiento", nombre: "Alojamiento" },
  { id: "cocina", nombre: "Cocina equipada" },
] as const;

type RecordValue = Record<string, unknown>;
export type ProviderDraft = Pick<Proveedor,
  "nombre" | "categoriaPrincipalId" | "categoriaIds" | "descripcion" | "descripcionCorta" |
  "contacto" | "redesSociales" | "ubicacion" | "imagenes"
> & {
  cobertura: string[];
  servicios: string[];
  precio: { modalidad: "consultar" | "desde"; importe: number | null; moneda: string | null; unidad: "evento" | "persona" | "hora" | "unidad" | null; actualizadoEn: ProviderTimestampValue | null };
  contratacion: { anticipacion: string; incluye: string; duracion: string; reserva: string };
  espacio: { capacidadMinima: number | null; capacidadMaxima: number | null; cubierto: boolean | null; aireLibre: boolean | null; caracteristicas: string[]; coordenadasVerificadas: boolean };
};
export type ProviderReviewStatus = "sin_cambios" | "en_revision" | "requiere_correcciones";
export type ProviderBetaMetadata = {
  version: 1; revision: number; contenidoRevision: number;
  estadoRevision: ProviderReviewStatus; pausaOrigen: "administracion" | "responsable" | null;
  motivoCorreccion: string | null; notasInternas: string;
};
export type ProviderBetaDocument = RecordValue & {
  beta: ProviderBetaMetadata;
  revisionPendiente: { revision: number; contenido: RecordValue; enviadaEn: Date; enviadaPor: string } | null;
  aprobada: { revision: number; contenido: RecordValue; aprobadaEn: Date; aprobadaPor: string } | null;
};
export type ProviderBetaOperation = "save" | "submit" | "approve" | "requestChanges" | "pause" | "archive" | "resume";
export class ProviderBetaError extends Error {
  constructor(public readonly code: "invalid-argument" | "failed-precondition" | "aborted", message: string, public readonly fields: string[] = []) {
    super(message);
  }
}
export function providerRecord(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function text(value: unknown, field: string, max = 10000): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new ProviderBetaError("invalid-argument", `Revisá ${field}.`, [field]);
  return value.trim();
}
function nullableText(value: unknown, field: string, max = 1000): string | null { return text(value, field, max) || null; }
function list(value: unknown, field: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) throw new ProviderBetaError("invalid-argument", `Revisá ${field}.`, [field]);
  return [...new Set(value.map((item) => text(item, field, 250)).filter(Boolean))];
}
function nullableNumber(value: unknown, field: string, min = 0, max = 1000000000): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ProviderBetaError("invalid-argument", `Revisá ${field}.`, [field]);
  return value;
}
function nullableBoolean(value: unknown, field: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new ProviderBetaError("invalid-argument", `Revisá ${field}.`, [field]);
  return value;
}
function safeUrl(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field, 2000);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch { throw new ProviderBetaError("invalid-argument", `Usá una URL http o https válida en ${field}.`, [field]); }
}
function compatibleUrl(value: unknown, previous: unknown, field: string): string | null {
  // Imported evidence is preserved privately when unchanged. It never bypasses
  // the public URL allowlist below or permits a newly introduced unsafe URL.
  if (typeof value === "string" && value === previous) return value;
  return safeUrl(value, field);
}
function publicUrl(value: unknown): string | null {
  try { return safeUrl(value, "url"); } catch { return null; }
}
function phone(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field, 40);
  if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized)) throw new ProviderBetaError("invalid-argument", `${field}: usá formato internacional, por ejemplo +5491123456789.`, [field]);
  return normalized;
}
function email(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field, 254);
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new ProviderBetaError("invalid-argument", `Revisá ${field}.`, [field]);
  return normalized?.toLowerCase() || null;
}
const LOCATION_TEXT_FIELDS = ["direccionOriginal", "direccionCompleta", "calle", "numero", "codigoPostal", "ciudad", "nivel1Codigo", "nivel1Nombre", "nivel1Tipo", "nivel2Codigo", "nivel2Nombre", "nivel2Tipo", "paisCodigo", "paisNombre", "regionMetropolitana", "subregionMetropolitana"] as const;
const SOCIAL_FIELDS = ["instagram", "facebook", "tiktok", "youtube", "pinterest", "linkedin", "linktree"] as const;
const EDITABLE_FIELDS = ["nombre", "categoriaPrincipalId", "categoriaIds", "descripcion", "descripcionCorta", "contacto", "redesSociales", "ubicacion", "imagenes", "cobertura", "servicios", "precio", "contratacion", "espacio"] as const;

function image(value: unknown, field: string, type: ImagenProveedor["tipo"], order: number): ImagenProveedor | null {
  if (value == null) return null;
  const item = providerRecord(value);
  const id = text(item.id, `${field}.id`, 160);
  const storagePath = text(item.storagePath, `${field}.storagePath`, 1000);
  if (!id || !/^proveedores\/[^/]+\/(portada|galeria|media)\/[^/]+$/.test(storagePath)) throw new ProviderBetaError("invalid-argument", "La imagen debe pertenecer al archivo privado de la ficha.", [field]);
  return { id, tipo: type, storagePath, url: null, urlOriginal: nullableText(item.urlOriginal, field, 2000),
    alt: text(item.alt, `${field}.alt`, 500), orden: order,
    ancho: nullableNumber(item.ancho, field), alto: nullableNumber(item.alto, field),
    tamanioBytes: nullableNumber(item.tamanioBytes, field), mimeType: nullableText(item.mimeType, field),
    formato: nullableText(item.formato, field), importadaEn: null };
}

/** Editable input is an allowlist, never a canonical document or an ACL patch. */
export function normalizeProviderDraft(value: unknown, previous?: ProviderDraft, now = new Date()): ProviderDraft {
  const source = providerRecord(value);
  if (value == null || Array.isArray(value) || typeof value !== "object") throw new ProviderBetaError("invalid-argument", "La ficha debe ser un objeto.");
  const unknown = Object.keys(source).filter((key) => !EDITABLE_FIELDS.includes(key as typeof EDITABLE_FIELDS[number]));
  if (unknown.length) throw new ProviderBetaError("invalid-argument", "La edición contiene campos no autorizados.", unknown);
  const contact = providerRecord(source.contacto);
  const location = providerRecord(source.ubicacion);
  const socials = providerRecord(source.redesSociales);
  const photos = providerRecord(source.imagenes);
  const price = providerRecord(source.precio);
  const hiring = providerRecord(source.contratacion);
  const venue = providerRecord(source.espacio);
  const primary = nullableText(source.categoriaPrincipalId, "categoriaPrincipalId", 100);
  const categories = [...new Set([...(primary ? [primary] : []), ...list(source.categoriaIds, "categoriaIds")])];
  const categoryIds = new Set(PROVIDER_CATEGORY_CATALOG.map((entry) => entry.documentId));
  if (categories.some((id) => !categoryIds.has(id))) throw new ProviderBetaError("invalid-argument", "Elegí categorías del catálogo vigente.", ["categoriaIds"]);
  const isVenue = VENUE_CATEGORY_IDS.includes(primary || "");
  const sameLegacyCategories = previous && primary === previous.categoriaPrincipalId && JSON.stringify([...categories].sort()) === JSON.stringify([...previous.categoriaIds].sort());
  if (primary && !sameLegacyCategories && categories.some((id) => VENUE_CATEGORY_IDS.includes(id) !== isVenue)) throw new ProviderBetaError("invalid-argument", "Las categorías adicionales deben corresponder al mismo tipo de negocio.", ["categoriaIds"]);
  const services = list(source.servicios, "servicios");
  if (services.some((id) => !PROVIDER_SERVICES.some((service) => service.id === id && service.categoriaIds.some((category) => categories.includes(category))))) throw new ProviderBetaError("invalid-argument", "Revisá los servicios de las categorías elegidas.", ["servicios"]);
  const features = list(venue.caracteristicas, "espacio.caracteristicas");
  if (features.some((id) => !PROVIDER_VENUE_FEATURES.some((feature) => feature.id === id))) throw new ProviderBetaError("invalid-argument", "Característica de espacio desconocida.", ["espacio.caracteristicas"]);
  const coordinates = providerRecord(location.coordenadas);
  const lat = nullableNumber(coordinates.latitud, "ubicacion.coordenadas.latitud", -90, 90);
  const lng = nullableNumber(coordinates.longitud, "ubicacion.coordenadas.longitud", -180, 180);
  if ((lat === null) !== (lng === null)) throw new ProviderBetaError("invalid-argument", "Completá ambas coordenadas o dejalas vacías.", ["ubicacion.coordenadas"]);
  const locationText = Object.fromEntries(LOCATION_TEXT_FIELDS.map((field) => [field, nullableText(location[field], `ubicacion.${field}`)])) as Omit<Proveedor["ubicacion"], "coordenadas">;
  if (locationText.paisCodigo && !/^[A-Z]{2}$/.test(locationText.paisCodigo)) throw new ProviderBetaError("invalid-argument", "El país debe usar código ISO de dos letras.", ["ubicacion.paisCodigo"]);
  const originalPhone = nullableText(contact.telefonoOriginal, "contacto.telefonoOriginal", 100);
  const normalizedPhone = previous && originalPhone !== previous.contacto.telefonoOriginal
    ? normalizePhone(originalPhone, locationText.paisCodigo).normalized
    : phone(contact.telefonoNormalizado, "contacto.telefonoNormalizado");
  const minimum = nullableNumber(venue.capacidadMinima, "espacio.capacidadMinima");
  const maximum = nullableNumber(venue.capacidadMaxima, "espacio.capacidadMaxima");
  if ((minimum !== null && !Number.isInteger(minimum)) || (maximum !== null && !Number.isInteger(maximum)) || (minimum !== null && maximum !== null && minimum > maximum)) throw new ProviderBetaError("invalid-argument", "Revisá las capacidades mínima y máxima.", ["espacio"]);
  const modality = price.modalidad == null ? "consultar" : price.modalidad;
  if (modality !== "consultar" && modality !== "desde") throw new ProviderBetaError("invalid-argument", "Modalidad de precio inválida.", ["precio"]);
  const amount = modality === "desde" ? nullableNumber(price.importe, "precio.importe", 0.01) : null;
  const currency = modality === "desde" ? nullableText(price.moneda, "precio.moneda", 3)?.toUpperCase() || null : null;
  const unit = modality === "desde" ? price.unidad : null;
  if (modality === "desde" && (amount === null || !currency || !/^[A-Z]{3}$/.test(currency) || !["evento", "persona", "hora", "unidad"].includes(String(unit)))) throw new ProviderBetaError("invalid-argument", "Indicá un importe positivo, moneda y unidad.", ["precio"]);
  const priceChanged = !previous || previous.precio.modalidad !== modality || previous.precio.importe !== amount || previous.precio.moneda !== currency || previous.precio.unidad !== unit;
  if (photos.galeria != null && !Array.isArray(photos.galeria)) throw new ProviderBetaError("invalid-argument", "Galería inválida.", ["imagenes.galeria"]);
  const otherSocials = Array.isArray(socials.otras) ? socials.otras.map((entry) => {
    const item = providerRecord(entry);
    const before = previous?.redesSociales.otras.find((prior) => prior.tipo === item.tipo && prior.url === item.url);
    return { tipo: text(item.tipo, "redesSociales.otras", 100), url: compatibleUrl(item.url, before?.url, "redesSociales.otras") || "" };
  }).filter((entry) => entry.tipo && entry.url) : [];
  return {
    nombre: text(source.nombre, "nombre", Math.max(200, previous?.nombre.length || 0)), categoriaPrincipalId: primary, categoriaIds: categories,
    descripcion: text(source.descripcion, "descripcion", Math.max(20000, previous?.descripcion.length || 0)), descripcionCorta: text(source.descripcionCorta, "descripcionCorta", Math.max(600, previous?.descripcionCorta.length || 0)),
    contacto: { telefonoOriginal: originalPhone || normalizedPhone, telefonoNormalizado: normalizedPhone, whatsapp: phone(contact.whatsapp, "contacto.whatsapp"), email: email(contact.email, "contacto.email"), emailsAlternativos: list(contact.emailsAlternativos, "contacto.emailsAlternativos").map((entry) => email(entry, "contacto.emailsAlternativos") as string), sitioWeb: compatibleUrl(contact.sitioWeb, previous?.contacto.sitioWeb, "contacto.sitioWeb") },
    redesSociales: { ...Object.fromEntries(SOCIAL_FIELDS.map((field) => [field, compatibleUrl(socials[field], previous?.redesSociales[field], `redesSociales.${field}`)])) as Omit<Proveedor["redesSociales"], "otras">, otras: otherSocials },
    ubicacion: { ...locationText, coordenadas: lat !== null && lng !== null ? { latitud: lat, longitud: lng } : null },
    imagenes: { portada: image(photos.portada, "imagenes.portada", "portada", 0), logo: image(photos.logo, "imagenes.logo", "logo", 0), galeria: ((photos.galeria || []) as unknown[]).map((entry, index) => image(entry, "imagenes.galeria", "galeria", index)).filter((entry): entry is ImagenProveedor => entry !== null) },
    cobertura: list(source.cobertura, "cobertura"), servicios: services,
    precio: { modalidad: modality, importe: amount, moneda: currency, unidad: unit as ProviderDraft["precio"]["unidad"], actualizadoEn: modality === "desde" ? priceChanged ? now : previous?.precio.actualizadoEn || now : null },
    contratacion: { anticipacion: text(hiring.anticipacion, "contratacion.anticipacion", 2000), incluye: text(hiring.incluye, "contratacion.incluye", 3000), duracion: text(hiring.duracion, "contratacion.duracion", 2000), reserva: text(hiring.reserva, "contratacion.reserva", 3000) },
    espacio: { capacidadMinima: minimum, capacidadMaxima: maximum, cubierto: nullableBoolean(venue.cubierto, "espacio.cubierto"), aireLibre: nullableBoolean(venue.aireLibre, "espacio.aireLibre"), caracteristicas: features, coordenadasVerificadas: venue.coordenadasVerificadas === true },
  };
}

/** Legacy import records are adapted without writes, validation or invented data. */
export function providerDraftFromDocument(document: RecordValue): ProviderDraft {
  const empty = normalizeProviderDraft({});
  const draft = { ...empty, ...Object.fromEntries(EDITABLE_FIELDS.filter((field) => field in document).map((field) => [field, document[field]])) } as ProviderDraft;
  draft.imagenes = { ...empty.imagenes, ...providerRecord(document.imagenes) } as ProviderDraft["imagenes"];
  return draft;
}
export function providerBetaMetadata(document: RecordValue): ProviderBetaMetadata {
  const beta = providerRecord(document.beta);
  return { version: 1, revision: Number.isInteger(beta.revision) ? Number(beta.revision) : 0,
    contenidoRevision: Number.isInteger(beta.contenidoRevision) ? Number(beta.contenidoRevision) : 0,
    estadoRevision: ["en_revision", "requiere_correcciones"].includes(String(beta.estadoRevision)) ? beta.estadoRevision as ProviderReviewStatus : "sin_cambios",
    pausaOrigen: beta.pausaOrigen === "responsable" ? "responsable" : document.estado === "pausado" ? "administracion" : null,
    motivoCorreccion: typeof beta.motivoCorreccion === "string" ? beta.motivoCorreccion : null,
    notasInternas: typeof beta.notasInternas === "string" ? beta.notasInternas : "" };
}
export function providerPublicationState(document: RecordValue): "borrador" | "publicada" | "pausada" | "archivada" {
  return document.estado === "publicado" ? "publicada" : document.estado === "pausado" ? "pausada" : document.estado === "eliminado" ? "archivada" : "borrador";
}
export function providerHasPendingChanges(document: RecordValue): boolean {
  const beta = providerBetaMetadata(document);
  return beta.estadoRevision !== "sin_cambios" || !document.aprobada || providerRecord(document.aprobada).revision !== beta.contenidoRevision;
}
export function providerPublicationIssues(draft: ProviderDraft): string[] {
  const missing: string[] = [];
  for (const key of ["nombre", "descripcionCorta", "descripcion"] as const) if (!draft[key]?.trim()) missing.push(key);
  if (!PROVIDER_CATEGORY_CATALOG.some((entry) => entry.documentId === draft.categoriaPrincipalId && entry.activa)) missing.push("categoriaPrincipalId");
  if (!draft.ubicacion.ciudad?.trim()) missing.push("ubicacion.ciudad");
  if (!draft.ubicacion.nivel1Nombre?.trim()) missing.push("ubicacion.nivel1Nombre");
  if (!/^\+[1-9]\d{7,14}$/.test(draft.contacto.whatsapp || "") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contacto.email || "")) missing.push("contacto");
  if (!VENUE_CATEGORY_IDS.includes(draft.categoriaPrincipalId || "") && !draft.cobertura.length) missing.push("cobertura");
  return missing;
}
function publicImage(value: ImagenProveedor | null | undefined): RecordValue | null {
  if (!value) return null;
  return { id: value.id, tipo: value.tipo, storagePath: value.storagePath, alt: value.alt, orden: value.orden, ancho: value.ancho, alto: value.alto, mimeType: value.mimeType };
}
/** This is the sole projection boundary, also used for the private preview. */
export function projectProviderPublicContent(draft: ProviderDraft): RecordValue {
  const venue = VENUE_CATEGORY_IDS.includes(draft.categoriaPrincipalId || "");
  const coordinates = draft.ubicacion.coordenadas;
  const verifiedCoordinates = draft.espacio.coordenadasVerificadas && coordinates &&
    typeof coordinates.latitud === "number" && Number.isFinite(coordinates.latitud) && Math.abs(coordinates.latitud) <= 90 &&
    typeof coordinates.longitud === "number" && Number.isFinite(coordinates.longitud) && Math.abs(coordinates.longitud) <= 180
    ? { latitud: coordinates.latitud, longitud: coordinates.longitud } : null;
  return {
    nombre: draft.nombre, categoriaPrincipalId: draft.categoriaPrincipalId, categoriaIds: [...draft.categoriaIds],
    descripcionCorta: draft.descripcionCorta, descripcion: draft.descripcion,
    contacto: { whatsapp: draft.contacto.whatsapp, email: draft.contacto.email, telefono: draft.contacto.telefonoNormalizado || draft.contacto.telefonoOriginal, sitioWeb: publicUrl(draft.contacto.sitioWeb) },
    redesSociales: { ...Object.fromEntries(SOCIAL_FIELDS.map((field) => [field, publicUrl(draft.redesSociales[field])])), otras: draft.redesSociales.otras.filter((entry) => publicUrl(entry.url)).map((entry) => ({ tipo: entry.tipo, url: publicUrl(entry.url) })) },
    ubicacion: { ciudad: draft.ubicacion.ciudad, provincia: draft.ubicacion.nivel1Nombre, pais: draft.ubicacion.paisNombre, paisCodigo: draft.ubicacion.paisCodigo,
      ...(venue ? { direccion: draft.ubicacion.direccionCompleta, coordenadas: verifiedCoordinates } : {}) },
    cobertura: [...draft.cobertura], servicios: [...draft.servicios],
    precio: { modalidad: draft.precio.modalidad, importe: draft.precio.importe, moneda: draft.precio.moneda, unidad: draft.precio.unidad, actualizadoEn: draft.precio.actualizadoEn },
    contratacion: Object.fromEntries((["anticipacion", "incluye", "duracion", "reserva"] as const).filter((key) => typeof draft.contratacion[key] === "string" && draft.contratacion[key].trim()).map((key) => [key, draft.contratacion[key]])),
    ...(venue ? { espacio: { capacidadMinima: draft.espacio.capacidadMinima, capacidadMaxima: draft.espacio.capacidadMaxima, cubierto: draft.espacio.cubierto, aireLibre: draft.espacio.aireLibre, caracteristicas: [...draft.espacio.caracteristicas] } } : {}),
    imagenes: { portada: publicImage(draft.imagenes.portada), logo: publicImage(draft.imagenes.logo), galeria: draft.imagenes.galeria.map(publicImage) },
  };
}

/** Snapshot reads pass through the same public allowlist as fresh drafts. */
export function sanitizeProviderPublicSnapshot(value: unknown): RecordValue {
  const source = providerRecord(value);
  const contact = providerRecord(source.contacto);
  const location = providerRecord(source.ubicacion);
  const draft = providerDraftFromDocument({ ...source,
    contacto: { whatsapp: contact.whatsapp ?? null, email: contact.email ?? null, telefonoOriginal: contact.telefono ?? null, telefonoNormalizado: null, sitioWeb: contact.sitioWeb ?? null, emailsAlternativos: [] },
    ubicacion: { ...normalizeProviderDraft({}).ubicacion, ciudad: location.ciudad ?? null, nivel1Nombre: location.provincia ?? null, paisNombre: location.pais ?? null, paisCodigo: location.paisCodigo ?? null, direccionCompleta: location.direccion ?? null, coordenadas: location.coordenadas ?? null },
    espacio: { ...normalizeProviderDraft({}).espacio, ...providerRecord(source.espacio), coordenadasVerificadas: Boolean(location.coordenadas) },
  });
  return projectProviderPublicContent(draft);
}

export function createProviderBetaDocument(draft: ProviderDraft, id: string, actorUid: string, now: Date, notes: unknown = ""): ProviderBetaDocument {
  return {
    schemaVersion: 3, ...draft, nombreNormalizado: normalizeSearchText(draft.nombre), slug: `prov-${id}`,
    estado: "borrador", activo: true, visible: false,
    validacion: { estado: "no_validado", metodo: null, validadoEn: null, validadoPor: null },
    propietario: { reclamado: false, userId: null, reclamadoEn: null },
    revisionManual: { requerida: false, motivos: [], revisadaEn: null, revisadaPor: null, notas: null },
    fuente: { tipo: "manual", sitio: null, origen: null, urlOriginal: null, urlOriginalNormalizada: null, idExterno: null, categoriaOriginal: null, tipoSchemaOriginal: null, fuenteExtraccionOriginal: null, versionArchivoOrigen: null, fechaArchivoOrigen: null, motivoArchivoOrigen: null, archivoOrigen: null, importadoEn: null },
    importacion: { version: 1, datosImportados: false, descripcionImportada: false, portadaImportada: false, galeriaImportada: false, cantidadImagenes: 0, ultimoIntentoEn: null, ultimoError: null, completadaEn: null },
    creadoEn: now, actualizadoEn: now, publicadoEn: null,
    beta: { version: 1, revision: 1, contenidoRevision: 1, estadoRevision: "sin_cambios", pausaOrigen: null, motivoCorreccion: null, notasInternas: text(notes, "internalNotes", 10000) },
    revisionPendiente: null, aprobada: null,
  };
}

export function transitionProviderBeta(document: RecordValue, input: { operation: ProviderBetaOperation; expectedRevision: unknown; draft?: unknown; reviewRevision?: unknown; reason?: unknown; internalNotes?: unknown }, actorUid: string, now: Date): { document: ProviderBetaDocument; changedFields: string[]; reason: string | null } {
  const previous = providerBetaMetadata(document);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== previous.revision) throw new ProviderBetaError("aborted", "Otra persona modificó esta ficha. Recargala antes de continuar.");
  const revision = previous.revision + 1;
  const next = { ...document, schemaVersion: 3, visible: false, actualizadoEn: now, beta: { ...previous, revision }, revisionPendiente: document.revisionPendiente || null, aprobada: document.aprobada || null } as ProviderBetaDocument;
  const reason = nullableText(input.reason, "reason", 2000);
  let changedFields: string[] = [];
  if (["requestChanges", "pause", "archive"].includes(input.operation) && !reason) throw new ProviderBetaError("invalid-argument", "Indicá el motivo de esta acción.", ["reason"]);
  if (input.operation === "save") {
    const before = providerDraftFromDocument(document);
    const draft = normalizeProviderDraft(input.draft, before, now);
    Object.assign(next, draft, { nombreNormalizado: normalizeSearchText(draft.nombre) });
    if (JSON.stringify(projectProviderPublicContent(before)) !== JSON.stringify(projectProviderPublicContent(draft))) next.beta.contenidoRevision = revision;
    if (input.internalNotes !== undefined) next.beta.notasInternas = text(input.internalNotes, "internalNotes", 10000);
    changedFields = EDITABLE_FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(draft[field]));
    if (next.beta.notasInternas !== previous.notasInternas) changedFields.push("notasInternas");
  } else if (input.operation === "submit") {
    const draft = providerDraftFromDocument(document);
    const issues = providerPublicationIssues(draft);
    if (issues.length) throw new ProviderBetaError("failed-precondition", "Completá los datos requeridos antes de enviar a revisión.", issues);
    next.revisionPendiente = { revision: previous.contenidoRevision, contenido: projectProviderPublicContent(draft), enviadaEn: now, enviadaPor: actorUid };
    next.beta.estadoRevision = "en_revision";
    next.beta.motivoCorreccion = null;
    changedFields = ["revisionPendiente"];
  } else if (input.operation === "approve") {
    const pending = providerRecord(document.revisionPendiente);
    if (previous.estadoRevision !== "en_revision" || pending.revision !== input.reviewRevision || pending.revision !== previous.contenidoRevision) throw new ProviderBetaError("aborted", "El contenido cambió o la revisión ya no está vigente. Revisá y enviá nuevamente.");
    const issues = providerPublicationIssues(providerDraftFromDocument(document));
    if (issues.length) throw new ProviderBetaError("failed-precondition", "La ficha no cumple los requisitos de aprobación.", issues);
    next.aprobada = { revision: Number(pending.revision), contenido: sanitizeProviderPublicSnapshot(pending.contenido), aprobadaEn: now, aprobadaPor: actorUid };
    next.revisionPendiente = null;
    next.beta.estadoRevision = "sin_cambios";
    next.beta.motivoCorreccion = null;
    if (providerRecord(document.validacion).estado === "suspendido" && document.estado !== "eliminado") {
      next.estado = "pausado"; next.beta.pausaOrigen = "administracion";
    } else if (!["pausado", "eliminado"].includes(String(document.estado))) next.estado = "publicado";
    next.publicadoEn = document.publicadoEn || now;
    changedFields = ["aprobada", "revisionPendiente", "estado"];
  } else if (input.operation === "requestChanges") {
    if (previous.estadoRevision !== "en_revision") throw new ProviderBetaError("failed-precondition", "No hay una revisión pendiente.");
    next.beta.estadoRevision = "requiere_correcciones";
    next.beta.motivoCorreccion = reason;
    changedFields = ["estadoRevision", "motivoCorreccion"];
  } else if (input.operation === "pause") {
    if (document.estado === "eliminado") throw new ProviderBetaError("failed-precondition", "La ficha está archivada.");
    next.estado = "pausado";
    next.beta.pausaOrigen = "administracion";
    changedFields = ["estado", "pausaOrigen"];
  } else if (input.operation === "archive") {
    next.estado = "eliminado"; next.activo = false;
    changedFields = ["estado", "activo"];
  } else if (input.operation === "resume") {
    if (document.estado !== "pausado" || !document.aprobada || providerRecord(document.validacion).estado === "suspendido") throw new ProviderBetaError("failed-precondition", "Sólo puede reactivarse una ficha pausada con versión aprobada y sin restricción vigente.");
    next.estado = "publicado"; next.activo = true; next.beta.pausaOrigen = null;
    changedFields = ["estado", "pausaOrigen"];
  }
  return { document: next, changedFields, reason };
}

export function providerBetaControls(value: unknown): { panelEnabled: boolean; privateDirectoryEnabled: boolean; onboardingEnabled: boolean; directoryEnabled: boolean } {
  const config = providerRecord(value);
  // Public delivery and onboarding are intentionally unimplemented in milestone 1.
  return { panelEnabled: config.panelEnabled === true, privateDirectoryEnabled: config.privateDirectoryEnabled === true, onboardingEnabled: false, directoryEnabled: false };
}
