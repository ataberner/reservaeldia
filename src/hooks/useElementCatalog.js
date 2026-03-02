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
  fetchFirestoreDecorCatalogPage,
  fetchFirestorePopularCatalog,
  fetchStorageCatalogPage,
} from "@/domain/elements/service";

const RECENT_STORAGE_KEY = "editor:elements:recent:v1";
const RECENT_LIMIT = 24;
const FIRESTORE_PAGE_SIZE = 96;
const DECOR_PAGE_SIZE = 96;
const STORAGE_PAGE_SIZE = 72;
const CATALOG_CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_AUTOLOAD_MAX_ATTEMPTS = 12;
const SEARCH_AUTOLOAD_DELAY_MS = 140;
const SEARCH_CATEGORY_TARGET_MATCHES = 36;

let catalogCache = {
  updatedAt: 0,
  source: "firestore",
  libraryBaseItems: [],
  popularBaseItems: [],
  hasMore: true,
  firestoreCursor: null,
  storageToken: undefined,
  decorBaseItems: [],
  hasMoreDecor: true,
  decorCursor: null,
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
      .filter((item) => item.kind === "icon" || item.kind === "gif")
  );
}

function normalizeRawDecorItems(rawItems = []) {
  return dedupeCatalogItems(
    (Array.isArray(rawItems) ? rawItems : [])
      .map((raw, index) => normalizeCatalogIconItem(raw, raw?.id || `decor-${index}`))
      .filter(Boolean)
      .filter((item) => item.kind === "image")
  );
}

function toRecentIdentity(item) {
  if (!item) return "";
  if (item.kind === "shape") return `shape:${item.figura || item.id}`;
  return `${item.kind}:${item.id}:${item.src || ""}`;
}

