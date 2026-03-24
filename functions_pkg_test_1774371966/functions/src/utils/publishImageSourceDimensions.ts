import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";

import { resolvePublishImageCropState } from "./publishImageCrop";
import {
  areEquivalentStorageBuckets,
  normalizeStoragePathCandidate,
  parseBucketAndPathFromStorageValue,
} from "./storageAssetValue";
const {
  resolveObjectPrimaryAssetUrl,
} = require("../../shared/renderAssetContract.cjs");

type UnknownRecord = Record<string, unknown>;
type PublishImageSourceSize = {
  width: number | null;
  height: number | null;
};
type PublishImageSizeCache = Map<string, Promise<PublishImageSourceSize>>;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function asRecordList(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asRecord(entry));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function resolveImageStoragePath(
  object: UnknownRecord,
  defaultBucketName: string
): string {
  const candidates = [
    getString(object.storagePath),
    resolveObjectPrimaryAssetUrl(object),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const parsed = parseBucketAndPathFromStorageValue(candidate, defaultBucketName);
    if (!parsed) continue;
    if (!areEquivalentStorageBuckets(parsed.bucketName, defaultBucketName)) continue;

    const normalizedPath = normalizeStoragePathCandidate(parsed.path);
    if (normalizedPath) return normalizedPath;
  }

  return "";
}

async function resolveStorageImageSourceSize(
  storagePath: string,
  cache: PublishImageSizeCache
): Promise<PublishImageSourceSize> {
  const bucket = getStorage().bucket();
  const safePath = normalizeStoragePathCandidate(storagePath);
  if (!safePath) {
    return {
      width: null,
      height: null,
    };
  }

  const cacheKey = `${bucket.name}/${safePath}`;
  if (!cache.has(cacheKey)) {
    const resolution = (async (): Promise<PublishImageSourceSize> => {
      try {
        const [buffer] = await bucket.file(safePath).download();
        const metadata = await sharp(buffer, {
          animated: false,
          failOnError: false,
        }).metadata();

        return {
          width: toPositiveInteger(metadata.width),
          height: toPositiveInteger(metadata.height),
        };
      } catch (error) {
        logger.warn("No se pudo resolver el tamano origen de una imagen para publish", {
          storagePath: safePath,
          error: error instanceof Error ? error.message : String(error || ""),
        });

        return {
          width: null,
          height: null,
        };
      }
    })();

    cache.set(cacheKey, resolution);
  }

  return cache.get(cacheKey) as Promise<PublishImageSourceSize>;
}

export async function backfillPublishImageSourceDimensions(
  objects: unknown[]
): Promise<UnknownRecord[]> {
  const safeObjects = asRecordList(objects);
  if (safeObjects.length === 0) return [];

  const bucket = getStorage().bucket();
  const cache: PublishImageSizeCache = new Map();

  return Promise.all(
    safeObjects.map(async (object) => {
      if (getString(object.tipo).toLowerCase() !== "imagen") {
        return object;
      }

      const cropState = resolvePublishImageCropState(object);
      if (!cropState.hasMeaningfulCrop) {
        return object;
      }

      if (cropState.sourceWidth !== null && cropState.sourceHeight !== null) {
        return object;
      }

      const storagePath = resolveImageStoragePath(object, bucket.name);
      if (!storagePath) {
        return object;
      }

      const sourceSize = await resolveStorageImageSourceSize(storagePath, cache);
      const nextWidth = cropState.sourceWidth ?? sourceSize.width;
      const nextHeight = cropState.sourceHeight ?? sourceSize.height;

      if (nextWidth === cropState.sourceWidth && nextHeight === cropState.sourceHeight) {
        return object;
      }

      return {
        ...object,
        ...(nextWidth ? { ancho: nextWidth } : {}),
        ...(nextHeight ? { alto: nextHeight } : {}),
      };
    })
  );
}
