export function normalizeStoragePathCandidate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^gs:\/\//i.test(raw)) {
    const withoutScheme = raw.replace(/^gs:\/\//i, "");
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash <= 0) return "";
    return withoutScheme.slice(firstSlash + 1).replace(/^\/+/, "");
  }

  return raw.replace(/^\/+/, "");
}

export function parseBucketAndPathFromStorageValue(
  rawValue: string,
  defaultBucketName: string
): { bucketName: string; path: string } | null {
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

  return { bucketName: defaultBucketName, path: normalizedPath };
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

export function areEquivalentStorageBuckets(a: string, b: string): boolean {
  const keyA = getBucketProjectKey(a);
  const keyB = getBucketProjectKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}
