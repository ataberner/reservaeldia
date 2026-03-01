import { useMemo, useState } from "react";

function normalizeString(value) {
  return String(value || "").trim();
}

export default function IconCatalogBulkActionsBar({
  selectedCount,
  filteredTotal,
  visibleCount,
  allVisibleSelected,
  allFilteredLoadedSelected,
  bulkBusy,
  onToggleSelectAllVisible,
  onToggleSelectAllFilteredLoaded,
  onClearSelection,
  onBulkActivate,
  onBulkDeactivate,
  onBulkAssignCategory,
  onBulkRemoveCategory,
}) {
  const [categoryInput, setCategoryInput] = useState("");
  const normalizedCategory = useMemo(
    () => normalizeString(categoryInput),
    [categoryInput]
  );
  const hasSelection = Number(selectedCount || 0) > 0;
  const disableBulkActions = !hasSelection || bulkBusy;
  const disableCategoryActions = disableBulkActions || !normalizedCategory;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            {selectedCount} seleccionados
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
            {visibleCount} visibles
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
            {filteredTotal} filtrados
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onToggleSelectAllVisible}
            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
          </button>
          <button
            type="button"
            onClick={onToggleSelectAllFilteredLoaded}
            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {allFilteredLoadedSelected ? "Quitar filtrados" : "Seleccionar filtrados"}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount <= 0}
            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]">
        <button
          type="button"
          onClick={onBulkActivate}
          disabled={disableBulkActions}
          className="h-8 rounded-md border border-emerald-600 bg-emerald-600 px-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Activar seleccion
        </button>
        <button
          type="button"
          onClick={onBulkDeactivate}
          disabled={disableBulkActions}
          className="h-8 rounded-md border border-amber-600 bg-amber-600 px-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Desactivar seleccion
        </button>
        <input
          type="text"
          value={categoryInput}
          onChange={(event) => setCategoryInput(event.target.value)}
          placeholder="Categoria para accion masiva"
          className="h-8 min-w-0 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
        />
        <button
          type="button"
          onClick={() => onBulkAssignCategory(normalizedCategory)}
          disabled={disableCategoryActions}
          className="h-8 rounded-md border border-teal-600 bg-teal-600 px-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Asignar cat
        </button>
        <button
          type="button"
          onClick={() => onBulkRemoveCategory(normalizedCategory)}
          disabled={disableCategoryActions}
          className="h-8 rounded-md border border-rose-600 bg-rose-600 px-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Quitar cat
        </button>
      </div>
    </section>
  );
}
