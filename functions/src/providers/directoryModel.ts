import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { providerRecord, sanitizeProviderPublicSnapshot, VENUE_CATEGORY_IDS } from "./betaModel";
import { normalizeSearchText } from "./normalization";
import { directoryRegionExists, matchesDirectoryRegion } from "./directoryRegions";

type Data = Record<string, unknown>;
export type DirectoryCategory = { id: string; nombre: string; orden: number; tipo: "lugar" | "profesional" };
export type DirectoryFilters = { kind: "lugar" | "profesional"; search: string; location: string; categoryId: string; minCapacity: number | null; regionId: string; guests: number | null; pageSize: number };
export type ApprovedDirectoryProvider = { id: string; approvedRevision: number; content: Data };
export const DIRECTORY_SCAN_LIMIT = 5000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;

export function directoryProviderId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw new HttpsError("invalid-argument", "Identificador de ficha inválido.");
  return value;
}
function filterText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 200) throw new HttpsError("invalid-argument", "Filtro de búsqueda inválido.");
  return normalizeSearchText(value);
}
export function normalizeDirectoryFilters(data: Data, categories: DirectoryCategory[]): DirectoryFilters {
  if (data.kind !== "lugar" && data.kind !== "profesional") throw new HttpsError("invalid-argument", "Elegí lugares o profesionales.");
  const pageSize = data.pageSize == null ? 12 : data.pageSize;
  if (!Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 24) throw new HttpsError("invalid-argument", "Tamaño de página inválido.");
  const categoryId = data.categoryId == null || data.categoryId === "" ? "" : directoryProviderId(data.categoryId);
  if (categoryId && !categories.some(category => category.id === categoryId && category.tipo === data.kind)) throw new HttpsError("invalid-argument", "La categoría no está disponible en este directorio.");
  const minCapacity = data.minCapacity == null || data.minCapacity === "" ? null : data.minCapacity;
  if (minCapacity !== null && (data.kind !== "lugar" || !Number.isSafeInteger(minCapacity) || Number(minCapacity) < 1 || Number(minCapacity) > 100000)) throw new HttpsError("invalid-argument", "La capacidad debe ser un número entero positivo para lugares.");
  const regionId = data.regionId == null || data.regionId === "" ? "" : data.regionId;
  if (typeof regionId !== "string" || (regionId && (data.kind !== "lugar" || !directoryRegionExists(regionId)))) throw new HttpsError("invalid-argument", "Elegí una zona de Argentina disponible.");
  const guests = data.guests == null || data.guests === "" ? null : data.guests;
  if (guests !== null && (data.kind !== "lugar" || !Number.isSafeInteger(guests) || Number(guests) < 1 || Number(guests) > 100000)) throw new HttpsError("invalid-argument", "La cantidad de invitados debe ser un número entero positivo.");
  return { kind: data.kind, search: filterText(data.search), location: filterText(data.location), categoryId, minCapacity: minCapacity === null ? null : Number(minCapacity), regionId, guests: guests === null ? null : Number(guests), pageSize: Number(pageSize) };
}
function filterHash(filters: DirectoryFilters): string {
  const { regionId, guests, ...legacy } = filters;
  // Existing clients keep valid cursors when neither new venue criterion applies.
  return createHash("sha256").update(JSON.stringify(!regionId && guests === null ? legacy : filters)).digest("hex");
}
export function encodeDirectoryCursor(lastId: string, filters: DirectoryFilters): string {
  return Buffer.from(JSON.stringify({ version: 1, lastId: directoryProviderId(lastId), filters: filterHash(filters) })).toString("base64url");
}
export function decodeDirectoryCursor(cursor: unknown, filters: DirectoryFilters): string | null {
  if (cursor == null || cursor === "") return null;
  try {
    if (typeof cursor !== "string" || cursor.length > 600 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const decoded = providerRecord(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (decoded.version !== 1 || decoded.filters !== filterHash(filters) || Object.keys(decoded).sort().join() !== "filters,lastId,version") throw new Error();
    return directoryProviderId(decoded.lastId);
  } catch { throw new HttpsError("invalid-argument", "La página no corresponde a estos filtros. Volvé al inicio de la búsqueda."); }
}
function filled(value: unknown): value is string { return typeof value === "string" && Boolean(value.trim()); }
function optionalString(value: unknown): boolean { return value == null || typeof value === "string"; }
function stringArray(value: unknown): boolean { return Array.isArray(value) && value.every(entry => typeof entry === "string"); }
function optionalNumber(value: unknown): boolean { return value == null || (typeof value === "number" && Number.isFinite(value)); }
function hasPublicValueTypes(content: Data): boolean {
  const contact = providerRecord(content.contacto), location = providerRecord(content.ubicacion), price = providerRecord(content.precio);
  const social = providerRecord(content.redesSociales), space = providerRecord(content.espacio);
  const priceDate = price.actualizadoEn;
  return Object.values(contact).every(optionalString) &&
    Object.entries(location).every(([key, value]) => key === "coordenadas" || optionalString(value)) &&
    Object.entries(social).every(([key, value]) => key === "otras" ? Array.isArray(value) && value.every(entry => {
      const item = providerRecord(entry); return typeof item.tipo === "string" && typeof item.url === "string";
    }) : optionalString(value)) &&
    [content.categoriaIds, content.cobertura, content.servicios].every(stringArray) &&
    ["consultar", "desde"].includes(String(price.modalidad)) && optionalNumber(price.importe) && optionalString(price.moneda) && optionalString(price.unidad) &&
    (priceDate == null || priceDate instanceof Date || typeof (priceDate as { toDate?: unknown })?.toDate === "function") &&
    optionalNumber(space.capacidadMinima) && optionalNumber(space.capacidadMaxima) &&
    [space.cubierto, space.aireLibre].every(value => value == null || typeof value === "boolean") &&
    (!content.espacio || stringArray(space.caracteristicas));
}

/** Eligibility reads current lifecycle, but presentation reads exclusively the approved snapshot. */
export function approvedDirectoryProvider(id: string, document: Data, categories: DirectoryCategory[]): ApprovedDirectoryProvider | null {
  if (document.estado !== "publicado" || document.activo !== true || providerRecord(document.validacion).estado === "suspendido") return null;
  const approved = providerRecord(document.aprobada);
  if (!Number.isSafeInteger(approved.revision) || Number(approved.revision) < 1 || !approved.contenido) return null;
  try {
    const content = sanitizeProviderPublicSnapshot(approved.contenido);
    const category = categories.find(entry => entry.id === content.categoriaPrincipalId);
    const location = providerRecord(content.ubicacion), contact = providerRecord(content.contacto);
    if (!category || !hasPublicValueTypes(content) || ![content.nombre, content.descripcionCorta, content.descripcion, location.ciudad, location.provincia].every(filled)) return null;
    if (!/^\+[1-9]\d{7,14}$/.test(String(contact.whatsapp || "")) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contact.email || ""))) return null;
    if (category.tipo === "profesional" && !(Array.isArray(content.cobertura) && content.cobertura.some(filled))) return null;
    return { id: directoryProviderId(id), approvedRevision: Number(approved.revision), content };
  } catch { return null; }
}
export function matchesDirectoryFilters(provider: ApprovedDirectoryProvider, filters: DirectoryFilters): boolean {
  const content = provider.content, location = providerRecord(content.ubicacion);
  const venue = VENUE_CATEGORY_IDS.includes(String(content.categoriaPrincipalId));
  if ((venue ? "lugar" : "profesional") !== filters.kind) return false;
  if (filters.categoryId && !(Array.isArray(content.categoriaIds) && content.categoriaIds.includes(filters.categoryId))) return false;
  const capacity = providerRecord(content.espacio).capacidadMaxima;
  if (filters.minCapacity !== null && !(typeof capacity === "number" && Number.isFinite(capacity) && capacity >= filters.minCapacity)) return false;
  if (filters.guests !== null) {
    const minimum = providerRecord(content.espacio).capacidadMinima;
    if (!(typeof capacity === "number" && Number.isFinite(capacity) && capacity >= filters.guests)) return false;
    if (typeof minimum === "number" && Number.isFinite(minimum) && minimum > filters.guests) return false;
  }
  if (!matchesDirectoryRegion(location, filters.regionId)) return false;
  if (filters.search && !normalizeSearchText([content.nombre, content.descripcionCorta].join(" ")).includes(filters.search)) return false;
  const serviceAreas = !venue && Array.isArray(content.cobertura) ? content.cobertura : [];
  return !filters.location || normalizeSearchText([location.ciudad, location.provincia, ...serviceAreas].join(" ")).includes(filters.location);
}

