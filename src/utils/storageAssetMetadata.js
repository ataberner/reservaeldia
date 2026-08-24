import { getMetadata, ref as storageRef } from "firebase/storage";
import { storage } from "@/firebase";
import {
  buildStorageAssetDescriptor,
  resolveStorageAssetUrl,
} from "@/domain/assets/storageAssetDescriptor";

const metadataResolutionCache = new Map();

function normalizeText(value) {
  return String(value || "").trim();
}

export function hasCompleteStorageAssetDescriptor(value) {
  return Boolean(
    normalizeText(value?.storagePath) &&
      normalizeText(value?.storageGeneration) &&
      normalizeText(value?.storageDownloadToken)
  );
}

export async function resolveStorageAssetDescriptorFromMetadata(value) {
  const url = resolveStorageAssetUrl(value);
  const persistedPath = normalizeText(value?.storagePath);
  const referenceValue = persistedPath || url;
  if (!referenceValue) return null;

  const cacheKey = persistedPath || url;
  if (!metadataResolutionCache.has(cacheKey)) {
    metadataResolutionCache.set(
      cacheKey,
      (async () => {
        try {
          const assetRef = storageRef(storage, referenceValue);
          const metadata = await getMetadata(assetRef);
          return buildStorageAssetDescriptor({
            url,
            storagePath: metadata.fullPath || assetRef.fullPath,
            storageGeneration: metadata.generation,
            storageDownloadToken: value?.storageDownloadToken,
            width: metadata.customMetadata?.sourceWidth,
            height: metadata.customMetadata?.sourceHeight,
          });
        } catch {
          return null;
        }
      })()
    );
  }

  return metadataResolutionCache.get(cacheKey);
}
