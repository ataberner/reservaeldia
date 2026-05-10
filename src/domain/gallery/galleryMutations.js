import { resolveGalleryCellMediaUrl } from "../../../shared/renderAssetContract.js";
import { resolveGalleryLayoutSelection } from "./galleryLayoutPresets.js";
import { buildDynamicGalleryObjectPatch } from "../templates/galleryDynamicMedia.js";

const DEFAULT_CELL_BG = "#f3f4f6";
const DEFAULT_CELL_FIT = "cover";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteIndex(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : -1;
}

function isGalleryObject(gallery) {
  return normalizeText(gallery?.tipo) === "galeria";
}

function isDynamicGallery(gallery) {
  return normalizeText(gallery?.galleryLayoutMode).toLowerCase() === "dynamic_media";
}

function cloneCell(cell) {
  return { ...asObject(cell) };
}

function getRawCells(gallery) {
  return Array.isArray(gallery?.cells) ? gallery.cells.map(cloneCell) : [];
}

function resolveFixedSlotCount(gallery) {
  const hasExplicitGrid =
    Number.isFinite(Number(gallery?.rows)) || Number.isFinite(Number(gallery?.cols));
  if (!hasExplicitGrid && Array.isArray(gallery?.cells) && gallery.cells.length > 0) {
    return gallery.cells.length;
  }

  const rows = Math.max(1, Number(gallery?.rows) || 1);
  const cols = Math.max(1, Number(gallery?.cols) || 1);
  return rows * cols;
}

function hasCellMedia(cell) {
  return Boolean(resolveGalleryCellMediaUrl(cell));
}

function cleanUndefinedFields(cell) {
  return Object.fromEntries(
    Object.entries(cell).filter(([, value]) => typeof value !== "undefined")
  );
}

function normalizeCellForRead(cell) {
  const safeCell = cloneCell(cell);
  const mediaUrl = resolveGalleryCellMediaUrl(safeCell);
  const next = {
    ...safeCell,
    fit: normalizeText(safeCell.fit) || DEFAULT_CELL_FIT,
    bg: normalizeText(safeCell.bg) || DEFAULT_CELL_BG,
  };

  if (mediaUrl) {
    next.mediaUrl = mediaUrl;
  }

  return next;
}

function clearCellMedia(cell) {
  const safeCell = cloneCell(cell);
  const next = {
    ...safeCell,
    mediaUrl: null,
    fit: normalizeText(safeCell.fit) || DEFAULT_CELL_FIT,
    bg: normalizeText(safeCell.bg) || DEFAULT_CELL_BG,
  };

  delete next.url;
  delete next.src;
  delete next.storagePath;
  delete next.assetId;
  delete next.alt;

  return cleanUndefinedFields(next);
}

export function resolveGalleryPhotoMediaUrl(photo) {
  if (typeof photo === "string") return normalizeText(photo);

  const safePhoto = asObject(photo);
  return (
    resolveGalleryCellMediaUrl(safePhoto) ||
    normalizeText(safePhoto.downloadURL) ||
    normalizeText(safePhoto.imageUrl)
  );
}

export function normalizeGalleryPhotoInput(photo, defaults = {}) {
  const mediaUrl = resolveGalleryPhotoMediaUrl(photo);
  if (!mediaUrl) return null;

  const safePhoto = asObject(photo);
  const safeDefaults = asObject(defaults);
  const next = {
    mediaUrl,
    fit: normalizeText(safePhoto.fit) || normalizeText(safeDefaults.fit) || DEFAULT_CELL_FIT,
    bg: normalizeText(safePhoto.bg) || normalizeText(safeDefaults.bg) || DEFAULT_CELL_BG,
  };

  const cellId = normalizeText(safePhoto.cellId);
  if (cellId) next.id = cellId;

  const storagePath = normalizeText(safePhoto.storagePath);
  if (storagePath) next.storagePath = storagePath;

  const assetId = normalizeText(safePhoto.assetId);
  if (assetId) next.assetId = assetId;

  const alt = normalizeText(safePhoto.alt) || normalizeText(safePhoto.nombre);
  if (alt) next.alt = alt;

  return next;
}

