"use strict";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMetric(value) {
  return Math.round(toFiniteNumber(value, 0) * 1000) / 1000;
}

function normalizeGalleryLayoutMode(value) {
  return normalizeText(value).toLowerCase() === "dynamic_media"
    ? "dynamic_media"
    : "fixed";
}

function normalizeGalleryLayoutType(value) {
  const token = normalizeText(value).toLowerCase();
  if (token === "editorial") return "editorial";
  if (token === "canvas_preserve") return "canvas_preserve";
  return "canvas_preserve";
}

const {
  resolveGalleryCellMediaUrl,
} = require("../renderAssetContract.cjs");

function normalizeMediaUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function collectGalleryMediaUrls(cells) {
  if (!Array.isArray(cells)) return [];
  return cells
    .map((cell) => {
      if (!cell || typeof cell !== "object") return "";
      return normalizeText(resolveGalleryCellMediaUrl(cell));
    })
    .filter(Boolean);
}

function resolveFixedCellRatio(ratio) {
  const safeRatio = normalizeText(ratio);
  if (safeRatio === "4:3") return 3 / 4;
  if (safeRatio === "16:9") return 9 / 16;
  return 1;
}

function pushRect(rects, x, y, width, height) {
  rects.push({
    x: roundMetric(x),
    y: roundMetric(y),
    width: roundMetric(width),
    height: roundMetric(height),
  });
}

