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

const PUBLISH_ASSET_FIELD_KEYS = new Set([
  "src",
  "url",
  "mediaUrl",
  "fondoImagen",
  "frameSvgUrl",
]);
const DEFAULT_SECTION_HEIGHT = 600;

type PublishAssetResolveCache = Map<string, Promise<string | null>>;

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSectionHeight(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SECTION_HEIGHT;
  return parsed;
}

async function resolveStoragePathToReadUrl(
  storagePath: string,
  cache: PublishAssetResolveCache
): Promise<string | null> {
  const bucket = getStorage().bucket();
  const safePath = normalizeStoragePathCandidate(storagePath);
  if (!safePath) return null;

  const cacheKey = `${bucket.name}/${safePath}`;
  if (!cache.has(cacheKey)) {
    const resolution = (async (): Promise<string | null> => {
      try {
        const file = bucket.file(safePath);
        const [exists] = await file.exists();
        if (!exists) {
          logger.warn("Asset de publicacion no encontrado en Storage", {
            storagePath: safePath,
          });
          return null;
        }

        const [url] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
        });
        return url;
      } catch (error) {
        logger.warn("No se pudo resolver asset de publicacion", {
          storagePath: safePath,
          error: error instanceof Error ? error.message : String(error || ""),
        });
        return null;
      }
    })();

    cache.set(cacheKey, resolution);
  }

  return cache.get(cacheKey) as Promise<string | null>;
}

async function resolvePublishAssetValue(
  rawValue: unknown,
  storagePathOverride: unknown,
  cache: PublishAssetResolveCache
): Promise<string> {
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

  if (!storagePath) {
    return directValue;
  }

  const resolvedUrl = await resolveStoragePathToReadUrl(storagePath, cache);
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
            key === "src" || key === "url" ? source.storagePath : null;
          const normalized = await resolvePublishAssetValue(
            nestedValue,
            storagePathOverride,
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
  if (getString(value.tipo).toLowerCase() !== "galeria") {
    return value;
  }

  const sourceCells = Array.isArray(value.cells) ? value.cells : [];
  const nextCells = sourceCells.map((cell) => {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) return cell;

    const sourceCell = cell as Record<string, unknown>;
    const resolvedMediaUrl =
      getString(sourceCell.mediaUrl) ||
      getString(sourceCell.url) ||
      getString(sourceCell.src);

    if (getString(sourceCell.mediaUrl) === resolvedMediaUrl) {
      return sourceCell;
    }

    return {
      ...sourceCell,
      mediaUrl: resolvedMediaUrl,
    };
  });

  return {
    ...value,
    cells: nextCells,
  };
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

      return nextSection;
    })
  );
}

export async function normalizePublishRenderStateAssets(params: {
  objetos: unknown[];
  secciones: unknown[];
}): Promise<{ objetos: unknown[]; secciones: unknown[] }> {
  const cache: PublishAssetResolveCache = new Map();
  const safeObjetos = Array.isArray(params.objetos) ? params.objetos : [];
  const safeSecciones = Array.isArray(params.secciones) ? params.secciones : [];

  const [objetos, secciones] = await Promise.all([
    normalizePublishAssetFieldsDeep(safeObjetos, cache),
    normalizePublishSections(safeSecciones, cache),
  ]);
  const objetosConDimensionesOrigen = await backfillPublishImageSourceDimensions(
    Array.isArray(objetos) ? objetos : []
  );

  return {
    objetos: Array.isArray(objetosConDimensionesOrigen)
      ? objetosConDimensionesOrigen
      : [],
    secciones: Array.isArray(secciones) ? secciones : [],
  };
}
