import { getStorage } from "firebase-admin/storage";
import { createHash } from "node:crypto";
import * as logger from "firebase-functions/logger";
import {
  buildSectionDecorationsPayload,
  normalizeSectionBackgroundModel,
} from "./sectionBackground";
import {
  normalizeStoragePathCandidate,
} from "./storageAssetValue";
import { createRenderAssetAuthorizer, requireRenderAssetAccessContext, type RenderAssetAccessContext } from "../render/renderAssetAuthorization";
import { parseRenderAssetReference } from "../render/renderAssetReference";
import type { IconSvgRenderable } from "../iconCatalog/types";
import { backfillPublishImageSourceDimensions } from "./publishImageSourceDimensions";
const {
  normalizeRenderAssetObject,
  normalizeRenderAssetSection,
  normalizeRenderAssetState,
} = require("../../shared/renderAssetContract.cjs");
const { normalizeIconRenderable, buildIconSvgDataUrl } = require("../../shared/iconRenderableContract.cjs");

const PUBLISH_ASSET_FIELD_KEYS = new Set([
  "src",
  "url",
  "mediaUrl",
  "fondoImagen",
  "frameSvgUrl",
  "imageUrl",
  "giftListUrl",
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
  authorizer: ReturnType<typeof createRenderAssetAuthorizer>;
  metadata: Map<string, Promise<PublishAssetMetadata>>;
  signedUrls: Map<string, Promise<string | null>>;
  iconSnapshots: Map<string, Promise<IconSvgRenderable | null>>;
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
    const localStorage = process.env.RESERVA_FIREBASE_MODE === "emulators" &&
      url.host === process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    if (url.hostname.replace(/\.+$/, "") !== "firebasestorage.googleapis.com" &&
      !url.hostname.replace(/\.+$/, "").endsWith(".firebasestorage.app") && !localStorage) {
      return "";
    }
    return getString(url.searchParams.get("token"));
  } catch {
    return "";
  }
}

