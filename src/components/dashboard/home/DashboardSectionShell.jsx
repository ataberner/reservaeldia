export default function DashboardSectionShell({
  anchorId = "",
  eyebrow = "",
  title,
  description = "",
  aside = null,
  children,
}) {
  return (
    <section
      id={anchorId || undefined}
      className="rounded-[30px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/70 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6f3bc0]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}