function buildBounds(rects) {
  const safeRects = Array.isArray(rects) ? rects : [];
  if (!safeRects.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  safeRects.forEach((rect) => {
    const x = roundMetric(rect?.x);
    const y = roundMetric(rect?.y);
    const width = Math.max(0, roundMetric(rect?.width));
    const height = Math.max(0, roundMetric(rect?.height));

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  return {
    minX: roundMetric(minX),
    minY: roundMetric(minY),
    maxX: roundMetric(maxX),
    maxY: roundMetric(maxY),
    width: roundMetric(Math.max(0, maxX - minX)),
    height: roundMetric(Math.max(0, maxY - minY)),
  };
}

function normalizeRectCollection(rects) {
  const safeRects = Array.isArray(rects) ? rects : [];
  const bounds = buildBounds(safeRects);
  return {
    rects: safeRects.map((rect) => ({
      x: roundMetric((Number(rect?.x) || 0) - bounds.minX),
      y: roundMetric((Number(rect?.y) || 0) - bounds.minY),
      width: roundMetric(rect?.width),
      height: roundMetric(rect?.height),
    })),
    totalWidth: bounds.width,
    totalHeight: bounds.height,
    bounds,
  };
}

function sortSlotsInVisualOrder(slots) {
  const safeSlots = Array.isArray(slots) ? slots : [];
  return [...safeSlots].sort((left, right) => {
    const deltaY = roundMetric((left?.y || 0) - (right?.y || 0));
    if (Math.abs(deltaY) > 0.5) return deltaY;
    return roundMetric((left?.x || 0) - (right?.x || 0));
  });
}

function buildRowGroupsForSlots(slots) {
  const orderedSlots = sortSlotsInVisualOrder(slots);
  const rows = [];
  const tolerance = 0.5;

  orderedSlots.forEach((slot, slotIndex) => {
    const slotTop = roundMetric(slot?.y);
    const slotBottom = roundMetric((slot?.y || 0) + (slot?.height || 0));
    const slotLeft = roundMetric(slot?.x);
    const slotRight = roundMetric((slot?.x || 0) + (slot?.width || 0));
    const currentRow = rows[rows.length - 1];

    if (!currentRow || Math.abs(slotTop - currentRow.top) > tolerance) {
      rows.push({
        slotIndexes: [slotIndex],
        top: slotTop,
        bottom: slotBottom,
        left: slotLeft,
        right: slotRight,
      });
      return;
    }

    currentRow.slotIndexes.push(slotIndex);
    currentRow.top = Math.min(currentRow.top, slotTop);
    currentRow.bottom = Math.max(currentRow.bottom, slotBottom);
    currentRow.left = Math.min(currentRow.left, slotLeft);
    currentRow.right = Math.max(currentRow.right, slotRight);
  });

  return rows.map((row, rowIndex) => ({
    rowIndex,
    slotIndexes: row.slotIndexes.sort(
      (leftIndex, rightIndex) => orderedSlots[leftIndex].x - orderedSlots[rightIndex].x
    ),
    top: roundMetric(row.top),
    height: roundMetric(Math.max(0, row.bottom - row.top)),
    left: roundMetric(row.left),
    width: roundMetric(Math.max(0, row.right - row.left)),
  }));
}

function normalizeBlueprintSlots(slots) {
  return sortSlotsInVisualOrder(
    (Array.isArray(slots) ? slots : [])
      .map((slot) => {
        const safeSlot = asObject(slot);
        const width = Math.max(0, toFiniteNumber(safeSlot.width, 0));
        const height = Math.max(0, toFiniteNumber(safeSlot.height, 0));
        if (width <= 0 || height <= 0) return null;
        return {
          x: roundMetric(safeSlot.x),
          y: roundMetric(safeSlot.y),
          width: roundMetric(width),
          height: roundMetric(height),
        };
      })
      .filter(Boolean)
  );
}

function createGalleryLayoutBlueprint({
  kind = "grid",
  baseWidth,
  baseHeight,
  slots,
  anchor = "center",
  grid = undefined,
}) {
  const safeSlots = normalizeBlueprintSlots(slots);
  const bounds = buildBounds(safeSlots);
  const safeKind = normalizeText(kind).toLowerCase() === "custom" ? "custom" : "grid";
  const safeAnchor = normalizeText(anchor).toLowerCase() === "center" ? "center" : "center";
  const rowGroups = buildRowGroupsForSlots(safeSlots);
  const safeGrid = safeKind === "grid" ? asObject(grid) : undefined;

  return {
    kind: safeKind,
    anchor: safeAnchor,
    baseWidth: roundMetric(
      Math.max(0, toFiniteNumber(baseWidth, bounds.width))
    ),
    baseHeight: roundMetric(
      Math.max(0, toFiniteNumber(baseHeight, bounds.height))
    ),
    slots: safeSlots,
    rowGroups,
    ...(safeKind === "grid"
      ? {
          grid: {
            rows: Math.max(1, Math.round(toFiniteNumber(safeGrid.rows, rowGroups.length || 1))),
            cols: Math.max(
              1,
              Math.round(
                toFiniteNumber(
                  safeGrid.cols,
                  rowGroups.reduce(
                    (acc, row) => Math.max(acc, row.slotIndexes.length),
                    1
                  )
                )
              )
            ),
            cellWidth: roundMetric(
              Math.max(1, toFiniteNumber(safeGrid.cellWidth, safeSlots[0]?.width || 1))
            ),
            cellHeight: roundMetric(
              Math.max(1, toFiniteNumber(safeGrid.cellHeight, safeSlots[0]?.height || 1))
            ),
            gapX: roundMetric(Math.max(0, toFiniteNumber(safeGrid.gapX, 0))),
            gapY: roundMetric(Math.max(0, toFiniteNumber(safeGrid.gapY, 0))),
          },
        }
      : {}),
  };
}

function buildFixedGridLayout({
  width,
  rows,
  cols,
  gap,
  ratio,
}) {
  const safeWidth = Math.max(1, toFiniteNumber(width, 1));
  const safeRows = Math.max(1, Math.round(toFiniteNumber(rows, 1)));
  const safeCols = Math.max(1, Math.round(toFiniteNumber(cols, 1)));
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));
  const cellRatio = resolveFixedCellRatio(ratio);

  const totalGapX = safeGap * Math.max(0, safeCols - 1);
  const totalGapY = safeGap * Math.max(0, safeRows - 1);
  const cellWidth = Math.max(1, (safeWidth - totalGapX) / safeCols);
  const cellHeight = Math.max(1, cellWidth * cellRatio);
  const rects = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      rects.push({
        x: roundMetric(col * (cellWidth + safeGap)),
        y: roundMetric(row * (cellHeight + safeGap)),
        width: roundMetric(cellWidth),
        height: roundMetric(cellHeight),
      });
    }
  }

  return {
    mode: "fixed",
    layoutType: "grid",
    rects,
    totalWidth: roundMetric(safeWidth),
    totalHeight: roundMetric(safeRows * cellHeight + totalGapY),
    mediaCount: rects.length,
  };
}

