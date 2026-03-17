import {
  ArrowDown,
  ArrowUp,
  Check,
  Image as ImageIcon,
  Move,
  Trash2,
  X,
} from "lucide-react";

function IconActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  tone = "default",
}) {
  const toneClassName =
    tone === "danger"
      ? "border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50"
      : "border-slate-200 text-slate-500 hover:border-[#d9c8f5] hover:bg-[#f8f4ff] hover:text-[#6b41a7]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 text-slate-300 opacity-55"
          : toneClassName
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function AdjustButton({ active = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-55"
          : active
            ? "border-[#ccb6ef] bg-[#f4eeff] text-[#6b41a7]"
            : "border-[#ddd1f4] bg-white text-[#5f3596] hover:border-[#ccb6ef] hover:bg-[#f8f4ff]"
      }`}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : <Move className="h-3.5 w-3.5" />}
      {active ? "Ajustando" : "Ajustar"}
    </button>
  );
}

function DecorationRow({
  decoration,
  index,
  total,
  isActive,
  disabled,
  onAdjust,
  onMoveUp,
  onMoveDown,
  onRemove,
  onConvertToImage,
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {decoration?.src ? (
          <img
            src={decoration.src}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-800">
            {decoration?.nombre || `Decoracion ${index + 1}`}
          </p>
          {total > 1 ? (
            <span className="shrink-0 text-[10px] font-medium text-slate-400">
              {index + 1}/{total}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <AdjustButton
            active={isActive}
            disabled={disabled}
            onClick={() => onAdjust(decoration.id)}
          />

          <div className="flex shrink-0 items-center gap-1">
            <IconActionButton
              label="Mover arriba"
              icon={ArrowUp}
              onClick={() => onMoveUp(decoration.id)}
              disabled={disabled || index === 0}
            />
            <IconActionButton
              label="Mover abajo"
              icon={ArrowDown}
              onClick={() => onMoveDown(decoration.id)}
              disabled={disabled || index === total - 1}
            />
            <IconActionButton
              label="Volver a imagen"
              icon={ImageIcon}
              onClick={() => onConvertToImage(decoration.id)}
              disabled={disabled}
            />
            <IconActionButton
              label="Quitar"
              icon={Trash2}
              onClick={() => onRemove(decoration.id)}
              disabled={disabled}
              tone="danger"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SectionBackgroundDecorationsPanel({
  decorations = [],
  activeDecorationId = null,
  disabled = false,
  isMobile = false,
  onClose,
  onAdjust,
  onMoveUp,
  onMoveDown,
  onRemove,
  onConvertToImage,
}) {
  const safeDecorations = Array.isArray(decorations) ? decorations : [];

  if (!safeDecorations.length) return null;

  return (
    <div
      className={`max-w-full overflow-x-hidden rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_18px_36px_rgba(15,23,42,0.10)] ${
        isMobile ? "w-full" : "w-[360px]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Decoraciones del fondo</h3>
          <p className="text-[11px] text-slate-500">
            {safeDecorations.length} {safeDecorations.length === 1 ? "imagen" : "imagenes"}
          </p>
        </div>

        {typeof onClose === "function" ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#d9c8f5] hover:bg-[#f8f4ff] hover:text-[#6b41a7]"
            aria-label="Cerrar panel de decoraciones"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex max-h-[320px] flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1">
        {safeDecorations.map((decoration, index) => (
          <DecorationRow
            key={decoration.id}
            decoration={decoration}
            index={index}
            total={safeDecorations.length}
            isActive={activeDecorationId === decoration.id}
            disabled={disabled}
            onAdjust={onAdjust}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            onConvertToImage={onConvertToImage}
          />
        ))}
      </div>
    </div>
  );
}
