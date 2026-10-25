import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { requireSuperAdmin } from "../auth/adminAuth";
import { PROVIDER_CATEGORY_CATALOG } from "./config";
import { PROVIDER_BETA_CONFIG_PATH, PROVIDER_SERVICES, PROVIDER_VENUE_FEATURES, VENUE_CATEGORY_IDS, providerBetaControls, providerRecord } from "./betaModel";
import { approvedDirectoryProvider, directoryContent, directoryProviderId, normalizeDirectoryFilters, scanDirectoryPage, serializeDirectory, type DirectoryCategory } from "./directoryModel";

export async function requirePrivateDirectory(db: Firestore): Promise<void> {
  const config = await db.doc(PROVIDER_BETA_CONFIG_PATH).get();
  if (!providerBetaControls(config.data()).privateDirectoryEnabled) throw new HttpsError("permission-denied", "El directorio privado todavía no está habilitado.");
}
export async function readDirectoryCategories(db: Firestore): Promise<DirectoryCategory[]> {
  const snapshot = await db.collection("categorias_proveedores").where("activa", "==", true).get();
  const known = new Set<string>(PROVIDER_CATEGORY_CATALOG.map(category => category.documentId));
  return snapshot.docs.flatMap(document => {
    const data = document.data();
    if (!known.has(document.id) || data.slug !== document.id || typeof data.nombre !== "string" || !data.nombre.trim()) return [];
    return [{ id: document.id, nombre: data.nombre, orden: typeof data.orden === "number" ? data.orden : 0,
      tipo: VENUE_CATEGORY_IDS.includes(document.id) ? "lugar" as const : "profesional" as const }];
  }).sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
}
export async function readApprovedDirectoryProvider(db: Firestore, id: string, categories?: DirectoryCategory[]) {
  const snapshot = await db.doc(`proveedores/${id}`).get();
  const approved = snapshot.exists ? approvedDirectoryProvider(id, snapshot.data() || {}, categories || await readDirectoryCategories(db)) : null;
  if (!approved) throw new HttpsError("not-found", "Esta ficha no está disponible en el directorio privado.");
  return approved;
}
export async function providerDirectoryHandler(request: CallableRequest<unknown>, db: Firestore): Promise<unknown> {
  requireSuperAdmin(request);
  const data = providerRecord(request.data);
  if (data.operation === "access") {
    const config = await db.doc(PROVIDER_BETA_CONFIG_PATH).get();
    return { enabled: providerBetaControls(config.data()).privateDirectoryEnabled, mode: "private", publicEnabled: false };
  }
  await requirePrivateDirectory(db);
  const categories = await readDirectoryCategories(db);
  if (data.operation === "catalog") return { categories, services: PROVIDER_SERVICES, features: PROVIDER_VENUE_FEATURES };
  if (data.operation === "get") {
    const provider = await readApprovedDirectoryProvider(db, directoryProviderId(data.id), categories);
    return serializeDirectory({ id: provider.id, approvedRevision: provider.approvedRevision, content: directoryContent(provider.content), private: true });
  }
  if (data.operation === "list") {
    const filters = normalizeDirectoryFilters(data, categories);
    const result = await scanDirectoryPage(async (after, limit) => {
      // Single-field equality + document ID ordering uses the existing index.
      // A one-document lookahead distinguishes exact batch ends without a false partial page.
      let query = db.collection("proveedores").where("estado", "==", "publicado").orderBy(FieldPath.documentId())
        .select("estado", "activo", "validacion.estado", "aprobada").limit(limit + 1);
      if (after) query = query.startAfter(after);
      const snapshot = await query.get();
      return { records: snapshot.docs.slice(0, limit).map(document => ({ id: document.id, data: document.data() })), exhausted: snapshot.size <= limit };
    }, filters, categories, data.cursor);
    return serializeDirectory(result);
  }
  throw new HttpsError("invalid-argument", "Operación de directorio inválida.");
}
