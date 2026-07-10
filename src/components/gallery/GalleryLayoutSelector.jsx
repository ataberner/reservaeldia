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

function getPhotoCountPreviewGrid(count) {
  const safeCount = Math.max(1, Math.min(16, Math.round(Number(count) || 1)));
  if (safeCount <= 1) return { rows: 1, cols: 1, count: safeCount };
  if (safeCount <= 2) return { rows: 1, cols: 2, count: safeCount };
  if (safeCount <= 3) return { rows: 1, cols: 3, count: safeCount };
  if (safeCount <= 4) return { rows: 2, cols: 2, count: safeCount };
  if (safeCount <= 6) return { rows: 2, cols: 3, count: safeCount };
  if (safeCount <= 8) return { rows: 2, cols: 4, count: safeCount };
  if (safeCount <= 9) return { rows: 3, cols: 3, count: safeCount };
  if (safeCount <= 12) return { rows: 3, cols: 4, count: safeCount };
  return { rows: 4, cols: 4, count: safeCount };
}

function LayoutPreview({ kind, photoCount }) {
  if (kind === "photo-count-grid") {
    const grid = getPhotoCountPreviewGrid(photoCount);
    const cellSize = grid.cols >= 4 ? "6px" : grid.cols === 3 ? "8px" : "10px";
    return (
      <span
        className="mx-auto grid h-8 content-center justify-center gap-0.5 text-current"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, ${cellSize})`,
          gridTemplateRows: `repeat(${grid.rows}, ${cellSize})`,
        }}
      >
        {Array.from({ length: grid.count }, (_, index) => (
          <PreviewBlock key={index} className="h-full w-full opacity-75" />
        ))}
      </span>
    );
  }

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
  variant = "grid",
  title = "Layout",
  emptyMessage = "No hay layouts disponibles.",
}) {
  const normalizedOptions = (Array.isArray(options) ? options : [])
    .map(getGalleryLayoutDisplay)
    .filter((option) => option.id);

  if (variant === "list") {
    return (
      <div>
        {title && (
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </div>
        )}
        {normalizedOptions.length > 0 ? (
          <div className="flex flex-col gap-1">
            {normalizedOptions.map((option) => {
              const isActive = option.id === activeLayoutId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isActive}
                  disabled={disabled}
                  onClick={() => onSelect?.(option.id)}
                  className={`flex min-h-[38px] items-center gap-2 rounded-md border px-2 py-1 text-left transition ${
                    isActive
                      ? "border-purple-300 bg-purple-50 text-purple-800"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-purple-200 hover:bg-purple-50"
                  } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  title={option.label}
                >
                  <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-50 text-current">
                    <span className="block w-full scale-75">
                      <LayoutPreview kind={option.previewKind} photoCount={option.photoCount} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                    {option.label}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                      Actual
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-1 py-1 text-xs text-zinc-500">{emptyMessage}</p>
        )}
      </div>
    );
  }

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
                <LayoutPreview kind={option.previewKind} photoCount={option.photoCount} />
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
