import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { JSDOM } from "jsdom";
import express, { Request, Response } from "express";
import { generarHTMLDesdeSecciones } from "./utils/generarHTMLDesdeSecciones";
import { type RSVPConfig as ModalConfig } from "./utils/generarModalRSVP";
import {
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  isSuperAdmin,
  getSuperAdminUids,
} from "./auth/adminAuth";

import * as logger from "firebase-functions/logger";

// Inicialización de Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

const db = admin.firestore();
const bucket = getStorage().bucket();

const MAX_ADMIN_SCAN = 10000;
const MAX_USERS_STATS_SCAN = 100000;
const DEFAULT_USERS_PAGE_SIZE = 100;
const MAX_USERS_PAGE_SIZE = 200;
const TEMPLATE_ASSET_FIELD_KEYS = new Set([
  "src",
  "url",
  "mediaUrl",
  "fondoImagen",
]);
const TEMPLATE_PRIVATE_STORAGE_PREFIXES = [
  "usuarios/",
  "user_uploads/",
  "thumbnails_borradores/",
  "borradores/",
  "previews/",
];

type TemplateAssetCopyCache = Map<string, Promise<string>>;

type CustomClaimsMap = Record<string, unknown>;
type UserProfileSource =
  | "email-register"
  | "google-login"
  | "profile-completion";

type UserProfileData = {
  nombre: string | null;
  apellido: string | null;
  nombreCompleto: string | null;
  fechaNacimiento: string | null;
  profileComplete: boolean;
};

type AdminUserSummary = {
  uid: string;
  email: string | null;
  displayName: string | null;
  adminClaim: boolean;
  isSuperAdmin: boolean;
  disabled: boolean;
  lastSignInTime: string | null;
  creationTime: string | null;
};

type UserDirectoryItem = {
  uid: string;
  email: string | null;
  displayName: string | null;
  nombre: string | null;
  apellido: string | null;
  nombreCompleto: string | null;
  fechaNacimiento: string | null;
  profileComplete: boolean;
  adminClaim: boolean;
  isSuperAdmin: boolean;
  disabled: boolean;
  lastSignInTime: string | null;
  creationTime: string | null;
};

const USER_PROFILE_SOURCE_SET = new Set<UserProfileSource>([
  "email-register",
  "google-login",
  "profile-completion",
]);

const BIRTHDATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRequiredName(raw: unknown, field: string): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", `Falta ${field}`);
  }

  const value = normalizeSpaces(raw);
  if (value.length < 2 || value.length > 60) {
    throw new HttpsError(
      "invalid-argument",
      `${field} debe tener entre 2 y 60 caracteres`
    );
  }

  return value;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(candidate.getTime())) return false;

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeBirthDate(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "Falta fechaNacimiento");
  }

  const value = raw.trim();
  if (!BIRTHDATE_REGEX.test(value)) {
    throw new HttpsError(
      "invalid-argument",
      "fechaNacimiento debe tener formato YYYY-MM-DD"
    );
  }

  const [year, month, day] = value.split("-").map((item) => Number(item));
  if (!isValidDateParts(year, month, day)) {
    throw new HttpsError("invalid-argument", "fechaNacimiento no es valida");
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  if (candidate.getTime() > today.getTime()) {
    throw new HttpsError(
      "invalid-argument",
      "fechaNacimiento no puede ser futura"
    );
  }

  return value;
}

function normalizeProfileSource(raw: unknown): UserProfileSource {
  if (typeof raw === "undefined") return "profile-completion";
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "source invalido");
  }

  if (!USER_PROFILE_SOURCE_SET.has(raw as UserProfileSource)) {
    throw new HttpsError("invalid-argument", "source invalido");
  }

  return raw as UserProfileSource;
}

function normalizeOptionalText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = normalizeSpaces(raw);
  return value.length > 0 ? value : null;
}

function isValidBirthDateString(value: string | null): boolean {
  if (!value || !BIRTHDATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map((item) => Number(item));
  if (!isValidDateParts(year, month, day)) return false;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  return candidate.getTime() <= today.getTime();
}

function isProfileCompleteFromFields(
  nombre: string | null,
  apellido: string | null,
  fechaNacimiento: string | null
): boolean {
  return Boolean(nombre && apellido && isValidBirthDateString(fechaNacimiento));
}

function buildNombreCompleto(nombre: string, apellido: string): string {
  return normalizeSpaces(`${nombre} ${apellido}`);
}

function extractProfileFromDocData(data: unknown): UserProfileData {
  const raw = (data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const nombre = normalizeOptionalText(raw.nombre);
  const apellido = normalizeOptionalText(raw.apellido);
  const fechaNacimiento = normalizeOptionalText(raw.fechaNacimiento);
  const computedFullName =
    nombre && apellido ? buildNombreCompleto(nombre, apellido) : null;
  const storedFullName = normalizeOptionalText(raw.nombreCompleto);
  const nombreCompleto = storedFullName || computedFullName;

  return {
    nombre,
    apellido,
    nombreCompleto,
    fechaNacimiento: isValidBirthDateString(fechaNacimiento)
      ? fechaNacimiento
      : null,
    profileComplete: isProfileCompleteFromFields(
      nombre,
      apellido,
      fechaNacimiento
    ),
  };
}

type TimestampLike = {
  toDate: () => Date;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as TimestampLike).toDate === "function"
  );
}

