import { Check, CheckCircle2, Copy, ExternalLink, Loader2, Play } from "lucide-react";
import usePublicationAvailability from "@/hooks/usePublicationAvailability";

function getAvailabilityMessage(availability, operation) {
  if (availability.loading) {
    return "Los cambios se guardaron. Estamos verificando la disponibilidad del enlace.";
  }
  if (availability.readError) {
    return "Los cambios se guardaron, pero no pudimos confirmar la disponibilidad del enlace.";
  }
  if (availability.status?.isPaused) {
    return "Los cambios se guardaron. Tu invitacion sigue pausada; reanudala para que tus invitados puedan verla.";
  }
  if (!availability.status?.isActive) {
    return "Los cambios se guardaron. La invitacion no esta disponible para visitantes; revisa su estado en Mis invitaciones.";
  }
  return operation === "update"
    ? "Los cambios ya estan visibles en tu enlace publico."
    : "Tu invitacion ya esta online y lista para compartir.";
}

export default function PublicationSuccessState({
  operation = "new",
  publicUrl = "",
  amountLabel = "",
  paymentId = "",
  approvedAt = "",
  copied = false,
  onCopy,
  onClose,
}) {
  const availability = usePublicationAvailability(publicUrl);
  const canShare = Boolean(availability.status?.isActive);
  const isPaused = Boolean(availability.status?.isPaused);
  const title =
    operation === "update" ? "Invitacion actualizada" : "Invitacion publicada";
  const subtitle = getAvailabilityMessage(availability, operation);
  const safeUrl = String(publicUrl || "").trim();

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {title}
        </p>
        <p className="text-xs text-emerald-900/90" aria-live="polite">{subtitle}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
          {canShare ? "Enlace para compartir" : "Enlace de tu invitacion"}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            readOnly
            value={safeUrl || "No disponible"}
            className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs text-slate-700"
          />
          <button
            type="button"
            onClick={onCopy}
            disabled={!safeUrl || !canShare}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              safeUrl && canShare
                ? "border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
                : "cursor-not-allowed border border-emerald-200 bg-emerald-100 text-emerald-500"
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar enlace"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-xs text-emerald-900 sm:grid-cols-2">
        <p>Monto: {amountLabel || "-"}</p>
        <p>ID pago: {paymentId || "-"}</p>
        <p>Operacion: {operation === "update" ? "Actualizacion" : "Publicacion"}</p>
        <p>Fecha: {approvedAt || "-"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isPaused ? (
          <button
            type="button"
            onClick={availability.resume}
            disabled={availability.resuming}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#692B9A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5c2389] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#692B9A] focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {availability.resuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {availability.resuming ? "Reanudando..." : "Reanudar invitacion"}
          </button>
        ) : null}
        {availability.readError ? (
          <button
            type="button"
            onClick={availability.retryRead}
            className="rounded-lg border border-[#692B9A] bg-white px-3 py-2 text-xs font-semibold text-[#692B9A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#692B9A] focus-visible:ring-offset-2"
          >
            Volver a verificar
          </button>
        ) : null}
        {safeUrl && canShare ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Ver invitación
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center rounded-lg border border-[#d8ccea] bg-white px-3 py-1.5 text-xs font-semibold text-[#6f3bc0] hover:bg-[#f4ecff]"
        >
          Cerrar
        </button>
      </div>
      {availability.resumeError ? (
        <p role="alert" className="text-xs text-[#B3261E]">{availability.resumeError}</p>
      ) : null}
    </div>
  );
}
