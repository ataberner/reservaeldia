import {
  isCountdownPresetLegacy,
  isCountdownPresetProtected,
} from "@/domain/countdownPresets/builderState";

function statusLabel(status) {
  if (status === "published") return "Publicado";
  if (status === "archived") return "Archivado";
  return "Borrador";
}

function categoryLabel(category) {
  const labels = {
    boda: "Boda",
    quince: "Quince",
    cumpleanos: "Cumpleaños",
    aniversario: "Aniversario",
    "baby-shower": "Baby shower",
    corporativo: "Corporativo",
    general: "General",
  };
  return labels[category] || category;
}

function getName(item) {
  return item?.draft?.nombre || item?.nombre || item?.id || "Sin nombre";
}

function PresetBadges({ item, selectedDirty = false }) {
  const hasDraft = Boolean(Number(item?.draftVersion || 0) && item?.draft);
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          item?.estado === "published"
            ? "bg-emerald-100 text-emerald-700"
            : item?.estado === "archived"
              ? "bg-slate-200 text-slate-700"
              : "bg-amber-100 text-amber-800"
        }`}
      >
        {statusLabel(item?.estado)}
      </span>
      {hasDraft ? (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          Draft
        </span>
      ) : null}
      {selectedDirty ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          Local
        </span>
      ) : null}
      {isCountdownPresetLegacy(item) ? (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          Legacy
        </span>
      ) : null}
      {isCountdownPresetProtected(item) ? (
        <span
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
          title="Tiene versiones o assets publicados protegidos"
        >
          Protegido
        </span>
      ) : null}
    </span>
  );
}

export default function CountdownPresetList({
  items,
  filteredItems,
  categoryOptions,
  selectedId,
  dirty,
  loading,
  filters,
  onFilterChange,
  onSelect,
  onCreate,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const visibleItems = Array.isArray(filteredItems) ? filteredItems : [];
  const selectedVisible = visibleItems.some((item) => item.id === selectedId);

  return (
    <aside className="self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-3 lg:flex lg:h-full lg:max-h-[calc(100dvh-1.5rem)] lg:min-h-0 lg:flex-col">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Presets</h2>
          <p className="text-[11px] text-slate-600">
            {visibleItems.length} de {safeItems.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 outline-none hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          Crear preset
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <label className="block text-[11px] font-medium text-slate-600">
          Buscar por nombre o categoría
          <input
            type="search"
            value={filters?.query || ""}
            onChange={(event) => onFilterChange?.("query", event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            placeholder="Buscar presets"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-medium text-slate-600">
            Estado
            <select
              value={filters?.status || "all"}
              onChange={(event) =>
                onFilterChange?.("status", event.target.value)
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <option value="all">Todos</option>
              <option value="published">Publicados</option>
              <option value="draft">Borradores</option>
              <option value="archived">Archivados</option>
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-600">
            Categoría
            <select
              value={filters?.category || "all"}
              onChange={(event) =>
                onFilterChange?.("category", event.target.value)
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <option value="all">Todas</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[11px] font-medium text-slate-600">
          Orden
          <select
            value={filters?.sort || "updated-desc"}
            onChange={(event) => onFilterChange?.("sort", event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <option value="updated-desc">Última modificación</option>
            <option value="name-asc">Nombre</option>
            <option value="version-desc">Versión activa</option>
          </select>
        </label>
      </div>

      {!selectedVisible && selectedId ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          El preset abierto no coincide con los filtros. La selección y sus
          cambios locales se conservan.
        </p>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-slate-700 lg:hidden">
        Cambiar preset
        <select
          value={selectedVisible ? selectedId || "" : ""}
          onChange={(event) => onSelect?.(event.target.value)}
          disabled={loading || !visibleItems.length}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <option value="" disabled>
            {visibleItems.length ? "Seleccionar" : "Sin resultados"}
          </option>
          {visibleItems.map((item) => (
            <option key={item.id} value={item.id}>
              {getName(item)} — {statusLabel(item.estado)}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 hidden min-h-0 overflow-y-auto overscroll-contain pr-1 lg:block lg:flex-1">
        {loading ? (
          <div role="status" className="space-y-2" aria-label="Cargando presets">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`countdown-preset-skeleton-${index}`}
                className="h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}
        {!loading && !visibleItems.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
            No hay presets que coincidan con la búsqueda.
          </p>
        ) : null}
        {!loading ? (
          <div className="space-y-2">
            {visibleItems.map((item) => {
              const selected = item.id === selectedId;
              const name = getName(item);
              const thumbnail =
                item?.draft?.svgRef?.thumbnailUrl ||
                item?.svgRef?.thumbnailUrl ||
                "";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect?.(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`min-h-11 w-full rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    selected
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex gap-3">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[9px] text-slate-500">
                        Sin imagen
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <strong className="min-w-0 truncate text-sm text-slate-900">
                          {name}
                        </strong>
                        <PresetBadges
                          item={item}
                          selectedDirty={selected && dirty}
                        />
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-600">
                        {item?.draft?.categoria?.label ||
                          item?.categoria?.label ||
                          "Sin categoría"}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        Activa: {Number(item.activeVersion || 0) || "—"} ·
                        Borrador: {Number(item.draftVersion || 0) || "—"}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
