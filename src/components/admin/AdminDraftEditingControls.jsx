export default function AdminDraftEditingControls({
  editing = false,
  busy = false,
  error = "",
  onToggle,
  onReload,
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-2 text-xs sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={editing ? "text-indigo-700" : "text-slate-500"}>
          {editing
            ? "Edición administrativa · se conserva el propietario"
            : "Borrador de otro usuario · solo lectura"}
        </p>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Procesando..." : editing ? "Volver a solo lectura" : "Editar borrador"}
        </button>
      </div>
      {error && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-rose-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={onReload}
            disabled={busy}
            className="rounded-md px-1 py-0.5 font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            Recargar borrador
          </button>
        </div>
      )}
    </div>
  );
}
