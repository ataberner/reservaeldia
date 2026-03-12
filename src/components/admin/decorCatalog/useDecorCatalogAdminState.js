import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDecorCatalogTotalsFallback,
  getIconUsageStats,
  listDecorCatalog,
  patchIconMetadata,
  revalidateIcon,
  setIconActivation,
  setIconPriority,
  uploadIconBootstrap,
  watchIconById,
} from "./decorCatalogAdminApi";
import {
  filterIcons,
  mapIconDocToViewModel,
  parseCategoriesInput,
  parseKeywordsInput,
  sortIcons,
} from "./decorCatalogMappers";

const BACKEND_PAGE_LIMIT = 400;
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 180;
const PROCESSING_TIMEOUT_MS = 90000;
const BULK_ACTION_BATCH_SIZE = 20;

function normalizeString(value) {
  return String(value || "").trim();
}

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;
  return typeof message === "string" ? message : fallback;
}

function clampPriority(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-9999, Math.min(9999, Math.round(parsed)));
}

function categoriesEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (normalizeString(left[index]).toLowerCase() !== normalizeString(right[index]).toLowerCase()) {
      return false;
    }
  }
  return true;
}

function buildBulkCategoryPatch(icon, categoryInput, mode) {
  const targetCategory = parseCategoriesInput(categoryInput)[0] || "";
  const targetKey = targetCategory.toLowerCase();
  if (!targetCategory || !targetKey) return null;

  const currentCategories = parseCategoriesInput([
    icon?.categoria,
    ...(Array.isArray(icon?.categorias) ? icon.categorias : []),
  ]);
  const currentPrimary = normalizeString(icon?.categoria);

  if (mode === "assign") {
    const withoutTarget = currentCategories.filter(
      (category) => normalizeString(category).toLowerCase() !== targetKey
    );
    const nextCategories = parseCategoriesInput([targetCategory, ...withoutTarget]);
    const nextPrimary = targetCategory;
    const unchanged =
      normalizeString(currentPrimary).toLowerCase() === targetKey &&
      categoriesEqual(currentCategories, nextCategories);
    if (unchanged) return null;
    return {
      categoria: nextPrimary,
      categorias: nextCategories,
    };
  }

  if (mode === "remove") {
    const nextCategories = currentCategories.filter(
      (category) => normalizeString(category).toLowerCase() !== targetKey
    );
    const hasCategory =
      currentCategories.length !== nextCategories.length ||
      normalizeString(currentPrimary).toLowerCase() === targetKey;
    if (!hasCategory) return null;

    const nextPrimary = nextCategories[0] || "";
    return {
      categoria: nextPrimary,
      categorias: nextCategories,
    };
  }

  return null;
}

async function runInBatches(items, handler, batchSize = BULK_ACTION_BATCH_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  for (let start = 0; start < list.length; start += batchSize) {
    const batch = list.slice(start, start + batchSize);
    const batchResults = await Promise.all(batch.map((entry) => handler(entry)));
    results.push(...batchResults);
  }
  return results;
}

function mergeIconLists(activeItems, archivedItems) {
  const mergedMap = new Map();
  for (const item of archivedItems) {
    if (!item?.id) continue;
    mergedMap.set(item.id, item);
  }
  for (const item of activeItems) {
    if (!item?.id) continue;
    mergedMap.set(item.id, item);
  }
  return Array.from(mergedMap.values());
}

function updateIconItem(items, nextItem) {
  const list = Array.isArray(items) ? items.slice() : [];
  const index = list.findIndex((entry) => entry.id === nextItem.id);
  if (index === -1) {
    list.unshift(nextItem);
    return list;
  }
  list[index] = nextItem;
  return list;
}

function patchIconActivationInList(items, params) {
  const list = Array.isArray(items) ? items.slice() : [];
  const iconId = normalizeString(params?.iconId);
  if (!iconId) return list;
  const targetIndex = list.findIndex((entry) => entry.id === iconId);
  if (targetIndex === -1) return list;

  const target = list[targetIndex];
  const nextActive = params?.active === true;
  list[targetIndex] = {
    ...target,
    isActive: nextActive,
    source: nextActive ? "active" : "archived",
    status: nextActive ? "active" : "archived",
    updatedAt: new Date(),
  };
  return list;
}

function parseStatusMessageFromIcon(icon) {
  if (icon?.status === "duplicate") {
    return {
      type: "warning",
      text: "La decoracion fue archivada por contenido duplicado.",
    };
  }

  if (icon?.status === "rejected") {
    return {
      type: "error",
      text: "La decoracion fue rechazada por validacion.",
    };
  }

  const validationStatus = normalizeString(icon?.validationStatus).toLowerCase();
  if (validationStatus === "rejected") {
    return {
      type: "error",
      text: "La decoracion fue rechazada por validacion.",
    };
  }
  if (validationStatus === "warning") {
    return {
      type: "warning",
      text: "La decoracion se subio con advertencias de validacion.",
    };
  }
  return {
    type: "success",
    text: "Decoracion subida y validada correctamente.",
  };
}