function buildGalleryLayoutBlueprint({
  width,
  rows,
  cols,
  gap,
  ratio,
  kind,
  slots,
  baseHeight,
  anchor,
}) {
  const safeSlots = normalizeBlueprintSlots(slots);
  const safeKind = normalizeText(kind).toLowerCase() === "custom" ? "custom" : "grid";

  if (safeSlots.length > 0) {
    return createGalleryLayoutBlueprint({
      kind: safeKind,
      baseWidth: width,
      baseHeight,
      slots: safeSlots,
      anchor,
      ...(safeKind === "grid"
        ? {
            grid: {
              rows,
              cols,
            },
          }
        : {}),
    });
  }

  const fixedLayout = buildFixedGridLayout({
    width,
    rows,
    cols,
    gap,
    ratio,
  });
  const safeRows = Math.max(1, Math.round(toFiniteNumber(rows, 1)));
  const safeCols = Math.max(1, Math.round(toFiniteNumber(cols, 1)));
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));

  return createGalleryLayoutBlueprint({
    kind: "grid",
    baseWidth: fixedLayout.totalWidth,
    baseHeight: fixedLayout.totalHeight,
    slots: fixedLayout.rects,
    anchor: anchor || "center",
    grid: {
      rows: safeRows,
      cols: safeCols,
      cellWidth: fixedLayout.rects[0]?.width || 1,
      cellHeight: fixedLayout.rects[0]?.height || 1,
      gapX: safeGap,
      gapY: safeGap,
    },
  });
}

function normalizeGalleryLayoutBlueprint(rawBlueprint) {
  if (!rawBlueprint || typeof rawBlueprint !== "object" || Array.isArray(rawBlueprint)) {
    return undefined;
  }

  const source = asObject(rawBlueprint);
  const slots = normalizeBlueprintSlots(source.slots);
  if (!slots.length) return undefined;

  const safeKind = normalizeText(source.kind).toLowerCase() === "custom" ? "custom" : "grid";
  const safeGrid = asObject(source.grid);

  return createGalleryLayoutBlueprint({
    kind: safeKind,
    baseWidth: source.baseWidth,
    baseHeight: source.baseHeight,
    slots,
    anchor: source.anchor,
    ...(safeKind === "grid"
      ? {
          grid: {
            rows: safeGrid.rows,
            cols: safeGrid.cols,
            cellWidth: safeGrid.cellWidth,
            cellHeight: safeGrid.cellHeight,
            gapX: safeGrid.gapX,
            gapY: safeGrid.gapY,
          },
        }
      : {}),
  });
}

