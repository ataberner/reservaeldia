import { useEffect } from "react";
import TextPresetCard from "./TextPresetCard";

function collectPresetFonts(presets = []) {
  const set = new Set();

  (Array.isArray(presets) ? presets : []).forEach((preset) => {
    const sourceItems = Array.isArray(preset?.items) ? preset.items : [];
    sourceItems.forEach((item) => {
      const rawFamily = item?.fontFamily ?? item?.font ?? "";
      const family = String(rawFamily || "").trim();
      if (family) set.add(family);
    });
  });

  return [...set];
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`skeleton-preset-${index}`}
          className="h-[250px] animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}

export default function TextPresetGrid({
  loading,
  error,
  items,
  busyById,
  onEdit,
  onDuplicate,
  onToggleActivation,
  onToggleVisibility,
  onDelete,
  onReload,
}) {
  useEffect(() => {
    const fontsToLoad = collectPresetFonts(items);
    if (!fontsToLoad.length) return;
    let active = true;
    void import("@/utils/fontManager")
      .then(({ fontManager }) => {
        if (!active) return;
        return fontManager.loadFonts(fontsToLoad);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [items]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
        <GridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <h3 className="text-base font-semibold text-slate-800">No hay presets de texto</h3>
        <p className="mt-1 text-sm text-slate-600">
          Crea el primer preset o sincroniza el catalogo legacy.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((preset) => (
        <TextPresetCard
          key={preset.id}
          preset={preset}
          busyState={busyById?.[preset.id] || {}}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onToggleActivation={onToggleActivation}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
