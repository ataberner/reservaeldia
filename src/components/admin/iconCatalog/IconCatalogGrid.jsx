import IconCatalogCard from "./IconCatalogCard";

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="h-[220px] animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}

export default function IconCatalogGrid({
  loading,
  error,
  items,
  technicalView,
  forceBlack,
  selectedIconIds,
  bulkActionBusy,
  busyById,
  onToggleSelect,
  onEdit,
  onToggleActivation,
  onRevalidate,
  onPrioritySave,
  canLoadMore,
  loadingMoreFromBackend,
  onLoadMore,
  onReload,
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
        <GridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <h3 className="text-base font-semibold text-slate-800">No hay resultados</h3>
        <p className="mt-1 text-sm text-slate-600">
          Ajusta los filtros o sube un nuevo icono para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {items.map((icon) => (
          <IconCatalogCard
            key={icon.id}
            icon={icon}
            technicalView={technicalView}
            forceBlack={forceBlack}
            selected={selectedIconIds?.has?.(icon.id) === true}
            selectionDisabled={bulkActionBusy}
            busyState={busyById?.[icon.id] || {}}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onToggleActivation={onToggleActivation}
            onRevalidate={onRevalidate}
            onPrioritySave={onPrioritySave}
          />
        ))}
      </div>

      {canLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMoreFromBackend}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMoreFromBackend ? "Cargando catalogo..." : "Cargar mas"}
          </button>
        </div>
      )}
    </div>
  );
}