function toISODateTime(value: unknown): string | null {
  if (isTimestampLike(value)) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

function toLimitedString(value: unknown, maxLength = 500): string | null {
  if (value === null || typeof value === "undefined") return null;
  const asText = typeof value === "string" ? value : String(value);
  const normalized = asText.trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function toLimitedJson(value: unknown, maxLength = 4000): string | null {
  if (value === null || typeof value === "undefined") return null;

  try {
    const asJson = JSON.stringify(value);
    if (!asJson) return null;
    if (asJson.length <= maxLength) return asJson;
    return `${asJson.slice(0, maxLength)}…`;
  } catch {
    return toLimitedString(value, maxLength);
  }
}

function parseBucketAndPathFromStorageValue(
  rawValue: string
): { bucketName: string; path: string } | null {
  const value = rawValue.trim();
  if (!value || value.startsWith("data:")) return null;

  if (/^gs:\/\//i.test(value)) {
    const withoutScheme = value.replace(/^gs:\/\//i, "");
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash <= 0) return null;
    const bucketName = withoutScheme.slice(0, firstSlash);
    const path = withoutScheme.slice(firstSlash + 1);
    if (!path) return null;
    return {
      bucketName,
      path: decodeURIComponent(path),
    };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);

      if (
        url.hostname === "firebasestorage.googleapis.com" ||
        url.hostname.endsWith(".firebasestorage.app")
      ) {
        const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
        if (!match) return null;

        const bucketName = decodeURIComponent(match[1] || "");
        const path = decodeURIComponent(match[2] || "");
        if (!bucketName || !path) return null;
        return { bucketName, path };
      }

      if (url.hostname === "storage.googleapis.com") {
        const segments = url.pathname
          .split("/")
          .filter((segment) => segment.length > 0);
        if (segments.length < 2) return null;
        const bucketName = segments[0] || "";
        const path = decodeURIComponent(segments.slice(1).join("/"));
        if (!bucketName || !path) return null;
        return { bucketName, path };
      }
    } catch {
      return null;
    }

    return null;
  }

  if (value.includes("://")) return null;

  const normalizedPath = value.replace(/^\/+/, "");
  if (!normalizedPath) return null;

  return { bucketName: bucket.name, path: normalizedPath };
}

function shouldCloneTemplateStoragePath(path: string, plantillaId: string): boolean {
  const normalized = path.toLowerCase();
  const ownSharedPrefix = `plantillas/${plantillaId.toLowerCase()}/assets/`;
  if (normalized.startsWith(ownSharedPrefix)) return false;

  return TEMPLATE_PRIVATE_STORAGE_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  );
}

function sanitizeTemplateAssetFileName(path: string): string {
  const rawName = path.split("/").pop() || "asset";
  const cleaned = rawName
    .replace(/[?#].*$/, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "asset";
}

function buildStorageDownloadUrl(path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

async function cloneTemplateAssetToSharedPath(
  sourcePath: string,
  rawValue: string,
  plantillaId: string,
  cache: TemplateAssetCopyCache
): Promise<string> {
  if (cache.has(sourcePath)) {
    return cache.get(sourcePath) as Promise<string>;
  }

  const copyPromise = (async (): Promise<string> => {
    try {
      const sourceFile = bucket.file(sourcePath);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        logger.warn("Recurso no encontrado al normalizar plantilla", {
          plantillaId,
          sourcePath,
        });
        return rawValue;
      }

      const token = randomUUID();
      const safeName = sanitizeTemplateAssetFileName(sourcePath);
      const destinationPath = `plantillas/${plantillaId}/assets/${Date.now()}-${token}-${safeName}`;

      await sourceFile.copy(bucket.file(destinationPath));

      const [sourceMetadata] = await sourceFile.getMetadata();
      await bucket.file(destinationPath).setMetadata({
        contentType: sourceMetadata.contentType || undefined,
        cacheControl:
          sourceMetadata.cacheControl || "public,max-age=31536000,immutable",
        metadata: {
          ...(sourceMetadata.metadata || {}),
          firebaseStorageDownloadTokens: token,
        },
      });

      return buildStorageDownloadUrl(destinationPath, token);
    } catch (error) {
      logger.error("Error normalizando recurso de plantilla", {
        plantillaId,
        sourcePath,
        error,
      });
      return rawValue;
    }
  })();

  cache.set(sourcePath, copyPromise);
  return copyPromise;
}

async function normalizeTemplateAssetValue(
  rawValue: string,
  plantillaId: string,
  cache: TemplateAssetCopyCache
): Promise<string> {
  const parsed = parseBucketAndPathFromStorageValue(rawValue);
  if (!parsed) return rawValue;
  if (parsed.bucketName !== bucket.name) return rawValue;

  const normalizedPath = parsed.path.replace(/^\/+/, "");
  if (!normalizedPath) return rawValue;
  if (!shouldCloneTemplateStoragePath(normalizedPath, plantillaId)) return rawValue;

  return cloneTemplateAssetToSharedPath(
    normalizedPath,
    rawValue,
    plantillaId,
    cache
  );
}

async function normalizeTemplateAssetsDeep(
  value: unknown,
  plantillaId: string,
  cache: TemplateAssetCopyCache
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => normalizeTemplateAssetsDeep(item, plantillaId, cache))
    );
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = await Promise.all(
      Object.entries(source).map(async ([key, nestedValue]) => {
        if (
          typeof nestedValue === "string" &&
          TEMPLATE_ASSET_FIELD_KEYS.has(key)
        ) {
          const normalized = await normalizeTemplateAssetValue(
            nestedValue,
            plantillaId,
            cache
          );
          return [key, normalized];
        }

        const normalizedNested = await normalizeTemplateAssetsDeep(
          nestedValue,
          plantillaId,
          cache
        );
        return [key, normalizedNested];
      })
    );

    return Object.fromEntries(entries);
  }

  return value;
}