function buildPopulatedCell(previousCell, photo) {
  const safePrevious = cloneCell(previousCell);
  const normalizedPhoto = normalizeGalleryPhotoInput(photo, safePrevious);
  if (!normalizedPhoto) return null;

  const next = {
    ...safePrevious,
    mediaUrl: normalizedPhoto.mediaUrl,
    fit: normalizedPhoto.fit,
    bg: normalizedPhoto.bg,
  };

  delete next.url;
  delete next.src;
  delete next.storagePath;
  delete next.assetId;
  delete next.alt;

  if (normalizedPhoto.id || safePrevious.id) {
    next.id = normalizeText(safePrevious.id) || normalizedPhoto.id;
  }
  if (normalizedPhoto.storagePath) next.storagePath = normalizedPhoto.storagePath;
  if (normalizedPhoto.assetId) next.assetId = normalizedPhoto.assetId;
  if (normalizedPhoto.alt) next.alt = normalizedPhoto.alt;

  return cleanUndefinedFields(next);
}

function buildResult(originalGallery, nextGallery, meta = {}) {
  const changed = meta.changed !== undefined ? meta.changed === true : nextGallery !== originalGallery;
  return {
    action: meta.action || "",
    changed,
    reason: meta.reason || "",
    gallery: nextGallery || originalGallery,
    addedCount: Number(meta.addedCount || 0),
  };
}

function noop(originalGallery, action, reason) {
  return buildResult(originalGallery, originalGallery, {
    action,
    changed: false,
    reason,
  });
}

function normalizeFixedCellsForMutation(gallery) {
  const rawCells = getRawCells(gallery);
  const slotCount = resolveFixedSlotCount(gallery);
  const totalCells = Math.max(slotCount, rawCells.length);

  return Array.from({ length: totalCells }, (_, index) => {
    const cell = normalizeCellForRead(rawCells[index] || {});
    if (!hasCellMedia(cell)) return clearCellMedia(cell);
    return cell;
  });
}

function normalizeDynamicCellsForMutation(gallery) {
  return getRawCells(gallery)
    .map(normalizeCellForRead)
    .filter(hasCellMedia);
}

function rebuildDynamicGallery(gallery, nextVisibleCells) {
  const safeCells = Array.isArray(nextVisibleCells) ? nextVisibleCells : [];
  const patch = buildDynamicGalleryObjectPatch({
    galleryObject: {
      ...gallery,
      cells: safeCells,
    },
    mediaUrls: safeCells.map((cell) => resolveGalleryCellMediaUrl(cell)).filter(Boolean),
  });

  return {
    ...gallery,
    ...patch,
  };
}

function resolveTargetByCellId(cells, target) {
  const cellId = normalizeText(target?.cellId || target?.id);
  if (!cellId) return -1;
  return cells.findIndex((cell) => normalizeText(cell?.id) === cellId);
}

function getPopulatedFixedSourceIndexes(cells, slotCount) {
  const indexes = [];
  for (let index = 0; index < slotCount; index += 1) {
    if (hasCellMedia(cells[index])) indexes.push(index);
  }
  return indexes;
}

function resolveFixedSourceIndex(gallery, target) {
  const cells = normalizeFixedCellsForMutation(gallery);
  const slotCount = resolveFixedSlotCount(gallery);
  const byCellId = resolveTargetByCellId(cells, target);
  if (byCellId >= 0 && byCellId < slotCount) return byCellId;

  const explicitSourceIndex = toFiniteIndex(target?.sourceIndex ?? target?.slotIndex);
  if (explicitSourceIndex >= 0 && explicitSourceIndex < slotCount) return explicitSourceIndex;

  const directIndex = toFiniteIndex(target?.index);
  if (directIndex >= 0 && directIndex < slotCount) return directIndex;

  const displayIndex = toFiniteIndex(target?.displayIndex);
  if (displayIndex >= 0) {
    const populatedIndexes = getPopulatedFixedSourceIndexes(cells, slotCount);
    return populatedIndexes[displayIndex] ?? -1;
  }

  return -1;
}