function scaleGalleryLayoutBlueprint(blueprint, scale) {
  const safeBlueprint = normalizeGalleryLayoutBlueprint(blueprint);
  const safeScale = toFiniteNumber(scale, 1);
  if (!safeBlueprint || !Number.isFinite(safeScale) || safeScale <= 0) {
    return safeBlueprint;
  }

  const scaledSlots = safeBlueprint.slots.map((slot) => ({
    x: roundMetric(slot.x * safeScale),
    y: roundMetric(slot.y * safeScale),
    width: roundMetric(slot.width * safeScale),
    height: roundMetric(slot.height * safeScale),
  }));

  return createGalleryLayoutBlueprint({
    kind: safeBlueprint.kind,
    anchor: safeBlueprint.anchor,
    baseWidth: roundMetric(safeBlueprint.baseWidth * safeScale),
    baseHeight: roundMetric(safeBlueprint.baseHeight * safeScale),
    slots: scaledSlots,
    ...(safeBlueprint.kind === "grid"
      ? {
          grid: {
            rows: safeBlueprint.grid?.rows,
            cols: safeBlueprint.grid?.cols,
            cellWidth: roundMetric((safeBlueprint.grid?.cellWidth || 1) * safeScale),
            cellHeight: roundMetric((safeBlueprint.grid?.cellHeight || 1) * safeScale),
            gapX: roundMetric((safeBlueprint.grid?.gapX || 0) * safeScale),
            gapY: roundMetric((safeBlueprint.grid?.gapY || 0) * safeScale),
          },
        }
      : {}),
  });
}

function resolveEditorialDesktopLayout(width, count, gap) {
  const rects = [];
  const safeWidth = Math.max(1, toFiniteNumber(width, 1));
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));

  if (count <= 0) {
    return {
      rects,
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  if (count === 1) {
    pushRect(rects, 0, 0, safeWidth, safeWidth * 0.72);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: rects[0].height,
    };
  }

  if (count === 2) {
    const cellWidth = (safeWidth - safeGap) / 2;
    const cellHeight = cellWidth * 1.08;
    pushRect(rects, 0, 0, cellWidth, cellHeight);
    pushRect(rects, cellWidth + safeGap, 0, cellWidth, cellHeight);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: cellHeight,
    };
  }

  if (count === 3) {
    const leftWidth = (safeWidth - safeGap) * 0.58;
    const rightWidth = safeWidth - safeGap - leftWidth;
    const smallHeight = rightWidth * 0.82;
    const heroHeight = smallHeight * 2 + safeGap;
    pushRect(rects, 0, 0, leftWidth, heroHeight);
    pushRect(rects, leftWidth + safeGap, 0, rightWidth, smallHeight);
    pushRect(rects, leftWidth + safeGap, smallHeight + safeGap, rightWidth, smallHeight);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: heroHeight,
    };
  }

  if (count === 4) {
    const cellWidth = (safeWidth - safeGap) / 2;
    const cellHeight = cellWidth * 0.96;
    for (let index = 0; index < 4; index += 1) {
      const row = Math.floor(index / 2);
      const col = index % 2;
      pushRect(
        rects,
        col * (cellWidth + safeGap),
        row * (cellHeight + safeGap),
        cellWidth,
        cellHeight
      );
    }
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: cellHeight * 2 + safeGap,
    };
  }

  const leftWidth = (safeWidth - safeGap) * 0.58;
  const rightWidth = safeWidth - safeGap - leftWidth;
  const smallWidth = (rightWidth - safeGap) / 2;
  const smallHeight = smallWidth * 0.96;
  const heroHeight = smallHeight * 2 + safeGap;

  pushRect(rects, 0, 0, leftWidth, heroHeight);
  pushRect(rects, leftWidth + safeGap, 0, smallWidth, smallHeight);
  pushRect(rects, leftWidth + safeGap + smallWidth + safeGap, 0, smallWidth, smallHeight);
  pushRect(rects, leftWidth + safeGap, smallHeight + safeGap, smallWidth, smallHeight);
  pushRect(
    rects,
    leftWidth + safeGap + smallWidth + safeGap,
    smallHeight + safeGap,
    smallWidth,
    smallHeight
  );

  let cursorY = heroHeight + safeGap;
  let remaining = count - 5;
  const pairWidth = (safeWidth - safeGap) / 2;
  const pairHeight = pairWidth * 0.72;
  const fullHeight = safeWidth * 0.56;

  while (remaining > 0) {
    if (remaining === 1) {
      pushRect(rects, 0, cursorY, safeWidth, fullHeight);
      cursorY += fullHeight + safeGap;
      remaining -= 1;
      continue;
    }

    pushRect(rects, 0, cursorY, pairWidth, pairHeight);
    pushRect(rects, pairWidth + safeGap, cursorY, pairWidth, pairHeight);
    cursorY += pairHeight + safeGap;
    remaining -= 2;
  }

  return {
    rects,
    totalWidth: safeWidth,
    totalHeight: Math.max(0, cursorY - safeGap),
  };
}

