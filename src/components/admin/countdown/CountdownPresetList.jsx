export default function CountdownPresetList({
  items,
  selectedId,
  loading,
  onSelect,
  onCreate,
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Presets</h2>
          <p className="text-[11px] text-slate-600">Catalogo global de countdowns.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
        >
          Nuevo preset
        </button>
      </div>

      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`skeleton-preset-${index}`}
                className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : null}

        {!loading && safeItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-600">
            No hay presets cargados.
          </div>
        ) : null}

        {!loading && safeItems.length > 0 ? (
          <div className="space-y-1.5">
            {safeItems.map((item) => {
              const isSelected = item.id === selectedId;
              const sourceTag =
                String(item?.metadata?.migrationSource || "").toLowerCase() === "legacy-config-v1"
                  ? "legacy"
                  : "nuevo";
              const statusColor =
                item.estado === "published"
                  ? "bg-emerald-100 text-emerald-700"
                  : item.estado === "archived"
                    ? "bg-zinc-200 text-zinc-700"
                    : "bg-amber-100 text-amber-700";

              const previewThumb =
                item?.svgRef?.thumbnailUrl ||
                item?.draft?.svgRef?.thumbnailUrl ||
                null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect?.(item.id)}
                  className={`w-full rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-violet-300 bg-violet-50/70"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex gap-3">
                    {previewThumb ? (
                      <img
                        src={previewThumb}
                        alt={`${item.nombre} thumbnail`}
                        className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[9px] text-slate-500">
                        Sin miniatura
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-slate-900">
                          {item.nombre || item.id}
                        </p>
                        <div className="flex items-center gap-1">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {sourceTag}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
                            {item.estado || "draft"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-600">
                        {item?.categoria?.label || "General / Minimal"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        v{Number(item.activeVersion || 0)} activa
                        {item.draftVersion ? ` | borrador ${item.draftVersion}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
