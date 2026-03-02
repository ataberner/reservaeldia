export default function DecorCatalogFiltersBar({
  searchInput,
  onSearchInputChange,
  categoryOptions,
  selectedCategory,
  onCategoryChange,
  selectedStatus,
  onStatusChange,
  selectedSort,
  onSortChange,
  technicalView,
  onTechnicalViewChange,
  forceBlack,
  onForceBlackChange,
  filteredTotal,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))]">
        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Buscar
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Nombre, keyword o categoria"
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Categoria
          </span>
          <select
            value={selectedCategory}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
          >
            <option value="all">Todas</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Estado
          </span>
          <select
            value={selectedStatus}
            onChange={(event) => onStatusChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Ordenar
          </span>
          <select
            value={selectedSort}
            onChange={(event) => onSortChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
          >
            <option value="manual">Orden manual</option>
            <option value="most_used">Mas usados</option>
            <option value="recent">Mas recientes</option>
          </select>
        </label>

        <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-span-1 lg:justify-end">
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={technicalView}
              onChange={(event) => onTechnicalViewChange(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200"
            />
            Tecnica
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={forceBlack}
              disabled={!technicalView}
              onChange={(event) => onForceBlackChange(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200 disabled:cursor-not-allowed"
            />
            Negro
          </label>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {filteredTotal} items
          </span>
        </div>
      </div>
    </div>
  );
}

