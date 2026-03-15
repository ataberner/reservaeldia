import { useEffect, useId } from "react";
import { AlertTriangle, ArrowRight, Save, X } from "lucide-react";
import { createPortal } from "react-dom";
import { formatPricingAmount } from "@/domain/siteSettings/pricingModel";

function resolveReason(value) {
  const normalized = String(value || "").trim();
  return normalized || "Sin motivo cargado.";
}

function formatPreviousAmount(value) {
  if (value === null || value === undefined) return "Sin valor previo";
  return formatPricingAmount(value);
}

export default function PricingChangeConfirmModal({
  isOpen,
  change,
  saving = false,
  onCancel,
  onConfirm,
}) {
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  useEffect(() => {
    if (!isOpen) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) {
        onCancel?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen, onCancel, saving]);

  if (!isOpen || !change || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1f1238]/58 p-4 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel?.();
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-lg overflow-hidden rounded-[26px] border border-[#e6daf8] bg-white text-slate-800 shadow-[0_34px_86px_rgba(45,24,88,0.34)]"
      >
        <div className="relative border-b border-[#ece4fb] bg-gradient-to-r from-white via-[#faf6ff] to-[#f4f8ff] px-4 pb-3 pt-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#dfd3f4] bg-white text-[#6f3bc0] transition hover:bg-[#f5edff] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Cerrar modal"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-start gap-2.5 pr-8">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fff0da] via-[#ffebc7] to-[#ffe2b2] text-[#9d5a00] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(157,90,0,0.18)]">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Confirmar cambio de precios
              </h2>
              <p id={descriptionId} className="mt-0.5 text-xs text-slate-600">
                Revisa los montos antes de guardar. Este cambio solo afectara nuevos checkouts.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Publicacion
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <span>{formatPreviousAmount(change.previousPublishPrice)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <strong className="text-slate-900">
                  {formatPricingAmount(change.newPublishPrice)}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Actualizacion
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <span>{formatPreviousAmount(change.previousUpdatePrice)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <strong className="text-slate-900">
                  {formatPricingAmount(change.newUpdatePrice)}
                </strong>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            Las sesiones ya creadas mantienen el monto con el que fueron iniciadas. Solo los
            nuevos checkouts usaran estos valores.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Motivo
            </p>
            <p className="mt-1 text-sm text-slate-700">{resolveReason(change.reason)}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ece4fb] px-4 pb-4 pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-[#d9ccef] bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-[#f8f3ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfddb6] bg-gradient-to-r from-[#4e8f35] via-[#3f7f28] to-[#2f6c1d] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_14px_28px_rgba(47,108,29,0.28)] transition hover:from-[#46812f] hover:via-[#387324] hover:to-[#295f19] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Confirmar y guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