function canonicalDownloadUrl(path: string, token: string, directValue: string): string {
  const bucketName = getStorage().bucket().name;
  let origin = "https://firebasestorage.googleapis.com";
  if (process.env.RESERVA_FIREBASE_MODE === "emulators" && bucketName.startsWith("demo-")) {
    try {
      const url = new URL(directValue);
      if (url.host === process.env.FIREBASE_STORAGE_EMULATOR_HOST) origin = url.origin;
    } catch { /* Non-URL values cannot supply a download token. */ }
  }
  return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
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

  // Keep the guard at the resolution boundary as well as at descriptor parsing:
  // neither a reused token nor either cache is an authorization source.
  await cache.authorizer.authorize(safePath);

  const directToken = getFirebaseDownloadToken(directValue);
  if (
    directToken &&
    persistedGeneration &&
    persistedDownloadToken &&
    directToken === persistedDownloadToken
  ) {
    cache.diagnostics.canonicalDescriptorReuseCount += 1;
    return canonicalDownloadUrl(safePath, directToken, directValue);
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
    return canonicalDownloadUrl(safePath, directToken, directValue);
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
  const directValue = getString(rawValue);
  // Authorize BOTH representations, including a descriptor that differs from
  // its displayed URL. An allowed override cannot launder a private direct URL.
  const directLocation = await cache.authorizer.authorize(directValue);
  const overrideLocation = await cache.authorizer.authorize(getString(storagePathOverride));
  const directPath = directLocation.kind === "storage" ? directLocation.path : "";
  const overridePath = overrideLocation.kind === "storage" ? overrideLocation.path : "";
  const storagePath = directPath || overridePath;
  const descriptorMatchesDirectAsset = Boolean(
    directPath && overridePath && directPath === overridePath
  );

  if (!storagePath) {
    return directLocation.kind === "external" ? directLocation.value : "";
  }

  const resolvedUrl = await resolveStoragePathToReadUrl(
    storagePath,
    directValue,
    descriptorMatchesDirectAsset ? getString(persistedGeneration) : "",
    descriptorMatchesDirectAsset ? getString(persistedDownloadToken) : "",
    cache
  );
  // No unverified input URL/path is returned when a Storage resolution fails.
  // Validation can report the absent asset without exposing an alternate route.
  return resolvedUrl || "";
}

async function prepareCanonicalIconSnapshot(
  source: Record<string, unknown>,
  cache: PublishAssetResolveCache
): Promise<Record<string, unknown>> {
  if (source.tipo !== "icono" || source.formato !== "svg" || !source.iconRender) return source;
  const snapshot = normalizeIconRenderable(source.iconRender) as IconSvgRenderable | null;
  if (!snapshot) return source;
  const bytes = Buffer.byteLength(snapshot.svgText, "utf8");
  const hash = createHash("sha256").update(snapshot.svgText).digest("hex");
  if (bytes !== snapshot.bytes || hash !== snapshot.hashSha256) return { ...source, iconRender: null };

  if (!cache.iconSnapshots.has(hash)) {
    cache.iconSnapshots.set(hash, (async () => {
      // Lazy import keeps JSDOM/sharp out of the render module's import path.
      // The catalog's existing SVG authority validates the stored bytes; schema
      // fields or a client-supplied hash alone never establish a safe snapshot.
      const { inspectAndNormalizeSvg } = await import("../iconCatalog/svgValidation");
      const report = await inspectAndNormalizeSvg({ svgText: snapshot.svgText,
        fileName: "persisted-icon.svg", bytes, normalizeSafe: true, normalizeCurrentColor: false });
      return report.renderable;
    })());
  }
  const verified = await cache.iconSnapshots.get(hash);
  if (!verified || verified.hashSha256 !== hash || verified.bytes !== bytes ||
      verified.viewBox !== snapshot.viewBox || verified.geometryCount !== snapshot.geometryCount ||
      verified.colorMode !== snapshot.colorMode) return { ...source, iconRender: null };

  // Catalog URLs are provenance for a canonical SVG, not render inputs. Only
  // this narrow iconos provenance may skip current catalog availability. Any
  // unrelated private reference still goes through the ordinary authorization.
  for (const key of ["src", "url", "storagePath"]) {
    const value = getString(source[key]);
    if (!value) continue;
    const reference = parseRenderAssetReference(value, getStorage().bucket().name);
    if (reference.kind === "storage" && reference.path.startsWith("iconos/")) continue;
    await cache.authorizer.authorize(value);
  }
  const result = { ...source, iconRender: verified, src: buildIconSvgDataUrl(verified, source.color),
    url: buildIconSvgDataUrl(verified, source.color) } as Record<string, unknown>;
  // A Storage descriptor cannot override this self-contained image downstream.
  delete result.storagePath;
  delete result.storageGeneration;
  delete result.storageDownloadToken;
  return result;
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
    const source = await prepareCanonicalIconSnapshot(value as Record<string, unknown>, cache);
    for (const key of ["storagePath", "fondoImagenStoragePath"]) {
      if (typeof source[key] === "string" && source[key]) await cache.authorizer.authorize(source[key] as string);
    }
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
  gifts?: unknown;
}, options: {
  purpose?: string;
  assetAccess?: RenderAssetAccessContext;
} = {}): Promise<{
  objetos: unknown[];
  secciones: unknown[];
  gifts: Record<string, unknown> | null;
  diagnostics: PublishAssetNormalizationDiagnostics;
}> {
  const startedAt = performance.now();
  const diagnostics = createDiagnostics(options.purpose);
  const assetAccess = requireRenderAssetAccessContext(options.assetAccess);
  const cache: PublishAssetResolveCache = {
    authorizer: createRenderAssetAuthorizer(assetAccess, getStorage().bucket().name),
    metadata: new Map(),
    signedUrls: new Map(),
    iconSnapshots: new Map(),
    diagnostics,
  };
  const safeObjetos = Array.isArray(params.objetos) ? params.objetos : [];
  const safeSecciones = Array.isArray(params.secciones) ? params.secciones : [];

  const safeGifts = params.gifts && typeof params.gifts === "object" && !Array.isArray(params.gifts)
    ? params.gifts : null;
  const [objetos, secciones, gifts] = await Promise.all([
    normalizePublishAssetFieldsDeep(safeObjetos, cache),
    normalizePublishSections(safeSecciones, cache),
    normalizePublishAssetFieldsDeep(safeGifts, cache),
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
    gifts: gifts as Record<string, unknown> | null,
    diagnostics,
  };
}
