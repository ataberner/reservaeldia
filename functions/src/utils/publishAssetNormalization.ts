import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import {
  buildSectionDecorationsPayload,
  normalizeSectionBackgroundModel,
} from "./sectionBackground";
import {
  areEquivalentStorageBuckets,
  normalizeStoragePathCandidate,
  parseBucketAndPathFromStorageValue,
} from "./storageAssetValue";
import { backfillPublishImageSourceDimensions } from "./publishImageSourceDimensions";
const {
  normalizeRenderAssetObject,
  normalizeRenderAssetSection,
  normalizeRenderAssetState,
} = require("../../shared/renderAssetContract.cjs");

const PUBLISH_ASSET_FIELD_KEYS = new Set([
  "src",
  "url",
  "mediaUrl",
  "fondoImagen",
  "frameSvgUrl",
]);
const DEFAULT_SECTION_HEIGHT = 600;

type PublishAssetMetadata = {
  exists: boolean;
  downloadTokens: Set<string>;
  generation: string;
};

export type PublishAssetNormalizationDiagnostics = {
  purpose: string;
  assetFieldCount: number;
  canonicalDescriptorReuseCount: number;
  verifiedDownloadUrlReuseCount: number;
  unresolvedAssetCount: number;
  metadataReadCount: number;
  metadataCacheHitCount: number;
  metadataReadMs: number;
  signedUrlCount: number;
  signedUrlCacheHitCount: number;
  signedUrlMs: number;
  croppedImageCount: number;
  persistedDimensionCount: number;
  legacyMissingDimensionCount: number;
  dimensionDownloadCount: number;
  dimensionDownloadMs: number;
  totalMs: number;
};

