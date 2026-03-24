import { AlertTriangle, ShieldAlert } from "lucide-react";

function getIssueKey(issue, index) {
  const code = typeof issue?.code === "string" ? issue.code.trim() : "";
  const objectId = typeof issue?.objectId === "string" ? issue.objectId.trim() : "";
  const sectionId = typeof issue?.sectionId === "string" ? issue.sectionId.trim() : "";
  const fieldPath = typeof issue?.fieldPath === "string" ? issue.fieldPath.trim() : "";
  const message = typeof issue?.message === "string" ? issue.message.trim() : "";
  return [code, objectId, sectionId, fieldPath, message, index].join("|");
}

function IssueList({
  title,
  icon,
  count,
  items,
  tone = "warning",
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const styles =
    tone === "blocking"
      ? {
          card: "border-red-200 bg-red-50/85 text-red-950",
          badge: "border-red-200 bg-white/80 text-red-700",
          icon: "text-red-600",
          bullet: "bg-red-700",
          text: "text-red-900",
        }
      : {
          card: "border-amber-200 bg-amber-50/85 text-amber-950",
          badge: "border-amber-200 bg-white/80 text-amber-700",
          icon: "text-amber-600",
          bullet: "bg-amber-700",
          text: "text-amber-900",
        };

  const Icon = icon;

  return (
    <div className={`rounded-2xl border px-3 py-3 ${styles.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/80 ${styles.icon}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
          </div>
        </div>
        <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${styles.badge}`}>
          {count}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {items.map((issue, index) => (
          <li
            key={getIssueKey(issue, index)}
            className={`flex items-start gap-2 text-[12px] leading-5 ${styles.text}`}
          >
            <span className={`mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${styles.bullet}`} />
            <span>{issue?.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PublishValidationSummary({
  validation,
  pending = false,
}) {
  const blockers = Array.isArray(validation?.blockers) ? validation.blockers : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  const hasIssues = blockers.length > 0 || warnings.length > 0;

  if (!pending && !hasIssues) return null;

  return (
    <div className="mt-3 space-y-2.5">
      {pending ? (
        <div className="rounded-2xl border border-slate-200 bg-white/84 px-3 py-3 text-[12px] text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          Validando compatibilidad de publish...
        </div>
      ) : null}

      <IssueList
        title="Bloqueos de publish"
        icon={ShieldAlert}
        count={blockers.length}
        items={blockers}
        tone="blocking"
      />

      <IssueList
        title="Advertencias de compatibilidad"
        icon={AlertTriangle}
        count={warnings.length}
        items={warnings}
        tone="warning"
      />
    </div>
  );
}
