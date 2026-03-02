import { useMemo } from "react";

function Badge({ children, tone = "slate" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : tone === "cyan"
            ? "border-cyan-200 bg-cyan-50 text-cyan-800"
            : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

let previewMeasureCtx = null;
function getPreviewMeasureCtx() {
  if (typeof document === "undefined") return null;
  if (previewMeasureCtx) return previewMeasureCtx;
  const canvas = document.createElement("canvas");
  previewMeasureCtx = canvas.getContext("2d");
  return previewMeasureCtx;
}

function normalizeAlign(value) {
  const raw = String(value || "left").toLowerCase();
  if (raw === "center" || raw === "right") return raw;
  return "left";
}

function getDisplayText(item) {
  const raw = String(item?.texto || "");
  return item?.uppercase === true ? raw.toUpperCase() : raw;
}

function buildFontString({ fontStyle = "normal", fontWeight = "normal", fontSize = 20, fontFamily = "sans-serif" }) {
  const style = fontStyle && fontStyle !== "normal" ? `${fontStyle} ` : "";
  const weight = fontWeight && fontWeight !== "normal" ? `${fontWeight} ` : "";
  return `${style}${weight}${Number(fontSize)}px ${fontFamily}`;
}

function measureTextWidth(texto, fontDesc, letterSpacing = 0) {
  const safeText = String(texto ?? "").replace(/\r\n/g, "\n");
  const safeSpacing = Number(letterSpacing) || 0;
  const lines = safeText.split("\n");
  const ctx = getPreviewMeasureCtx();

  if (!ctx) {
    const safeSize = Number(fontDesc?.fontSize) || 20;
    return Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        return Math.max(18, safeLine.length * (safeSize * 0.56) + Math.max(0, safeLine.length - 1) * safeSpacing);
      }),
      18
    );
  }

  ctx.font = buildFontString(fontDesc);
  return Math.max(
    ...lines.map((line) => {
      const safeLine = String(line || "");
      const baseWidth = ctx.measureText(safeLine).width;
      const spacingExtra = Math.max(0, safeLine.length - 1) * safeSpacing;
      return Math.max(18, baseWidth + spacingExtra);
    }),
    18
  );
}

