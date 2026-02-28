import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SHAPE_LIBRARY,
  buildOrderedCategories,
  dedupeCatalogItems,
  filterByCategory,
  groupResultsByKind,
  mergeCatalogItems,
  normalizeCatalogIconItem,
  normalizeQueryText,
  normalizeRecentEntry,
  rankItemsByQuery,
  sortLibraryItemsDefault,
} from "@/domain/elements/catalog";
import {
  fetchFirestoreCatalogPage,
  fetchFirestorePopularCatalog,
  fetchStorageCatalogPage,
} from "@/domain/elements/service";

const RECENT_STORAGE_KEY = "editor:elements:recent:v1";
const RECENT_LIMIT = 24;
const FIRESTORE_PAGE_SIZE = 96;
const STORAGE_PAGE_SIZE = 72;
const CATALOG_CACHE_TTL_MS = 2 * 60 * 1000;

let catalogCache = {
  updatedAt: 0,
  source: "firestore",
  libraryBaseItems: [],
  popularBaseItems: [],
  hasMore: true,
  firestoreCursor: null,
  storageToken: undefined,
};

function readRecentItems() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeRecentEntry(entry))
      .filter(Boolean)
      .sort((left, right) => (right.insertedAt || 0) - (left.insertedAt || 0))
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentItems(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(Array.isArray(items) ? items.slice(0, RECENT_LIMIT) : [])
    );
  } catch {
    // Ignore localStorage failures.
  }
}

function normalizeRawCatalogItems(rawItems = []) {
  return dedupeCatalogItems(
    (Array.isArray(rawItems) ? rawItems : [])
      .map((raw, index) => normalizeCatalogIconItem(raw, raw?.id || `raw-${index}`))
      .filter(Boolean)
  );
}

function toRecentIdentity(item) {
  if (!item) return "";
  if (item.kind === "shape") return `shape:${item.figura || item.id}`;
  return `${item.kind}:${item.id}:${item.src || ""}`;
}