function parsePageInfo(pageInfo) {
  const active = pageInfo?.active || {};
  const archived = pageInfo?.archived || {};
  return {
    active: {
      hasMore: active.hasMore === true,
      nextCursor: normalizeString(active.nextCursor) || null,
    },
    archived: {
      hasMore: archived.hasMore === true,
      nextCursor: normalizeString(archived.nextCursor) || null,
    },
  };
}

export function useDecorCatalogAdminState() {
  const [items, setItems] = useState([]);
  const [catalogTotals, setCatalogTotals] = useState({
    active: null,
    archived: null,
    total: null,
  });
  const [loadingList, setLoadingList] = useState(false);
  const [reloadingList, setReloadingList] = useState(false);
  const [loadingMoreFromBackend, setLoadingMoreFromBackend] = useState(false);
  const [listError, setListError] = useState("");
  const [hasMoreFromBackend, setHasMoreFromBackend] = useState(false);
  const [usageStats, setUsageStats] = useState({ totalUses: 0, top: [] });
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedHealth, setSelectedHealth] = useState("all");
  const [selectedSort, setSelectedSort] = useState("manual");
  const [technicalView, setTechnicalView] = useState(false);
  const [forceBlack, setForceBlack] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
  const [editingIconId, setEditingIconId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyById, setBusyById] = useState({});
  const [selectedIconIds, setSelectedIconIds] = useState(() => new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [uploadState, setUploadState] = useState({
    phase: "idle",
    iconId: null,
    text: "",
    validationStatus: null,
    warnings: [],
    errors: [],
  });

  const flashTimerRef = useRef(null);
  const processingUnsubscribeRef = useRef(null);
  const processingTimeoutRef = useRef(null);
  const licenseOverridesRef = useRef({});
  const paginationRef = useRef({
    active: {
      nextCursor: null,
      hasMore: true,
    },
    archived: {
      nextCursor: null,
      hasMore: true,
    },
  });

  const setBusy = useCallback((iconId, key, value) => {
    const normalizedId = normalizeString(iconId);
    if (!normalizedId || !key) return;
    setBusyById((prev) => ({
      ...prev,
      [normalizedId]: {
        ...(prev[normalizedId] || {}),
        [key]: value,
      },
    }));
  }, []);

  const pushFlashMessage = useCallback((type, text) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlashMessage({ type, text: normalizeString(text) });
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
    }, 5000);
  }, []);

  const stopProcessingWatcher = useCallback(() => {
    if (processingUnsubscribeRef.current) {
      processingUnsubscribeRef.current();
      processingUnsubscribeRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  const mapAndOverlayIcon = useCallback((doc, source) => {
    const mapped = mapIconDocToViewModel(doc, source);
    const fallbackLicense = licenseOverridesRef.current[mapped.id];
    if (!mapped.license && fallbackLicense) {
      return {
        ...mapped,
        license: fallbackLicense,
      };
    }
    return mapped;
  }, []);

  const applyCatalogPage = useCallback(
    (catalogData, { reset = false } = {}) => {
      const activeItems = Array.isArray(catalogData?.items)
        ? catalogData.items.map((item) => mapAndOverlayIcon(item, "active"))
        : [];
      const archivedItems = Array.isArray(catalogData?.archivedItems)
        ? catalogData.archivedItems.map((item) => mapAndOverlayIcon(item, "archived"))
        : [];
      const pageInfo = parsePageInfo(catalogData?.pageInfo || {});
      const totalsRaw = catalogData?.totals || {};
      const nextActiveTotal = Number(totalsRaw.active);
      const nextArchivedTotal = Number(totalsRaw.archived);
      const nextTotal = Number(totalsRaw.total);
      if (
        Number.isFinite(nextActiveTotal) &&
        Number.isFinite(nextArchivedTotal) &&
        Number.isFinite(nextTotal)
      ) {
        setCatalogTotals({
          active: Math.max(0, Math.round(nextActiveTotal)),
          archived: Math.max(0, Math.round(nextArchivedTotal)),
          total: Math.max(0, Math.round(nextTotal)),
        });
      } else if (reset) {
        setCatalogTotals({
          active: null,
          archived: null,
          total: null,
        });
      }

      paginationRef.current = {
        active: {
          hasMore: pageInfo.active.hasMore,
          nextCursor: pageInfo.active.nextCursor,
        },
        archived: {
          hasMore: pageInfo.archived.hasMore,
          nextCursor: pageInfo.archived.nextCursor,
        },
      };

      setHasMoreFromBackend(pageInfo.active.hasMore || pageInfo.archived.hasMore);

      if (reset) {
        setItems(mergeIconLists(activeItems, archivedItems));
        setVisibleCount(PAGE_SIZE);
        return;
      }

      setItems((prev) => {
        const mergedMap = new Map();
        for (const item of prev) {
          if (!item?.id) continue;
          mergedMap.set(item.id, item);
        }
        for (const item of archivedItems) {
          if (!item?.id) continue;
          mergedMap.set(item.id, item);
        }
        for (const item of activeItems) {
          if (!item?.id) continue;
          mergedMap.set(item.id, item);
        }
        return Array.from(mergedMap.values());
      });
    },
    [mapAndOverlayIcon]
  );

  const fetchCatalogPage = useCallback(
    async ({ reset = false } = {}) => {
      const cursor = reset
        ? null
        : {
            active: paginationRef.current.active.nextCursor,
            archived: paginationRef.current.archived.nextCursor,
          };

      let catalogData = await listDecorCatalog({
        includeArchived: true,
        limit: BACKEND_PAGE_LIMIT,
        includeTotals: reset === true,
        ...(cursor ? { cursor } : {}),
      });

      if (reset) {
        const totalsRaw = catalogData?.totals || {};
        const hasTotals =
          Number.isFinite(Number(totalsRaw.active)) &&
          Number.isFinite(Number(totalsRaw.archived)) &&
          Number.isFinite(Number(totalsRaw.total));

        if (!hasTotals) {
          try {
            const fallbackTotals = await getDecorCatalogTotalsFallback({
              includeArchived: true,
            });
            catalogData = {
              ...(catalogData || {}),
              totals: fallbackTotals,
            };
          } catch {
            // Si el fallback tambien falla, mantenemos el flujo sin bloquear la grilla.
          }
        }
      }

      applyCatalogPage(catalogData, { reset });
      return catalogData;
    },
    [applyCatalogPage]
  );

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        setReloadingList(true);
      } else {
        setLoadingList(true);
      }
      setListError("");

      try {
        const [catalogResult, usageResult] = await Promise.allSettled([
          fetchCatalogPage({ reset: true }),
          getIconUsageStats({ limit: 20 }),
        ]);

        if (catalogResult.status === "rejected") {
          throw catalogResult.reason;
        }

        if (usageResult.status === "fulfilled") {
          const usageData = usageResult.value || {};
          setUsageStats({
            totalUses: Number(usageData.totalUses || 0),
            top: Array.isArray(usageData.top) ? usageData.top : [],
          });
        } else {
          setUsageStats({ totalUses: 0, top: [] });
        }
      } catch (error) {
        setItems([]);
        setCatalogTotals({
          active: null,
          archived: null,
          total: null,
        });
        setHasMoreFromBackend(false);
        setListError(getErrorMessage(error, "No se pudo cargar el catalogo de decoraciones."));
      } finally {
        setLoadingList(false);
        setReloadingList(false);
      }
    },
    [fetchCatalogPage]
  );

  useEffect(() => {
    reload({ silent: false });
  }, [reload]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchTerm(normalizeString(searchInput));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchTerm, selectedCategory, selectedHealth, selectedStatus, selectedSort, technicalView]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      stopProcessingWatcher();
    };
  }, [stopProcessingWatcher]);

  useEffect(() => {
    const validIds = new Set(
      (Array.isArray(items) ? items : [])
        .map((icon) => normalizeString(icon?.id))
        .filter(Boolean)
    );
    setSelectedIconIds((prev) => {
      if (!(prev instanceof Set) || prev.size === 0) return prev;
      const next = new Set();
      let changed = false;
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [items]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const icon of items) {
      if (icon?.categoria) set.add(icon.categoria);
      for (const category of icon?.categorias || []) {
        if (category) set.add(category);
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [items]);

  const filteredItems = useMemo(
    () =>
      filterIcons(items, {
        search: searchTerm,
        category: selectedCategory,
        status: selectedStatus,
        health: selectedHealth,
      }),
    [items, searchTerm, selectedCategory, selectedHealth, selectedStatus]
  );

  const activeHeaderFilter = useMemo(() => {
    if (selectedHealth === "warning") return "warning";
    if (selectedHealth === "rejected") return "rejected";
    if (selectedHealth === "processing") return "processing";
    if (selectedStatus === "active") return "active";
    if (selectedStatus === "inactive") return "inactive";
    return "all";
  }, [selectedHealth, selectedStatus]);

  const applyHeaderQuickFilter = useCallback((filterKey) => {
    const key = normalizeString(filterKey).toLowerCase();

    if (key === "all") {
      setSelectedStatus("all");
      setSelectedHealth("all");
      return;
    }

    if (key === "active") {
      setSelectedStatus((prev) => (prev === "active" ? "all" : "active"));
      setSelectedHealth("all");
      return;
    }

    if (key === "inactive") {
      setSelectedStatus((prev) => (prev === "inactive" ? "all" : "inactive"));
      setSelectedHealth("all");
      return;
    }

    if (key === "warning" || key === "rejected" || key === "processing") {
      setSelectedStatus("all");
      setSelectedHealth((prev) => (prev === key ? "all" : key));
    }
  }, []);

  const sortedItems = useMemo(
    () =>
      sortIcons(
        filteredItems,
        selectedSort === "most_used"
          ? "most_used"
          : selectedSort === "recent"
            ? "recent"
            : "manual"
      ),
    [filteredItems, selectedSort]
  );

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount]
  );

  const selectedIcons = useMemo(() => {
    if (!(selectedIconIds instanceof Set) || selectedIconIds.size === 0) return [];
    const byId = new Map(
      (Array.isArray(items) ? items : [])
        .filter((icon) => Boolean(icon?.id))
        .map((icon) => [icon.id, icon])
    );
    const out = [];
    for (const iconId of selectedIconIds) {
      const icon = byId.get(iconId);
      if (icon) out.push(icon);
    }
    return out;
  }, [items, selectedIconIds]);

  const selectedCount = selectedIcons.length;

  const allVisibleSelected = useMemo(() => {
    if (!Array.isArray(visibleItems) || visibleItems.length === 0) return false;
    return visibleItems.every((icon) => selectedIconIds.has(icon.id));
  }, [selectedIconIds, visibleItems]);

  const allFilteredLoadedSelected = useMemo(() => {
    if (!Array.isArray(sortedItems) || sortedItems.length === 0) return false;
    return sortedItems.every((icon) => selectedIconIds.has(icon.id));
  }, [selectedIconIds, sortedItems]);

  const summaryStats = useMemo(() => {
    let activeCount = 0;
    let warningCount = 0;
    let rejectedCount = 0;
    let processingCount = 0;

    for (const icon of items) {
      if (icon?.isActive) activeCount += 1;
      if (icon?.validationStatus === "warning") warningCount += 1;
      if (
        icon?.validationStatus === "rejected" ||
        icon?.status === "rejected" ||
        icon?.status === "duplicate"
      ) {
        rejectedCount += 1;
      }
      if (icon?.status === "processing") processingCount += 1;
    }

    const activeTotal = Number(catalogTotals.active);
    const archivedTotal = Number(catalogTotals.archived);
    const totalFromBackend = Number(catalogTotals.total);
    const hasTotals =
      Number.isFinite(activeTotal) &&
      Number.isFinite(archivedTotal) &&
      Number.isFinite(totalFromBackend);

    return {
      total: hasTotals ? totalFromBackend : items.length,
      active: hasTotals ? activeTotal : activeCount,
      inactive: hasTotals ? archivedTotal : Math.max(0, items.length - activeCount),
      warnings: warningCount,
      rejected: rejectedCount,
      processing: processingCount,
      totalUses: Number(usageStats.totalUses || 0),
    };
  }, [
    catalogTotals.active,
    catalogTotals.archived,
    catalogTotals.total,
    items,
    usageStats.totalUses,
  ]);

  const selectedEditIcon = useMemo(
    () => items.find((icon) => icon.id === editingIconId) || null,
    [items, editingIconId]
  );

  const toggleSelectIcon = useCallback((iconId, nextSelected) => {
    const normalizedId = normalizeString(iconId);
    if (!normalizedId) return;

    setSelectedIconIds((prev) => {
      const next = new Set(prev);
      const shouldSelect =
        typeof nextSelected === "boolean" ? nextSelected : !next.has(normalizedId);
      if (shouldSelect) {
        next.add(normalizedId);
      } else {
        next.delete(normalizedId);
      }
      return next;
    });
  }, []);

  const clearSelectedIcons = useCallback(() => {
    setSelectedIconIds(new Set());
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIconIds((prev) => {
      const next = new Set(prev);
      const shouldSelect = !allVisibleSelected;
      for (const icon of visibleItems) {
        if (!icon?.id) continue;
        if (shouldSelect) {
          next.add(icon.id);
        } else {
          next.delete(icon.id);
        }
      }
      return next;
    });
  }, [allVisibleSelected, visibleItems]);

  const toggleSelectAllFilteredLoaded = useCallback(() => {
    setSelectedIconIds((prev) => {
      const next = new Set(prev);
      const shouldSelect = !allFilteredLoadedSelected;
      for (const icon of sortedItems) {
        if (!icon?.id) continue;
        if (shouldSelect) {
          next.add(icon.id);
        } else {
          next.delete(icon.id);
        }
      }
      return next;
    });
  }, [allFilteredLoadedSelected, sortedItems]);

  const applyBulkActivationToSelected = useCallback(
    async ({ active }) => {
      if (bulkActionBusy) return;
      const targetActive = active === true;
      const selectedSnapshot = Array.isArray(selectedIcons) ? selectedIcons.slice() : [];

      if (selectedSnapshot.length === 0) {
        pushFlashMessage("warning", "Selecciona al menos una decoracion.");
        return;
      }

      setBulkActionBusy(true);
      try {
        const results = await runInBatches(selectedSnapshot, async (icon) => {
          const iconId = normalizeString(icon?.id);
          if (!iconId) {
            return { iconId: "", ok: false };
          }

          const previousActive = icon?.isActive === true;
          if (previousActive === targetActive) {
            return { iconId, skipped: true, previousActive };
          }

          try {
            await setIconActivation({
              iconId,
              active: targetActive,
              reason: "admin-bulk-toggle",
            });
            return { iconId, ok: true, previousActive };
          } catch (error) {
            return {
              iconId,
              ok: false,
              error: getErrorMessage(error, "No se pudo actualizar el estado."),
            };
          }
        });

        const successIds = results.filter((entry) => entry?.ok).map((entry) => entry.iconId);
        const failedIds = results
          .filter((entry) => entry?.ok === false && entry?.iconId)
          .map((entry) => entry.iconId);
        const skippedCount = results.filter((entry) => entry?.skipped).length;
        const successCount = successIds.length;

        if (successCount > 0) {
          const successIdSet = new Set(successIds);
          setItems((prev) => {
            let next = prev;
            for (const iconId of successIdSet) {
              next = patchIconActivationInList(next, {
                iconId,
                active: targetActive,
              });
            }
            return next;
          });

          const deltaActive = results.reduce((acc, entry) => {
            if (!entry?.ok) return acc;
            if (entry.previousActive === targetActive) return acc;
            return acc + (targetActive ? 1 : -1);
          }, 0);

          if (deltaActive !== 0) {
            setCatalogTotals((prev) => {
              const activeTotal = Number(prev.active);
              const archivedTotal = Number(prev.archived);
              const total = Number(prev.total);
              if (
                !Number.isFinite(activeTotal) ||
                !Number.isFinite(archivedTotal) ||
                !Number.isFinite(total)
              ) {
                return prev;
              }
              return {
                active: Math.max(0, activeTotal + deltaActive),
                archived: Math.max(0, archivedTotal - deltaActive),
                total,
              };
            });
          }
        }

        setSelectedIconIds(new Set(failedIds));

        if (failedIds.length > 0) {
          pushFlashMessage(
            "warning",
            `Operacion masiva parcial: ${successCount} ok, ${failedIds.length} con error, ${skippedCount} sin cambios.`
          );
        } else {
          pushFlashMessage(
            "success",
            `Operacion masiva completada: ${successCount} actualizados${skippedCount > 0 ? `, ${skippedCount} sin cambios` : ""}.`
          );
        }
      } finally {
        setBulkActionBusy(false);
      }
    },
    [bulkActionBusy, pushFlashMessage, selectedIcons]
  );

  const applyBulkCategoryToSelected = useCallback(
    async ({ category, mode }) => {
      if (bulkActionBusy) return;
      const normalizedCategory = normalizeString(category);
      const normalizedMode = mode === "remove" ? "remove" : "assign";
      const selectedSnapshot = Array.isArray(selectedIcons) ? selectedIcons.slice() : [];

      if (selectedSnapshot.length === 0) {
        pushFlashMessage("warning", "Selecciona al menos una decoracion.");
        return;
      }

      if (!normalizedCategory) {
        pushFlashMessage("error", "Indica una categoria para la accion masiva.");
        return;
      }

      setBulkActionBusy(true);
      try {
        const results = await runInBatches(selectedSnapshot, async (icon) => {
          const iconId = normalizeString(icon?.id);
          if (!iconId) return { iconId: "", ok: false };

          const categoryPatch = buildBulkCategoryPatch(
            icon,
            normalizedCategory,
            normalizedMode
          );
          if (!categoryPatch) {
            return { iconId, skipped: true };
          }

          try {
            await patchIconMetadata({
              iconId,
              patch: categoryPatch,
            });
            return { iconId, ok: true, patch: categoryPatch };
          } catch (error) {
            return {
              iconId,
              ok: false,
              error: getErrorMessage(error, "No se pudo actualizar la categoria."),
            };
          }
        });

        const successEntries = results.filter((entry) => entry?.ok);
        const failedIds = results
          .filter((entry) => entry?.ok === false && entry?.iconId)
          .map((entry) => entry.iconId);
        const skippedCount = results.filter((entry) => entry?.skipped).length;

        if (successEntries.length > 0) {
          const patchById = new Map(
            successEntries.map((entry) => [entry.iconId, entry.patch])
          );
          setItems((prev) =>
            prev.map((icon) => {
              const categoryPatch = patchById.get(icon.id);
              if (!categoryPatch) return icon;
              return {
                ...icon,
                categoria: normalizeString(categoryPatch.categoria),
                categorias: Array.isArray(categoryPatch.categorias)
                  ? categoryPatch.categorias
                  : [],
                updatedAt: new Date(),
              };
            })
          );
        }

        setSelectedIconIds(new Set(failedIds));

        const successCount = successEntries.length;
        const actionLabel =
          normalizedMode === "remove" ? "Categoria removida" : "Categoria asignada";
        if (failedIds.length > 0) {
          pushFlashMessage(
            "warning",
            `${actionLabel} en ${successCount}. ${failedIds.length} con error y ${skippedCount} sin cambios.`
          );
        } else {
          pushFlashMessage(
            "success",
            `${actionLabel} en ${successCount} decoraciones${skippedCount > 0 ? `, ${skippedCount} sin cambios` : ""}.`
          );
        }

        // Refresco silencioso para resetear cursores/paginacion y evitar estados
        // inconsistentes despues de cambios masivos de categorias.
        await reload({ silent: true });
      } finally {
        setBulkActionBusy(false);
      }
    },
    [bulkActionBusy, pushFlashMessage, reload, selectedIcons]
  );

  const startProcessingWatch = useCallback(
    (iconId) => {
      const normalizedId = normalizeString(iconId);
      if (!normalizedId) return;

      stopProcessingWatcher();
      setUploadState({
        phase: "processing",
        iconId: normalizedId,
        text: "Procesando validaciones del backend...",
        validationStatus: null,
        warnings: [],
        errors: [],
      });

      processingUnsubscribeRef.current = watchIconById(
        normalizedId,
        (payload) => {
          if (!payload?.exists || !payload?.data) return;
          const mapped = mapAndOverlayIcon(
            { id: payload.id, ...payload.data },
            payload.source
          );
          setItems((prev) => updateIconItem(prev, mapped));

          const hasValidation = Boolean(mapped.validation);
          const isTerminalStatus =
            payload.source === "archived" ||
            mapped.status === "active" ||
            mapped.status === "duplicate" ||
            mapped.status === "rejected";

          if (!hasValidation || !isTerminalStatus) return;

          const warnings = Array.isArray(mapped.validation?.warnings)
            ? mapped.validation.warnings
            : [];
          const errors = Array.isArray(mapped.validation?.errors)
            ? mapped.validation.errors
            : [];
          const statusMessage = parseStatusMessageFromIcon(mapped);

          setUploadState({
            phase: "done",
            iconId: normalizedId,
            text: statusMessage.text,
            validationStatus: mapped.validationStatus || "passed",
            warnings,
            errors,
          });

          pushFlashMessage(statusMessage.type, statusMessage.text);
          stopProcessingWatcher();
          reload({ silent: true });
        },
        (error) => {
          setUploadState({
            phase: "error",
            iconId: normalizedId,
            text: getErrorMessage(
              error,
              "No se pudo observar el estado de validacion de la decoracion."
            ),
            validationStatus: null,
            warnings: [],
            errors: [],
          });
          pushFlashMessage(
            "error",
            "No se pudo consultar el estado de validacion de la decoracion."
          );
          stopProcessingWatcher();
        }
      );

      processingTimeoutRef.current = setTimeout(() => {
        setUploadState((prev) => ({
          ...prev,
          phase: "done",
          text:
            prev.phase === "processing"
              ? "La validacion demora mas de lo esperado. Se actualizara en la grilla al refrescar."
              : prev.text,
        }));
        stopProcessingWatcher();
        reload({ silent: true });
      }, PROCESSING_TIMEOUT_MS);
    },
    [mapAndOverlayIcon, pushFlashMessage, reload, stopProcessingWatcher]
  );

  const uploadIcon = useCallback(
    async (payload) => {
      setUploadState({
        phase: "uploading",
        iconId: null,
        text: "Subiendo decoracion.....",
        validationStatus: null,
        warnings: [],
        errors: [],
      });

      try {
        const result = await uploadIconBootstrap(payload);
        const iconId = normalizeString(result?.iconId);
        if (!iconId) {
          throw new Error("No se pudo obtener el ID de la decoracion subida.");
        }

        if (normalizeString(payload?.license)) {
          licenseOverridesRef.current[iconId] = normalizeString(payload.license);
        }

        setIsUploadPanelOpen(false);
        setUploadState({
          phase: "processing",
          iconId,
          text: "Decoracion subida. Validando archivo en backend.....",
          validationStatus: null,
          warnings: [],
          errors: [],
        });
        pushFlashMessage("success", "Decoracion subida. Esperando validacion del backend.");
        startProcessingWatch(iconId);
        await reload({ silent: true });
        return { ok: true, iconId };
      } catch (error) {
        const message = getErrorMessage(error, "No se pudo subir la decoracion.");
        setUploadState({
          phase: "error",
          iconId: null,
          text: message,
          validationStatus: null,
          warnings: [],
          errors: [],
        });
        pushFlashMessage("error", message);
        return { ok: false, message };
      }
    },
    [pushFlashMessage, reload, startProcessingWatch]
  );

  const saveIconEdits = useCallback(
    async ({
      iconId,
      nombre,
      categoria,
      categoriasInput,
      keywordsInput,
      license,
      priority,
      active,
    }) => {
      const normalizedId = normalizeString(iconId);
      const current = items.find((item) => item.id === normalizedId);
      if (!normalizedId || !current) {
        pushFlashMessage("error", "No se encontro la decoracion a editar.");
        return { ok: false };
      }

      const nextName = normalizeString(nombre);
      const nextCategories = parseCategoriesInput(
        categoriasInput ?? categoria
      );
      const nextCategory = nextCategories[0] || "";
      const nextKeywords = parseKeywordsInput(keywordsInput);
      const nextLicense = normalizeString(license);
      const nextPriority = clampPriority(priority);
      const nextActive = active === true;

      if (!nextName) {
        pushFlashMessage("error", "El nombre de la decoracion es obligatorio.");
        return { ok: false };
      }

      setSavingEdit(true);
      setBusy(normalizedId, "saving", true);

      try {
        await patchIconMetadata({
          iconId: normalizedId,
          patch: {
            nombre: nextName,
            categoria: nextCategory,
            categorias: nextCategories,
            keywords: nextKeywords,
            tags: nextKeywords,
            license: nextLicense,
          },
        });

        if (nextPriority !== Number(current.priority || 0)) {
          await setIconPriority({
            iconId: normalizedId,
            priority: nextPriority,
          });
        }

        if (nextActive !== current.isActive) {
          await setIconActivation({
            iconId: normalizedId,
            active: nextActive,
            reason: "admin-drawer-save",
          });
        }

        licenseOverridesRef.current[normalizedId] = nextLicense;
        setItems((prev) => {
          let nextList = prev.map((item) =>
            item.id === normalizedId
              ? {
                  ...item,
                  nombre: nextName,
                  categoria: nextCategory,
                  categorias: nextCategories,
                  keywords: nextKeywords,
                  license: nextLicense,
                  priority: nextPriority,
                  popular: nextPriority > 0,
                  updatedAt: new Date(),
                }
              : item
          );
          if (nextActive !== current.isActive) {
            nextList = patchIconActivationInList(nextList, {
              iconId: normalizedId,
              active: nextActive,
            });
          }
          return nextList;
        });
        if (nextActive !== current.isActive) {
          setCatalogTotals((prev) => {
            const activeTotal = Number(prev.active);
            const archivedTotal = Number(prev.archived);
            const total = Number(prev.total);
            if (
              !Number.isFinite(activeTotal) ||
              !Number.isFinite(archivedTotal) ||
              !Number.isFinite(total)
            ) {
              return prev;
            }
            const delta = nextActive ? 1 : -1;
            return {
              active: Math.max(0, activeTotal + delta),
              archived: Math.max(0, archivedTotal - delta),
              total,
            };
          });
        }
        pushFlashMessage("success", "Cambios guardados correctamente.");
        setEditingIconId(null);
        return { ok: true };
      } catch (error) {
        const message = getErrorMessage(error, "No se pudieron guardar los cambios.");
        pushFlashMessage("error", message);
        return { ok: false, message };
      } finally {
        setSavingEdit(false);
        setBusy(normalizedId, "saving", false);
      }
    },
    [items, pushFlashMessage, setBusy]
  );

  const toggleActivationForIcon = useCallback(
    async (icon) => {
      const normalizedId = normalizeString(icon?.id);
      if (!normalizedId) return;
      const nextActive = icon?.isActive !== true;
      setBusy(normalizedId, "activation", true);
      try {
        await setIconActivation({
          iconId: normalizedId,
          active: nextActive,
          reason: "admin-grid-toggle",
        });
        setItems((prev) =>
          patchIconActivationInList(prev, {
            iconId: normalizedId,
            active: nextActive,
          })
        );
        setCatalogTotals((prev) => {
          const activeTotal = Number(prev.active);
          const archivedTotal = Number(prev.archived);
          const total = Number(prev.total);
          if (
            !Number.isFinite(activeTotal) ||
            !Number.isFinite(archivedTotal) ||
            !Number.isFinite(total)
          ) {
            return prev;
          }
          const delta = nextActive ? 1 : -1;
          return {
            active: Math.max(0, activeTotal + delta),
            archived: Math.max(0, archivedTotal - delta),
            total,
          };
        });
        pushFlashMessage(
          "success",
          nextActive ? "Decoracion activada." : "Decoracion desactivada."
        );
      } catch (error) {
        pushFlashMessage(
          "error",
          getErrorMessage(error, "No se pudo cambiar el estado de la decoracion.")
        );
      } finally {
        setBusy(normalizedId, "activation", false);
      }
    },
    [pushFlashMessage, setBusy]
  );

  const updatePriorityForIcon = useCallback(
    async ({ iconId, priority }) => {
      const normalizedId = normalizeString(iconId);
      if (!normalizedId) return;
      const nextPriority = clampPriority(priority);
      setBusy(normalizedId, "priority", true);

      try {
        await setIconPriority({
          iconId: normalizedId,
          priority: nextPriority,
        });

        setItems((prev) =>
          prev.map((item) =>
            item.id === normalizedId
              ? {
                  ...item,
                  priority: nextPriority,
                  popular: nextPriority > 0,
                }
              : item
          )
        );
        pushFlashMessage("success", "Orden manual actualizado.");
      } catch (error) {
        pushFlashMessage(
          "error",
          getErrorMessage(error, "No se pudo actualizar el orden manual.")
        );
      } finally {
        setBusy(normalizedId, "priority", false);
      }
    },
    [pushFlashMessage, setBusy]
  );

  const revalidateIconFromGrid = useCallback(
    async (icon) => {
      const normalizedId = normalizeString(icon?.id);
      if (!normalizedId) return;

      setBusy(normalizedId, "revalidate", true);
      try {
        await revalidateIcon({
          iconId: normalizedId,
          force: true,
          archiveOnReject: true,
        });
        pushFlashMessage("success", "Revalidacion ejecutada.");
        await reload({ silent: true });
      } catch (error) {
        pushFlashMessage(
          "error",
          getErrorMessage(error, "No se pudo revalidar la decoracion.")
        );
      } finally {
        setBusy(normalizedId, "revalidate", false);
      }
    },
    [pushFlashMessage, reload, setBusy]
  );

  const loadMore = useCallback(async () => {
    if (visibleCount < sortedItems.length) {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      return;
    }

    if (!hasMoreFromBackend || loadingMoreFromBackend) {
      return;
    }

    setLoadingMoreFromBackend(true);
    try {
      await fetchCatalogPage({ reset: false });
      setVisibleCount((prev) => prev + PAGE_SIZE);
    } catch (error) {
      pushFlashMessage(
        "error",
        getErrorMessage(error, "No se pudieron cargar mas decoraciones desde backend.")
      );
    } finally {
      setLoadingMoreFromBackend(false);
    }
  }, [
    visibleCount,
    sortedItems.length,
    hasMoreFromBackend,
    loadingMoreFromBackend,
    fetchCatalogPage,
    pushFlashMessage,
  ]);

  return {
    items,
    loadingList,
    reloadingList,
    loadingMoreFromBackend,
    listError,
    hasMoreFromBackend,
    usageStats,
    searchInput,
    searchTerm,
    selectedCategory,
    selectedStatus,
    selectedHealth,
    selectedSort,
    technicalView,
    forceBlack,
    visibleCount,
    visibleItems,
    filteredTotal: sortedItems.length,
    canLoadMore: visibleCount < sortedItems.length || hasMoreFromBackend,
    selectedIconIds,
    selectedCount,
    allVisibleSelected,
    allFilteredLoadedSelected,
    bulkActionBusy,
    categoryOptions,
    summaryStats,
    activeHeaderFilter,
    editingIconId,
    selectedEditIcon,
    savingEdit,
    busyById,
    flashMessage,
    isUploadPanelOpen,
    uploadState,
    setSearchInput,
    setSelectedCategory,
    setSelectedStatus,
    setSelectedHealth,
    setSelectedSort,
    setTechnicalView,
    setForceBlack,
    setIsUploadPanelOpen,
    openEditIcon: setEditingIconId,
    closeEditIcon: () => setEditingIconId(null),
    reload,
    loadMore,
    applyHeaderQuickFilter,
    toggleSelectIcon,
    clearSelectedIcons,
    toggleSelectAllVisible,
    toggleSelectAllFilteredLoaded,
    bulkActivateSelected: () => applyBulkActivationToSelected({ active: true }),
    bulkDeactivateSelected: () => applyBulkActivationToSelected({ active: false }),
    bulkAssignCategorySelected: (category) =>
      applyBulkCategoryToSelected({ category, mode: "assign" }),
    bulkRemoveCategorySelected: (category) =>
      applyBulkCategoryToSelected({ category, mode: "remove" }),
    uploadIcon,
    saveIconEdits,
    toggleActivationForIcon,
    updatePriorityForIcon,
    revalidateIconFromGrid,
    clearFlashMessage: () => setFlashMessage(null),
  };
}


