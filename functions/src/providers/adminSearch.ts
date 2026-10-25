import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { providerBetaMetadata, providerHasPendingChanges, providerPublicationState, providerRecord } from "./betaModel";
import { normalizeSearchText } from "./normalization";

type Data = Record<string, unknown>;
const ORDER = "documentId:asc";
const SCOPE = "adminProvidersV1:list";
const ID = /^[A-Za-z0-9_-]{1,160}$/;
export const ADMIN_SEARCH_LIMITS = Object.freeze({ examined: 5000, received: 5050, queries: 50, batch: 100, timeoutMs: 20000, responseBytes: 256 * 1024 });
export class ProviderAdminSearchError extends Error {
  constructor(public readonly code: "invalid-argument" | "resource-exhausted" | "deadline-exceeded" | "internal", message: string) { super(message); }
}
export type AdminSearchFilters = { search: string; city: string; categoryId: string; publication: string; owner: string; pending: boolean | null; pageSize: number };
export type AdminSearchBatch = { records: { id: string; data: Data }[]; exhausted: boolean; received: number };
type FetchBatch = (after: string | null, limit: number) => Promise<AdminSearchBatch>;

function invalid(message: string): never { throw new ProviderAdminSearchError("invalid-argument", message); }
function textFilter(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 200) return invalid("La búsqueda y localidad deben tener hasta 200 caracteres.");
  return normalizeSearchText(value);
}
function choice(value: unknown, allowed: string[], name: string): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || !allowed.includes(value)) return invalid(`Filtro de ${name} inválido.`);
  return value;
}
export function normalizeAdminSearchFilters(data: Data): AdminSearchFilters {
  const pageSize = data.pageSize == null ? 20 : data.pageSize;
  if (!Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 50) return invalid("Tamaño de página inválido.");
  const categoryId = data.categoryId == null || data.categoryId === "" ? "" : data.categoryId;
  if (typeof categoryId !== "string" || (categoryId && !ID.test(categoryId))) return invalid("Filtro de categoría inválido.");
  if (data.pending != null && typeof data.pending !== "boolean") return invalid("Filtro de pendientes inválido.");
  if (data.order != null && data.order !== ORDER) return invalid("Orden de búsqueda inválido.");
  return { search: textFilter(data.search), city: textFilter(data.city), categoryId,
    publication: choice(data.publication, ["borrador", "publicada", "pausada", "archivada"], "publicación"),
    owner: choice(data.owner, ["plataforma", "responsable"], "responsable"), pending: data.pending == null ? null : data.pending as boolean, pageSize: Number(pageSize) };
}
function filterHash(filters: AdminSearchFilters): string { return createHash("sha256").update(JSON.stringify(filters)).digest("hex"); }
export function encodeAdminSearchCursor(lastId: string, filters: AdminSearchFilters): string {
  return Buffer.from(JSON.stringify({ version: 1, scope: SCOPE, order: ORDER, lastId, filters: filterHash(filters) })).toString("base64url");
}
export function decodeAdminSearchCursor(cursor: unknown, filters: AdminSearchFilters): string | null {
  if (cursor == null || cursor === "") return null;
  try {
    if (typeof cursor !== "string" || cursor.length > 800 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value = providerRecord(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (Object.keys(value).sort().join() !== "filters,lastId,order,scope,version" || value.version !== 1 || value.scope !== SCOPE || value.order !== ORDER || value.filters !== filterHash(filters) || typeof value.lastId !== "string" || !ID.test(value.lastId)) throw new Error();
    return value.lastId;
  } catch { return invalid("La página no corresponde a esta búsqueda. Volvé al inicio y aplicá los filtros nuevamente."); }
}
export function adminSearchSummary(id: string, document: Data): Data {
  const beta = providerBetaMetadata(document);
  return { id, nombre: document.nombre || "Sin nombre", categoriaPrincipalId: document.categoriaPrincipalId || null,
    ciudad: providerRecord(document.ubicacion).ciudad || null, email: providerRecord(document.contacto).email || null,
    publication: providerPublicationState(document), reviewStatus: beta.estadoRevision,
    ownerUserId: providerRecord(document.propietario).userId || null, revision: beta.revision, hasPendingChanges: providerHasPendingChanges(document) };
}
export function matchesAdminSearch(document: Data, entry: Data, filters: AdminSearchFilters): boolean {
  const contact = providerRecord(document.contacto);
  const searchable = normalizeSearchText([document.nombre, contact.email, ...(Array.isArray(contact.emailsAlternativos) ? contact.emailsAlternativos : [])].join(" "));
  return (!filters.search || searchable.includes(filters.search)) &&
    (!filters.categoryId || document.categoriaPrincipalId === filters.categoryId || (Array.isArray(document.categoriaIds) && document.categoriaIds.includes(filters.categoryId))) &&
    (!filters.city || normalizeSearchText(entry.ciudad).includes(filters.city)) &&
    (!filters.publication || filters.publication === entry.publication) &&
    (filters.owner !== "plataforma" || !entry.ownerUserId) && (filters.owner !== "responsable" || Boolean(entry.ownerUserId)) &&
    (filters.pending === null || entry.hasPendingChanges === filters.pending);
}
function timedOut(): ProviderAdminSearchError { return new ProviderAdminSearchError("deadline-exceeded", "La búsqueda agotó el tiempo disponible. Intentá nuevamente o contactá a administración."); }
function response(items: Data[], nextCursor: string | null, scanned: number): { items: Data[]; nextCursor: string | null; scanned: number } {
  const result = { items, nextCursor, scanned };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > ADMIN_SEARCH_LIMITS.responseBytes) throw new ProviderAdminSearchError("resource-exhausted", "El resultado supera el tamaño permitido. Intentá con una página menor o contactá a administración.");
  return result;
}

/** Read-only matching pages. The transport and verified authorization stay in betaService. */
export async function searchAdminProviders(fetchBatch: FetchBatch, filters: AdminSearchFilters, cursor: unknown, now: () => number = () => performance.now()): Promise<{ items: Data[]; nextCursor: string | null; scanned: number }> {
  let after = decodeAdminSearchCursor(cursor, filters), scanned = 0, received = 0, queries = 0;
  const deadline = now() + ADMIN_SEARCH_LIMITS.timeoutMs;
  const items: Data[] = [];
  let lastDelivered: string | null = null;
  while (scanned < ADMIN_SEARCH_LIMITS.examined) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) throw timedOut();
    const limit = Math.min(ADMIN_SEARCH_LIMITS.batch, ADMIN_SEARCH_LIMITS.examined - scanned);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let batch: AdminSearchBatch;
    try {
      // A timed-out get may finish its bounded read in the SDK; no subsequent
      // batch is scheduled and no partial response or mutation is produced.
      batch = await Promise.race([fetchBatch(after, limit), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timedOut()), remainingMs); })]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
    if (now() >= deadline) throw timedOut();
    queries += 1; received += batch.received;
    if (!Number.isInteger(batch.received) || batch.received < batch.records.length || batch.received > limit + 1 || batch.records.length > limit || received > ADMIN_SEARCH_LIMITS.received || queries > ADMIN_SEARCH_LIMITS.queries) throw new ProviderAdminSearchError("internal", "No se pudo completar la búsqueda.");
    for (const record of batch.records) {
      if (now() >= deadline) throw timedOut();
      scanned += 1; after = record.id;
      const entry = adminSearchSummary(record.id, record.data);
      if (!matchesAdminSearch(record.data, entry, filters)) continue;
      if (items.length === filters.pageSize) return response(items, encodeAdminSearchCursor(lastDelivered!, filters), scanned);
      items.push(entry); lastDelivered = record.id;
      response(items, null, scanned);
    }
    if (batch.exhausted) return response(items, null, scanned);
    if (!batch.records.length) throw new ProviderAdminSearchError("internal", "No se pudo continuar la búsqueda.");
  }
  throw new ProviderAdminSearchError("resource-exhausted", "La búsqueda supera el límite de esta beta. Intentá nuevamente o contactá a administración.");
}