export default function useElementCatalog() {
  const loadingRef = useRef(false);
  const initializedRef = useRef(false);
  const firestoreCursorRef = useRef(null);
  const storageTokenRef = useRef(undefined);
  const sourceRef = useRef("firestore");

  const [query, setQuery] = useState("");
  const [libraryBaseItems, setLibraryBaseItems] = useState([]);
  const [popularBaseItems, setPopularBaseItems] = useState([]);
  const [recentItems, setRecentItems] = useState(() => readRecentItems());
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("firestore");

  const saveCacheSnapshot = useCallback((snapshot) => {
    catalogCache = {
      ...catalogCache,
      ...snapshot,
      updatedAt: Date.now(),
    };
  }, []);

  const resolvePopularItems = useCallback((items, popularCandidates) => {
    const fromLibrary = (Array.isArray(items) ? items : []).filter((entry) => entry.popular);
    return sortLibraryItemsDefault(
      dedupeCatalogItems([...(Array.isArray(popularCandidates) ? popularCandidates : []), ...fromLibrary])
    );
  }, []);

  const initializeCatalog = useCallback(async () => {
    if (loadingRef.current) return;

    const now = Date.now();
    const cacheIsFresh =
      Array.isArray(catalogCache.libraryBaseItems) &&
      catalogCache.libraryBaseItems.length > 0 &&
      now - (catalogCache.updatedAt || 0) < CATALOG_CACHE_TTL_MS;
    if (cacheIsFresh) {
      setLibraryBaseItems(catalogCache.libraryBaseItems);
      setPopularBaseItems(catalogCache.popularBaseItems || []);
      setHasMore(Boolean(catalogCache.hasMore));
      setSource(catalogCache.source || "firestore");
      sourceRef.current = catalogCache.source || "firestore";
      firestoreCursorRef.current = catalogCache.firestoreCursor || null;
      storageTokenRef.current = catalogCache.storageToken;
      setError("");
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const [firstPage, popularPage] = await Promise.all([
        fetchFirestoreCatalogPage({ pageSize: FIRESTORE_PAGE_SIZE, cursor: null }),
        fetchFirestorePopularCatalog(),
      ]);
      const normalizedPage = normalizeRawCatalogItems(firstPage.items);
      const normalizedPopular = normalizeRawCatalogItems(popularPage);
      const mergedLibrary = sortLibraryItemsDefault(
        mergeCatalogItems(normalizedPage, normalizedPopular)
      );

      setLibraryBaseItems(mergedLibrary);
      setPopularBaseItems(resolvePopularItems(mergedLibrary, normalizedPopular));
      firestoreCursorRef.current = firstPage.cursor || null;
      storageTokenRef.current = undefined;
      sourceRef.current = "firestore";
      setSource("firestore");
      setHasMore(Boolean(firstPage.hasMore));
      saveCacheSnapshot({
        source: "firestore",
        libraryBaseItems: mergedLibrary,
        popularBaseItems: resolvePopularItems(mergedLibrary, normalizedPopular),
        hasMore: Boolean(firstPage.hasMore),
        firestoreCursor: firstPage.cursor || null,
        storageToken: undefined,
      });

      if (!mergedLibrary.length) {
        throw new Error("Catalogo de Firestore vacio.");
      }
    } catch (firestoreError) {
      try {
        const fallbackPage = await fetchStorageCatalogPage({
          pageSize: STORAGE_PAGE_SIZE,
          pageToken: undefined,
        });
        const fallbackItems = sortLibraryItemsDefault(normalizeRawCatalogItems(fallbackPage.items));

        setLibraryBaseItems(fallbackItems);
        setPopularBaseItems([]);
        firestoreCursorRef.current = null;
        storageTokenRef.current = fallbackPage.nextPageToken || undefined;
        sourceRef.current = "storage";
        setSource("storage");
        setHasMore(Boolean(fallbackPage.hasMore));
        setError("Catalogo remoto no disponible. Mostrando biblioteca fallback.");
        saveCacheSnapshot({
          source: "storage",
          libraryBaseItems: fallbackItems,
          popularBaseItems: [],
          hasMore: Boolean(fallbackPage.hasMore),
          firestoreCursor: null,
          storageToken: fallbackPage.nextPageToken || undefined,
        });
      } catch (storageError) {
        setLibraryBaseItems([]);
        setPopularBaseItems([]);
        firestoreCursorRef.current = null;
        storageTokenRef.current = undefined;
        sourceRef.current = "storage";
        setSource("storage");
        setHasMore(false);
        setError("No se pudo cargar la biblioteca de elementos.");
        saveCacheSnapshot({
          source: "storage",
          libraryBaseItems: [],
          popularBaseItems: [],
          hasMore: false,
          firestoreCursor: null,
          storageToken: undefined,
        });
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [resolvePopularItems, saveCacheSnapshot]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      if (sourceRef.current === "firestore") {
        const nextPage = await fetchFirestoreCatalogPage({
          pageSize: FIRESTORE_PAGE_SIZE,
          cursor: firestoreCursorRef.current,
        });
        const normalizedNext = normalizeRawCatalogItems(nextPage.items);
        firestoreCursorRef.current = nextPage.cursor || null;
        setHasMore(Boolean(nextPage.hasMore));
        setError("");
        setLibraryBaseItems((previous) => {
          const nextLibrary = sortLibraryItemsDefault(mergeCatalogItems(previous, normalizedNext));
          saveCacheSnapshot({
            source: "firestore",
            libraryBaseItems: nextLibrary,
            popularBaseItems,
            hasMore: Boolean(nextPage.hasMore),
            firestoreCursor: nextPage.cursor || null,
            storageToken: undefined,
          });
          return nextLibrary;
        });
      } else {
        const fallbackPage = await fetchStorageCatalogPage({
          pageSize: STORAGE_PAGE_SIZE,
          pageToken: storageTokenRef.current,
        });
        const normalizedNext = normalizeRawCatalogItems(fallbackPage.items);
        storageTokenRef.current = fallbackPage.nextPageToken || undefined;
        setHasMore(Boolean(fallbackPage.hasMore));
        setError("");
        setLibraryBaseItems((previous) => {
          const nextLibrary = sortLibraryItemsDefault(mergeCatalogItems(previous, normalizedNext));
          saveCacheSnapshot({
            source: "storage",
            libraryBaseItems: nextLibrary,
            popularBaseItems,
            hasMore: Boolean(fallbackPage.hasMore),
            firestoreCursor: firestoreCursorRef.current,
            storageToken: fallbackPage.nextPageToken || undefined,
          });
          return nextLibrary;
        });
      }
    } catch (loadError) {
      if (sourceRef.current === "firestore") {
        try {
          const fallbackPage = await fetchStorageCatalogPage({
            pageSize: STORAGE_PAGE_SIZE,
            pageToken: storageTokenRef.current,
          });
          const normalizedNext = normalizeRawCatalogItems(fallbackPage.items);
          sourceRef.current = "storage";
          setSource("storage");
          storageTokenRef.current = fallbackPage.nextPageToken || undefined;
          setHasMore(Boolean(fallbackPage.hasMore));
          setError("Firestore no respondio. Continuando con fallback de Storage.");
          setLibraryBaseItems((previous) => {
            const nextLibrary = sortLibraryItemsDefault(mergeCatalogItems(previous, normalizedNext));
            saveCacheSnapshot({
              source: "storage",
              libraryBaseItems: nextLibrary,
              popularBaseItems,
              hasMore: Boolean(fallbackPage.hasMore),
              firestoreCursor: null,
              storageToken: fallbackPage.nextPageToken || undefined,
            });
            return nextLibrary;
          });
        } catch {
          setHasMore(false);
          setError("No se pudieron cargar mas elementos.");
        }
      } else {
        setHasMore(false);
        setError("No se pudieron cargar mas elementos.");
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, popularBaseItems, saveCacheSnapshot]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeCatalog();
  }, [initializeCatalog]);

  const registerRecent = useCallback((item) => {
    const normalizedEntry = normalizeRecentEntry({
      ...(item || {}),
      insertedAt: Date.now(),
    });
    if (!normalizedEntry) return;

    setRecentItems((previous) => {
      const previousList = Array.isArray(previous) ? previous : [];
      const nextIdentity = toRecentIdentity(normalizedEntry);
      const merged = [
        normalizedEntry,
        ...previousList.filter((entry) => toRecentIdentity(entry) !== nextIdentity),
      ].slice(0, RECENT_LIMIT);
      writeRecentItems(merged);
      return merged;
    });
  }, []);

  const shapeItems = useMemo(() => SHAPE_LIBRARY.slice(), []);

  const libraryItems = useMemo(
    () => sortLibraryItemsDefault(dedupeCatalogItems(libraryBaseItems)),
    [libraryBaseItems]
  );

  const popularItems = useMemo(
    () => sortLibraryItemsDefault(resolvePopularItems(libraryItems, popularBaseItems)),
    [libraryItems, popularBaseItems, resolvePopularItems]
  );

  const categories = useMemo(
    () => buildOrderedCategories(mergeCatalogItems(libraryItems, popularItems)),
    [libraryItems, popularItems]
  );

  const allSearchableItems = useMemo(
    () => dedupeCatalogItems([...shapeItems, ...libraryItems]),
    [shapeItems, libraryItems]
  );

  const groupedResults = useMemo(() => {
    const normalizedQuery = normalizeQueryText(query);
    if (!normalizedQuery) {
      return {
        shape: [],
        icon: [],
        gif: [],
      };
    }

    const ranked = rankItemsByQuery(allSearchableItems, normalizedQuery);
    const grouped = groupResultsByKind(ranked);
    return {
      shape: grouped.shape.slice(0, 36),
      icon: grouped.icon.slice(0, 120),
      gif: grouped.gif.slice(0, 80),
    };
  }, [allSearchableItems, query]);

  const getLibraryByKind = useCallback(
    (kind, category = "all") => {
      const byKind = libraryItems.filter((item) => item.kind === kind);
      return filterByCategory(byKind, category);
    },
    [libraryItems]
  );

  return {
    shapeItems,
    libraryItems,
    popularItems,
    recentItems,
    categories,
    query,
    setQuery,
    groupedResults,
    hasMore,
    loadMore,
    loading,
    error,
    registerRecent,
    getLibraryByKind,
    source,
  };
}
