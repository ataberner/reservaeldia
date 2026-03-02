export default function TextPresetFiltersBar({
  searchInput,
  onSearchInputChange,
  selectedTipo,
  onTipoChange,
  selectedCategoria,
  onCategoriaChange,
  selectedActivo,
  onActivoChange,
  selectedVisible,
  onVisibleChange,
  categoryOptions,
  filteredTotal,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Buscar
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Nombre o tags"
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Tipo
          </span>
          <select
            value={selectedTipo}
            onChange={(event) => onTipoChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
          >
            <option value="all">Todos</option>
            <option value="simple">Simple</option>
            <option value="compuesto">Compuesto</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Categoria
          </span>
          <select
            value={selectedCategoria}
            onChange={(event) => onCategoriaChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
          >
            <option value="all">Todas</option>
            {categoryOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Activo
          </span>
          <select
            value={selectedActivo}
            onChange={(event) => onActivoChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
          >
            <option value="all">Todos</option>
            <option value="active">Si</option>
            <option value="inactive">No</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Mostrar editor
          </span>
          <select
            value={selectedVisible}
            onChange={(event) => onVisibleChange(event.target.value)}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
          >
            <option value="all">Todos</option>
            <option value="visible">Si</option>
            <option value="hidden">No</option>
          </select>
        </label>
      </div>

      <div className="mt-2 text-right">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {filteredTotal} items
        </span>
      </div>
    </div>
  );
}
