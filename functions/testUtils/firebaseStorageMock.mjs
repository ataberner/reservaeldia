import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const storageModule = require("firebase-admin/storage");

function normalizeStoragePath(path) {
  return String(path || "").trim().replace(/^\/+/, "");
}

function mergeMetadata(currentValue, nextValue) {
  const current =
    currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
      ? currentValue
      : {};
  const next =
    nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
      ? nextValue
      : {};

  return {
    ...current,
    ...next,
    metadata: {
      ...(current.metadata && typeof current.metadata === "object"
        ? current.metadata
        : {}),
      ...(next.metadata && typeof next.metadata === "object" ? next.metadata : {}),
    },
  };
}

export function buildMockSignedUrl(bucketName, path) {
  return `https://signed.example.test/${encodeURIComponent(
    String(bucketName || "").trim()
  )}/${encodeURIComponent(normalizeStoragePath(path))}`;
}

export function installFirebaseStorageMock({
  defaultBucketName = "reservaeldia-7a440.firebasestorage.app",
  files = {},
} = {}) {
  const originalGetStorage = storageModule.getStorage;
  const originalApp = admin.app;
  const originalInitializeApp = admin.initializeApp;
  const originalApplicationDefault = admin.credential.applicationDefault;
  const hadOwnAppsProperty = Object.prototype.hasOwnProperty.call(admin, "apps");
  const originalAppsDescriptor = hadOwnAppsProperty
    ? Object.getOwnPropertyDescriptor(admin, "apps")
    : null;

  const fileStates = new Map();
  const copies = [];
  const metadataWrites = [];
  const mockApp = { name: "__firebase-storage-mock__" };

  const setFileState = (bucketName, path, state = {}) => {
    const safeBucketName = String(bucketName || defaultBucketName).trim();
    const safePath = normalizeStoragePath(path);
    const key = `${safeBucketName}/${safePath}`;
    const previous = fileStates.get(key) || {};
    fileStates.set(key, {
      ...previous,
      ...state,
      exists: state.exists !== false,
      metadata: mergeMetadata(previous.metadata, state.metadata),
    });
  };

  const getFileState = (bucketName, path) => {
    const safeBucketName = String(bucketName || defaultBucketName).trim();
    const safePath = normalizeStoragePath(path);
    const key = `${safeBucketName}/${safePath}`;
    const existing = fileStates.get(key);
    if (existing) {
      return existing;
    }

    return {
      exists: false,
      metadata: {},
      signedUrl: buildMockSignedUrl(safeBucketName, safePath),
      downloadBuffer: null,
    };
  };

  Object.entries(files).forEach(([path, state]) => {
    setFileState(defaultBucketName, path, state);
  });

  Object.defineProperty(admin, "apps", {
    value: [mockApp],
    configurable: true,
  });
  admin.app = () => mockApp;
  admin.initializeApp = () => mockApp;
  admin.credential.applicationDefault = () => ({ projectId: "fixture-project" });

  storageModule.getStorage = () => ({
    bucket(bucketName = defaultBucketName) {
      const safeBucketName = String(bucketName || defaultBucketName).trim();

      return {
        name: safeBucketName,
        file(path) {
          const safePath = normalizeStoragePath(path);

          return {
            __bucketName: safeBucketName,
            __path: safePath,
            async exists() {
              return [getFileState(safeBucketName, safePath).exists === true];
            },
            async getSignedUrl() {
              const state = getFileState(safeBucketName, safePath);
              return [state.signedUrl || buildMockSignedUrl(safeBucketName, safePath)];
            },
            async copy(destinationFile) {
              const sourceState = getFileState(safeBucketName, safePath);
              const destinationBucketName =
                String(destinationFile?.__bucketName || defaultBucketName).trim();
              const destinationPath = normalizeStoragePath(destinationFile?.__path);

              setFileState(destinationBucketName, destinationPath, {
                exists: true,
                metadata: sourceState.metadata,
                downloadBuffer: sourceState.downloadBuffer,
              });

              copies.push({
                sourceBucketName: safeBucketName,
                sourcePath: safePath,
                destinationBucketName,
                destinationPath,
              });

              return [destinationFile];
            },
            async getMetadata() {
              return [getFileState(safeBucketName, safePath).metadata || {}];
            },
            async setMetadata(metadata) {
              const current = getFileState(safeBucketName, safePath);
              setFileState(safeBucketName, safePath, {
                ...current,
                metadata: mergeMetadata(current.metadata, metadata),
              });
              metadataWrites.push({
                bucketName: safeBucketName,
                path: safePath,
                metadata,
              });
            },
            async download() {
              const state = getFileState(safeBucketName, safePath);
              return [state.downloadBuffer || Buffer.alloc(0)];
            },
          };
        },
      };
    },
  });

  return {
    copies,
    metadataWrites,
    restore() {
      storageModule.getStorage = originalGetStorage;
      admin.app = originalApp;
      admin.initializeApp = originalInitializeApp;
      admin.credential.applicationDefault = originalApplicationDefault;

      if (hadOwnAppsProperty && originalAppsDescriptor) {
        Object.defineProperty(admin, "apps", originalAppsDescriptor);
      } else {
        delete admin.apps;
      }
    },
    getFileState(path, bucketName = defaultBucketName) {
      return getFileState(bucketName, path);
    },
  };
}

