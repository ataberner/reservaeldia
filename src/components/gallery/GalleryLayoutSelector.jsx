import React from "react";
import { DEFAULT_GALLERY_LAYOUT_SELECTOR_IDS } from "@/domain/gallery/galleryLayoutPresets";

export const PRIMARY_GALLERY_LAYOUT_IDS = DEFAULT_GALLERY_LAYOUT_SELECTOR_IDS;

const DISPLAY_OVERRIDES = Object.freeze({
  squares: {
    label: "Collage",
    previewKind: "collage",
  },
  one_by_n: {
    label: "1x4",
    previewKind: "row-1",
  },
  two_by_n: {
    label: "2x2",
    previewKind: "row-2",
  },
  three_by_n: {
    label: "2x3",
    previewKind: "row-3",
  },
});

export function getGalleryLayoutDisplay(option = {}) {
  const id = String(option?.id || "").trim();
  const override = DISPLAY_OVERRIDES[id] || {};
  return {
    ...option,
    id,
    label: override.label || option?.label || id,
    previewKind: override.previewKind || option?.previewKind || "grid",
  };
}

function PreviewBlock({ className = "" }) {
  return <span className={`block rounded-[3px] bg-current ${className}`} />;
}

function LayoutPreview({ kind }) {
  if (kind === "row-1") {
    return (
      <span className="grid h-8 w-full grid-cols-4 gap-1 text-current">
        {[0, 1, 2, 3].map((index) => (
          <PreviewBlock key={index} className="h-full opacity-75" />
        ))}
      </span>
    );
  }

  if (kind === "row-2") {
    return (
      <span className="grid h-8 w-full content-center justify-center grid-cols-[repeat(2,14px)] gap-1 text-current">
        {[0, 1, 2, 3].map((index) => (
          <PreviewBlock key={index} className="h-3.5 w-3.5 opacity-75" />
        ))}
      </span>
    );
  }

  if (kind === "row-3") {
    return (
      <span className="grid h-8 w-full content-center justify-center grid-cols-[repeat(3,9px)] gap-0.5 text-current">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <PreviewBlock key={index} className="h-[9px] w-[9px] opacity-75" />
        ))}
      </span>
    );
  }

  if (kind === "collage") {
    return (
      <span className="relative mx-auto block h-8 w-12 text-current">
        <PreviewBlock className="absolute left-1 top-0.5 h-6 w-6 opacity-55" />
        <PreviewBlock className="absolute left-5 top-1.5 h-7 w-7 opacity-85 ring-2 ring-white" />
      </span>
    );
  }

  if (kind === "wide") {
    return (
      <span className="flex h-8 w-full items-center text-current">
        <PreviewBlock className="h-5 w-full opacity-75" />
      </span>
    );
  }

  if (kind === "split") {
    return (
      <span className="grid h-8 w-full grid-cols-2 gap-1 text-current">
        <PreviewBlock className="h-full opacity-75" />
        <PreviewBlock className="h-full opacity-75" />
      </span>
    );
  }

  if (kind === "single") {
    return (
      <span className="flex h-8 w-full items-center justify-center text-current">
        <PreviewBlock className="h-7 w-8 opacity-75" />
      </span>
    );
  }

  return (
    <span className="grid h-8 w-full grid-cols-2 gap-1 text-current">
      {[0, 1, 2, 3].map((index) => (
        <PreviewBlock key={index} className="h-full opacity-75" />
      ))}
    </span>
  );
}

export default function GalleryLayoutSelector({
  options = [],
  activeLayoutId = "",
  onSelect,
  disabled = false,
  compact = false,
  title = "Layout",
  emptyMessage = "No hay layouts disponibles.",
}) {
  const normalizedOptions = (Array.isArray(options) ? options : [])
    .map(getGalleryLayoutDisplay)
    .filter((option) => option.id);

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      {normalizedOptions.length > 0 ? (
        <div className={`mt-2 grid ${compact ? "grid-cols-2 gap-1.5" : "grid-cols-2 gap-2"}`}>
          {normalizedOptions.map((option) => {
            const isActive = option.id === activeLayoutId;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                disabled={disabled}
                onClick={() => onSelect?.(option.id)}
                className={`flex min-h-[72px] flex-col items-stretch justify-between rounded-md border px-2 py-2 text-left transition ${
                  isActive
                    ? "border-purple-400 bg-white text-purple-700 ring-2 ring-purple-100"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                title={option.label}
              >
                <LayoutPreview kind={option.previewKind} />
                <span className="mt-1 truncate text-center text-[11px] font-semibold">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">{emptyMessage}</p>
      )}
    </div>
  );
}