function resolveEditorialMobileLayout(width, count, gap) {
  const rects = [];
  const safeWidth = Math.max(1, toFiniteNumber(width, 1));
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));

  if (count <= 0) {
    return {
      rects,
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  if (count === 1) {
    pushRect(rects, 0, 0, safeWidth, safeWidth * 0.9);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: rects[0].height,
    };
  }

  if (count === 2) {
    const cellHeight = safeWidth * 0.62;
    pushRect(rects, 0, 0, safeWidth, cellHeight);
    pushRect(rects, 0, cellHeight + safeGap, safeWidth, cellHeight);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: cellHeight * 2 + safeGap,
    };
  }

  if (count === 3) {
    const heroHeight = safeWidth * 0.72;
    const cellWidth = (safeWidth - safeGap) / 2;
    const cellHeight = cellWidth * 0.96;
    pushRect(rects, 0, 0, safeWidth, heroHeight);
    pushRect(rects, 0, heroHeight + safeGap, cellWidth, cellHeight);
    pushRect(rects, cellWidth + safeGap, heroHeight + safeGap, cellWidth, cellHeight);
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: heroHeight + safeGap + cellHeight,
    };
  }

  if (count === 4) {
    const cellWidth = (safeWidth - safeGap) / 2;
    const cellHeight = cellWidth * 0.96;
    for (let index = 0; index < 4; index += 1) {
      const row = Math.floor(index / 2);
      const col = index % 2;
      pushRect(
        rects,
        col * (cellWidth + safeGap),
        row * (cellHeight + safeGap),
        cellWidth,
        cellHeight
      );
    }
    return {
      rects,
      totalWidth: safeWidth,
      totalHeight: cellHeight * 2 + safeGap,
    };
  }

  const heroHeight = safeWidth * 0.72;
  const cellWidth = (safeWidth - safeGap) / 2;
  const cellHeight = cellWidth * 0.96;

  pushRect(rects, 0, 0, safeWidth, heroHeight);
  pushRect(rects, 0, heroHeight + safeGap, cellWidth, cellHeight);
  pushRect(rects, cellWidth + safeGap, heroHeight + safeGap, cellWidth, cellHeight);
  pushRect(rects, 0, heroHeight + safeGap + cellHeight + safeGap, cellWidth, cellHeight);
  pushRect(
    rects,
    cellWidth + safeGap,
    heroHeight + safeGap + cellHeight + safeGap,
    cellWidth,
    cellHeight
  );

  let cursorY = heroHeight + safeGap + cellHeight * 2 + safeGap;
  let remaining = count - 5;
  const fullHeight = safeWidth * 0.56;

  while (remaining > 0) {
    pushRect(rects, 0, cursorY, safeWidth, fullHeight);
    cursorY += fullHeight + safeGap;
    remaining -= 1;
  }

  return {
    rects,
    totalWidth: safeWidth,
    totalHeight: Math.max(0, cursorY - safeGap),
  };
}