async function getProfileMapByUid(uids: string[]): Promise<Map<string, UserProfileData>> {
  const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
  if (uniqueUids.length === 0) {
    return new Map();
  }

  const refs = uniqueUids.map((uid) => db.collection("usuarios").doc(uid));
  const snaps = await db.getAll(...refs);
  const map = new Map<string, UserProfileData>();

  for (const snap of snaps) {
    if (!snap.exists) continue;
    map.set(snap.id, extractProfileFromDocData(snap.data()));
  }

  return map;
}

function toAdminUserSummary(
  userRecord: admin.auth.UserRecord,
  superAdminSet: Set<string>
): AdminUserSummary {
  const claims = (userRecord.customClaims || {}) as CustomClaimsMap;
  const adminClaim = claims.admin === true;
  const userIsSuperAdmin = superAdminSet.has(userRecord.uid);

  return {
    uid: userRecord.uid,
    email: userRecord.email || null,
    displayName: userRecord.displayName || null,
    adminClaim,
    isSuperAdmin: userIsSuperAdmin,
    disabled: userRecord.disabled === true,
    lastSignInTime: userRecord.metadata?.lastSignInTime || null,
    creationTime: userRecord.metadata?.creationTime || null,
  };
}

function toUserDirectoryItem(
  userRecord: admin.auth.UserRecord,
  superAdminSet: Set<string>,
  profile: UserProfileData | null = null
): UserDirectoryItem {
  const claims = (userRecord.customClaims || {}) as CustomClaimsMap;
  const profileData = profile || {
    nombre: null,
    apellido: null,
    nombreCompleto: null,
    fechaNacimiento: null,
    profileComplete: false,
  };
  const nombreCompleto = profileData.nombreCompleto || userRecord.displayName || null;
  const profileComplete = isProfileCompleteFromFields(
    profileData.nombre,
    profileData.apellido,
    profileData.fechaNacimiento
  );

  return {
    uid: userRecord.uid,
    email: userRecord.email || null,
    displayName: userRecord.displayName || null,
    nombre: profileData.nombre,
    apellido: profileData.apellido,
    nombreCompleto,
    fechaNacimiento: profileData.fechaNacimiento,
    profileComplete,
    adminClaim: claims.admin === true,
    isSuperAdmin: superAdminSet.has(userRecord.uid),
    disabled: userRecord.disabled === true,
    lastSignInTime: userRecord.metadata?.lastSignInTime || null,
    creationTime: userRecord.metadata?.creationTime || null,
  };
}

const app = express();


app.get("/i/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug;
  if (!slug) return res.status(400).send("Falta el slug");

  const file = bucket.file(`publicadas/${slug}/index.html`);
  const [exists] = await file.exists();

  if (!exists) return res.status(404).send("Invitación publicada no encontrada");

  const [contenido] = await file.download();
  res.set("Content-Type", "text/html").send(contenido.toString());
});

export const verInvitacionPublicada = onRequest(
  { region: "us-central1" },
  app
);







// ✅ Función para ver la invitación en el iframe

export const verInvitacion = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    const slug = req.query.slug as string;
    if (!slug) {
      res.status(400).send("Falta el slug");
      return;
    }

    try {
      const snap = await db.collection("borradores").doc(slug).get();
      if (!snap.exists) {
        res.status(404).send("Invitación no encontrada");
        return;
      }

      const datos = snap.data();
      const contenido = datos?.contenido || {};

      const file = bucket.file(`borradores/${slug}/index.html`);
      const [htmlBuffer] = await file.download();
      const html = htmlBuffer.toString("utf-8");

      const dom = new JSDOM(html);
      const { document } = dom.window;

      Object.entries(contenido).forEach(([id, valores]: any) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return;
        if (valores.texto) el.textContent = valores.texto;
        if (valores.top || valores.left) {
          el.setAttribute(
            "style",
            `position: absolute; top: ${valores.top}; left: ${valores.left};`
          );
        }
      });

      document.querySelectorAll("style").forEach((style) => {
        if (style.textContent?.includes(".editable")) style.remove();
      });

      res.set("X-Frame-Options", "").set("Content-Type", "text/html");
      res.status(200).send(dom.serialize());
    } catch (error) {
      logger.error("❌ Error al servir invitación:", error);
      res.status(500).send("Error interno del servidor");
    }
  }
);




