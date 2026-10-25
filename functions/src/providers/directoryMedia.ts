import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { isSuperAdmin } from "../auth/adminAuth";
import { ensureAdminApp } from "../firebaseAdmin";
import { PROVIDER_IMAGE_MIME_TYPES } from "./config";
import { providerRecord } from "./betaModel";
import { isProviderMediaPath } from "./betaMedia";
import { directoryProviderId, type ApprovedDirectoryProvider } from "./directoryModel";
import { readApprovedDirectoryProvider, requirePrivateDirectory } from "./directoryService";

export function approvedDirectoryImagePath(provider: ApprovedDirectoryProvider, imageId: unknown, revision: unknown): string {
  const id = directoryProviderId(imageId);
  if (typeof revision !== "string" || !/^[1-9]\d*$/.test(revision) || Number(revision) !== provider.approvedRevision) throw new HttpsError("not-found", "La versión de esta imagen ya no está disponible.");
  const images = providerRecord(provider.content.imagenes);
  const candidates = [images.portada, images.logo, ...(Array.isArray(images.galeria) ? images.galeria : [])].map(providerRecord);
  const image = candidates.find(candidate => candidate.id === id);
  if (!image || !isProviderMediaPath(provider.id, image.storagePath)) throw new HttpsError("not-found", "La imagen no forma parte de la versión aprobada.");
  return image.storagePath;
}
const HTTP_STATUS: Record<string, number> = { "unauthenticated": 401, "permission-denied": 403, "not-found": 404, "invalid-argument": 400 };
export const providerDirectoryImageV1 = onRequest({
  region: "us-central1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 3,
  cors: ["https://reservaeldia.com.ar", /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
}, async (request, response) => {
  response.set("Cache-Control", "private, no-store");
  response.set("X-Content-Type-Options", "nosniff");
  response.set("Vary", "Authorization, Origin");
  if (request.method !== "GET") { response.set("Allow", "GET").status(405).end(); return; }
  try {
    const app = ensureAdminApp();
    const bearer = /^Bearer (\S+)$/.exec(request.get("authorization") || "");
    if (!bearer) throw new HttpsError("unauthenticated", "Iniciá sesión.");
    let uid: string;
    try { uid = (await getAuth(app).verifyIdToken(bearer[1], true)).uid; }
    catch { throw new HttpsError("unauthenticated", "La sesión no es válida."); }
    if (!isSuperAdmin(uid)) throw new HttpsError("permission-denied", "Acceso administrativo requerido.");
    const db = getFirestore(app);
    await requirePrivateDirectory(db);
    const provider = await readApprovedDirectoryProvider(db, directoryProviderId(request.query.providerId));
    const path = approvedDirectoryImagePath(provider, request.query.imageId, request.query.approvedRevision);
    const file = getStorage(app).bucket().file(path);
    const [metadata] = await file.getMetadata();
    const type = String(metadata.contentType || "");
    if (!PROVIDER_IMAGE_MIME_TYPES.some(mime => mime === type)) throw new HttpsError("not-found", "La imagen no está disponible.");
    response.type(type);
    await new Promise<void>((resolve, reject) => {
      const stream = file.createReadStream();
      stream.on("error", reject);
      response.on("finish", resolve);
      response.on("close", () => { stream.destroy(); resolve(); });
      stream.pipe(response);
    });
  } catch (error) {
    if (response.headersSent) { response.end(); return; }
    const code = error instanceof HttpsError ? error.code : (error as { code?: unknown })?.code === 404 ? "not-found" : "internal";
    response.status(HTTP_STATUS[code] || 500).json({ error: { code, message: error instanceof HttpsError ? error.message : "No se pudo obtener la imagen privada." } });
  }
});