type PublishAssetResolveCache = {
  metadata: Map<string, Promise<PublishAssetMetadata>>;
  signedUrls: Map<string, Promise<string | null>>;
  diagnostics: PublishAssetNormalizationDiagnostics;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSectionHeight(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SECTION_HEIGHT;
  return parsed;
}

function getFirebaseDownloadToken(value: string): string {
  if (!/^https?:\/\//i.test(value)) return "";

  try {
    const url = new URL(value);
    if (
      url.hostname !== "firebasestorage.googleapis.com" &&
      !url.hostname.endsWith(".firebasestorage.app")
    ) {
      return "";
    }
    return getString(url.searchParams.get("token"));
  } catch {
    return "";
  }
}

function parseDownloadTokens(metadata: unknown): Set<string> {
  if (!metadata || typeof metadata !== "object") return new Set();
  const customMetadata = (metadata as Record<string, unknown>).metadata;
  if (!customMetadata || typeof customMetadata !== "object") return new Set();
  const rawTokens = getString(
    (customMetadata as Record<string, unknown>).firebaseStorageDownloadTokens
  );
  return new Set(
    rawTokens
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

function createDiagnostics(purpose: unknown): PublishAssetNormalizationDiagnostics {
  return {
    purpose: getString(purpose) || "prepared-render",
    assetFieldCount: 0,
    canonicalDescriptorReuseCount: 0,
    verifiedDownloadUrlReuseCount: 0,
    unresolvedAssetCount: 0,
    metadataReadCount: 0,
    metadataCacheHitCount: 0,
    metadataReadMs: 0,
    signedUrlCount: 0,
    signedUrlCacheHitCount: 0,
    signedUrlMs: 0,
    croppedImageCount: 0,
    persistedDimensionCount: 0,
    legacyMissingDimensionCount: 0,
    dimensionDownloadCount: 0,
    dimensionDownloadMs: 0,
    totalMs: 0,
  };
}

function roundMs(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

async function readPublishAssetMetadata(
  storagePath: string,
  cache: PublishAssetResolveCache
): Promise<PublishAssetMetadata> {
  const bucket = getStorage().bucket();
  const safePath = normalizeStoragePathCandidate(storagePath);
  if (!safePath) {
    return { exists: false, downloadTokens: new Set(), generation: "" };
  }

  const cacheKey = `${bucket.name}/${safePath}`;
  if (!cache.metadata.has(cacheKey)) {
    cache.diagnostics.metadataReadCount += 1;
    const resolution = (async (): Promise<PublishAssetMetadata> => {
      const startedAt = performance.now();
      try {
        const file = bucket.file(safePath);
        const [metadata] = await file.getMetadata();
        return {
          exists: true,
          downloadTokens: parseDownloadTokens(metadata),
          generation: getString(metadata?.generation),
        };
      } catch (error) {
        logger.warn("Asset de publicacion no encontrado en Storage", {
          storagePath: safePath,
          error: error instanceof Error ? error.message : String(error || ""),
        });
        return { exists: false, downloadTokens: new Set(), generation: "" };
      } finally {
        cache.diagnostics.metadataReadMs += performance.now() - startedAt;
      }
    })();

    cache.metadata.set(cacheKey, resolution);
  } else {
    cache.diagnostics.metadataCacheHitCount += 1;
  }

  return cache.metadata.get(cacheKey) as Promise<PublishAssetMetadata>;
}

async function resolveStoragePathToReadUrl(
  storagePath: string,
  directValue: string,
  persistedGeneration: string,
  persistedDownloadToken: string,
  cache: PublishAssetResolveCache
): Promise<string | null> {
  const bucket = getStorage().bucket();
  const safePath = normalizeStoragePathCandidate(storagePath);
  if (!safePath) return null;

  const directToken = getFirebaseDownloadToken(directValue);
  if (
    directToken &&
    persistedGeneration &&
    persistedDownloadToken &&
    directToken === persistedDownloadToken
  ) {
    cache.diagnostics.canonicalDescriptorReuseCount += 1;
    return directValue;
  }

  const metadata = await readPublishAssetMetadata(safePath, cache);
  if (!metadata.exists) {
    cache.diagnostics.unresolvedAssetCount += 1;
    return null;
  }

  const persistedVersionMatches =
    !persistedGeneration ||
    !metadata.generation ||
    metadata.generation === persistedGeneration;
  if (
    directToken &&
    persistedVersionMatches &&
    metadata.downloadTokens.has(directToken)
  ) {
    cache.diagnostics.verifiedDownloadUrlReuseCount += 1;
    return directValue;
  }

  const cacheKey = `${bucket.name}/${safePath}`;
  if (!cache.signedUrls.has(cacheKey)) {
    cache.diagnostics.signedUrlCount += 1;
    const resolution = (async (): Promise<string | null> => {
      const startedAt = performance.now();
      try {
        const [url] = await bucket.file(safePath).getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
        });
        return url;
      } catch (error) {
        logger.warn("No se pudo firmar asset de publicacion", {
          storagePath: safePath,
          error: error instanceof Error ? error.message : String(error || ""),
        });
        return null;
      } finally {
        cache.diagnostics.signedUrlMs += performance.now() - startedAt;
      }
    })();
    cache.signedUrls.set(cacheKey, resolution);
  } else {
    cache.diagnostics.signedUrlCacheHitCount += 1;
  }

  return cache.signedUrls.get(cacheKey) as Promise<string | null>;
}

async function resolvePublishAssetValue(
  rawValue: unknown,
  storagePathOverride: unknown,
  persistedGeneration: unknown,
  persistedDownloadToken: unknown,
  cache: PublishAssetResolveCache
): Promise<string> {
  cache.diagnostics.assetFieldCount += 1;
  const bucket = getStorage().bucket();
  const directValue = getString(rawValue);
  const directLocation = directValue
    ? parseBucketAndPathFromStorageValue(directValue, bucket.name)
    : null;
  const overridePath = normalizeStoragePathCandidate(getString(storagePathOverride));

  const directPath =
    directLocation && areEquivalentStorageBuckets(directLocation.bucketName, bucket.name)
      ? normalizeStoragePathCandidate(directLocation.path)
      : "";
  const storagePath = directPath || overridePath;
  const descriptorMatchesDirectAsset = Boolean(
    directPath && overridePath && directPath === overridePath
  );

  if (!storagePath) {
    return directValue;
  }

  const resolvedUrl = await resolveStoragePathToReadUrl(
    storagePath,
    directValue,
    descriptorMatchesDirectAsset ? getString(persistedGeneration) : "",
    descriptorMatchesDirectAsset ? getString(persistedDownloadToken) : "",
    cache
  );
  return resolvedUrl || directValue || storagePath;
}

async function normalizePublishAssetFieldsDeep(
  value: unknown,
  cache: PublishAssetResolveCache
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((entry) => normalizePublishAssetFieldsDeep(entry, cache))
    );
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = await Promise.all(
      Object.entries(source).map(async ([key, nestedValue]) => {
        if (PUBLISH_ASSET_FIELD_KEYS.has(key)) {
          if (typeof nestedValue !== "string") {
            if (nestedValue !== null && nestedValue !== undefined) {
              logger.warn("Campo asset invalido en publicacion", {
                fieldKey: key,
                valueType: typeof nestedValue,
              });
            }
            return [key, ""] as const;
          }

          const storagePathOverride =
            key === "fondoImagen"
              ? source.fondoImagenStoragePath
              : source.storagePath;
          const persistedGeneration =
            key === "fondoImagen"
              ? source.fondoImagenStorageGeneration
              : source.storageGeneration;
          const persistedDownloadToken =
            key === "fondoImagen"
              ? source.fondoImagenDownloadToken
              : source.storageDownloadToken;
          const normalized = await resolvePublishAssetValue(
            nestedValue,
            storagePathOverride,
            persistedGeneration,
            persistedDownloadToken,
            cache
          );
          return [key, normalized] as const;
        }

        const normalizedNested = await normalizePublishAssetFieldsDeep(
          nestedValue,
          cache
        );
        return [key, normalizedNested] as const;
      })
    );

    return normalizePublishObjectAssetContracts(
      Object.fromEntries(entries) as Record<string, unknown>
    );
  }

  return value;
}

function normalizePublishObjectAssetContracts(
  value: Record<string, unknown>
): Record<string, unknown> {
  return normalizeRenderAssetObject(value);
}

async function normalizePublishSections(
  secciones: unknown[],
  cache: PublishAssetResolveCache
): Promise<unknown[]> {
  const list = Array.isArray(secciones) ? secciones : [];

  return Promise.all(
    list.map(async (section) => {
      if (!section || typeof section !== "object") return section;

      const normalizedSection = await normalizePublishAssetFieldsDeep(section, cache);
      const nextSection = {
        ...(normalizedSection as Record<string, unknown>),
      };
      const backgroundModel = normalizeSectionBackgroundModel(nextSection);

      nextSection.decoracionesFondo = buildSectionDecorationsPayload(
        {
          items: backgroundModel.decoraciones.map((decoration) => ({
            ...decoration,
          })),
          parallax: backgroundModel.parallax,
        },
        {
          sectionHeight: resolveSectionHeight(nextSection.altura),
        }
      );

      return normalizeRenderAssetSection(nextSection);
    })
  );
}

export async function normalizePublishRenderStateAssets(params: {
  objetos: unknown[];
  secciones: unknown[];
}, options: {
  purpose?: string;
} = {}): Promise<{
  objetos: unknown[];
  secciones: unknown[];
  diagnostics: PublishAssetNormalizationDiagnostics;
}> {
  const startedAt = performance.now();
  const diagnostics = createDiagnostics(options.purpose);
  const cache: PublishAssetResolveCache = {
    metadata: new Map(),
    signedUrls: new Map(),
    diagnostics,
  };
  const safeObjetos = Array.isArray(params.objetos) ? params.objetos : [];
  const safeSecciones = Array.isArray(params.secciones) ? params.secciones : [];

  const [objetos, secciones] = await Promise.all([
    normalizePublishAssetFieldsDeep(safeObjetos, cache),
    normalizePublishSections(safeSecciones, cache),
  ]);
  const objetosConDimensionesOrigen = await backfillPublishImageSourceDimensions(
    Array.isArray(objetos) ? objetos : [],
    {
      onDiagnostics: (dimensionDiagnostics) => {
        diagnostics.croppedImageCount = dimensionDiagnostics.croppedImageCount;
        diagnostics.persistedDimensionCount =
          dimensionDiagnostics.persistedDimensionCount;
        diagnostics.legacyMissingDimensionCount =
          dimensionDiagnostics.legacyMissingDimensionCount;
        diagnostics.dimensionDownloadCount =
          dimensionDiagnostics.dimensionDownloadCount;
        diagnostics.dimensionDownloadMs =
          dimensionDiagnostics.dimensionDownloadMs;
      },
    }
  );
  const renderAssetState = normalizeRenderAssetState({
    objetos: Array.isArray(objetosConDimensionesOrigen)
      ? objetosConDimensionesOrigen
      : [],
    secciones: Array.isArray(secciones) ? secciones : [],
  });

  diagnostics.metadataReadMs = roundMs(diagnostics.metadataReadMs);
  diagnostics.signedUrlMs = roundMs(diagnostics.signedUrlMs);
  diagnostics.dimensionDownloadMs = roundMs(diagnostics.dimensionDownloadMs);
  diagnostics.totalMs = roundMs(performance.now() - startedAt);

  logger.info("[PREVIEW:ASSETS] normalizePublishRenderStateAssets", diagnostics);

  return {
    objetos: renderAssetState.objetos,
    secciones: renderAssetState.secciones,
    diagnostics,
  };
}