function resolveDynamicDisplayIndex(gallery, target) {
  const cells = normalizeDynamicCellsForMutation(gallery);
  const byCellId = resolveTargetByCellId(cells, target);
  if (byCellId >= 0) return byCellId;

  const displayIndex = toFiniteIndex(target?.displayIndex);
  if (displayIndex >= 0 && displayIndex < cells.length) return displayIndex;

  const directIndex = toFiniteIndex(target?.index);
  if (directIndex >= 0 && directIndex < cells.length) return directIndex;

  const sourceIndex = toFiniteIndex(target?.sourceIndex ?? target?.slotIndex);
  if (sourceIndex >= 0) {
    const sourceCells = getRawCells(gallery).map(normalizeCellForRead);
    const populated = sourceCells
      .map((cell, index) => (hasCellMedia(cell) ? { cell, index } : null))
      .filter(Boolean);
    return populated.findIndex((entry) => entry.index === sourceIndex);
  }

  return -1;
}

function moveArrayItem(items, from, to) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function getGalleryPhotos(gallery) {
  if (!isGalleryObject(gallery)) return [];

  const dynamic = isDynamicGallery(gallery);
  const cells = dynamic ? getRawCells(gallery) : normalizeFixedCellsForMutation(gallery);
  const slotLimit = dynamic ? cells.length : resolveFixedSlotCount(gallery);
  const photos = [];

  for (let sourceIndex = 0; sourceIndex < slotLimit; sourceIndex += 1) {
    const cell = normalizeCellForRead(cells[sourceIndex] || {});
    const mediaUrl = resolveGalleryCellMediaUrl(cell);
    if (!mediaUrl) continue;

    photos.push({
      displayIndex: photos.length,
      sourceIndex,
      index: sourceIndex,
      cellId: normalizeText(cell.id),
      mediaUrl,
      storagePath: normalizeText(cell.storagePath),
      assetId: normalizeText(cell.assetId),
      fit: normalizeText(cell.fit) || DEFAULT_CELL_FIT,
      bg: normalizeText(cell.bg) || DEFAULT_CELL_BG,
      alt: normalizeText(cell.alt),
      cell,
    });
  }

  return photos;
}

export function resolveGalleryMediaKey(cell) {
  const safeCell = asObject(cell);
  return (
    normalizeText(safeCell.storagePath) ||
    normalizeText(safeCell.assetId) ||
    resolveGalleryPhotoMediaUrl(safeCell)
  );
}

export function normalizeGalleryState(gallery, options = {}) {
  if (!isGalleryObject(gallery)) {
    return noop(gallery, "normalize", "not-gallery");
  }

  if (isDynamicGallery(gallery)) {
    const cells = normalizeDynamicCellsForMutation(gallery);
    const nextGallery = rebuildDynamicGallery(gallery, cells);
    return buildResult(gallery, nextGallery, {
      action: "normalize",
      changed: true,
    });
  }

  const shouldEnsureFixedSlots = options.ensureFixedSlots === true;
  const cells = shouldEnsureFixedSlots
    ? normalizeFixedCellsForMutation(gallery)
    : getRawCells(gallery).map(normalizeCellForRead);

  return buildResult(
    gallery,
    {
      ...gallery,
      cells,
    },
    {
      action: "normalize",
      changed: true,
    }
  );
}