type CopiarPlantillaData = {
  plantillaId: string;
  slug: string;
};



// ✅Copia index.html de una plantilla a una nueva carpeta de borrador y guarda el contenido inicial en Firestore.

export const copiarPlantillaHTML = onCall(async (request) => {
  const { plantillaId, slug } = request.data;
  const uid = request.auth?.uid;

  if (!plantillaId || !slug)
    throw new HttpsError("invalid-argument", "Faltan datos");
  if (!uid) throw new HttpsError("unauthenticated", "Usuario no autenticado");

  const [archivos] = await bucket.getFiles({ prefix: `plantillas/${plantillaId}/` });
  const archivoHtml = archivos.find((f) => f.name.endsWith("index.html"));
  if (!archivoHtml)
    throw new HttpsError("not-found", "No se encontró index.html");

  const destino = archivoHtml.name.replace(
    `plantillas/${plantillaId}/`,
    `borradores/${slug}/`
  );
  await archivoHtml.copy(bucket.file(destino));

  const [htmlBuffer] = await archivoHtml.download();
  const html = htmlBuffer.toString("utf-8");
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const contenido: Record<string, any> = {};
  document.querySelectorAll("[data-id]").forEach((el) => {
    const id = el.getAttribute("data-id");
    const texto = el.textContent?.trim() || "";
    const style = el.getAttribute("style") || "";
    const top = style.match(/top:\s*([^;]+)/)?.[1]?.trim();
    const left = style.match(/left:\s*([^;]+)/)?.[1]?.trim();

    contenido[id!] = { texto, ...(top && { top }), ...(left && { left }) };
  });

  await db.collection("borradores").doc(slug).set({
    userId: uid,
    slug,
    plantillaId,
    contenido,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    slug,
    url: `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`,
  };
});





export const borrarBorrador = onCall(async (request) => {
  const { slug } = request.data;
  const uid = request.auth?.uid;

  if (!slug) throw new HttpsError("invalid-argument", "Falta el slug");
  if (!uid) throw new HttpsError("unauthenticated", "Usuario no autenticado");

  const docRef = db.collection("borradores").doc(slug);
  const snap = await docRef.get();

  if (!snap.exists) throw new HttpsError("not-found", "No existe el borrador");
  if (snap.data()?.userId !== uid)
    throw new HttpsError("permission-denied", "No podés borrar este borrador");

  await docRef.delete();
  const [files] = await bucket.getFiles({ prefix: `borradores/${slug}/` });
  await Promise.all(files.map((f) => f.delete()));

  return { success: true, archivosEliminados: files.length };
});




// 👇 Acá definís el tipo de datos esperados
interface PublicarInvitacionData {
  slug: string;
}

// 🗑️ ELIMINADA: función aplicarOverrides
// Esta función era específica del editor HTML contenteditable


async function resolverURLsDeObjetos(objetos: any[]): Promise<any[]> {
  const bucket = getStorage().bucket();

  const procesados = await Promise.all(
    objetos.map(async (obj) => {
      if (
        (obj.tipo === "imagen" || obj.tipo === "icono") &&
        obj.src &&
        !obj.src.startsWith("http")
      ) {
        try {
          const [url] = await bucket.file(obj.src).getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1 año
          });
          return { ...obj, src: url };
        } catch (error) {
          console.warn("❌ Error resolviendo URL de", obj.src, error);
          return obj;
        }
      }
      return obj;
    })
  );

  return procesados;
}

function safeServerTimestamp() {
  try {
    const fv = (admin as any)?.firestore?.FieldValue;
    if (fv?.serverTimestamp) return fv.serverTimestamp();
  } catch {}
  // Fallback seguro (solo se usa si falta FieldValue en emulador)
  return new Date();
}


