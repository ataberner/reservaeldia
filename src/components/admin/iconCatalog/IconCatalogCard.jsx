import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import {
  formatDateTime,
  getIconCatalogIssueHelp,
} from "./iconCatalogMappers";

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
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
  if (status === "duplicate") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
        Dup
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
        Proc
      </span>
    );
  }
  return null;
}

function IssueInfoTooltip({ help }) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(null);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const showTooltip = useCallback(() => {
    cancelScheduledClose();
    setOpen(true);
  }, [cancelScheduledClose]);

  const scheduleTooltipClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelScheduledClose]);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip || typeof window === "undefined") return;

    const margin = 12;
    const gap = 6;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
    const left = Math.min(
      maxLeft,
      Math.max(
        margin,
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      )
    );
    const belowTop = triggerRect.bottom + gap;
    const aboveTop = triggerRect.top - tooltipRect.height - gap;
    const fitsBelow = belowTop + tooltipRect.height <= window.innerHeight - margin;
    const top = fitsBelow
      ? belowTop
      : Math.max(margin, Math.min(aboveTop, window.innerHeight - tooltipRect.height - margin));

    setTooltipPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setTooltipPosition(null);
      return undefined;
    }

    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [open, updateTooltipPosition]);

  useEffect(() => () => cancelScheduledClose(), [cancelScheduledClose]);

  useEffect(() => {
    if (!open) return undefined;

    const closeFromOutside = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (tooltipRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeFromKeyboard = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus?.();
    };

    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  if (!help) return null;

  const toneClasses =
    help.tone === "error"
      ? {
          button: "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-200",
          panel: "border-rose-200",
          title: "text-rose-800",
        }
      : help.tone === "processing"
        ? {
            button: "border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 focus:ring-cyan-200",
            panel: "border-cyan-200",
            title: "text-cyan-800",
          }
        : {
            button: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 focus:ring-amber-200",
            panel: "border-amber-200",
            title: "text-amber-800",
          };

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            onMouseEnter={showTooltip}
            onMouseLeave={scheduleTooltipClose}
            style={
              tooltipPosition
                ? { left: tooltipPosition.left, top: tooltipPosition.top }
                : { left: -10000, top: -10000 }
            }
            className={`fixed z-[100] max-h-[calc(100dvh-1.5rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border bg-white p-2.5 text-left shadow-xl ${toneClasses.panel}`}
          >
            <p className={`text-xs font-semibold ${toneClasses.title}`}>{help.title}</p>
            <ul className="mt-1.5 space-y-2 text-[11px] leading-4 text-slate-700">
              {help.entries.map((entry, index) => (
                <li key={`${entry.problem}-${index}`}>
                  <p>{entry.problem}</p>
                  <p className="mt-0.5">
                    <strong>Como solucionarlo:</strong> {entry.solution}
                  </p>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Informacion: ${help.title}`}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleTooltipClose}
        onFocus={showTooltip}
        onBlur={scheduleTooltipClose}
        onClick={showTooltip}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border outline-none transition focus:ring-2 focus:ring-offset-1 motion-reduce:transition-none ${toneClasses.button}`}
      >
        <Info aria-hidden="true" size={14} strokeWidth={2.25} />
      </button>
      {tooltip}
    </>
  );
}

function TechnicalPreview({ url, forceBlack }) {
  const imageStyle = useMemo(
    () => (forceBlack ? { filter: "brightness(0) saturate(100%)" } : undefined),
    [forceBlack]
  );

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {[24, 48].map((size) => (
        <div key={size} className="rounded-md border border-slate-200 bg-white p-1">
          <p className="mb-1 text-center text-[9px] font-semibold text-slate-500">{size}px</p>
          <div className="flex h-10 items-center justify-center">
            <img
              src={url}
              alt={`preview-${size}`}
              style={{
                width: size,
                height: size,
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
    <div className="flex h-16 items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-1.5">
      <img src={url} alt="preview-icono" className="h-10 w-10 object-contain" loading="lazy" />
    </div>
  );
}

export default function IconCatalogCard({
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
  const issueHelp = useMemo(() => getIconCatalogIssueHelp(icon), [icon]);
  const categoryList = useMemo(() => {
    if (Array.isArray(icon?.categorias) && icon.categorias.length > 0) {
      return icon.categorias;
    }
    if (icon?.categoria) return [icon.categoria];
    return [];
  }, [icon?.categoria, icon?.categorias]);

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
          <IssueInfoTooltip help={issueHelp} />
        </div>
        <p className="text-[10px] font-medium text-slate-500">{icon?.format ? icon.format.toUpperCase() : "-"}</p>
      </div>

      {technicalView ? (
        <TechnicalPreview url={icon?.url} forceBlack={forceBlack} />
      ) : (
        <StandardPreview url={icon?.url} />
      )}

      <div className="mt-1.5 space-y-0.5 text-left">
        <h3
          className="line-clamp-1 text-xs font-semibold text-slate-900"
          title={icon?.nombre || ""}
        >
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

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600">
        <span>Usos: <strong>{icon?.usesCount || 0}</strong></span>
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
