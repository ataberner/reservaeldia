export default function DecorCatalogHeader({
  summaryStats,
  uploadPanelOpen,
  onToggleUploadPanel,
  onReload,
  reloading,
  activeFilter = "all",
  onFilterChange,
}) {
  const stats = summaryStats || {
    total: 0,
    active: 0,
    inactive: 0,
    warnings: 0,
    rejected: 0,
    processing: 0,
    totalUses: 0,
  };

  const kpiChips = [
    { label: "Total", value: stats.total, tone: "slate", filterKey: "all" },
    { label: "Activos", value: stats.active, tone: "emerald", filterKey: "active" },
    { label: "Inactivos", value: stats.inactive, tone: "amber", filterKey: "inactive" },
    { label: "Warn", value: stats.warnings, tone: "yellow", filterKey: "warning" },
    { label: "Rech", value: stats.rejected, tone: "rose", filterKey: "rejected" },
    { label: "Proc", value: stats.processing, tone: "cyan", filterKey: "processing" },
    { label: "Usos", value: stats.totalUses, tone: "indigo", filterKey: null },
  ];

  const toneClassByKey = {
    slate: "border-slate-200 bg-white text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  };

  return (
    <header className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-cyan-50 p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-left text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            Gestion de Decoraciones
          </h1>
          <p className="mt-0.5 hidden text-left text-xs text-slate-600 sm:block">
            Stickers, ilustraciones y metadatos tecnicos.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={onReload}
            disabled={reloading}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reloading ? "Actualizando..." : "Actualizar"}
          </button>
          <button
            type="button"
            onClick={onToggleUploadPanel}
            className="inline-flex h-8 items-center rounded-md border border-teal-600 bg-teal-600 px-2.5 text-xs font-medium text-white transition hover:bg-teal-700"
          >
            {uploadPanelOpen ? "Cerrar subida" : "Subir decoracion"}
          </button>
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1.5 pr-1">
          {kpiChips.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              disabled={!kpi.filterKey}
              onClick={() => {
                if (!kpi.filterKey) return;
                onFilterChange?.(kpi.filterKey);
              }}
              className={`rounded-full border px-2 py-1 text-left ${
                toneClassByKey[kpi.tone]
              } ${
                kpi.filterKey && activeFilter === kpi.filterKey
                  ? "ring-2 ring-slate-500/60"
                  : ""
              } ${
                kpi.filterKey
                  ? "transition hover:brightness-95"
                  : "cursor-default"
              }`}
              title={kpi.filterKey ? "Click para filtrar" : ""}
            >
              <p className="text-[10px] font-semibold leading-none">
                {kpi.label}: {kpi.value}
              </p>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

