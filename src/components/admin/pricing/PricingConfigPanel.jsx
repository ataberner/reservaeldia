import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  formatPricingAmount,
  formatPricingDateTime,
  formatPricingPreview,
} from "@/domain/siteSettings/pricingModel";

export default function PricingConfigPanel({
  config,
  form,
  error = "",
  success = "",
  saving = false,
  canSave = false,
  isDirty = false,
  validationMessage = "",
  onFieldChange,
  onReset,
  onReload,
  onOpenConfirm,
}) {
  const hasConfig = Boolean(config);
  const currency = form?.currency || config?.currency || "ARS";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#d8efd7] bg-gradient-to-br from-white via-[#f8fff7] to-[#f4fbff] p-5 shadow-[0_14px_40px_rgba(33,94,34,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cae7c9] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2f6c1d]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Pricing centralizado
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">
              Configuracion canonica para checkout y Mercado Pago
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Los montos viven en backend y solo afectan nuevos checkouts. Las sesiones ya
              creadas conservan el valor con el que fueron iniciadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReload}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Precio actual de publicacion</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {hasConfig ? formatPricingAmount(config.publishPrice, config.currency) : "No disponible"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Precio actual de actualizacion</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {hasConfig ? formatPricingAmount(config.updatePrice, config.currency) : "No disponible"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Moneda</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {hasConfig ? config.currency : "No disponible"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Version actual</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {hasConfig ? config.version || "-" : "No disponible"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Editar precios</h3>
            <p className="mt-1 text-sm text-slate-600">
              Cambia uno o ambos valores, completa el motivo y confirma antes de guardar.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <p>Ultima actualizacion: {formatPricingDateTime(config?.updatedAt)}</p>
            <p>Actualizado por: {config?.updatedByEmail || config?.updatedByUid || "-"}</p>
          </div>
        </div>

        {config?.lastChangeReason ? (
          <div className="mt-4 rounded-2xl border border-[#e5eceb] bg-[#f8fbfb] px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Ultimo motivo:</span>{" "}
            {config.lastChangeReason}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Precio de publicacion
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.publishPrice}
              onChange={(event) => onFieldChange("publishPrice", event.target.value)}
              disabled={!hasConfig || saving}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#9ecf96] focus:ring-2 focus:ring-[#def1d9]"
              placeholder="Ingresa un monto"
            />
            <p className="mt-2 text-xs text-slate-500">
              Vista previa: {formatPricingPreview(form.publishPrice, currency)}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Precio de actualizacion
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.updatePrice}
              onChange={(event) => onFieldChange("updatePrice", event.target.value)}
              disabled={!hasConfig || saving}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#9ecf96] focus:ring-2 focus:ring-[#def1d9]"
              placeholder="Ingresa un monto"
            />
            <p className="mt-2 text-xs text-slate-500">
              Vista previa: {formatPricingPreview(form.updatePrice, currency)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Moneda</label>
            <select
              value={form.currency}
              onChange={(event) => onFieldChange("currency", event.target.value)}
              disabled={!hasConfig || saving}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#9ecf96] focus:ring-2 focus:ring-[#def1d9]"
            >
              <option value="ARS">ARS</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Preparado para multiples monedas, limitado a ARS en esta version.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Motivo del cambio
            </label>
            <textarea
              value={form.changeReason}
              onChange={(event) => onFieldChange("changeReason", event.target.value)}
              rows={3}
              maxLength={500}
              disabled={!hasConfig || saving}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#9ecf96] focus:ring-2 focus:ring-[#def1d9]"
              placeholder="Ej: ajuste comercial de temporada"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Campo obligatorio para guardar cambios.</span>
              <span>{String(form.changeReason || "").length}/500</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              Valores permitidos: enteros mayores o iguales a 0. El backend valida y aplica
              el monto real al crear la preferencia.
            </p>
            {isDirty && !canSave && validationMessage ? (
              <p className="text-xs font-medium text-amber-700">{validationMessage}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={!hasConfig || saving || !isDirty}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Restaurar
            </button>

            <button
              type="button"
              onClick={onOpenConfirm}
              disabled={!hasConfig || saving || !canSave}
              className="inline-flex items-center gap-2 rounded-xl border border-[#a5d298] bg-gradient-to-r from-[#5c9a40] via-[#47842f] to-[#35711f] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(53,113,31,0.24)] transition hover:from-[#528937] hover:via-[#40772a] hover:to-[#2f651b] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
