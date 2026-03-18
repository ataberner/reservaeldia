import { useEffect, useState } from "react";

const EMPTY_SNAPSHOT = Object.freeze([null, "none"]);
const imageEntryCache = new Map();

function buildCacheKey(src, crossOrigin) {
  return `${String(crossOrigin || "")}::${String(src || "")}`;
}

function createEmptySnapshot() {
  return [null, "none"];
}

function createSnapshot(entry) {
  if (!entry) return createEmptySnapshot();
  return [entry.image || null, entry.status || "loading"];
}

function notifyEntry(entry) {
  if (!entry?.listeners) return;
  entry.listeners.forEach((listener) => {
    try {
      listener(createSnapshot(entry));
    } catch {}
  });
}

function getOrCreateImageEntry(src, crossOrigin) {
  const safeSrc = String(src || "").trim();
  if (!safeSrc || typeof Image === "undefined") return null;

  const cacheKey = buildCacheKey(safeSrc, crossOrigin);
  const cachedEntry = imageEntryCache.get(cacheKey);
  if (cachedEntry && cachedEntry.status !== "failed") return cachedEntry;
  if (cachedEntry?.status === "failed") {
    imageEntryCache.delete(cacheKey);
  }

  const image = new Image();
  if (crossOrigin !== undefined && crossOrigin !== null && crossOrigin !== "") {
    image.crossOrigin = crossOrigin;
  }

  const entry = {
    key: cacheKey,
    src: safeSrc,
    crossOrigin,
    image: null,
    status: "loading",
    listeners: new Set(),
  };

  image.onload = () => {
    entry.image = image;
    entry.status = "loaded";
    notifyEntry(entry);
  };

  image.onerror = () => {
    entry.status = "failed";
    notifyEntry(entry);
  };

  image.src = safeSrc;

  if (image.complete && image.naturalWidth > 0) {
    entry.image = image;
    entry.status = "loaded";
  }

  imageEntryCache.set(cacheKey, entry);
  return entry;
}

export default function useSharedImage(src, crossOrigin = "anonymous") {
  const safeSrc = String(src || "").trim();
  const [snapshot, setSnapshot] = useState(() => {
    if (!safeSrc) return EMPTY_SNAPSHOT;
    const entry = getOrCreateImageEntry(safeSrc, crossOrigin);
    return entry ? createSnapshot(entry) : EMPTY_SNAPSHOT;
  });

  useEffect(() => {
    if (!safeSrc) {
      setSnapshot(EMPTY_SNAPSHOT);
      return undefined;
    }

    const entry = getOrCreateImageEntry(safeSrc, crossOrigin);
    if (!entry) {
      setSnapshot(EMPTY_SNAPSHOT);
      return undefined;
    }

    setSnapshot(createSnapshot(entry));

    const handleUpdate = (nextSnapshot) => {
      setSnapshot(nextSnapshot);
    };

    entry.listeners.add(handleUpdate);
    return () => {
      entry.listeners.delete(handleUpdate);
    };
  }, [crossOrigin, safeSrc]);

  return snapshot;
}