export function directoryImageDescriptor(value: unknown): Data | null {
  const image = providerRecord(value);
  if (typeof image.id !== "string" || !ID.test(image.id)) return null;
  return { id: image.id, tipo: ["portada", "logo", "galeria"].includes(String(image.tipo)) ? image.tipo : "galeria", alt: typeof image.alt === "string" ? image.alt : "",
    orden: Number.isSafeInteger(image.orden) && Number(image.orden) >= 0 ? image.orden : 0,
    ancho: typeof image.ancho === "number" && image.ancho > 0 ? image.ancho : null,
    alto: typeof image.alto === "number" && image.alto > 0 ? image.alto : null, mimeType: typeof image.mimeType === "string" ? image.mimeType : null };
}
export function directoryContent(content: Data): Data {
  const images = providerRecord(content.imagenes);
  return { ...content, imagenes: { portada: directoryImageDescriptor(images.portada), logo: directoryImageDescriptor(images.logo),
    galeria: Array.isArray(images.galeria) ? images.galeria.map(directoryImageDescriptor).filter(Boolean) : [] } };
}
export function directorySummary(provider: ApprovedDirectoryProvider): Data {
  const content = directoryContent(provider.content);
  return { id: provider.id, approvedRevision: provider.approvedRevision, nombre: content.nombre,
    categoriaPrincipalId: content.categoriaPrincipalId, categoriaIds: content.categoriaIds,
    descripcionCorta: content.descripcionCorta, ubicacion: content.ubicacion, cobertura: content.cobertura,
    precio: content.precio, ...(content.espacio ? { espacio: content.espacio } : {}), portada: providerRecord(content.imagenes).portada };
}

