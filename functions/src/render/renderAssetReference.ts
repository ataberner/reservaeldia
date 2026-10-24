import { HttpsError } from "firebase-functions/v2/https";
import { areEquivalentStorageBuckets } from "../utils/storageAssetValue";

export type RenderAssetReference =
  | { kind: "empty" }
  | { kind: "external"; value: string }
  | { kind: "storage"; bucketName: string; path: string };

export function denyRenderAsset(): never {
  // Never include a private path, token or URL in the error sent to the client.
  throw new HttpsError("permission-denied", "No tenes permiso para utilizar uno de los archivos.");
}

export function hasRenderReferenceControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function decodeReference(value: string): string {
  let decoded = value;
  try {
    for (let pass = 0; pass < 4 && /%[0-9a-f]{2}/i.test(decoded); pass += 1) {
      decoded = decodeURIComponent(decoded);
    }
  } catch { denyRenderAsset(); }
  if (/%[0-9a-f]{2}/i.test(decoded) || /%(?![0-9a-f]{2})/i.test(decoded)) denyRenderAsset();
  return decoded;
}

function canonicalPath(value: string): string {
  const decoded = decodeReference(value).replace(/^\/+/, "");
  if (!decoded || /[\\?#]/.test(decoded) || hasRenderReferenceControlCharacter(decoded) ||
      decoded.split("/").some(segment => !segment || segment === "." || segment === "..")) {
    denyRenderAsset();
  }
  return decoded;
}

function storageReference(bucketName: string, path: string, expectedBucket: string): RenderAssetReference {
  const decodedBucket = decodeReference(bucketName);
  if (!areEquivalentStorageBuckets(decodedBucket, expectedBucket)) denyRenderAsset();
  return { kind: "storage", bucketName: expectedBucket, path: canonicalPath(path) };
}

function isStorageHost(host: string): boolean {
  // Official aliases must not fall through as unrestricted external URLs:
  // https://docs.cloud.google.com/storage/docs/request-endpoints
  // https://docs.cloud.google.com/docs/security/compliance/restrict-endpoint-usage
  // Virtual download host example: https://docs.cloud.google.com/docs/buildpacks/java
  return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com" ||
    host === "storage.cloud.google.com" || host === "www.googleapis.com" ||
    host === "content-storage.googleapis.com" || host === "storage-download.googleapis.com" ||
    host === "storage.mtls.googleapis.com" || host === "storage.mtls.cloud.google.com" ||
    host === "content-storage.mtls.googleapis.com" || host.endsWith(".storage-download.googleapis.com") ||
    host.endsWith(".storage.googleapis.com") || host.endsWith(".firebasestorage.app");
}

function isStorageDownloadPath(value: string): boolean {
  let decoded = value;
  for (let pass = 0; pass <= 4; pass += 1) {
    if (/^\/download\/storage\/v1(?:\/|$)/i.test(decoded)) return true;
    try { decoded = decodeURIComponent(decoded); }
    catch { return false; }
  }
  return false;
}

/** Parse once for permission and resolution. Ambiguous Storage forms fail closed. */
export function parseRenderAssetReference(raw: string, bucketName: string): RenderAssetReference {
  const value = raw.trim();
  if (!value) return { kind: "empty" };
  if (/^data:image\//i.test(value)) return { kind: "external", value };
  if (/^gs:\/\//i.test(value)) {
    const match = value.match(/^gs:\/\/([^/]+)\/(.+)$/i);
    if (!match) denyRenderAsset();
    return storageReference(match[1], match[2], bucketName);
  }
  if (/^(?:https?:)?\/\//i.test(value)) {
    let url: URL;
    try { url = new URL(value.startsWith("//") ? `https:${value}` : value); }
    catch { return denyRenderAsset(); }
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    const emulatorStorage = ["127.0.0.1", "localhost", "[::1]"].includes(host) && /^\/v0\/b\//.test(url.pathname);
    // Authenticated browser downloads redirect here. Restrict recognition to
    // the documented Storage path, preserving unrelated external image URLs.
    const apiDataStorage = /^[a-z0-9]+-apidata\.googleusercontent\.com$/.test(host) &&
      isStorageDownloadPath(url.pathname);
    if (!isStorageHost(host) && !emulatorStorage && !apiDataStorage) return { kind: "external", value };
    // WHATWG URL treats backslashes as separators; raw-path validation must not
    // inspect a different authority/path from the one the browser would use.
    if (value.includes("\\")) denyRenderAsset();
    if (url.username || url.password || (!emulatorStorage && url.port && url.port !== "443" && url.port !== "80")) denyRenderAsset();
    // URL normalizes literal dot segments; reject them before that normalization.
    const rawPath = value.replace(/^(?:https?:)?\/\/[^/]+/i, "").split(/[?#]/)[0];
    canonicalPath(rawPath);
    const apiPath = url.pathname.match(/^\/(?:v0|(?:download\/)?storage\/v1)\/b\/([^/]+)\/o\/(.+)$/i);
    if (apiPath) return storageReference(apiPath[1], apiPath[2], bucketName);
    if (host === "storage.googleapis.com" || host === "storage.cloud.google.com" ||
        host === "storage.mtls.googleapis.com" || host === "storage.mtls.cloud.google.com" ||
        host === "storage-download.googleapis.com") {
      const match = url.pathname.match(/^\/([^/]+)\/(.+)$/);
      if (match) return storageReference(match[1], match[2], bucketName);
    }
    if (host.endsWith(".storage.googleapis.com")) {
      return storageReference(host.slice(0, -".storage.googleapis.com".length), url.pathname, bucketName);
    }
    if (host.endsWith(".storage-download.googleapis.com")) {
      return storageReference(host.slice(0, -".storage-download.googleapis.com".length), url.pathname, bucketName);
    }
    denyRenderAsset();
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) denyRenderAsset();
  const path = canonicalPath(value);
  // These are checked-in public site resources, not bucket namespaces. In
  // particular /assets/countdown is NOT included in this exception.
  if (value.startsWith("/") && /^(?:assets\/(?:css|img|lugares|music|profesionales)\/|boda\/|icons\/|favicon_io\/|para-diseño\/)/.test(path)) {
    return { kind: "external", value: `/${path}` };
  }
  return { kind: "storage", bucketName, path };
}