export const publicarInvitacion = onCall(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    const { slug, slugPublico } = request.data;
    if (!slug) throw new HttpsError("invalid-argument", "Falta el slug del borrador");

    const slugDestino = slugPublico || slug;

    // 🔹 1. Leer el borrador original
    const docSnap = await db.collection("borradores").doc(slug).get();
    if (!docSnap.exists) throw new HttpsError("not-found", "No se encontró el borrador");

    const data = docSnap.data();
    if (!data) throw new HttpsError("not-found", "El documento está vacío");

    // 🔹 2. Resolver datos del borrador
    const objetos = data?.objetos || [];
    const secciones = data?.secciones || [];
    const objetosFinales = await resolverURLsDeObjetos(objetos);

    const rsvp: ModalConfig = {
      enabled: data?.rsvp?.enabled !== false,
      title: data?.rsvp?.title,
      subtitle: data?.rsvp?.subtitle,
      buttonText: data?.rsvp?.buttonText,
      primaryColor: data?.rsvp?.primaryColor,
      sheetUrl: data?.rsvp?.sheetUrl,
    };

    // 🔹 3. Generar HTML
    const htmlFinal = generarHTMLDesdeSecciones(secciones, objetosFinales, rsvp, {
      slug: slugDestino,
    });

    // 🔹 4. Subir HTML a Storage con el slug destino
    const filePath = `publicadas/${slugDestino}/index.html`;
    await bucket.file(filePath).save(htmlFinal, {
      contentType: "text/html",
      public: true,
      metadata: { cacheControl: "public,max-age=3600" },
    });

    // 🔹 5. Guardar metadatos en Firestore
    const url = `https://reservaeldia.com.ar/i/${slugDestino}`;
    await db.collection("publicadas").doc(slugDestino).set(
      {
        slug: slugDestino,
        slugOriginal: slug !== slugDestino ? slug : undefined,
        userId: data.userId,
        plantillaId: data.plantillaId || null,
        urlPublica: url,
        nombre: data.nombre || slugDestino,
        tipo: data.tipo || data.plantillaTipo || "desconocido",
        portada: data.thumbnailUrl || null,
        invitadosCount: data.invitadosCount || 0,
        publicadaEn: safeServerTimestamp(),
      },
      { merge: true }
    );

    // 🔁 6. Guardar también el slugPublico dentro del borrador original
    if (slugPublico && slugPublico !== slug) {
      await db.collection("borradores").doc(slug).set(
        { slugPublico },
        { merge: true }
      );
    }

    return { success: true, url };
  }
);







export const borrarTodosLosBorradores = onCall(
  async (request: CallableRequest<unknown>) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("No estás autenticado.");
    }

    const db = admin.firestore();
    const storage = admin.storage();

    const snapshot = await db.collection("borradores").where("userId", "==", userId).get();

    const deletePromises = snapshot.docs.map(async (doc) => {
      const slug = doc.id;
      await doc.ref.delete();
      await storage.bucket().deleteFiles({ prefix: `borradores/${slug}/` });
    });

    await Promise.all(deletePromises);

    return { success: true };
  }
);


export const copiarPlantilla = onCall(
  async (request: CallableRequest<{ plantillaId: string; slug: string }>): Promise<{ slug: string }> => {
    const { plantillaId, slug } = request.data;
    const uid = request.auth?.uid;

    if (!uid) throw new Error("Usuario no autenticado");
    if (!plantillaId || !slug) throw new Error("Faltan datos requeridos");

    const docPlantilla = await db.collection("plantillas").doc(plantillaId).get();
    const datos = docPlantilla.data();

    if (!datos) throw new Error("Plantilla no encontrada");

    const datosPlantilla = datos as Record<string, unknown>;
    const assetCache: TemplateAssetCopyCache = new Map();
    const [objetosNormalizados, seccionesNormalizadas, portadaNormalizada] =
      await Promise.all([
        normalizeTemplateAssetsDeep(
          datosPlantilla.objetos || [],
          plantillaId,
          assetCache
        ),
        normalizeTemplateAssetsDeep(
          datosPlantilla.secciones || [],
          plantillaId,
          assetCache
        ),
        typeof datosPlantilla.portada === "string"
          ? normalizeTemplateAssetValue(
              datosPlantilla.portada,
              plantillaId,
              assetCache
            )
          : Promise.resolve(null),
      ]);

    await db.collection("borradores").doc(slug).set({
      slug,
      userId: uid,
      plantillaId,
      editor:
        typeof datosPlantilla.editor === "string"
          ? datosPlantilla.editor
          : "konva",
      objetos: Array.isArray(objetosNormalizados) ? objetosNormalizados : [],
      secciones: Array.isArray(seccionesNormalizadas) ? seccionesNormalizadas : [],
      portada: portadaNormalizada,
      nombre:
        typeof datosPlantilla.nombre === "string" && datosPlantilla.nombre.trim()
          ? datosPlantilla.nombre
          : "Plantilla sin nombre",
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
      creado: admin.firestore.FieldValue.serverTimestamp(),
    });


    logger.info(`✅ Borrador creado desde plantilla '${plantillaId}' con slug '${slug}'`);
    return { slug };
  }
);

