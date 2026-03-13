import { randomUUID } from "crypto";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";

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

export type TemplateAssetCopyCache = Map<string, Promise<string>>;

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

function defaultBucket() {
  ensureApp();
  return getStorage().bucket();
}

export function parseBucketAndPathFromStorageValue(
  rawValue: string
): { bucketName: string; path: string } | null {
  const bucket = defaultBucket();
  const value = String(rawValue || "").trim();
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

function getBucketProjectKey(bucketName: string): string {
  const normalized = (bucketName || "").toLowerCase().trim();
  if (normalized.endsWith(".firebasestorage.app")) {
    return normalized.replace(/\.firebasestorage\.app$/, "");
  }
  if (normalized.endsWith(".appspot.com")) {
    return normalized.replace(/\.appspot\.com$/, "");
  }
  return normalized;
}

function areEquivalentStorageBuckets(a: string, b: string): boolean {
  const keyA = getBucketProjectKey(a);
  const keyB = getBucketProjectKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

function shouldCloneTemplateStoragePath(path: string, plantillaId: string): boolean {
  const normalized = path.toLowerCase();
  const ownSharedPrefix = `plantillas/${String(plantillaId || "").toLowerCase()}/assets/`;
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
  const bucket = defaultBucket();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

async function cloneTemplateAssetToSharedPath(
  sourceBucketName: string,
  sourcePath: string,
  rawValue: string,
  plantillaId: string,
  cache: TemplateAssetCopyCache
): Promise<string> {
  const bucket = defaultBucket();
  const cacheKey = `${sourceBucketName}/${sourcePath}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as Promise<string>;
  }

  const copyPromise = (async (): Promise<string> => {
    try {
      const sourceBucket = getStorage().bucket(sourceBucketName);
      const sourceFile = sourceBucket.file(sourcePath);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        logger.warn("Recurso no encontrado al normalizar plantilla", {
          plantillaId,
          sourceBucketName,
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
        sourceBucketName,
        sourcePath,
        error,
      });
      return rawValue;
    }
  })();

  cache.set(cacheKey, copyPromise);
  return copyPromise;
}

export async function normalizeTemplateAssetValue(
  rawValue: string,
  plantillaId: string,
  cache: TemplateAssetCopyCache = new Map()
): Promise<string> {
  const bucket = defaultBucket();
  const parsed = parseBucketAndPathFromStorageValue(rawValue);
  if (!parsed) return rawValue;
  if (!areEquivalentStorageBuckets(parsed.bucketName, bucket.name)) return rawValue;

  const normalizedPath = parsed.path.replace(/^\/+/, "");
  if (!normalizedPath) return rawValue;
  if (!shouldCloneTemplateStoragePath(normalizedPath, plantillaId)) return rawValue;

  return cloneTemplateAssetToSharedPath(
    parsed.bucketName,
    normalizedPath,
    rawValue,
    plantillaId,
    cache
  );
}

export async function normalizeTemplateAssetsDeep(
  value: unknown,
  plantillaId: string,
  cache: TemplateAssetCopyCache = new Map()
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
