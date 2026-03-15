import { History, Loader2 } from "lucide-react";
import {
  formatPricingAmount,
  formatPricingDateTime,
} from "@/domain/siteSettings/pricingModel";

function resolveActorLabel(item) {
  return item?.changedByEmail || item?.changedByUid || "Sistema";
}

function formatPreviousAmount(value) {
  if (value === null || value === undefined) return "Sin valor previo";
  return formatPricingAmount(value);
}

export default function PricingHistory({
  items = [],
  historyError = "",
  historyUnavailable = false,
  hasMoreHistory = false,
  loadingMoreHistory = false,
  onLoadMore,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <History className="h-3.5 w-3.5" />
            Historial
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            Registro completo de cambios
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Cada cambio guarda version, actor, fecha, valores anteriores y nuevos.
          </p>
        </div>
      </div>

      {historyError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {historyError}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {historyUnavailable ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Historial no disponible en este entorno. La configuracion actual sigue operativa y
            podras conectar este bloque cuando el callable este desplegado.
          </div>
        ) : null}

        {!historyUnavailable && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Todavia no hay cambios registrados en el historial.
          </div>
        ) : null}

        {!historyUnavailable
          ? items.map((item) => (
              <article
                key={item.version}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      Version {item.version}
                    </span>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {resolveActorLabel(item)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatPricingDateTime(item.changedAt)}
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-700 sm:min-w-[320px]">
                    <p>
                      Publicacion: <strong>{formatPreviousAmount(item.previousPublishPrice)}</strong>{" "}
                      a <strong>{formatPricingAmount(item.newPublishPrice)}</strong>
                    </p>
                    <p>
                      Actualizacion: <strong>{formatPreviousAmount(item.previousUpdatePrice)}</strong>{" "}
                      a <strong>{formatPricingAmount(item.newUpdatePrice)}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Motivo:</span>{" "}
                  {item.reason || "Sin motivo cargado."}
                </div>
              </article>
            ))
          : null}
      </div>

      {hasMoreHistory ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMoreHistory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMoreHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loadingMoreHistory ? "Cargando..." : "Cargar mas historial"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
