import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "./decorCatalogMappers";

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function ValidationBadge({ validationStatus }) {
  if (validationStatus === "warning") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800">
        Warn
      </span>
    );
  }

  if (validationStatus === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
        Rech
      </span>
    );
  }

  return null;
}

function SecondaryStatusBadge({ status }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
        Proc
      </span>
    );
  }
  return null;
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "-";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function TechnicalPreview({ url, forceBlack }) {
  const imageStyle = useMemo(
    () => (forceBlack ? { filter: "brightness(0) saturate(100%)" } : undefined),
    [forceBlack]
  );

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {[96, 160].map((size) => (
        <div key={size} className="rounded-md border border-slate-200 bg-white p-1">
          <p className="mb-1 text-center text-[9px] font-semibold text-slate-500">{size}px</p>
          <div className="flex h-16 items-center justify-center">
            <img
              src={url}
              alt={`preview-${size}`}
              style={{
                maxWidth: size,
                maxHeight: size,
                objectFit: "contain",
                ...imageStyle,
              }}
              loading="lazy"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StandardPreview({ url }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-2">
      <img src={url} alt="preview-decoracion" className="max-h-36 w-auto object-contain" loading="lazy" />
    </div>
  );
}

export default function DecorCatalogCard({
  icon,
  technicalView,
  forceBlack,
  selected,
  selectionDisabled,
  busyState,
  onToggleSelect,
  onEdit,
  onToggleActivation,
  onRevalidate,
  onPrioritySave,
}) {
  const [priorityInput, setPriorityInput] = useState(String(icon?.priority || 0));
  const busy = busyState || {};

  useEffect(() => {
    setPriorityInput(String(icon?.priority || 0));
  }, [icon?.priority, icon?.id]);

  const validationWarnings = Array.isArray(icon?.validation?.warnings)
    ? icon.validation.warnings.length
    : 0;
  const validationErrors = Array.isArray(icon?.validation?.errors)
    ? icon.validation.errors.length
    : 0;
  const categoryList = useMemo(() => {
    if (Array.isArray(icon?.categorias) && icon.categorias.length > 0) {
      return icon.categorias;
    }
    if (icon?.categoria) return [icon.categoria];
    return [];
  }, [icon?.categoria, icon?.categorias]);

  const previewUrl = icon?.thumbnailUrl || icon?.url;
  const dimensionsText = icon?.width && icon?.height ? `${icon.width} x ${icon.height}` : "-";

  const savePriority = () => {
    const parsed = Number(priorityInput);
    if (!Number.isFinite(parsed)) return;
    onPrioritySave?.({
      iconId: icon.id,
      priority: parsed,
    });
  };

  const handleActivationClick = (event) => {
    event?.currentTarget?.blur?.();
    onToggleActivation?.(icon);
  };

  const handleSelectChange = (event) => {
    onToggleSelect?.(icon?.id, event.target.checked);
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:shadow">
      <div className="mb-1.5 flex items-start justify-between gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <label className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <input
              type="checkbox"
              checked={selected === true}
              disabled={selectionDisabled}
              onChange={handleSelectChange}
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-200 disabled:cursor-not-allowed"
            />
            Sel
          </label>
          <StatusBadge active={icon?.isActive} />
          <ValidationBadge validationStatus={icon?.validationStatus} />
          <SecondaryStatusBadge status={icon?.status} />
        </div>
        <p className="text-[10px] font-medium text-slate-500">{icon?.format ? icon.format.toUpperCase() : "-"}</p>
      </div>

      {technicalView ? (
        <TechnicalPreview url={previewUrl} forceBlack={forceBlack} />
      ) : (
        <StandardPreview url={previewUrl} />
      )}

      <div className="mt-1.5 space-y-0.5 text-left">
        <h3 className="line-clamp-1 text-xs font-semibold text-slate-900" title={icon?.nombre || ""}>
          {icon?.nombre || "Sin nombre"}
        </h3>
        {categoryList.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {categoryList.map((category) => (
              <span
                key={`${icon?.id}-${category}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700"
                title={category}
              >
                {category}
              </span>
            ))}
          </div>
        ) : (
          <p className="line-clamp-1 text-[11px] text-slate-600">Sin categoria</p>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-slate-600">
        <span>Dim: <strong>{dimensionsText}</strong></span>
        <span>Peso: <strong>{formatBytes(icon?.bytes)}</strong></span>
        <span>Alpha: <strong>{icon?.hasAlpha === null ? "-" : icon?.hasAlpha ? "Si" : "No"}</strong></span>
        <span>Ord: <strong>{icon?.priority || 0}</strong></span>
      </div>

      <p className="mt-1 line-clamp-1 text-[10px] text-slate-500" title={formatDateTime(icon?.updatedAt)}>
        {formatDateTime(icon?.updatedAt)}
      </p>

      {(validationWarnings > 0 || validationErrors > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
          {validationErrors > 0 && (
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
              Err {validationErrors}
            </span>
          )}
          {validationWarnings > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">
              Warn {validationWarnings}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        <input
          type="number"
          min={-9999}
          max={9999}
          value={priorityInput}
          onChange={(event) => setPriorityInput(event.target.value)}
          className="h-6 w-full rounded-md border border-slate-300 px-1 text-[10px] text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
        />
        <button
          type="button"
          onClick={savePriority}
          disabled={busy?.priority === true}
          className="h-6 rounded-md border border-teal-600 bg-teal-600 px-1.5 text-[9px] font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy?.priority ? "..." : "OK"}
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onEdit?.(icon.id)}
          className="h-6 rounded-md border border-slate-300 bg-white px-1 text-[9px] font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleActivationClick}
          disabled={busy?.activation === true}
          className={`h-6 rounded-md px-1 text-[9px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            icon?.isActive
              ? "border border-amber-600 bg-amber-600 hover:bg-amber-700"
              : "border border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {busy?.activation ? "..." : icon?.isActive ? "Off" : "On"}
        </button>
        <button
          type="button"
          onClick={() => onRevalidate?.(icon)}
          disabled={busy?.revalidate === true}
          title="Revalidar manualmente"
          className="h-6 rounded-md border border-cyan-600 bg-cyan-600 px-1 text-[9px] font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {busy?.revalidate ? "..." : "Rev"}
        </button>
      </div>
    </article>
  );
}