function resolveGridPreserveLayout(blueprint, count) {
  const safeBlueprint = normalizeGalleryLayoutBlueprint(blueprint);
  if (!safeBlueprint) {
    return {
      rects: [],
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  const mediaCount = Math.max(0, Math.round(toFiniteNumber(count, 0)));
  if (mediaCount <= 0) {
    return {
      rects: [],
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  const grid = asObject(safeBlueprint.grid);
  const cols = Math.max(
    1,
    Math.round(
      toFiniteNumber(
        grid.cols,
        safeBlueprint.rowGroups.reduce(
          (acc, row) => Math.max(acc, row.slotIndexes.length),
          1
        )
      )
    )
  );
  const cellWidth = Math.max(1, toFiniteNumber(grid.cellWidth, safeBlueprint.slots[0]?.width || 1));
  const cellHeight = Math.max(
    1,
    toFiniteNumber(grid.cellHeight, safeBlueprint.slots[0]?.height || 1)
  );
  const gapX = Math.max(0, toFiniteNumber(grid.gapX, 0));
  const gapY = Math.max(0, toFiniteNumber(grid.gapY, gapX));
  const rects = [];

  for (let index = 0; index < mediaCount; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    pushRect(
      rects,
      col * (cellWidth + gapX),
      row * (cellHeight + gapY),
      cellWidth,
      cellHeight
    );
  }

  return normalizeRectCollection(rects);
}

function resolveCustomRepeatableRow(blueprint) {
  const safeBlueprint = normalizeGalleryLayoutBlueprint(blueprint);
  if (!safeBlueprint) return null;

  const rows = Array.isArray(safeBlueprint.rowGroups) ? safeBlueprint.rowGroups : [];
  if (!rows.length) return null;

  const maxSlotsPerRow = rows.reduce(
    (acc, row) => Math.max(acc, Array.isArray(row.slotIndexes) ? row.slotIndexes.length : 0),
    0
  );
  let repeatRowIndex = -1;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const slotCount = Array.isArray(rows[index].slotIndexes) ? rows[index].slotIndexes.length : 0;
    if (slotCount === maxSlotsPerRow && slotCount > 0) {
      repeatRowIndex = index;
      break;
    }
  }

  if (repeatRowIndex < 0) {
    repeatRowIndex = rows.length - 1;
  }

  const repeatRow = rows[repeatRowIndex];
  const previousRow = repeatRowIndex > 0 ? rows[repeatRowIndex - 1] : null;
  const nextRow = repeatRowIndex < rows.length - 1 ? rows[repeatRowIndex + 1] : null;

  let gapY = 0;
  if (nextRow) {
    gapY = nextRow.top - (repeatRow.top + repeatRow.height);
  } else if (previousRow) {
    gapY = repeatRow.top - (previousRow.top + previousRow.height);
  }

  return {
    row: repeatRow,
    gapY: roundMetric(Math.max(0, gapY)),
  };
}

function resolveCustomPreserveLayout(blueprint, count) {
  const safeBlueprint = normalizeGalleryLayoutBlueprint(blueprint);
  if (!safeBlueprint) {
    return {
      rects: [],
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  const mediaCount = Math.max(0, Math.round(toFiniteNumber(count, 0)));
  if (mediaCount <= 0) {
    return {
      rects: [],
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  const baseSlots = safeBlueprint.slots;
  if (mediaCount <= baseSlots.length) {
    return normalizeRectCollection(baseSlots.slice(0, mediaCount));
  }

  const repeatable = resolveCustomRepeatableRow(safeBlueprint);
  if (!repeatable) {
    return normalizeRectCollection(baseSlots.slice(0, mediaCount));
  }

  const repeatRowSlots = repeatable.row.slotIndexes
    .map((slotIndex) => baseSlots[slotIndex])
    .filter(Boolean);

  if (!repeatRowSlots.length) {
    return normalizeRectCollection(baseSlots.slice(0, mediaCount));
  }

  const repeatRowBounds = buildBounds(repeatRowSlots);
  const repeatRowHeight = repeatRowBounds.height;
  let cursorTop = buildBounds(baseSlots).maxY + repeatable.gapY;
  let remaining = mediaCount - baseSlots.length;
  const nextRects = [...baseSlots];

  while (remaining > 0) {
    const visibleCount = Math.min(remaining, repeatRowSlots.length);
    for (let slotIndex = 0; slotIndex < visibleCount; slotIndex += 1) {
      const slot = repeatRowSlots[slotIndex];
      nextRects.push({
        x: roundMetric(slot.x),
        y: roundMetric(cursorTop + (slot.y - repeatRowBounds.minY)),
        width: roundMetric(slot.width),
        height: roundMetric(slot.height),
      });
    }
    remaining -= visibleCount;
    cursorTop += repeatRowHeight + repeatable.gapY;
  }

  return normalizeRectCollection(nextRects);
}

function resolveCanvasPreserveLayout({
  width,
  rows,
  cols,
  gap,
  ratio,
  layoutBlueprint,
  mediaUrls,
}) {
  const safeUrls = normalizeMediaUrls(mediaUrls);
  const blueprint =
    normalizeGalleryLayoutBlueprint(layoutBlueprint) ||
    buildGalleryLayoutBlueprint({
      width,
      rows,
      cols,
      gap,
      ratio,
    });

  const resolved =
    blueprint?.kind === "custom"
      ? resolveCustomPreserveLayout(blueprint, safeUrls.length)
      : resolveGridPreserveLayout(blueprint, safeUrls.length);

  return {
    mode: "dynamic_media",
    layoutType: "canvas_preserve",
    layoutBlueprint: blueprint,
    rects: resolved.rects,
    totalWidth: roundMetric(resolved.totalWidth),
    totalHeight: roundMetric(resolved.totalHeight),
    mediaCount: safeUrls.length,
  };
}

function resolveDynamicGalleryLayout({
  width,
  rows,
  cols,
  gap,
  ratio,
  layoutType,
  layoutBlueprint,
  mediaUrls,
  isMobile,
}) {
  const safeLayoutType = normalizeGalleryLayoutType(layoutType);
  const safeUrls = normalizeMediaUrls(mediaUrls);
  const safeWidth = Math.max(1, toFiniteNumber(width, 1));
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));

  if (safeLayoutType === "editorial") {
    const resolved = isMobile
      ? resolveEditorialMobileLayout(safeWidth, safeUrls.length, safeGap)
      : resolveEditorialDesktopLayout(safeWidth, safeUrls.length, safeGap);

    return {
      mode: "dynamic_media",
      layoutType: safeLayoutType,
      layoutBlueprint: normalizeGalleryLayoutBlueprint(layoutBlueprint),
      rects: resolved.rects,
      totalWidth: roundMetric(resolved.totalWidth),
      totalHeight: roundMetric(resolved.totalHeight),
      mediaCount: safeUrls.length,
    };
  }

  return resolveCanvasPreserveLayout({
    width: safeWidth,
    rows,
    cols,
    gap,
    ratio,
    layoutBlueprint,
    mediaUrls: safeUrls,
  });
}

function isDynamicMediaGallery(value) {
  return normalizeGalleryLayoutMode(value && value.galleryLayoutMode) === "dynamic_media";
}

function resolveGalleryRenderLayout({
  width,
  rows,
  cols,
  gap,
  ratio,
  layoutMode,
  layoutType,
  layoutBlueprint,
  mediaUrls,
  isMobile,
}) {
  const safeMode = normalizeGalleryLayoutMode(layoutMode);
  if (safeMode === "dynamic_media") {
    return resolveDynamicGalleryLayout({
      width,
      rows,
      cols,
      gap,
      ratio,
      layoutType,
      layoutBlueprint,
      mediaUrls,
      isMobile,
    });
  }

  return buildFixedGridLayout({
    width,
    rows,
    cols,
    gap,
    ratio,
  });
}

module.exports = {
  buildFixedGridLayout,
  buildGalleryLayoutBlueprint,
  collectGalleryMediaUrls,
  isDynamicMediaGallery,
  normalizeGalleryLayoutBlueprint,
  normalizeGalleryLayoutMode,
  normalizeGalleryLayoutType,
  normalizeMediaUrls,
  resolveCanvasPreserveLayout,
  resolveDynamicGalleryLayout,
  resolveGalleryRenderLayout,
  roundMetric,
  scaleGalleryLayoutBlueprint,
};
