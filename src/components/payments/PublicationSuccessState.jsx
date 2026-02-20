import { Check, CheckCircle2, Copy, ExternalLink } from "lucide-react";

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
  const title =
    operation === "update" ? "Invitacion actualizada" : "Invitacion publicada";
  const subtitle =
    operation === "update"
      ? "Los cambios ya estan visibles en tu enlace publico."
      : "Tu invitacion ya esta online y lista para compartir.";
  const safeUrl = String(publicUrl || "").trim();

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {title}
        </p>
        <p className="text-xs text-emerald-900/90">{subtitle}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
          Enlace para compartir
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
            disabled={!safeUrl}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              safeUrl
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
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Visitar invitacion
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
    </div>
  );
}