export const crearPlantilla = onCall(
  {
    region: "us-central1",
    cors: [
      "https://reservaeldia.com.ar",
      "http://localhost:3000"
    ],
  },
  async (request: CallableRequest<{ id: string; datos: any }>) => {
    // 🔒 Seguridad real: solo admins pueden crear plantillas base
    // La UI puede ocultar el botón, pero acá se valida de verdad.
    requireAdmin(request);

    const { id, datos } = request.data;
    if (!id || !datos) throw new Error("Faltan datos");

    const datosPlantilla = (datos as Record<string, unknown>) || {};
    const previewBase64 =
      typeof datosPlantilla.previewBase64 === "string"
        ? datosPlantilla.previewBase64
        : null;
    const { previewBase64: _omitPreview, ...datosSinPreview } = datosPlantilla;

    let portada =
      typeof datosPlantilla.portada === "string" ? datosPlantilla.portada : null;

    // 📸 Si se recibe una imagen en base64, subirla como portada
    if (previewBase64) {
      try {
        const base64 = previewBase64.split(",")[1]; // Elimina encabezado data:image/png;base64,
        const buffer = Buffer.from(base64, "base64");
        const filePath = `plantillas/${id}/preview.png`;
        const file = bucket.file(filePath);

        await file.save(buffer, {
          contentType: "image/png",
          public: true,
          metadata: {
            cacheControl: "public,max-age=31536000",
          },
        });

        portada = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        logger.info(`✅ Portada subida correctamente: ${portada}`);
      } catch (error) {
        logger.error("❌ Error al subir portada:", error);
        throw new Error("Error al subir la imagen de portada");
      }
    }

    const assetCache: TemplateAssetCopyCache = new Map();
    const [objetosNormalizados, seccionesNormalizadas, portadaNormalizada] =
      await Promise.all([
        normalizeTemplateAssetsDeep(datosPlantilla.objetos || [], id, assetCache),
        normalizeTemplateAssetsDeep(datosPlantilla.secciones || [], id, assetCache),
        portada
          ? normalizeTemplateAssetValue(portada, id, assetCache)
          : Promise.resolve(null),
      ]);

    // 📝 Guardar plantilla en Firestore
    await db.collection("plantillas").doc(id).set({
      ...datosSinPreview,
      portada: portadaNormalizada,
      objetos: Array.isArray(objetosNormalizados) ? objetosNormalizados : [],
      secciones: Array.isArray(seccionesNormalizadas) ? seccionesNormalizadas : [],
    });

    logger.info(`Plantilla '${id}' creada con exito`);
    return { success: true, portada: portadaNormalizada };
  }
);


/**
 * ================================
 * Admin: borrar plantilla
 * ================================
 *
 * Solo ADMIN (claim) puede borrar una plantilla base.
 * La seguridad real se aplica acá (no solo en la UI).
 */
export const borrarPlantilla = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ plantillaId: string }>) => {
    // 🔒 Seguridad real: solo admins pueden borrar plantillas base
    requireAdmin(request);

    const { plantillaId } = request.data || ({} as any);

    if (!plantillaId || typeof plantillaId !== "string") {
      throw new HttpsError("invalid-argument", "Falta plantillaId");
    }

    // Borrar doc principal
    await db.collection("plantillas").doc(plantillaId).delete();

    // (Opcional a futuro) limpiar assets en Storage / subdocs relacionados
    // Por ahora: minimalista y seguro.

    logger.info(`🗑️ Plantilla '${plantillaId}' borrada por admin`);
    return { success: true, plantillaId };
  }
);


/**
 * ================================
 * Access: admin / superadmin
 * ================================
 */
export const getAdminAccess = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<Record<string, never>>) => {
    const uid = requireAuth(request);
    const token = (request.auth?.token || {}) as CustomClaimsMap;

    const adminClaim = token.admin === true;
    const email = typeof token.email === "string" ? token.email : null;
    const userIsSuperAdmin = isSuperAdmin(uid);
    const userIsAdmin = adminClaim || userIsSuperAdmin;

    return {
      uid,
      email,
      adminClaim,
      isSuperAdmin: userIsSuperAdmin,
      isAdmin: userIsAdmin,
    };
  }
);


/**
 * ================================
 * Superadmin: listar admins
 * ================================
 */
export const listAdminUsers = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<Record<string, never>>) => {
    requireSuperAdmin(request);

    const superAdminSet = new Set(getSuperAdminUids());
    const items: AdminUserSummary[] = [];

    let scannedUsers = 0;
    let truncated = false;
    let nextPageToken: string | undefined = undefined;

    do {
      const remaining = MAX_ADMIN_SCAN - scannedUsers;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const batchSize = Math.min(1000, remaining);
      const page = await admin.auth().listUsers(batchSize, nextPageToken);

      for (const userRecord of page.users) {
        scannedUsers += 1;

        const summary = toAdminUserSummary(userRecord, superAdminSet);
        if (summary.adminClaim || summary.isSuperAdmin) {
          items.push(summary);
        }

        if (scannedUsers >= MAX_ADMIN_SCAN) {
          break;
        }
      }

      if (scannedUsers >= MAX_ADMIN_SCAN) {
        truncated = Boolean(page.pageToken);
        break;
      }

      nextPageToken = page.pageToken;
    } while (nextPageToken);

    items.sort((a, b) => {
      if (a.isSuperAdmin !== b.isSuperAdmin) {
        return a.isSuperAdmin ? -1 : 1;
      }

      const aEmail = (a.email || "").toLowerCase();
      const bEmail = (b.email || "").toLowerCase();

      if (aEmail !== bEmail) {
        if (!aEmail) return 1;
        if (!bEmail) return -1;
        return aEmail.localeCompare(bEmail);
      }

      return a.uid.localeCompare(b.uid);
    });

    return { items, scannedUsers, truncated };
  }
);


/**
 * ================================
 * Superadmin: buscar usuario por email
 * ================================
 */