export function addGalleryPhotos(gallery, photos, options = {}) {
  if (!isGalleryObject(gallery)) return noop(gallery, "add", "not-gallery");

  const safePhotos = (Array.isArray(photos) ? photos : [photos])
    .map((photo) => normalizeGalleryPhotoInput(photo, options.defaults))
    .filter(Boolean);
  if (safePhotos.length === 0) return noop(gallery, "add", "missing-media");

  if (isDynamicGallery(gallery)) {
    const currentCells = normalizeDynamicCellsForMutation(gallery);
    const nextCells = [
      ...currentCells,
      ...safePhotos.map((photo) => buildPopulatedCell({}, photo)).filter(Boolean),
    ];
    return buildResult(gallery, rebuildDynamicGallery(gallery, nextCells), {
      action: "add",
      changed: true,
      addedCount: nextCells.length - currentCells.length,
    });
  }

  const slotCount = resolveFixedSlotCount(gallery);
  const nextCells = normalizeFixedCellsForMutation(gallery);
  let addedCount = 0;

  for (const photo of safePhotos) {
    const slotIndex = nextCells
      .slice(0, slotCount)
      .findIndex((cell) => !hasCellMedia(cell));

    if (slotIndex < 0) break;

    nextCells[slotIndex] = buildPopulatedCell(nextCells[slotIndex], photo);
    addedCount += 1;
  }

  if (addedCount === 0) {
    return noop(gallery, "add", "fixed-gallery-full");
  }

  return buildResult(
    gallery,
    {
      ...gallery,
      cells: nextCells,
    },
    {
      action: "add",
      changed: true,
      reason: addedCount < safePhotos.length ? "fixed-gallery-partial" : "",
      addedCount,
    }
  );
}

export function removeGalleryPhoto(gallery, target = {}) {
  if (!isGalleryObject(gallery)) return noop(gallery, "remove", "not-gallery");

  if (isDynamicGallery(gallery)) {
    const cells = normalizeDynamicCellsForMutation(gallery);
    const displayIndex = resolveDynamicDisplayIndex(gallery, target);
    if (displayIndex < 0 || displayIndex >= cells.length) {
      return noop(gallery, "remove", "target-not-found");
    }

    const nextCells = cells.filter((_, index) => index !== displayIndex);
    return buildResult(gallery, rebuildDynamicGallery(gallery, nextCells), {
      action: "remove",
      changed: true,
    });
  }

  const sourceIndex = resolveFixedSourceIndex(gallery, target);
  if (sourceIndex < 0) return noop(gallery, "remove", "target-not-found");

  const nextCells = normalizeFixedCellsForMutation(gallery);
  nextCells[sourceIndex] = clearCellMedia(nextCells[sourceIndex]);

  return buildResult(
    gallery,
    {
      ...gallery,
      cells: nextCells,
    },
    {
      action: "remove",
      changed: true,
    }
  );
}

export function replaceGalleryPhoto(gallery, target = {}, photo) {
  if (!isGalleryObject(gallery)) return noop(gallery, "replace", "not-gallery");

  const normalizedPhoto = normalizeGalleryPhotoInput(photo);
  if (!normalizedPhoto) return noop(gallery, "replace", "missing-media");

  if (isDynamicGallery(gallery)) {
    const cells = normalizeDynamicCellsForMutation(gallery);
    const displayIndex = resolveDynamicDisplayIndex(gallery, target);
    if (displayIndex < 0 || displayIndex >= cells.length) {
      return noop(gallery, "replace", "target-not-found");
    }

    const nextCells = [...cells];
    nextCells[displayIndex] = buildPopulatedCell(nextCells[displayIndex], normalizedPhoto);
    return buildResult(gallery, rebuildDynamicGallery(gallery, nextCells), {
      action: "replace",
      changed: true,
    });
  }

  const sourceIndex = resolveFixedSourceIndex(gallery, target);
  if (sourceIndex < 0) return noop(gallery, "replace", "target-not-found");

  const nextCells = normalizeFixedCellsForMutation(gallery);
  nextCells[sourceIndex] = buildPopulatedCell(nextCells[sourceIndex], normalizedPhoto);

  return buildResult(
    gallery,
    {
      ...gallery,
      cells: nextCells,
    },
    {
      action: "replace",
      changed: true,
    }
  );
}

