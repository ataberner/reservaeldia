export default function TextPresetHeader({
  summaryStats,
  onCreate,
  onReload,
  reloading,
  syncingLegacy,
  onSyncLegacy,
}) {
  const stats = summaryStats || {
    total: 0,
    active: 0,
    inactive: 0,
    visible: 0,
    hidden: 0,
    simple: 0,
    compuesto: 0,
  };

  const chips = [
    { label: "Total", value: stats.total, tone: "slate" },
    { label: "Activos", value: stats.active, tone: "emerald" },
    { label: "Inactivos", value: stats.inactive, tone: "amber" },
    { label: "Visibles", value: stats.visible, tone: "cyan" },
    { label: "Ocultos", value: stats.hidden, tone: "zinc" },
    { label: "Simple", value: stats.simple, tone: "indigo" },
    { label: "Compuesto", value: stats.compuesto, tone: "violet" },
  ];

  const toneClassByKey = {
    slate: "border-slate-200 bg-white text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
  };

  return (
    <header className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-cyan-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            Gestion de Presets de Texto
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Crea combinaciones simples o compuestas para el panel Texto del editor.
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
            onClick={onSyncLegacy}
            disabled={syncingLegacy}
            className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncingLegacy ? "Sincronizando..." : "Sync legacy"}
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-8 items-center rounded-md border border-cyan-600 bg-cyan-600 px-2.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
          >
            Nuevo preset
          </button>
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1.5 pr-1">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${toneClassByKey[chip.tone]}`}
            >
              {chip.label}: {chip.value}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
