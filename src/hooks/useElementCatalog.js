import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SHAPE_LIBRARY,
  buildOrderedCategories,
  dedupeCatalogItems,
  filterByCategory,
  groupResultsByKind,
  mergeCatalogItems,
  normalizeCatalogIconItem,
  isCatalogItemAvailableForNewInsertion,
  normalizeQueryText,
  normalizeRecentEntry,
  rankItemsByQuery,
  sortLibraryItemsDefault,
} from "@/domain/elements/catalog";
import {
  fetchFirestoreDecorCatalogPage,
  subscribeFirestoreCatalog,
  subscribeFirestorePopularCatalog,
} from "@/domain/elements/service";

const RECENT_STORAGE_KEY = "editor:elements:recent:v1";
const RECENT_LIMIT = 24;
const FIRESTORE_PAGE_SIZE = 96;
const DECOR_PAGE_SIZE = 96;
const CATALOG_CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_AUTOLOAD_MAX_ATTEMPTS = 12;
const SEARCH_AUTOLOAD_DELAY_MS = 140;
const SEARCH_CATEGORY_TARGET_MATCHES = 36;

let catalogCache = {
  updatedAt: 0,
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
      .filter(isCatalogItemAvailableForNewInsertion)
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
  const decorCursorRef = useRef(null);

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
  const [catalogLimit, setCatalogLimit] = useState(FIRESTORE_PAGE_SIZE);

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
      Array.isArray(catalogCache.decorBaseItems) &&
      now - (catalogCache.updatedAt || 0) < CATALOG_CACHE_TTL_MS;
    if (cacheIsFresh) {
      setDecorBaseItems(catalogCache.decorBaseItems || []);
      setHasMoreDecor(Boolean(catalogCache.hasMoreDecor));
      decorCursorRef.current = catalogCache.decorCursor || null;
      return;
    }

    try {
      const decorPage = await fetchFirestoreDecorCatalogPage({
        pageSize: DECOR_PAGE_SIZE,
        cursor: null,
      });
      const decorItems = sortLibraryItemsDefault(normalizeRawDecorItems(decorPage.items));
      setDecorBaseItems(decorItems);
      setHasMoreDecor(Boolean(decorPage.hasMore));
      decorCursorRef.current = decorPage.cursor || null;
      saveCacheSnapshot({
        decorBaseItems: decorItems,
        hasMoreDecor: Boolean(decorPage.hasMore),
        decorCursor: decorPage.cursor || null,
      });
    } catch {
      setDecorBaseItems([]);
      setHasMoreDecor(false);
      decorCursorRef.current = null;
      saveCacheSnapshot({
        decorBaseItems: [],
        hasMoreDecor: false,
        decorCursor: null,
      });
    }
  }, [saveCacheSnapshot]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setCatalogLimit((current) => current + FIRESTORE_PAGE_SIZE);
  }, [hasMore]);

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

  useEffect(() => {
    loadingRef.current = true;
    setLoading(true);
    setError("");

    const unsubscribeCatalog = subscribeFirestoreCatalog({
      maxItems: catalogLimit,
      onData: ({ items, hasMore: nextHasMore }) => {
        setLibraryBaseItems(sortLibraryItemsDefault(normalizeRawCatalogItems(items)));
        setHasMore(Boolean(nextHasMore));
        setSource("firestore");
        setError("");
        loadingRef.current = false;
        setLoading(false);
      },
      onError: () => {
        setLibraryBaseItems([]);
        setPopularBaseItems([]);
        setHasMore(false);
        setSource("unavailable");
        setError("No se pudo verificar el catalogo aprobado. No se muestran iconos por seguridad.");
        loadingRef.current = false;
        setLoading(false);
      },
    });

    const unsubscribePopular = subscribeFirestorePopularCatalog({
      onData: (items) => {
        setPopularBaseItems(sortLibraryItemsDefault(normalizeRawCatalogItems(items)));
      },
      onError: () => {
        setPopularBaseItems([]);
      },
    });

    return () => {
      unsubscribeCatalog?.();
      unsubscribePopular?.();
    };
  }, [catalogLimit]);

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
    () => sortLibraryItemsDefault(mergeCatalogItems(libraryBaseItems, popularBaseItems)),
    [libraryBaseItems, popularBaseItems]
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

  const availableRecentItems = useMemo(() => {
    const availableMedia = new Map(
      combinedLibraryItems.map((item) => [toRecentIdentity(item), item])
    );
    return recentItems
      .map((item) => {
        if (item.kind === "shape") {
          return shapeItems.find((shape) => shape.id === item.id) || null;
        }
        return availableMedia.get(toRecentIdentity(item)) || null;
      })
      .filter(Boolean)
      .slice(0, RECENT_LIMIT);
  }, [combinedLibraryItems, recentItems, shapeItems]);

  const invalidateCatalogItem = useCallback((itemId) => {
    const safeId = String(itemId || "").trim();
    if (!safeId) return;
    setLibraryBaseItems((items) => items.filter((item) => item.id !== safeId));
    setPopularBaseItems((items) => items.filter((item) => item.id !== safeId));
  }, []);

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
    recentItems: availableRecentItems,
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
    invalidateCatalogItem,
    getLibraryByKind,
    source,
  };
}