function PresetPreview({ preset }) {
  const rawItems = Array.isArray(preset?.items) ? preset.items : [];

  const positionedItems = useMemo(
    () =>
      rawItems.map((item, index) => {
        const x = Number.isFinite(Number(item?.x)) ? Number(item.x) : 0;
        const y = Number.isFinite(Number(item?.y)) ? Number(item.y) : 0;
        const fontSize = Number.isFinite(Number(item?.fontSize)) ? Number(item.fontSize) : 20;
        const lineHeight =
          Number.isFinite(Number(item?.lineHeight)) && Number(item?.lineHeight) > 0
            ? Number(item.lineHeight)
            : 1.2;
        const letterSpacing = Number.isFinite(Number(item?.letterSpacing)) ? Number(item.letterSpacing) : 0;
        const align = normalizeAlign(item?.align || item?.textAlign);
        const text = getDisplayText(item);
        const width = measureTextWidth(
          text,
          {
            fontFamily: item?.fontFamily || "sans-serif",
            fontSize,
            fontWeight: item?.fontWeight || "normal",
            fontStyle: item?.italic ? "italic" : "normal",
          },
          letterSpacing
        );
        const linesCount = Math.max(1, String(text || "").split(/\r?\n/).length);
        const height = Math.max(fontSize, fontSize * lineHeight * linesCount);

        const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
        const right = left + width;

        return {
          key: item?.id || `item-${index + 1}`,
          text,
          y,
          left,
          right,
          width,
          height,
          align,
          fontSize,
          lineHeight,
          letterSpacing,
          color: item?.color || "#111111",
          fontFamily: item?.fontFamily || "sans-serif",
          fontWeight: item?.fontWeight || "normal",
          fontStyle: item?.italic ? "italic" : "normal",
        };
      }),
    [rawItems]
  );

  const bounds = useMemo(() => {
    if (!positionedItems.length) return { minX: 0, minY: 0, maxX: 300, maxY: 140 };

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    positionedItems.forEach((item) => {
      minX = Math.min(minX, item.left);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.right);
      maxY = Math.max(maxY, item.y + item.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return { minX: 0, minY: 0, maxX: 300, maxY: 140 };
    }

    return { minX, minY, maxX, maxY };
  }, [positionedItems]);

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(1, 220 / width, 84 / height);

  return (
    <div className="relative h-24 overflow-hidden rounded-md border border-slate-200 bg-gradient-to-b from-white to-slate-50">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width,
          height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        {positionedItems.map((item) => {
          return (
            <p
              key={item.key}
              className="absolute m-0 whitespace-pre"
              style={{
                left: item.left - bounds.minX,
                top: item.y - bounds.minY,
                width: item.width,
                fontSize: item.fontSize,
                lineHeight: item.lineHeight,
                letterSpacing: item.letterSpacing,
                color: item.color,
                fontFamily: item.fontFamily,
                fontWeight: item.fontWeight,
                fontStyle: item.fontStyle,
                textAlign: item.align,
              }}
            >
              {String(item.text || "").slice(0, 80)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function TextPresetCard({
  preset,
  busyState,
  onEdit,
  onDuplicate,
  onToggleActivation,
  onToggleVisibility,
  onDelete,
}) {
  const busy = busyState || {};

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:shadow">
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <Badge tone={preset?.activo ? "emerald" : "amber"}>
          {preset?.activo ? "Activo" : "Inactivo"}
        </Badge>
        <Badge tone={preset?.mostrarEnEditor ? "cyan" : "slate"}>
          {preset?.mostrarEnEditor ? "Visible" : "Oculto"}
        </Badge>
        <Badge tone="violet">{preset?.tipo === "compuesto" ? "Compuesto" : "Simple"}</Badge>
      </div>

      <PresetPreview preset={preset} />

      <div className="mt-2 space-y-0.5 text-left">
        <h3 className="line-clamp-1 text-xs font-semibold text-slate-900" title={preset?.nombre || ""}>
          {preset?.nombre || "Sin nombre"}
        </h3>
        <p className="line-clamp-1 text-[11px] text-slate-600">
          Categoria: <strong>{preset?.categoria || "general"}</strong>
        </p>
        <p className="line-clamp-1 text-[11px] text-slate-600">Orden: {Number(preset?.orden || 0)}</p>
        {Array.isArray(preset?.tags) && preset.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {preset.tags.slice(0, 4).map((tag) => (
              <span key={`${preset.id}-tag-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onEdit?.(preset.id)}
          className="h-6 rounded-md border border-slate-300 bg-white px-1 text-[9px] font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDuplicate?.(preset.id)}
          disabled={busy?.duplicate === true}
          className="h-6 rounded-md border border-indigo-300 bg-indigo-50 px-1 text-[9px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy?.duplicate ? "..." : "Duplicar"}
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(preset.id)}
          disabled={busy?.delete === true}
          className="h-6 rounded-md border border-rose-300 bg-rose-50 px-1 text-[9px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy?.delete ? "..." : "Eliminar"}
        </button>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onToggleActivation?.(preset)}
          disabled={busy?.activation === true}
          className={`h-6 rounded-md px-1 text-[9px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            preset?.activo
              ? "border border-amber-600 bg-amber-600 hover:bg-amber-700"
              : "border border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {busy?.activation ? "..." : preset?.activo ? "Desactivar" : "Activar"}
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility?.(preset)}
          disabled={busy?.visibility === true}
          className={`h-6 rounded-md px-1 text-[9px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            preset?.mostrarEnEditor
              ? "border border-slate-700 bg-slate-700 hover:bg-slate-800"
              : "border border-cyan-600 bg-cyan-600 hover:bg-cyan-700"
          }`}
        >
          {busy?.visibility ? "..." : preset?.mostrarEnEditor ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </article>
  );
}
