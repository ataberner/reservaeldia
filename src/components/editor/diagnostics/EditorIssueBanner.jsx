import { useMemo } from "react";

function prettyDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function EditorIssueBanner({
  report,
  sending = false,
  sendError = "",
  sentIssueId = null,
  onDismiss,
  onCopy,
  onSend,
}) {
  const summary = useMemo(() => {
    if (!report) return null;
    return {
      source: report.source || "unknown",
      message: report.message || "Sin mensaje",
      occurredAt: report.occurredAt,
      slug: report.slug || "-",
      fingerprint: report.fingerprint || "-",
    };
  }, [report]);

  if (!summary) return null;

  return (
    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Se detecto un error del editor</h4>
          <p className="mt-1 text-xs">
            {summary.source} - {summary.message}
          </p>
          <p className="mt-1 text-[11px] text-red-700">
            Fecha: {prettyDate(summary.occurredAt)} | Slug: {summary.slug} | Fingerprint: {summary.fingerprint}
          </p>
          {sentIssueId && (
            <p className="mt-1 text-[11px] text-red-700">Reporte enviado: {sentIssueId}</p>
          )}
          {sendError && (
            <p className="mt-1 text-[11px] text-red-700">Error al enviar: {sendError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-red-300 px-2 py-1 text-xs hover:bg-red-100"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
        >
          Copiar reporte
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className={`rounded px-3 py-1.5 text-xs font-medium text-white ${
            sending ? "bg-red-300" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {sending ? "Enviando..." : "Enviar reporte"}
        </button>
      </div>
    </div>
  );
}