export function assignGalleryPhotoToCell(gallery, target = {}, photo, options = {}) {
  const mediaUrl = resolveGalleryPhotoMediaUrl(photo);
  if (!mediaUrl || options.clear === true) {
    return removeGalleryPhoto(gallery, target);
  }
  return replaceGalleryPhoto(gallery, target, photo);
}

export function reorderGalleryPhotos(gallery, from, to) {
  if (!isGalleryObject(gallery)) return noop(gallery, "reorder", "not-gallery");

  const fromIndex = toFiniteIndex(typeof from === "object" ? from?.displayIndex ?? from?.index : from);
  const toIndex = toFiniteIndex(typeof to === "object" ? to?.displayIndex ?? to?.index : to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return noop(gallery, "reorder", "invalid-range");
  }

  if (isDynamicGallery(gallery)) {
    const cells = normalizeDynamicCellsForMutation(gallery);
    if (fromIndex >= cells.length || toIndex >= cells.length) {
      return noop(gallery, "reorder", "target-not-found");
    }

    return buildResult(gallery, rebuildDynamicGallery(gallery, moveArrayItem(cells, fromIndex, toIndex)), {
      action: "reorder",
      changed: true,
    });
  }

  const slotCount = resolveFixedSlotCount(gallery);
  const nextCells = normalizeFixedCellsForMutation(gallery);
  const occupiedIndexes = getPopulatedFixedSourceIndexes(nextCells, slotCount);
  if (fromIndex >= occupiedIndexes.length || toIndex >= occupiedIndexes.length) {
    return noop(gallery, "reorder", "target-not-found");
  }

  const reorderedCells = moveArrayItem(
    occupiedIndexes.map((sourceIndex) => nextCells[sourceIndex]),
    fromIndex,
    toIndex
  );

  occupiedIndexes.forEach((sourceIndex, orderIndex) => {
    nextCells[sourceIndex] = reorderedCells[orderIndex];
  });

  return buildResult(
    gallery,
    {
      ...gallery,
      cells: nextCells,
    },
    {
      action: "reorder",
      changed: true,
    }
  );
}

export function switchGalleryLayout(gallery, layoutId) {
  if (!isGalleryObject(gallery)) return noop(gallery, "switch-layout", "not-gallery");

  const safeLayoutId = normalizeText(layoutId);
  const { allowedLayouts } = resolveGalleryLayoutSelection(gallery);

  if (!safeLayoutId || !allowedLayouts.includes(safeLayoutId)) {
    return noop(gallery, "switch-layout", "layout-not-allowed");
  }

  if (normalizeText(gallery.currentLayout) === safeLayoutId) {
    return noop(gallery, "switch-layout", "already-selected");
  }

  return buildResult(
    gallery,
    {
      ...gallery,
      currentLayout: safeLayoutId,
    },
    {
      action: "switch-layout",
      changed: true,
    }
  );
}

export function applyGalleryMutationToObjects(objects, galleryId, mutateGallery) {
  if (!Array.isArray(objects)) {
    return {
      objects,
      changed: false,
      reason: "objects-not-array",
    };
  }

  const safeGalleryId = normalizeText(galleryId);
  const index = objects.findIndex((object) => object?.id === safeGalleryId);
  if (index < 0 || objects[index]?.tipo !== "galeria") {
    return {
      objects,
      changed: false,
      reason: "gallery-not-found",
    };
  }

  const mutation =
    typeof mutateGallery === "function"
      ? mutateGallery(objects[index])
      : noop(objects[index], "", "missing-mutator");

  if (!mutation?.changed) {
    return {
      objects,
      changed: false,
      reason: mutation?.reason || "unchanged",
      mutation,
    };
  }

  const nextObjects = [...objects];
  nextObjects[index] = mutation.gallery;

  return {
    objects: nextObjects,
    changed: true,
    reason: mutation.reason || "",
    mutation,
  };
}
