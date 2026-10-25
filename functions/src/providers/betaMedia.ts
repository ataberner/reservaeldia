import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import sharp from "sharp";
import { isSuperAdmin } from "../auth/adminAuth";
import { ensureAdminApp } from "../firebaseAdmin";
import { PROVIDER_IMAGE_MAX_BYTES, PROVIDER_IMAGE_MIME_TYPES } from "./config";
import { providerBetaControls, PROVIDER_BETA_CONFIG_PATH } from "./betaModel";
import type { ImagenProveedor, Proveedor } from "./types";

type ImageSet = Proveedor["imagenes"];

export function requireProviderMediaId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) {
    throw new HttpsError("invalid-argument", "Identificador de ficha inválido.");
  }
  return value;
}

export function isProviderMediaPath(providerId: string, path: unknown): path is string {
  if (typeof path !== "string" || path.length > 300) return false;
  const prefix = `proveedores/${providerId}/`;
  return path.startsWith(prefix) &&
    /^(portada|galeria|media)\/[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.(jpg|jpeg|png|webp|gif|avif)$/.test(path.slice(prefix.length));
}

function imageList(images: ImageSet | undefined): ImagenProveedor[] {
  return images ? [images.portada, images.logo, ...images.galeria].filter(
    (image): image is ImagenProveedor => Boolean(image)
  ) : [];
}

/** Trust metadata from existing records/the upload ledger, never a browser URL. */
export async function verifyProviderImageReferences(
  transaction: Transaction,
  db: Firestore,
  providerId: string,
  images: ImageSet,
  current: { imagenes?: ImageSet }
): Promise<ImageSet> {
  const existing = imageList(current.imagenes);
  const result = new Map<string, ImagenProveedor>();
  for (const image of imageList(images)) {
    if (!isProviderMediaPath(providerId, image.storagePath)) {
      throw new HttpsError("invalid-argument", "La imagen no pertenece a esta ficha.");
    }
    let trusted = existing.find(entry => entry.id === image.id && entry.storagePath === image.storagePath);
    if (!trusted) {
      const id = requireProviderMediaId(image.id);
      const record = await transaction.get(db.doc(`proveedores/${providerId}/archivos/${id}`));
      const stored = record.data()?.image as ImagenProveedor | undefined;
      if (stored?.id === image.id && stored?.storagePath === image.storagePath) trusted = stored;
    }
    if (!trusted) throw new HttpsError("failed-precondition", "La imagen no tiene una carga privada válida.");
    // Imported source evidence remains canonical/private; public projection
    // drops it. Never accept a replacement source/download URL from the browser.
    result.set(image.id, { ...trusted, url: null, alt: image.alt });
  }
  const select = (image: ImagenProveedor | null | undefined, tipo: ImagenProveedor["tipo"], orden: number) =>
    image ? { ...result.get(image.id)!, tipo, orden } : null;
  return {
    portada: select(images.portada, "portada", 0),
    logo: select(images.logo, "logo", 0),
    galeria: images.galeria.map((image, index) => select(image, "galeria", index)!),
  };
}

export async function prepareProviderImage(bytes: Buffer, contentType: string) {
  if (!bytes.length || bytes.length > PROVIDER_IMAGE_MAX_BYTES ||
      !PROVIDER_IMAGE_MIME_TYPES.some(type => type === contentType)) {
    throw new HttpsError("invalid-argument", "Usá una imagen JPG, PNG, WebP, GIF o AVIF de hasta 15 MiB.");
  }
  try {
    const input = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await input.metadata();
    const formats: Record<string, string> = {
      jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heif: "image/avif",
    };
    if (!metadata.format || formats[metadata.format] !== contentType || !metadata.width || !metadata.height) {
      throw new Error("Image signature mismatch");
    }
    // New photos become static WebP without EXIF/GPS. Imported bytes stay intact.
    const output = await input.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    if (output.data.length > PROVIDER_IMAGE_MAX_BYTES) throw new Error("Image too large");
    return output;
  } catch {
    throw new HttpsError("invalid-argument", "No se pudo validar la imagen. Elegí otro archivo.");
  }
}

async function requireOpenPanel(db: Firestore) {
  const config = await db.doc(PROVIDER_BETA_CONFIG_PATH).get();
  if (!providerBetaControls(config.data()).panelEnabled) {
    throw new HttpsError("permission-denied", "La beta de proveedores está cerrada.");
  }
}

const HTTP_STATUS: Record<string, number> = {
  "unauthenticated": 401, "permission-denied": 403, "not-found": 404,
  "invalid-argument": 400, "failed-precondition": 409,
};

export const providerAdminImageV1 = onRequest({
  region: "us-central1", memory: "512MiB", timeoutSeconds: 60, maxInstances: 3,
  cors: ["https://reservaeldia.com.ar", /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
}, async (request, response) => {
  response.set("Cache-Control", "private, no-store");
  response.set("X-Content-Type-Options", "nosniff");
  response.set("Vary", "Authorization, Origin");
  if (request.method !== "GET" && request.method !== "POST") {
    response.set("Allow", "GET, POST").status(405).end();
    return;
  }
  try {
    const app = ensureAdminApp();
    const bearer = /^Bearer (\S+)$/.exec(request.get("authorization") || "");
    if (!bearer) throw new HttpsError("unauthenticated", "Iniciá sesión.");
    let uid: string;
    try { uid = (await getAuth(app).verifyIdToken(bearer[1], true)).uid; }
    catch { throw new HttpsError("unauthenticated", "La sesión no es válida."); }
    if (!isSuperAdmin(uid)) throw new HttpsError("permission-denied", "Acceso administrativo requerido.");
    const db = getFirestore(app);
    await requireOpenPanel(db);
    const providerId = requireProviderMediaId(request.query.providerId);
    const providerRef = db.doc(`proveedores/${providerId}`);
    const snapshot = await providerRef.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "La ficha no existe.");
    const bucket = getStorage(app).bucket();

    if (request.method === "GET") {
      const path = request.query.storagePath;
      if (!isProviderMediaPath(providerId, path)) throw new HttpsError("invalid-argument", "Ruta de imagen inválida.");
      // No arbitrary bucket proxy: only registered/imported media for this ID.
      const provider = snapshot.data()!;
      const known = [provider.imagenes, provider.aprobada?.contenido?.imagenes, provider.revisionPendiente?.contenido?.imagenes]
        .some(images => imageList(images).some(image => image.storagePath === path));
      if (!known) {
        const ledger = await providerRef.collection("archivos").where("image.storagePath", "==", path).limit(1).get();
        if (ledger.empty) throw new HttpsError("not-found", "La imagen no está registrada.");
      }
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const type = String(metadata.contentType || "");
      if (!PROVIDER_IMAGE_MIME_TYPES.some(item => item === type)) throw new HttpsError("failed-precondition", "Formato de imagen inválido.");
      response.type(type);
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on("error", reject);
        response.on("finish", resolve);
        response.on("close", () => { stream.destroy(); resolve(); });
        stream.pipe(response);
      });
      return;
    }

    if (snapshot.data()?.estado === "eliminado") throw new HttpsError("failed-precondition", "La ficha está archivada.");
    const output = await prepareProviderImage(request.rawBody, (request.get("content-type") || "").split(";")[0]);
    const imageId = `img_${randomUUID().replace(/-/g, "")}`;
    const storagePath = `proveedores/${providerId}/media/${imageId}.webp`;
    const image: ImagenProveedor<Date> = {
      id: imageId, tipo: "galeria", storagePath, url: null, urlOriginal: null, alt: "", orden: 0,
      ancho: output.info.width, alto: output.info.height, mimeType: "image/webp", formato: "webp",
      tamanioBytes: output.data.length, importadaEn: new Date(),
    };
    const file = bucket.file(storagePath);
    await file.save(output.data, {
      resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "image/webp", cacheControl: "private,no-store", metadata: { providerId, imageId } },
    });
    try {
      await db.runTransaction(async transaction => {
        const [current, config] = await Promise.all([
          transaction.get(providerRef), transaction.get(db.doc(PROVIDER_BETA_CONFIG_PATH)),
        ]);
        if (!current.exists || current.data()?.estado === "eliminado" || !providerBetaControls(config.data()).panelEnabled) {
          throw new HttpsError("failed-precondition", "La ficha o el acceso cambiaron. Volvé a cargar.");
        }
        transaction.create(providerRef.collection("archivos").doc(imageId), { image, creadoPor: uid, creadoEn: new Date() });
        transaction.create(providerRef.collection("historial").doc(), {
          actorUid: uid, at: new Date(), action: "uploadImage", changedFields: ["imagenes"], reason: null,
          revision: current.data()?.beta?.revision || 0,
        });
      });
    } catch (error) {
      // Unique path belongs only to this attempt; never remove an approved file.
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
    response.status(201).json({ image });
  } catch (error) {
    if (response.headersSent) { response.end(); return; }
    const safe = error instanceof HttpsError ? error : new HttpsError("internal", "No se pudo procesar la imagen.");
    response.status(HTTP_STATUS[safe.code] || 500).json({ error: { code: safe.code, message: safe.message } });
  }
});
