const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{5,79}$/;
const IMAGE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
]);

export function normalizeProviderImageExtension(extension: unknown): string {
  const normalized = String(extension || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  if (!ALLOWED_EXTENSIONS.has(normalized)) {
    throw new Error("Unsupported provider image extension.");
  }
  return normalized;
}

function assertProviderId(providerId: string): void {
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new Error("Invalid provider ID for Storage path.");
  }
}

export function buildProviderCoverStoragePath(
  providerId: string,
  extension: unknown
): string {
  assertProviderId(providerId);
  const normalizedExtension = normalizeProviderImageExtension(extension);
  return `proveedores/${providerId}/portada/portada-original.${normalizedExtension}`;
}

export function buildProviderGalleryStoragePath(
  providerId: string,
  imageId: string,
  extension: unknown
): string {
  assertProviderId(providerId);
  if (!IMAGE_ID_PATTERN.test(imageId)) {
    throw new Error("Invalid provider image ID for Storage path.");
  }
  const normalizedExtension = normalizeProviderImageExtension(extension);
  return `proveedores/${providerId}/galeria/${imageId}.${normalizedExtension}`;
}