export const getAdminUserByEmail = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ email: string }>) => {
    requireSuperAdmin(request);

    const rawEmail = request.data?.email;
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
      throw new HttpsError("invalid-argument", "Falta email");
    }

    const email = rawEmail.trim().toLowerCase();
    const superAdminSet = new Set(getSuperAdminUids());

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      return {
        found: true,
        user: toAdminUserSummary(userRecord, superAdminSet),
      };
    } catch (error: any) {
      if (error?.code === "auth/user-not-found") {
        return { found: false, user: null };
      }

      logger.error("❌ Error buscando usuario por email", { email, error });
      throw new HttpsError("internal", "No se pudo buscar el usuario");
    }
  }
);


/**
 * ================================
 * Superadmin: estadísticas de usuarios
 * ================================
 */
export const getUsersStats = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<Record<string, never>>) => {
    requireSuperAdmin(request);

    const superAdminSet = new Set(getSuperAdminUids());

    let totalUsers = 0;
    let totalAdmins = 0;
    let totalSuperAdmins = 0;
    let totalDisabled = 0;
    let truncated = false;
    let nextPageToken: string | undefined = undefined;

    do {
      const remaining = MAX_USERS_STATS_SCAN - totalUsers;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const batchSize = Math.min(1000, remaining);
      const page = await admin.auth().listUsers(batchSize, nextPageToken);

      for (const userRecord of page.users) {
        totalUsers += 1;

        const claims = (userRecord.customClaims || {}) as CustomClaimsMap;
        const adminClaim = claims.admin === true;
        const userIsSuperAdmin = superAdminSet.has(userRecord.uid);

        if (adminClaim) totalAdmins += 1;
        if (userIsSuperAdmin) totalSuperAdmins += 1;
        if (userRecord.disabled === true) totalDisabled += 1;

        if (totalUsers >= MAX_USERS_STATS_SCAN) break;
      }

      if (totalUsers >= MAX_USERS_STATS_SCAN) {
        truncated = Boolean(page.pageToken);
        break;
      }

      nextPageToken = page.pageToken;
    } while (nextPageToken);

    return {
      totalUsers,
      totalAdmins,
      totalSuperAdmins,
      totalDisabled,
      scannedUsers: totalUsers,
      truncated,
    };
  }
);


/**
 * ================================
 * Perfil: guardar/actualizar datos obligatorios
 * ================================
 */
export const upsertUserProfile = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (
    request: CallableRequest<{
      nombre: string;
      apellido: string;
      fechaNacimiento: string;
      source?: UserProfileSource;
    }>
  ) => {
    const uid = requireAuth(request);
    const nombre = normalizeRequiredName(request.data?.nombre, "nombre");
    const apellido = normalizeRequiredName(request.data?.apellido, "apellido");
    const fechaNacimiento = normalizeBirthDate(request.data?.fechaNacimiento);
    const source = normalizeProfileSource(request.data?.source);
    const nombreCompleto = buildNombreCompleto(nombre, apellido);

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch (error: any) {
      logger.error("❌ Error obteniendo usuario autenticado para perfil", {
        uid,
        error,
      });
      throw new HttpsError("internal", "No se pudo obtener el usuario");
    }

    const email = userRecord.email || null;
    const profileRef = db.collection("usuarios").doc(uid);
    const existingSnap = await profileRef.get();

    const payload: Record<string, unknown> = {
      uid,
      email,
      nombre,
      apellido,
      nombreCompleto,
      fechaNacimiento,
      profileComplete: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedFrom: source,
    };

    if (!existingSnap.exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await profileRef.set(payload, { merge: true });

    const currentDisplayName = normalizeSpaces(userRecord.displayName || "");
    if (currentDisplayName !== nombreCompleto) {
      await admin.auth().updateUser(uid, { displayName: nombreCompleto });
    }

    const updatedSnap = await profileRef.get();
    const updatedData = updatedSnap.data() || {};

    return {
      success: true,
      profile: {
        uid,
        email,
        nombre,
        apellido,
        nombreCompleto,
        fechaNacimiento,
        profileComplete: true,
        updatedAt: toISODateTime(updatedData.updatedAt),
      },
    };
  }
);


/**
 * ================================
 * Perfil: estado del usuario autenticado
 * ================================
 */
export const getMyProfileStatus = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<Record<string, never>>) => {
    const uid = requireAuth(request);

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch (error: any) {
      logger.error("❌ Error obteniendo estado de auth del perfil", { uid, error });
      throw new HttpsError("internal", "No se pudo obtener el usuario");
    }

    const profileSnap = await db.collection("usuarios").doc(uid).get();
    const profileData = extractProfileFromDocData(
      profileSnap.exists ? profileSnap.data() : null
    );

    const providerIds = (userRecord.providerData || [])
      .map((provider) => provider.providerId)
      .filter((providerId): providerId is string => typeof providerId === "string");

    const nombreCompleto =
      profileData.nombreCompleto || normalizeOptionalText(userRecord.displayName);
    const profileComplete = isProfileCompleteFromFields(
      profileData.nombre,
      profileData.apellido,
      profileData.fechaNacimiento
    );

    return {
      uid,
      email: userRecord.email || null,
      emailVerified: userRecord.emailVerified === true,
      providerIds,
      profile: {
        nombre: profileData.nombre,
        apellido: profileData.apellido,
        nombreCompleto,
        fechaNacimiento: profileData.fechaNacimiento,
      },
      profileComplete,
    };
  }
);