export type DirectoryBatch = { records: { id: string; data: Data }[]; exhausted: boolean };
/** Fill pages across excluded records, with one matching lookahead and an explicit work bound. */
export async function scanDirectoryPage(fetchBatch: (after: string | null, limit: number) => Promise<DirectoryBatch>, filters: DirectoryFilters, categories: DirectoryCategory[], cursor: unknown) {
  let after = decodeDirectoryCursor(cursor, filters), scanned = 0;
  const items: Data[] = [];
  let lastDelivered: string | null = null;
  while (scanned < DIRECTORY_SCAN_LIMIT) {
    const batch = await fetchBatch(after, Math.min(100, DIRECTORY_SCAN_LIMIT - scanned));
    for (const record of batch.records) {
      scanned += 1; after = record.id;
      const provider = approvedDirectoryProvider(record.id, record.data, categories);
      if (!provider || !matchesDirectoryFilters(provider, filters)) continue;
      if (items.length === filters.pageSize) return { items, nextCursor: encodeDirectoryCursor(lastDelivered!, filters), hasMore: true };
      items.push(directorySummary(provider)); lastDelivered = record.id;
    }
    if (batch.exhausted) return { items, nextCursor: null, hasMore: false };
    if (!batch.records.length) throw new HttpsError("internal", "No se pudo continuar la búsqueda.");
  }
  throw new HttpsError("resource-exhausted", "La búsqueda supera el límite de esta beta. Volvé a intentarlo o contactá a administración.");
}

export function serializeDirectory(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate(): Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeDirectory);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeDirectory(entry)]));
  return value;
}
