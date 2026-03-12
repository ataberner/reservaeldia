import { useCallback, useEffect, useRef } from "react";
import DecorCatalogBulkActionsBar from "./DecorCatalogBulkActionsBar";
import DecorCatalogFiltersBar from "./DecorCatalogFiltersBar";
import DecorCatalogGrid from "./DecorCatalogGrid";
import DecorCatalogHeader from "./DecorCatalogHeader";
import DecorEditDrawer from "./DecorEditDrawer";
import DecorUploadPanel from "./DecorUploadPanel";
import { useDecorCatalogAdminState } from "./useDecorCatalogAdminState";

function FlashMessage({ message, onClose }) {
  if (!message?.text) return null;

  const toneClass =
    message.type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : message.type === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-xl border px-3 py-2 text-left text-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p>{message.text}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-current px-1.5 py-0.5 text-[11px] font-semibold"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function DecorCatalogAdminPage() {
  const {
    loadingList,
    reloadingList,
    loadingMoreFromBackend,
    listError,
    searchInput,
    selectedCategory,
    selectedHealth,
    selectedStatus,
    selectedSort,
    technicalView,
    forceBlack,
    visibleItems,
    filteredTotal,
    canLoadMore,
    selectedIconIds,
    selectedCount,
    allVisibleSelected,
    allFilteredLoadedSelected,
    bulkActionBusy,
    categoryOptions,
    summaryStats,
    activeHeaderFilter,
    selectedEditIcon,
    savingEdit,
    busyById,
    flashMessage,
    isUploadPanelOpen,
    uploadState,
    setSearchInput,
    setSelectedCategory,
    setSelectedStatus,
    setSelectedSort,
    setTechnicalView,
    setForceBlack,
    setIsUploadPanelOpen,
    openEditIcon,
    closeEditIcon,
    reload,
    loadMore,
    applyHeaderQuickFilter,
    toggleSelectIcon,
    clearSelectedIcons,
    toggleSelectAllVisible,
    toggleSelectAllFilteredLoaded,
    bulkActivateSelected,
    bulkDeactivateSelected,
    bulkAssignCategorySelected,
    bulkRemoveCategorySelected,
    uploadIcon,
    saveIconEdits,
    toggleActivationForIcon,
    updatePriorityForIcon,
    revalidateIconFromGrid,
    clearFlashMessage,
  } = useDecorCatalogAdminState();
  const scrollContainerRef = useRef(null);
  const autoLoadLockRef = useRef(false);
  const restoreScrollTopRef = useRef(null);

  const restoreScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    const previous = restoreScrollTopRef.current;
    if (!container || !Number.isFinite(previous)) return;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(previous, maxScrollTop);
  }, []);

  const handleToggleActivation = useCallback(
    async (icon) => {
      const container = scrollContainerRef.current;
      restoreScrollTopRef.current = container ? container.scrollTop : null;

      await toggleActivationForIcon(icon);

      requestAnimationFrame(() => {
        restoreScrollPosition();
        setTimeout(() => {
          restoreScrollPosition();
        }, 80);
      });
    },
    [restoreScrollPosition, toggleActivationForIcon]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const threshold = 120;
    const triggerLoadIfNeeded = () => {
      if (!canLoadMore) return;
      if (loadingList || loadingMoreFromBackend || reloadingList) return;
      if (autoLoadLockRef.current) return;

      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceToBottom > threshold) return;

      autoLoadLockRef.current = true;
      Promise.resolve(loadMore()).finally(() => {
        setTimeout(() => {
          autoLoadLockRef.current = false;
        }, 160);
      });
    };

    const onScroll = () => {
      triggerLoadIfNeeded();
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    triggerLoadIfNeeded();

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [
    canLoadMore,
    filteredTotal,
    loadMore,
    loadingList,
    loadingMoreFromBackend,
    reloadingList,
    selectedCategory,
    selectedHealth,
    selectedSort,
    selectedStatus,
    visibleItems.length,
  ]);

  return (
    <main className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-2 py-2 text-left sm:px-3 lg:px-4">
      <div className="sticky top-0 z-20 flex-none space-y-2 bg-slate-50 pb-2">
        <DecorCatalogHeader
          summaryStats={summaryStats}
          uploadPanelOpen={isUploadPanelOpen}
          onToggleUploadPanel={() => setIsUploadPanelOpen((prev) => !prev)}
          onReload={() => reload({ silent: false })}
          reloading={reloadingList}
          activeFilter={activeHeaderFilter}
          onFilterChange={applyHeaderQuickFilter}
        />

        {isUploadPanelOpen && (
          <DecorUploadPanel
            open={isUploadPanelOpen}
            onClose={() => setIsUploadPanelOpen(false)}
            onUpload={uploadIcon}
            uploadState={uploadState}
            categoryOptions={categoryOptions}
          />
        )}

        <FlashMessage message={flashMessage} onClose={clearFlashMessage} />

        <DecorCatalogFiltersBar
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          categoryOptions={categoryOptions}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedSort={selectedSort}
          onSortChange={setSelectedSort}
          technicalView={technicalView}
          onTechnicalViewChange={setTechnicalView}
          forceBlack={forceBlack}
          onForceBlackChange={setForceBlack}
          filteredTotal={filteredTotal}
        />

        <DecorCatalogBulkActionsBar
          selectedCount={selectedCount}
          filteredTotal={filteredTotal}
          visibleCount={visibleItems.length}
          allVisibleSelected={allVisibleSelected}
          allFilteredLoadedSelected={allFilteredLoadedSelected}
          bulkBusy={bulkActionBusy}
          onToggleSelectAllVisible={toggleSelectAllVisible}
          onToggleSelectAllFilteredLoaded={toggleSelectAllFilteredLoaded}
          onClearSelection={clearSelectedIcons}
          onBulkActivate={bulkActivateSelected}
          onBulkDeactivate={bulkDeactivateSelected}
          onBulkAssignCategory={bulkAssignCategorySelected}
          onBulkRemoveCategory={bulkRemoveCategorySelected}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto pr-1 scrollbar-thin">
          <DecorCatalogGrid
            loading={loadingList}
            error={listError}
            items={visibleItems}
            technicalView={technicalView}
            forceBlack={forceBlack}
            selectedIconIds={selectedIconIds}
            bulkActionBusy={bulkActionBusy}
            busyById={busyById}
            onToggleSelect={toggleSelectIcon}
            onEdit={openEditIcon}
            onToggleActivation={handleToggleActivation}
            onRevalidate={revalidateIconFromGrid}
            onPrioritySave={updatePriorityForIcon}
            canLoadMore={canLoadMore}
            loadingMoreFromBackend={loadingMoreFromBackend}
            onLoadMore={loadMore}
            onReload={() => reload({ silent: false })}
          />
        </div>
      </div>

      <DecorEditDrawer
        open={Boolean(selectedEditIcon)}
        icon={selectedEditIcon}
        saving={savingEdit}
        onClose={closeEditIcon}
        onSave={saveIconEdits}
        categoryOptions={categoryOptions}
      />
    </main>
  );
}