export default function useElementCatalog() {
  const loadingRef = useRef(false);
  const decorLoadingRef = useRef(false);
  const initializedRef = useRef(false);
  const searchAutoloadStateRef = useRef({ query: "", attempts: 0 });
  const firestoreCursorRef = useRef(null);
  const storageTokenRef = useRef(undefined);
  const decorCursorRef = useRef(null);
  const sourceRef = useRef("firestore");

  const [query, setQuery] = useState("");
  const [libraryBaseItems, setLibraryBaseItems] = useState([]);
  const [popularBaseItems, setPopularBaseItems] = useState([]);
  const [decorBaseItems, setDecorBaseItems] = useState([]);
  const [recentItems, setRecentItems] = useState(() => readRecentItems());
  const [hasMore, setHasMore] = useState(true);
  const [hasMoreDecor, setHasMoreDecor] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingDecor, setLoadingDecor] = useState(false);
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
      Array.isArray(catalogCache.decorBaseItems) &&
      now - (catalogCache.updatedAt || 0) < CATALOG_CACHE_TTL_MS;
    if (cacheIsFresh) {
      setLibraryBaseItems(catalogCache.libraryBaseItems || []);
      setPopularBaseItems(catalogCache.popularBaseItems || []);
      setDecorBaseItems(catalogCache.decorBaseItems || []);
      setHasMore(Boolean(catalogCache.hasMore));
      setHasMoreDecor(Boolean(catalogCache.hasMoreDecor));
      setSource(catalogCache.source || "firestore");
      sourceRef.current = catalogCache.source || "firestore";
      firestoreCursorRef.current = catalogCache.firestoreCursor || null;
      storageTokenRef.current = catalogCache.storageToken;
      decorCursorRef.current = catalogCache.decorCursor || null;
      setError("");
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError("");

    const decorTask = fetchFirestoreDecorCatalogPage({
      pageSize: DECOR_PAGE_SIZE,
      cursor: null,
    }).catch(() => null);

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
      const resolvedPopular = resolvePopularItems(mergedLibrary, normalizedPopular);

      setLibraryBaseItems(mergedLibrary);
      setPopularBaseItems(resolvedPopular);
      firestoreCursorRef.current = firstPage.cursor || null;
      storageTokenRef.current = undefined;
      sourceRef.current = "firestore";
      setSource("firestore");
      setHasMore(Boolean(firstPage.hasMore));
      saveCacheSnapshot({
        source: "firestore",
        libraryBaseItems: mergedLibrary,
        popularBaseItems: resolvedPopular,
        hasMore: Boolean(firstPage.hasMore),
        firestoreCursor: firstPage.cursor || null,
        storageToken: undefined,
      });

      if (!mergedLibrary.length) {
        throw new Error("Catalogo de Firestore vacio.");
      }
    } catch {
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
      } catch {
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
      const decorPage = await decorTask;
      if (decorPage) {
        const decorItems = sortLibraryItemsDefault(normalizeRawDecorItems(decorPage.items));
        setDecorBaseItems(decorItems);
        setHasMoreDecor(Boolean(decorPage.hasMore));
        decorCursorRef.current = decorPage.cursor || null;
        saveCacheSnapshot({
          decorBaseItems: decorItems,
          hasMoreDecor: Boolean(decorPage.hasMore),
          decorCursor: decorPage.cursor || null,
        });
      } else {
        setDecorBaseItems([]);
        setHasMoreDecor(false);
        decorCursorRef.current = null;
        saveCacheSnapshot({
          decorBaseItems: [],
          hasMoreDecor: false,
          decorCursor: null,
        });
      }

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
    } catch {
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

  const loadMoreDecor = useCallback(async () => {
    if (decorLoadingRef.current || !hasMoreDecor) return;
    decorLoadingRef.current = true;
    setLoadingDecor(true);

    try {
      const nextPage = await fetchFirestoreDecorCatalogPage({
        pageSize: DECOR_PAGE_SIZE,
        cursor: decorCursorRef.current,
      });
      const normalizedNext = normalizeRawDecorItems(nextPage.items);
      decorCursorRef.current = nextPage.cursor || null;
      setHasMoreDecor(Boolean(nextPage.hasMore));
      setDecorBaseItems((previous) => {
        const nextLibrary = sortLibraryItemsDefault(mergeCatalogItems(previous, normalizedNext));
        saveCacheSnapshot({
          decorBaseItems: nextLibrary,
          hasMoreDecor: Boolean(nextPage.hasMore),
          decorCursor: nextPage.cursor || null,
        });
        return nextLibrary;
      });
    } catch {
      setHasMoreDecor(false);
    } finally {
      decorLoadingRef.current = false;
      setLoadingDecor(false);
    }
  }, [hasMoreDecor, saveCacheSnapshot]);

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

  const decorItems = useMemo(
    () => sortLibraryItemsDefault(dedupeCatalogItems(decorBaseItems)),
    [decorBaseItems]
  );

  const combinedLibraryItems = useMemo(
    () => sortLibraryItemsDefault(mergeCatalogItems(libraryItems, decorItems)),
    [libraryItems, decorItems]
  );

  const categories = useMemo(
    () => buildOrderedCategories(mergeCatalogItems(combinedLibraryItems, popularItems)),
    [combinedLibraryItems, popularItems]
  );

  const allSearchableItems = useMemo(
    () => dedupeCatalogItems([...shapeItems, ...combinedLibraryItems]),
    [shapeItems, combinedLibraryItems]
  );

  const normalizedQuery = useMemo(() => normalizeQueryText(query), [query]);

  const groupedResults = useMemo(() => {
    if (!normalizedQuery) {
      return {
        shape: [],
        icon: [],
        image: [],
        gif: [],
      };
    }

    const ranked = rankItemsByQuery(allSearchableItems, normalizedQuery);
    const grouped = groupResultsByKind(ranked);
    return {
      shape: grouped.shape.slice(0, 36),
      icon: grouped.icon.slice(0, 120),
      image: grouped.image.slice(0, 120),
      gif: grouped.gif.slice(0, 80),
    };
  }, [allSearchableItems, normalizedQuery]);

  const queryMatchesKnownCategory = useMemo(() => {
    if (!normalizedQuery) return false;
    return categories.some((entry) => {
      const value = String(entry?.value || "");
      return value === normalizedQuery || value.includes(normalizedQuery) || normalizedQuery.includes(value);
    });
  }, [categories, normalizedQuery]);

  const categoryMatchCount = useMemo(() => {
    if (!normalizedQuery) return 0;
    return combinedLibraryItems.reduce((total, item) => {
      if (!item || (item.kind !== "icon" && item.kind !== "gif" && item.kind !== "image")) {
        return total;
      }
      const itemCategories = Array.isArray(item.categories) ? item.categories : [];
      const matched = itemCategories.some(
        (value) => value === normalizedQuery || value.includes(normalizedQuery) || normalizedQuery.includes(value)
      );
      return matched ? total + 1 : total;
    }, 0);
  }, [combinedLibraryItems, normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) {
      searchAutoloadStateRef.current = { query: "", attempts: 0 };
      return;
    }

    if (searchAutoloadStateRef.current.query !== normalizedQuery) {
      searchAutoloadStateRef.current = { query: normalizedQuery, attempts: 0 };
    }

    const mediaMatches = groupedResults.icon.length + groupedResults.image.length + groupedResults.gif.length;
    const canAttemptMore = searchAutoloadStateRef.current.attempts < SEARCH_AUTOLOAD_MAX_ATTEMPTS;
    const shouldCompleteCategory = queryMatchesKnownCategory && categoryMatchCount < SEARCH_CATEGORY_TARGET_MATCHES;
    const shouldAutoloadIcons =
      hasMore && canAttemptMore && !loadingRef.current && (mediaMatches === 0 || shouldCompleteCategory);
    const shouldAutoloadDecor =
      hasMoreDecor && canAttemptMore && !decorLoadingRef.current && (groupedResults.image.length === 0 || shouldCompleteCategory);

    if (!shouldAutoloadIcons && !shouldAutoloadDecor) return;

    const timerId = window.setTimeout(() => {
      if (shouldAutoloadIcons && !loadingRef.current && hasMore) {
        loadMore();
      }
      if (shouldAutoloadDecor && !decorLoadingRef.current && hasMoreDecor) {
        loadMoreDecor();
      }
      searchAutoloadStateRef.current = {
        query: normalizedQuery,
        attempts: searchAutoloadStateRef.current.attempts + 1,
      };
    }, SEARCH_AUTOLOAD_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [
    categoryMatchCount,
    groupedResults.gif.length,
    groupedResults.icon.length,
    groupedResults.image.length,
    hasMore,
    hasMoreDecor,
    loadMore,
    loadMoreDecor,
    normalizedQuery,
    queryMatchesKnownCategory,
  ]);

  const getLibraryByKind = useCallback(
    (kind, category = "all") => {
      const byKind = combinedLibraryItems.filter((item) => item.kind === kind);
      return filterByCategory(byKind, category);
    },
    [combinedLibraryItems]
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
    hasMoreDecor,
    loadMoreDecor,
    loadingDecor,
    error,
    registerRecent,
    getLibraryByKind,
    source,
  };
}