/**
 * ================================
 * Diagnostico: reporte de errores cliente
 * ================================
 */
export const reportClientIssue = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ report?: Record<string, unknown> }>) => {
    const uid = request.auth?.uid || null;
    const report =
      request.data?.report && typeof request.data.report === "object"
        ? request.data.report
        : {};

    const source = toLimitedString(report.source, 180) || "unknown";
    const message = toLimitedString(report.message, 2000) || "Sin mensaje";
    const stack = toLimitedString(report.stack, 12000);
    const severity = toLimitedString(report.severity, 40) || "error";
    const fingerprint = toLimitedString(report.fingerprint, 180);
    const slug = toLimitedString(report.slug, 180);
    const occurredAt = toLimitedString(report.occurredAt, 80);
    const detail = toLimitedString(report.detail, 12000);
    const runtime = toLimitedJson(report.runtime, 12000);
    const clientReportId = toLimitedString(report.id, 100);
    const breadcrumbs = Array.isArray(report.breadcrumbs)
      ? report.breadcrumbs.slice(-40).map((item) => toLimitedJson(item, 600))
      : [];

    const issueDoc = {
      uid,
      hasAuth: Boolean(uid),
      source,
      message,
      stack,
      severity,
      fingerprint,
      slug,
      occurredAt,
      detail,
      runtime,
      clientReportId,
      breadcrumbs,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const created = await db.collection("clientIssues").add(issueDoc);

    logger.error("Client issue report recibido", {
      issueId: created.id,
      uid,
      hasAuth: Boolean(uid),
      source,
      fingerprint,
    });

    return {
      success: true,
      issueId: created.id,
    };
  }
);


/**
 * ================================
 * Superadmin: listado paginado de usuarios
 * ================================
 */
export const listUsersDirectory = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (
    request: CallableRequest<{ pageSize?: number; pageToken?: string | null }>
  ) => {
    requireSuperAdmin(request);

    const requestedSize = Number(request.data?.pageSize);
    const pageSize = Number.isFinite(requestedSize)
      ? Math.max(20, Math.min(MAX_USERS_PAGE_SIZE, Math.floor(requestedSize)))
      : DEFAULT_USERS_PAGE_SIZE;

    const pageToken =
      typeof request.data?.pageToken === "string" && request.data?.pageToken.trim()
        ? request.data.pageToken.trim()
        : undefined;

    const superAdminSet = new Set(getSuperAdminUids());
    const page = await admin.auth().listUsers(pageSize, pageToken);
    const profileMap = await getProfileMapByUid(page.users.map((user) => user.uid));

    const items = page.users.map((userRecord) =>
      toUserDirectoryItem(
        userRecord,
        superAdminSet,
        profileMap.get(userRecord.uid) || null
      )
    );

    return {
      items,
      nextPageToken: page.pageToken || null,
      pageSize,
    };
  }
);



function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/**
 * ================================
 * Claims: asignar/quitar admin
 * ================================
 *
 * Solo SUPERADMIN (env var) puede ejecutarla.
 * Setea custom claims { admin: true/false } al usuario objetivo.
 */
export const setAdminClaim = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ uidTarget: string; admin: boolean }>) => {
    // 🔒 Solo superadmin puede asignar claims
    requireSuperAdmin(request);

    const { uidTarget, admin: adminFlag } = request.data || ({} as any);

    if (!uidTarget || typeof uidTarget !== "string") {
      throw new HttpsError("invalid-argument", "Falta uidTarget");
    }
    if (typeof adminFlag !== "boolean") {
      throw new HttpsError("invalid-argument", "Falta admin (boolean)");
    }

    let targetUser: admin.auth.UserRecord;
    try {
      targetUser = await admin.auth().getUser(uidTarget);
    } catch (error: any) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "No existe el usuario objetivo");
      }
      logger.error("❌ Error obteniendo usuario objetivo", { uidTarget, error });
      throw new HttpsError("internal", "No se pudo obtener el usuario objetivo");
    }

    const targetIsSuperAdmin = isSuperAdmin(uidTarget);
    if (!adminFlag && targetIsSuperAdmin) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede quitar admin a un superadmin"
      );
    }

    const currentClaims = (targetUser.customClaims || {}) as CustomClaimsMap;
    let nextClaims: CustomClaimsMap;

    if (adminFlag) {
      nextClaims = { ...currentClaims, admin: true };
    } else {
      const { admin: _currentAdmin, ...restClaims } = currentClaims;
      nextClaims = restClaims;
    }

    await admin
      .auth()
      .setCustomUserClaims(
        uidTarget,
        Object.keys(nextClaims).length > 0 ? nextClaims : null
      );

    const finalAdminClaim = adminFlag === true;

    return {
      success: true,
      uidTarget,
      admin: finalAdminClaim,
      isSuperAdmin: targetIsSuperAdmin,
      isAdmin: finalAdminClaim || targetIsSuperAdmin,
      email: targetUser.email || null,
    };
  }
);



