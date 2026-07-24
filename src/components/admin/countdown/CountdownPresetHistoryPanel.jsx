import { compareCountdownVersionToDraft } from "@/domain/countdownPresets/builderFormModel";

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getPublishedBy(version) {
  return (
    version?.metadata?.publishedBy ||
    version?.metadata?.publishedByUid ||
    version?.publishedBy ||
    version?.metadata?.updatedBy ||
    ""
  );
}

export default function CountdownPresetHistoryPanel({
  history,
  formState,
  onClose,
  onSelectVersion,
}) {
  if (!history?.open) return null;
  const selected = history.selectedVersion;
  const differences = compareCountdownVersionToDraft(selected, formState);

  return (
    <section
      aria-labelledby="countdown-history-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="countdown-history-title"
            className="text-sm font-semibold text-slate-950"
          >
            Historial publicado
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Las versiones son inmutables. Esta vista no activa ni sobrescribe
            versiones.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          Volver al editor
        </button>
      </div>

      {history.loading ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Cargando historial…
        </p>
      ) : null}
      {history.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {history.error}
        </p>
      ) : null}
      {!history.loading && !history.error && !history.items.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          Este preset todavía no tiene versiones publicadas.
        </p>
      ) : null}

      {history.items.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div
            className="space-y-2"
            role="listbox"
            aria-label="Versiones publicadas"
          >
            {history.items.map((version) => {
              const number = Number(version?.version || version?.id || 0);
              const active = number === Number(history.activeVersion);
              const chosen =
                Number(selected?.version || selected?.id || 0) === number;
              return (
                <button
                  key={version.id || number}
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => onSelectVersion?.(version)}
                  className={`min-h-11 w-full rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    chosen
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-slate-900">
                      Versión {number}
                    </strong>
                    {active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Activa
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {formatDate(
                      version?.metadata?.publishedAt || version?.publishedAt
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Versión{" "}
                    {Number(selected?.version || selected?.id || 0)}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">
                    {selected.nombre || "Preset sin nombre"}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {selected?.categoria?.label || "Sin categoría"}
                  </p>
                </div>
                {selected?.svgRef?.thumbnailUrl ? (
                  <img
                    src={selected.svgRef.thumbnailUrl}
                    alt={`Miniatura de ${selected.nombre || "la versión"}`}
                    className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-cover"
                  />
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Publicación</dt>
                  <dd className="text-slate-800">
                    {formatDate(
                      selected?.metadata?.publishedAt || selected?.publishedAt
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Usuario</dt>
                  <dd className="break-all text-slate-800">
                    {getPublishedBy(selected) || "No registrado por el contrato"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-500">
                    Diferencias frente al borrador local
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {differences.length
                      ? differences.join(", ")
                      : "Sin diferencias detectadas."}
                  </dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
