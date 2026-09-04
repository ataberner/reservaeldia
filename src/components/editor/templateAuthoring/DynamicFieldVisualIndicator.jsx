import { useRef } from "react";
import { Loader2 } from "lucide-react";
import { resolveNextDynamicFieldVisualRootId } from "@/domain/templates/dynamicFieldTargets";

function normalizeStatus(status) {
  const source = status && typeof status === "object" ? status : {};
  const state = ["visible", "hidden", "absent"].includes(source.state)
    ? source.state
    : "absent";
  return {
    state,
    linkedCount: Math.max(0, Number(source.linkedCount) || 0),
    canRestore: source.canRestore !== false,
    rootObjectIds: Array.isArray(source.rootObjectIds)
      ? source.rootObjectIds
      : source.firstRootObjectId
        ? [source.firstRootObjectId]
        : [],
  };
}

export default function DynamicFieldVisualIndicator({
  status,
  loading = false,
  error = "",
  onActivate,
  className = "",
}) {
  const normalized = normalizeStatus(status);
  const previousRootObjectIdRef = useRef("");
  const isAbsent = normalized.state === "absent";
  const label = loading
    ? "Actualizando representacion visual"
    : error
      ? `No se pudo actualizar la representacion visual: ${error}`
      : normalized.state === "visible"
        ? normalized.linkedCount > 1
          ? `Visible en la invitacion en ${normalized.linkedCount} elementos. Presiona para recorrerlos`
          : "Visible en la invitacion"
        : normalized.state === "hidden"
          ? "Vinculado, pero no visible en la invitacion"
          : normalized.canRestore
            ? "No esta visible. Volver a insertar"
            : "No esta visible";
  const statusText = normalized.state === "visible"
    ? "Visible"
    : normalized.state === "hidden"
      ? "Oculto"
      : normalized.canRestore
        ? "Insertar"
        : "No disponible";
  const stateClass = error
    ? "text-rose-700 hover:bg-rose-50"
    : isAbsent && normalized.canRestore
      ? "text-[#692B9A] underline decoration-[#b89ad4] underline-offset-2 hover:bg-[#f7f1fb]"
      : normalized.state === "hidden"
        ? "text-amber-800 hover:bg-amber-50"
        : "text-[#692B9A] hover:bg-[#f7f1fb]";
  const handleActivate = () => {
    if (isAbsent) {
      previousRootObjectIdRef.current = "";
      onActivate?.({ rootObjectId: null });
      return;
    }

    const rootObjectId = resolveNextDynamicFieldVisualRootId({
      rootObjectIds: normalized.rootObjectIds,
      previousRootObjectId: previousRootObjectIdRef.current,
    });
    if (rootObjectId) previousRootObjectIdRef.current = rootObjectId;
    onActivate?.({ rootObjectId });
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={loading || (isAbsent && !normalized.canRestore)}
      onClick={handleActivate}
      data-preserve-canvas-selection="true"
      className={`relative inline-flex h-10 min-w-[64px] shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-[11px] font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d8c8f1] disabled:cursor-not-allowed disabled:opacity-45 ${stateClass} ${className}`}
    >
      {loading ? (
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <span aria-hidden="true">{statusText}</span>
      )}
      {!loading && normalized.linkedCount > 1 ? (
        <span
          aria-hidden="true"
          className="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#692B9A] px-1 text-[9px] font-semibold leading-4 text-white"
        >
          {normalized.linkedCount > 9 ? "9+" : normalized.linkedCount}
        </span>
      ) : null}
    </button>
  );
}
