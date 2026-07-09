// components/MiniToolbarTabImagen.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Loader2, Upload } from "lucide-react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";
import GalleryLayoutSelector from "@/components/gallery/GalleryLayoutSelector";
import {
  readCanvasEditorMethod,
  readEditorObjects,
  readEditorSections,
  readEditorSelectionSnapshot,
} from "@/lib/editorRuntimeBridge";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import { resolveFirstSectionBaseImage } from "@/domain/sections/backgrounds";
import {
  buildCanvasImageElementFromLibraryImage,
  getGalleryAllowedLayoutState,
  getSelectedGalleryPhotoUsages,
  resolveAvailableImageGalleryAction,
  resolveGallerySidebarEditingTarget,
} from "@/domain/gallery/sidebarModel";
import {
  addGalleryPhotos,
  removeGalleryPhoto,
  replaceGalleryPhoto,
  reorderGalleryPhotos,
  switchGalleryLayout,
} from "@/domain/gallery/galleryMutations";
import { resolveGalleryCellMediaUrl } from "../../shared/renderAssetContract.js";

function getWindowSelectionSnapshot() {
  return readEditorSelectionSnapshot();
}

function resolveLibraryImageUrl(img) {
  if (typeof img === "string") return img;
  if (!img || typeof img !== "object") return "";
  return img.url || img.src || img.downloadURL || img.mediaUrl || "";
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function buildGalleryPhotoFromLibraryImage(img) {
  const mediaUrl = resolveLibraryImageUrl(img);
  if (!mediaUrl) return null;

  return {
    mediaUrl,
    storagePath: img?.storagePath,
    assetId: img?.assetId || img?.id,
    alt: img?.alt || img?.nombre,
    fit: "cover",
  };
}

function getGalleryPhotoRowKey(photo) {
  return (
    photo?.cellId ||
    photo?.storagePath ||
    photo?.assetId ||
    photo?.mediaUrl ||
    `source-${photo?.sourceIndex ?? "unknown"}`
  );
}

function buildGalleryPhotoRows(photos) {
  const seen = new Map();
  return (Array.isArray(photos) ? photos : []).map((photo) => {
    const baseKey = getGalleryPhotoRowKey(photo);
    const seenCount = seen.get(baseKey) || 0;
    seen.set(baseKey, seenCount + 1);
    return {
      photo,
      rowKey: `${baseKey}::${seenCount}`,
    };
  });
}

function buildGalleryPhotoTarget(photo) {
  if (!photo) return null;
  return {
    cellId: photo.cellId,
    sourceIndex: photo.sourceIndex,
    displayIndex: photo.displayIndex,
    mediaUrl: photo.mediaUrl,
  };
}

function moveArrayItemForPreview(items, from, to) {
  if (!Array.isArray(items)) return [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return items;
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function arraysMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function haveSameItems(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const counts = new Map();
  a.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  for (const item of b) {
    const nextCount = (counts.get(item) || 0) - 1;
    if (nextCount < 0) return false;
    if (nextCount === 0) {
      counts.delete(item);
    } else {
      counts.set(item, nextCount);
    }
  }
  return counts.size === 0;
}

function orderRowsByKeys(rows, rowKeys) {
  if (!Array.isArray(rows) || !Array.isArray(rowKeys) || rows.length !== rowKeys.length) {
    return rows;
  }

  if (!rows.every((row) => row?.rowKey)) return rows;

  const rowsByKey = new Map(rows.map((row) => [row.rowKey, row]));
  if (!rowKeys.every((rowKey) => rowsByKey.has(rowKey))) return rows;
  return rowKeys.map((rowKey) => rowsByKey.get(rowKey));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function resolveDragPreviewLeft(dragState) {
  const baseLeft = Number(dragState?.rowLeft) || 0;
  const rawLeft = (Number(dragState?.pointerX) || 0) - (Number(dragState?.grabOffsetX) || 0);
  return clampNumber(rawLeft, baseLeft - 32, baseLeft + 32);
}

function normalizeUploadKeyPart(value) {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

function buildGalleryReplacementUploadKey(galleryId, target) {
  const safeGalleryId = normalizeUploadKeyPart(galleryId);
  if (!safeGalleryId || !target) return "";

  const targetKey =
    normalizeUploadKeyPart(target.cellId) ||
    (Number.isFinite(Number(target.sourceIndex))
      ? `source-${Number(target.sourceIndex)}`
      : "") ||
    (Number.isFinite(Number(target.displayIndex))
      ? `display-${Number(target.displayIndex)}`
      : "") ||
    normalizeUploadKeyPart(target.mediaUrl);

  return targetKey ? `gallery:${safeGalleryId}:${targetKey}` : "";
}

function buildCoverReplacementUploadKey(sectionId) {
  const safeSectionId = normalizeUploadKeyPart(sectionId);
  return safeSectionId ? `cover:${safeSectionId}` : "";
}

function ImageReplacementOverlay({ text = "Subiendo imagen..." }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-lg bg-zinc-950/60 px-2 text-center text-[10px] font-semibold leading-tight text-white backdrop-blur-[1px]"
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export default function MiniToolbarTabImagen({
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId,
  setMostrarGaleria,
  setImagenesSeleccionadas,
  simplifiedForAssistant = false,
  replacementUploadState: controlledReplacementUploadState = null,
  onBeginReplacementUpload = null,
  onClearReplacementUpload = null,
}) {
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [editorSelection, setEditorSelection] = useState(getWindowSelectionSnapshot);
  const [panelNotice, setPanelNotice] = useState("");
  const [selectedPhotoTarget, setSelectedPhotoTarget] = useState(null);
  const [galleryEditMode, setGalleryEditMode] = useState("add");
  const [galleryDragState, setGalleryDragState] = useState(null);
  const [optimisticGalleryOrder, setOptimisticGalleryOrder] = useState(null);
  const [selectionRefreshToken, setSelectionRefreshToken] = useState(0);
  const [editorSnapshotToken, setEditorSnapshotToken] = useState(0);
  const [sidebarGalleryId, setSidebarGalleryId] = useState("");
  const [localReplacementUploadState, setLocalReplacementUploadState] = useState({});
  const isMountedRef = useRef(true);
  const galleryPhotoListRef = useRef(null);
  const galleryPhotoRowNodesRef = useRef(new Map());
  const galleryPhotoRowRectsBeforeUpdateRef = useRef(null);
  const galleryPhotoRowAnimationFrameRef = useRef(null);
  const galleryPhotoDragSessionRef = useRef(null);
  const galleryPhotoDragCleanupRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    return () => {
      if (galleryPhotoDragCleanupRef.current) {
        galleryPhotoDragCleanupRef.current();
      }
      if (
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function" &&
        galleryPhotoRowAnimationFrameRef.current
      ) {
        window.cancelAnimationFrame(galleryPhotoRowAnimationFrameRef.current);
        galleryPhotoRowAnimationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSelection = (event) => {
      const detail = event?.detail || {};
      const fallback = getWindowSelectionSnapshot();

      const selectedIds = Array.isArray(detail.ids)
        ? detail.ids
        : fallback.selectedIds;

      const galleryCellFromDetail =
        detail.galleryCell !== undefined
          ? detail.galleryCell
          : detail.cell !== undefined
            ? detail.cell
            : undefined;

      const galleryCell =
        galleryCellFromDetail !== undefined
          ? galleryCellFromDetail
          : fallback.galleryCell;

      setEditorSelection({
        selectedIds,
        galleryCell: galleryCell || null,
      });
      setEditorSnapshotToken((value) => value + 1);
    };

    syncSelection();

    window.addEventListener("editor-selection-change", syncSelection);
    window.addEventListener("editor-gallery-cell-change", syncSelection);

    return () => {
      window.removeEventListener("editor-selection-change", syncSelection);
      window.removeEventListener("editor-gallery-cell-change", syncSelection);
    };
  }, []);

  const editorObjects = useMemo(
    () => readEditorObjects(),
    [editorSnapshotToken, selectionRefreshToken]
  );
  const editorSections = useMemo(
    () => readEditorSections(),
    [editorSnapshotToken, selectionRefreshToken]
  );
  const firstSectionCover = useMemo(
    () => resolveFirstSectionBaseImage(editorSections),
    [editorSections]
  );
  const replacementUploadState =
    controlledReplacementUploadState && typeof controlledReplacementUploadState === "object"
      ? controlledReplacementUploadState
      : localReplacementUploadState;
  const coverReplacementUploadKey = useMemo(
    () => buildCoverReplacementUploadKey(firstSectionCover.sectionId),
    [firstSectionCover.sectionId]
  );
  const isCoverReplacementUploading = Boolean(
    coverReplacementUploadKey && replacementUploadState[coverReplacementUploadKey]
  );

  const setPanelNoticeSafe = useCallback((message) => {
    if (!isMountedRef.current) return;
    setPanelNotice(message);
  }, []);

  const beginReplacementUpload = useCallback((descriptor) => {
    if (!descriptor?.key) return;
    if (typeof onBeginReplacementUpload === "function") {
      onBeginReplacementUpload(descriptor);
      return;
    }
    if (!isMountedRef.current) return;
    setLocalReplacementUploadState((current) => ({
      ...current,
      [descriptor.key]: {
        ...descriptor,
        status: "uploading",
      },
    }));
  }, [onBeginReplacementUpload]);

  const clearReplacementUpload = useCallback((key) => {
    if (!key) return;
    if (typeof onClearReplacementUpload === "function") {
      onClearReplacementUpload(key);
      return;
    }
    if (!isMountedRef.current) return;
    setLocalReplacementUploadState((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, [onClearReplacementUpload]);

  const isReplacementUploadActive = useCallback(
    (key) => Boolean(key && replacementUploadState[key]),
    [replacementUploadState]
  );

  const galleryTargetState = useMemo(
    () =>
      resolveGallerySidebarEditingTarget({
        objects: editorObjects,
        selectedIds: editorSelection.selectedIds,
        sidebarGalleryId,
      }),
    [editorObjects, editorSelection.selectedIds, sidebarGalleryId]
  );

  const galleryCandidates = galleryTargetState.candidates;
  const galeriaSeleccionada = galleryTargetState.gallery;
  const showGalleryBlockSelector =
    galleryCandidates.length > 1 && galleryTargetState.source !== "canvas-selection";
  const shouldShowGalleryBlockSelector =
    showGalleryBlockSelector && !simplifiedForAssistant;

  useEffect(() => {
    if (!sidebarGalleryId) return;
    if (galleryCandidates.some((gallery) => gallery?.id === sidebarGalleryId)) return;
    setSidebarGalleryId("");
  }, [galleryCandidates, sidebarGalleryId]);

  useEffect(() => {
    if (galleryTargetState.source !== "canvas-selection" || !galeriaSeleccionada?.id) return;
    setSidebarGalleryId(galeriaSeleccionada.id);
  }, [galeriaSeleccionada?.id, galleryTargetState.source]);

  const selectedGalleryPhotos = useMemo(
    () => getSelectedGalleryPhotoUsages(galeriaSeleccionada),
    [galeriaSeleccionada]
  );

  const layoutState = useMemo(
    () => getGalleryAllowedLayoutState(galeriaSeleccionada),
    [galeriaSeleccionada]
  );

  const selectedLayoutOption = useMemo(
    () => layoutState.allowedLayoutOptions.find((option) => option.id === layoutState.selectedLayout),
    [layoutState.allowedLayoutOptions, layoutState.selectedLayout]
  );

  const visiblePhotoLimit = useMemo(() => {
    if (!layoutState.hasPresetContract) return null;
    const rawLimit = selectedLayoutOption?.maxPhotos;
    if (rawLimit === null || rawLimit === undefined) return null;
    const numericLimit = Number(rawLimit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) return null;
    return Math.floor(numericLimit);
  }, [layoutState.hasPresetContract, selectedLayoutOption?.maxPhotos]);

  const selectedGalleryPhotoRows = useMemo(
    () => buildGalleryPhotoRows(selectedGalleryPhotos),
    [selectedGalleryPhotos]
  );

  const orderedGalleryPhotoRows = useMemo(() => {
    if (!optimisticGalleryOrder || optimisticGalleryOrder.galleryId !== galeriaSeleccionada?.id) {
      return selectedGalleryPhotoRows;
    }

    const currentKeys = selectedGalleryPhotoRows.map((row) => row.rowKey);
    if (!haveSameItems(currentKeys, optimisticGalleryOrder.rowKeys)) {
      return selectedGalleryPhotoRows;
    }

    return orderRowsByKeys(selectedGalleryPhotoRows, optimisticGalleryOrder.rowKeys);
  }, [galeriaSeleccionada?.id, optimisticGalleryOrder, selectedGalleryPhotoRows]);

  const displayedGalleryPhotoRows = useMemo(() => {
    if (!galleryDragState) return orderedGalleryPhotoRows;
    return moveArrayItemForPreview(
      orderedGalleryPhotoRows,
      galleryDragState.fromIndex,
      galleryDragState.toIndex
    ).filter((row) => row?.rowKey && row?.photo);
  }, [galleryDragState, orderedGalleryPhotoRows]);

  const draggedGalleryPhotoRow = useMemo(() => {
    if (!galleryDragState) return null;
    return orderedGalleryPhotoRows[galleryDragState.fromIndex] || null;
  }, [galleryDragState, orderedGalleryPhotoRows]);

  const draggedGalleryPhoto = draggedGalleryPhotoRow?.photo || null;
  const selectedPhotoReplacementUploadKey = useMemo(
    () => buildGalleryReplacementUploadKey(galeriaSeleccionada?.id, selectedPhotoTarget),
    [galeriaSeleccionada?.id, selectedPhotoTarget]
  );
  const isSelectedPhotoReplacementUploading = Boolean(
    selectedPhotoReplacementUploadKey && replacementUploadState[selectedPhotoReplacementUploadKey]
  );

  const setGalleryPhotoRowNode = useCallback((rowKey, node) => {
    if (!rowKey) return;
    if (node) {
      galleryPhotoRowNodesRef.current.set(rowKey, node);
    } else {
      galleryPhotoRowNodesRef.current.delete(rowKey);
    }
  }, []);

  const captureGalleryPhotoRowRects = useCallback(() => {
    const rects = new Map();
    galleryPhotoRowNodesRef.current.forEach((node, rowKey) => {
      if (!node || typeof node.getBoundingClientRect !== "function") return;
      rects.set(rowKey, node.getBoundingClientRect());
    });
    galleryPhotoRowRectsBeforeUpdateRef.current = rects;
  }, []);

  useIsomorphicLayoutEffect(() => {
    const previousRects = galleryPhotoRowRectsBeforeUpdateRef.current;
    if (!previousRects || previousRects.size === 0) return;
    galleryPhotoRowRectsBeforeUpdateRef.current = null;
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function" ||
      typeof window.cancelAnimationFrame !== "function"
    ) {
      return;
    }

    if (galleryPhotoRowAnimationFrameRef.current) {
      window.cancelAnimationFrame(galleryPhotoRowAnimationFrameRef.current);
      galleryPhotoRowAnimationFrameRef.current = null;
    }

    const animatedNodes = [];
    displayedGalleryPhotoRows.forEach((row) => {
      if (!row?.rowKey) return;
      const node = galleryPhotoRowNodesRef.current.get(row.rowKey);
      const previousRect = previousRects.get(row.rowKey);
      if (!node || !previousRect) return;

      const nextRect = node.getBoundingClientRect();
      const dx = previousRect.left - nextRect.left;
      const dy = previousRect.top - nextRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.willChange = "transform";
      animatedNodes.push(node);
    });

    if (animatedNodes.length === 0) return;

    galleryPhotoRowAnimationFrameRef.current = window.requestAnimationFrame(() => {
      animatedNodes.forEach((node) => {
        node.style.transition = "transform 150ms cubic-bezier(0.2, 0, 0.2, 1)";
        node.style.transform = "";
      });

      window.setTimeout(() => {
        animatedNodes.forEach((node) => {
          node.style.transition = "";
          node.style.willChange = "";
        });
      }, 180);

      galleryPhotoRowAnimationFrameRef.current = null;
    });
  }, [displayedGalleryPhotoRows]);

  const totalCeldasGaleria = useMemo(() => {
    const isDynamicGallery =
      String(galeriaSeleccionada?.galleryLayoutMode || "").trim().toLowerCase() === "dynamic_media";
    const cells = Array.isArray(galeriaSeleccionada?.cells) ? galeriaSeleccionada.cells : [];
    if (isDynamicGallery) {
      return cells.filter((cell) => {
        const mediaUrl = resolveGalleryCellMediaUrl(cell);
        return Boolean(mediaUrl);
      }).length;
    }

    const rows = Math.max(1, Number(galeriaSeleccionada?.rows) || 1);
    const cols = Math.max(1, Number(galeriaSeleccionada?.cols) || 1);
    return rows * cols;
  }, [galeriaSeleccionada?.cells, galeriaSeleccionada?.cols, galeriaSeleccionada?.galleryLayoutMode, galeriaSeleccionada?.rows]);

  const celdaActiva = useMemo(() => {
    const cell = editorSelection.galleryCell;
    if (!cell || !galeriaSeleccionada) return null;
    if (cell.objId !== galeriaSeleccionada.id) return null;

    const idx = Number(cell.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= totalCeldasGaleria) return null;

    return { ...cell, index: idx };
  }, [editorSelection.galleryCell, galeriaSeleccionada, totalCeldasGaleria]);

  useEffect(() => {
    setPanelNotice("");
  }, [galeriaSeleccionada?.id, celdaActiva?.index]);

  useEffect(() => {
    setSelectedPhotoTarget(null);
    setGalleryEditMode("add");
    setOptimisticGalleryOrder(null);
  }, [galeriaSeleccionada?.id]);

  useEffect(() => {
    if (!optimisticGalleryOrder || optimisticGalleryOrder.galleryId !== galeriaSeleccionada?.id) return;

    const currentKeys = selectedGalleryPhotoRows.map((row) => row.rowKey);
    if (!haveSameItems(currentKeys, optimisticGalleryOrder.rowKeys)) {
      setOptimisticGalleryOrder(null);
      return;
    }

    if (arraysMatch(currentKeys, optimisticGalleryOrder.rowKeys)) {
      setOptimisticGalleryOrder(null);
    }
  }, [galeriaSeleccionada?.id, optimisticGalleryOrder, selectedGalleryPhotoRows]);

  useEffect(() => {
    if (!selectedPhotoTarget) return;
    const stillExists = selectedGalleryPhotos.some((photo) => {
      if (selectedPhotoTarget.cellId && photo.cellId) {
        return selectedPhotoTarget.cellId === photo.cellId;
      }
      return photo.sourceIndex === selectedPhotoTarget.sourceIndex;
    });
    if (!stillExists) {
      setSelectedPhotoTarget(null);
      setGalleryEditMode("add");
    }
  }, [selectedGalleryPhotos, selectedPhotoTarget]);

  const textoAyudaGaleria = useMemo(() => {
    if (celdaActiva) {
      return `Celda ${celdaActiva.index + 1} de ${totalCeldasGaleria} lista. Toca una miniatura o usa "Subir y asignar".`;
    }

    return "";
  }, [celdaActiva, totalCeldasGaleria]);

  const limpiarCeldaActiva = () => {
    if (!celdaActiva || typeof window.asignarImagenACelda !== "function") return;
    const ok = window.asignarImagenACelda(null, "cover");
    if (ok) {
      setPanelNotice("Imagen quitada de la celda activa.");
    }
  };

  const commitGalleryMutation = useCallback((mutation, successMessage, galleryOverride = null) => {
    const targetGallery = galleryOverride || galeriaSeleccionada;
    if (!targetGallery || !mutation) return false;

    if (!mutation.changed) {
      const reasonMessages = {
        "fixed-gallery-full": "Esta galeria fija no tiene celdas libres. La expansion de grilla sigue deshabilitada.",
        "target-not-found": "Selecciona una foto de esta galeria primero.",
        "layout-not-allowed": "Ese layout no esta permitido para esta galeria.",
        "already-selected": "Ese layout ya esta seleccionado.",
        "missing-media": "No se encontro una imagen valida para aplicar.",
      };
      setPanelNoticeSafe(reasonMessages[mutation.reason] || "No hubo cambios para aplicar.");
      return false;
    }

    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
        detail: {
          id: targetGallery.id,
          cambios: mutation.gallery,
        },
      })
    );
    if (isMountedRef.current) {
      setSelectionRefreshToken((value) => value + 1);
    }
    setPanelNoticeSafe(successMessage);
    return true;
  }, [galeriaSeleccionada, setPanelNoticeSafe]);

  const selectGalleryPhoto = useCallback((photo) => {
    const target = buildGalleryPhotoTarget(photo);
    if (!target) return;
    setSelectedPhotoTarget(target);
  }, []);

  const resolveLatestGalleryById = useCallback((galleryId) => {
    const safeGalleryId = String(galleryId || "").trim();
    if (!safeGalleryId) return null;

    const currentObjects = readEditorObjects();
    const currentGallery = currentObjects.find(
      (object) => object?.id === safeGalleryId && object?.tipo === "galeria"
    );
    if (currentGallery) return currentGallery;

    return galeriaSeleccionada?.id === safeGalleryId ? galeriaSeleccionada : null;
  }, [galeriaSeleccionada]);

  const replaceGalleryPhotoTargetWithUpload = useCallback((galleryId, target, uploadedUrl) => {
    const targetGallery = resolveLatestGalleryById(galleryId);
    if (!targetGallery || !target) return false;
    if (typeof uploadedUrl !== "string" || !uploadedUrl) return false;

    const committed = commitGalleryMutation(
      replaceGalleryPhoto(targetGallery, target, uploadedUrl),
      "Foto reemplazada en esta galeria.",
      targetGallery
    );
    if (committed && isMountedRef.current) {
      setSelectedPhotoTarget(target);
      setGalleryEditMode("add");
    }
    return committed;
  }, [commitGalleryMutation, resolveLatestGalleryById]);

  const openGalleryPhotoReplacementUpload = useCallback((galleryId, target, positionLabel) => {
    const uploadKey = buildGalleryReplacementUploadKey(galleryId, target);
    if (!galleryId || !target || !uploadKey) {
      setPanelNoticeSafe("Selecciona una foto de esta galeria primero.");
      return;
    }

    if (isReplacementUploadActive(uploadKey)) {
      setPanelNoticeSafe("Esa foto ya se esta reemplazando.");
      return;
    }

    if (typeof abrirSelector !== "function") {
      setPanelNoticeSafe("No se encontro el selector de archivos para subir la imagen.");
      return;
    }

    const safePositionLabel = positionLabel || "la foto seleccionada";
    setPanelNoticeSafe(`Selecciona una imagen del sistema para reemplazar ${safePositionLabel}.`);
    abrirSelector({
      onUploadStart: () => {
        beginReplacementUpload({
          key: uploadKey,
          kind: "gallery",
          galleryId,
          target,
        });
        setPanelNoticeSafe(`Subiendo imagen para ${safePositionLabel}...`);
      },
      onUploadedImage: (uploadedUrl) =>
        replaceGalleryPhotoTargetWithUpload(galleryId, target, uploadedUrl),
      onUploadError: () => {
        setPanelNoticeSafe("No se pudo actualizar esa foto. Conservamos la imagen anterior.");
      },
      onUploadSettled: () => {
        clearReplacementUpload(uploadKey);
      },
    });
  }, [
    abrirSelector,
    beginReplacementUpload,
    clearReplacementUpload,
    isReplacementUploadActive,
    replaceGalleryPhotoTargetWithUpload,
    setPanelNoticeSafe,
  ]);

  const startPhotoReplacement = useCallback((photo, options = {}) => {
    const target = buildGalleryPhotoTarget(photo);
    if (!target) return;

    selectGalleryPhoto(photo);
    setGalleryEditMode("replace");
    const photoPosition = Number(photo?.displayIndex || 0) + 1;
    const positionLabel = `la foto ${photoPosition}`;

    if (options.openFilePicker === true) {
      openGalleryPhotoReplacementUpload(galeriaSeleccionada?.id, target, positionLabel);
      return;
    }

    setPanelNoticeSafe(
      `Elige una imagen disponible o sube una nueva para reemplazar ${positionLabel}.`
    );
  }, [
    galeriaSeleccionada?.id,
    openGalleryPhotoReplacementUpload,
    selectGalleryPhoto,
    setPanelNoticeSafe,
  ]);

  const cleanupGalleryPhotoDrag = useCallback(() => {
    if (galleryPhotoDragCleanupRef.current) {
      galleryPhotoDragCleanupRef.current();
      galleryPhotoDragCleanupRef.current = null;
    }
    galleryPhotoDragSessionRef.current = null;
    setGalleryDragState(null);
  }, []);

  const resolvePointerDropIndex = useCallback((clientY) => {
    const listNode = galleryPhotoListRef.current;
    if (!listNode) return -1;

    const rows = Array.from(listNode.querySelectorAll("[data-gallery-photo-row='true']"));
    if (rows.length === 0) return -1;

    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return rows.length - 1;
  }, []);

  const commitPhotoReorder = useCallback((from, to, optimisticRows = null) => {
    if (!galeriaSeleccionada) return false;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;

    const committed = commitGalleryMutation(
      reorderGalleryPhotos(galeriaSeleccionada, from, to),
      "Orden de la galeria actualizado."
    );
    if (committed) {
      const nextRows = Array.isArray(optimisticRows)
        ? optimisticRows
        : moveArrayItemForPreview(orderedGalleryPhotoRows, from, to);
      const nextRowKeys = nextRows
        .map((row) => row?.rowKey)
        .filter(Boolean);
      captureGalleryPhotoRowRects();
      if (nextRowKeys.length === orderedGalleryPhotoRows.length) {
        setOptimisticGalleryOrder({
          galleryId: galeriaSeleccionada.id,
          rowKeys: nextRowKeys,
        });
      } else {
        setOptimisticGalleryOrder(null);
      }
      setSelectedPhotoTarget(null);
      setGalleryEditMode("add");
    }
    return committed;
  }, [captureGalleryPhotoRowRects, commitGalleryMutation, galeriaSeleccionada, orderedGalleryPhotoRows]);

  const handleGalleryPhotoHandleKeyDown = useCallback((event, photo) => {
    const from = Number(photo?.displayIndex);
    let to = from;

    if (event.key === "ArrowUp") {
      to = from - 1;
    } else if (event.key === "ArrowDown") {
      to = from + 1;
    } else if (event.key === "Home") {
      to = 0;
    } else if (event.key === "End") {
      to = selectedGalleryPhotos.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectGalleryPhoto(photo);

    if (!Number.isInteger(from) || to < 0 || to >= selectedGalleryPhotos.length || from === to) {
      setPanelNotice("La foto ya esta en ese extremo de la galeria.");
      return;
    }

    commitPhotoReorder(from, to);
  }, [commitPhotoReorder, selectGalleryPhoto, selectedGalleryPhotos.length]);

  const handleGalleryPhotoDragStart = useCallback((event, photoRow, visualIndex) => {
    const photo = photoRow?.photo;
    if (!galeriaSeleccionada || orderedGalleryPhotoRows.length < 2 || !photo) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const fromIndex = Number(visualIndex);
    if (!Number.isInteger(fromIndex) || fromIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();
    selectGalleryPhoto(photo);

    if (galleryPhotoDragCleanupRef.current) {
      galleryPhotoDragCleanupRef.current();
      galleryPhotoDragCleanupRef.current = null;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners below own the drag lifecycle.
    }

    const rowNode = event.currentTarget.closest("[data-gallery-photo-row='true']");
    const rowRect = rowNode?.getBoundingClientRect?.();
    const photoKey = photoRow.rowKey;
    galleryPhotoDragSessionRef.current = {
      pointerId: event.pointerId,
      fromIndex,
      toIndex: fromIndex,
      photoKey,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rowLeft: rowRect?.left || 0,
      rowWidth: rowRect?.width || 0,
      rowHeight: rowRect?.height || 58,
      grabOffsetX: rowRect ? event.clientX - rowRect.left : 0,
      grabOffsetY: rowRect ? event.clientY - rowRect.top : 0,
    };
    setGalleryDragState({
      photoKey,
      fromIndex,
      toIndex: fromIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rowLeft: rowRect?.left || 0,
      rowWidth: rowRect?.width || 0,
      rowHeight: rowRect?.height || 58,
      grabOffsetX: rowRect ? event.clientX - rowRect.left : 0,
      grabOffsetY: rowRect ? event.clientY - rowRect.top : 0,
    });

    const handleMove = (moveEvent) => {
      const session = galleryPhotoDragSessionRef.current;
      if (!session || moveEvent.pointerId !== session.pointerId) return;

      moveEvent.preventDefault();
      const toIndex = resolvePointerDropIndex(moveEvent.clientY);
      const nextToIndex = toIndex >= 0 ? toIndex : session.toIndex;

      session.toIndex = nextToIndex;
      session.pointerX = moveEvent.clientX;
      session.pointerY = moveEvent.clientY;
      captureGalleryPhotoRowRects();
      setGalleryDragState({
        photoKey: session.photoKey,
        fromIndex: session.fromIndex,
        toIndex: nextToIndex,
        pointerX: session.pointerX,
        pointerY: session.pointerY,
        rowLeft: session.rowLeft,
        rowWidth: session.rowWidth,
        rowHeight: session.rowHeight,
        grabOffsetX: session.grabOffsetX,
        grabOffsetY: session.grabOffsetY,
      });
    };

    const finishDrag = (endEvent, cancelled = false) => {
      const session = galleryPhotoDragSessionRef.current;
      if (!session || endEvent.pointerId !== session.pointerId) return;

      endEvent.preventDefault();
      const from = session.fromIndex;
      const to = session.toIndex;

      if (!cancelled && from !== to) {
        const optimisticRows = moveArrayItemForPreview(orderedGalleryPhotoRows, from, to);
        commitPhotoReorder(from, to, optimisticRows);
      }
      cleanupGalleryPhotoDrag();
    };

    const handleUp = (upEvent) => finishDrag(upEvent, false);
    const handleCancel = (cancelEvent) => finishDrag(cancelEvent, true);

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);

    galleryPhotoDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
    };
  }, [
    captureGalleryPhotoRowRects,
    cleanupGalleryPhotoDrag,
    commitPhotoReorder,
    galeriaSeleccionada,
    orderedGalleryPhotoRows,
    resolvePointerDropIndex,
    selectGalleryPhoto,
  ]);

  const handleRemoveSelectedPhoto = useCallback(() => {
    if (!galeriaSeleccionada || !selectedPhotoTarget) {
      setPanelNotice("Selecciona una foto de esta galeria primero.");
      return;
    }

    const committed = commitGalleryMutation(
      removeGalleryPhoto(galeriaSeleccionada, selectedPhotoTarget),
      "Foto quitada de esta galeria."
    );
    if (committed) {
      setSelectedPhotoTarget(null);
      setGalleryEditMode("add");
    }
  }, [commitGalleryMutation, galeriaSeleccionada, selectedPhotoTarget]);

  const handleMoveSelectedPhoto = useCallback((delta) => {
    if (!galeriaSeleccionada || !selectedPhotoTarget) {
      setPanelNotice("Selecciona una foto de esta galeria primero.");
      return;
    }

    const from = Number(selectedPhotoTarget.displayIndex);
    const to = from + delta;
    if (!Number.isInteger(from) || to < 0 || to >= selectedGalleryPhotos.length) {
      setPanelNotice("La foto ya esta en ese extremo de la galeria.");
      return;
    }

    commitPhotoReorder(from, to);
  }, [
    commitPhotoReorder,
    galeriaSeleccionada,
    selectedGalleryPhotos,
    selectedPhotoTarget,
  ]);

  const openSelectedPhotoReplacementPicker = useCallback(() => {
    if (!selectedPhotoTarget) {
      setPanelNoticeSafe("Selecciona una foto de esta galeria primero.");
      return;
    }

    setGalleryEditMode("replace");
    if (!galeriaSeleccionada?.id) {
      setPanelNoticeSafe("Selecciona una galeria para reemplazar la foto.");
      return;
    }

    openGalleryPhotoReplacementUpload(
      galeriaSeleccionada.id,
      selectedPhotoTarget,
      "la foto seleccionada"
    );
  }, [
    galeriaSeleccionada?.id,
    openGalleryPhotoReplacementUpload,
    selectedPhotoTarget,
    setPanelNoticeSafe,
  ]);

  const handleSwitchLayout = useCallback((layoutId) => {
    if (!galeriaSeleccionada) return;
    commitGalleryMutation(
      switchGalleryLayout(galeriaSeleccionada, layoutId),
      "Layout seleccionado para esta galeria."
    );
  }, [commitGalleryMutation, galeriaSeleccionada]);

  const replaceFirstSectionCoverImage = useCallback((imageInput, options = {}) => {
    const imageUrl = resolveLibraryImageUrl(imageInput);
    if (!imageUrl) {
      setPanelNoticeSafe("No se encontro una imagen valida para usar como portada.");
      return false;
    }

    const replaceCoverImage = readCanvasEditorMethod("replaceFirstSectionBackgroundImage");
    if (typeof replaceCoverImage !== "function") {
      setPanelNoticeSafe("No se encontro el flujo de fondo de portada del editor.");
      return false;
    }

    const ok = replaceCoverImage(imageUrl, {
      preservePlacement: true,
      sectionId: options.sectionId || options.expectedSectionId || "",
    });
    if (!ok) {
      setPanelNoticeSafe("No se pudo actualizar la imagen de portada.");
      return false;
    }

    if (isMountedRef.current) {
      setEditorSnapshotToken((value) => value + 1);
    }
    setPanelNoticeSafe("Imagen de portada actualizada.");
    return true;
  }, [setPanelNoticeSafe]);

  const handleCoverUploadClick = useCallback(() => {
    const sectionId = firstSectionCover.sectionId;
    const uploadKey = buildCoverReplacementUploadKey(sectionId);
    if (!sectionId || !uploadKey) {
      setPanelNoticeSafe("No se encontro la seccion de portada para reemplazar.");
      return;
    }

    if (isReplacementUploadActive(uploadKey)) {
      setPanelNoticeSafe("La imagen de portada ya se esta reemplazando.");
      return;
    }

    if (typeof abrirSelector !== "function") {
      setPanelNoticeSafe("No se encontro el selector de archivos para subir la imagen.");
      return;
    }

    abrirSelector({
      onUploadStart: () => {
        beginReplacementUpload({
          key: uploadKey,
          kind: "cover",
          sectionId,
        });
        setPanelNoticeSafe("Subiendo imagen de portada...");
      },
      onUploadedImage: (uploadedUrl) =>
        replaceFirstSectionCoverImage(uploadedUrl, { sectionId }),
      onUploadError: () => {
        setPanelNoticeSafe("No se pudo actualizar la portada. Conservamos la imagen anterior.");
      },
      onUploadSettled: () => {
        clearReplacementUpload(uploadKey);
      },
    });
  }, [
    abrirSelector,
    beginReplacementUpload,
    clearReplacementUpload,
    firstSectionCover.sectionId,
    isReplacementUploadActive,
    replaceFirstSectionCoverImage,
    setPanelNoticeSafe,
  ]);

  const insertAvailableImageIntoCanvas = useCallback((img) => {
    const imageElement = buildCanvasImageElementFromLibraryImage(img, {
      id: `img-${Date.now()}`,
      seccionActivaId,
    });

    if (!imageElement) {
      setPanelNotice("No se encontro una imagen valida para insertar.");
      return false;
    }

    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT, {
        detail: imageElement,
      })
    );
    setMostrarGaleria(false);
    setPanelNotice("Imagen insertada en el lienzo.");
    return true;
  }, [seccionActivaId, setMostrarGaleria]);

  const handleAvailableImageCoverAction = useCallback((img) => {
    replaceFirstSectionCoverImage(img);
  }, [replaceFirstSectionCoverImage]);

  const handleAvailableImageGalleryAction = useCallback((img) => {
    const photo = buildGalleryPhotoFromLibraryImage(img);

    if (!photo) {
      setPanelNotice("No se encontro una imagen valida para aplicar.");
      return;
    }

    if (!galeriaSeleccionada) {
      if (galleryTargetState.needsSidebarChoice) {
        setPanelNotice("Elige una galeria del listado para usar esta imagen.");
      }
      return;
    }

    const galleryAction = resolveAvailableImageGalleryAction({
      gallery: galeriaSeleccionada,
      activeCell: celdaActiva,
      selectedPhotoTarget,
    });

    if (
      galleryAction.action === "assign-active-cell" &&
      typeof window.asignarImagenACelda === "function"
    ) {
      const ok = window.asignarImagenACelda(photo, "cover");
      if (ok) {
        setPanelNotice("Imagen asignada a la celda activa.");
      }
      return;
    }

    if (galleryAction.action === "replace-selected-photo" && selectedPhotoTarget) {
      const committed = commitGalleryMutation(
        replaceGalleryPhoto(galeriaSeleccionada, selectedPhotoTarget, photo),
        "Foto reemplazada en esta galeria."
      );
      if (committed) {
        setGalleryEditMode("add");
      }
      return;
    }

    if (galleryAction.action === "add-to-gallery") {
      commitGalleryMutation(
        addGalleryPhotos(galeriaSeleccionada, photo),
        "Foto agregada a esta galeria."
      );
    }
  }, [
    celdaActiva,
    commitGalleryMutation,
    galeriaSeleccionada,
    galleryTargetState.needsSidebarChoice,
    selectedPhotoTarget,
  ]);

  const handleAvailableImageSelected = useCallback((img) => {
    insertAvailableImageIntoCanvas(img);
  }, [insertAvailableImageIntoCanvas]);

  const getAvailableImageActions = useCallback(() => {
    const galleryAction = resolveAvailableImageGalleryAction({
      gallery: galeriaSeleccionada,
      activeCell: celdaActiva,
      selectedPhotoTarget,
    });

    const actions = [];
    if (firstSectionCover.hasImage) {
      actions.push({
        key: "replace-first-section-cover",
        label: "Usar como portada",
        title: "Reemplazar la imagen de portada con esta foto",
        onClick: handleAvailableImageCoverAction,
      });
    }

    if (galleryAction.action !== "none") {
      actions.push({
        key: galleryAction.action,
        label: galleryAction.label,
        title:
          galleryAction.action === "assign-active-cell"
            ? "Usar esta imagen en la celda seleccionada"
            : galleryAction.action === "replace-selected-photo"
              ? "Reemplazar la foto seleccionada con esta imagen"
              : "Agregar esta imagen a la galeria activa",
        onClick: handleAvailableImageGalleryAction,
      });
    }

    return actions;
  }, [
    celdaActiva,
    firstSectionCover.hasImage,
    galeriaSeleccionada,
    handleAvailableImageCoverAction,
    handleAvailableImageGalleryAction,
    selectedPhotoTarget,
  ]);

  const handleUploadButtonClick = useCallback(() => {
    if (galeriaSeleccionada && !celdaActiva && galleryEditMode === "replace" && selectedPhotoTarget) {
      openSelectedPhotoReplacementPicker();
      return;
    }

    if (typeof abrirSelector !== "function") {
      setPanelNotice("No se encontro el selector de archivos para subir la imagen.");
      return;
    }

    abrirSelector();
  }, [
    abrirSelector,
    celdaActiva,
    galeriaSeleccionada,
    galleryEditMode,
    openSelectedPhotoReplacementPicker,
    selectedPhotoTarget,
  ]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${isMobileViewport ? "gap-2" : "gap-3"}`}>
      {firstSectionCover.hasImage && (
        <section
          className={`shrink-0 border border-zinc-200 bg-white ${
            isMobileViewport ? "rounded-lg px-2.5 py-2" : "rounded-xl px-3 py-2.5"
          }`}
        >
          <div className="text-[13px] font-semibold leading-[18px] text-zinc-700">
            Cambiar imagen de portada
          </div>
          <button
            type="button"
            onClick={handleCoverUploadClick}
            disabled={isCoverReplacementUploading}
            aria-busy={isCoverReplacementUploading}
            className="mt-2 block w-full rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-left transition hover:border-purple-200 hover:bg-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 disabled:cursor-wait disabled:hover:border-zinc-200 disabled:hover:bg-zinc-50"
          >
            <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-md bg-zinc-100">
              <img
                src={firstSectionCover.imageUrl}
                alt="Imagen de portada"
                className="h-full w-full object-cover"
              />
              {isCoverReplacementUploading && (
                <ImageReplacementOverlay text="Subiendo imagen..." />
              )}
            </span>
            <span className="mt-2 flex items-center justify-between gap-2 px-0.5">
              <span className="min-w-0 truncate text-xs font-medium text-zinc-700">
                {isCoverReplacementUploading ? "Reemplazando..." : "Reemplazar imagen"}
              </span>
              {isCoverReplacementUploading ? (
                <Loader2 size={15} className="shrink-0 animate-spin text-zinc-500" aria-hidden="true" />
              ) : (
                <Upload size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
              )}
            </span>
          </button>
        </section>
      )}

      {galleryCandidates.length > 0 && (
        <section
          className={`shrink-0 border border-zinc-200 bg-white ${
            isMobileViewport ? "rounded-lg px-2.5 py-2" : "rounded-xl px-3 py-2.5"
          }`}
        >
          {shouldShowGalleryBlockSelector && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Galerias del borrador
              </div>
              <div className="grid gap-1.5">
                {galleryCandidates.map((gallery, index) => {
                  const isActiveGallery = galeriaSeleccionada?.id === gallery.id;
                  const photoCount = getSelectedGalleryPhotoUsages(gallery).length;
                  return (
                    <button
                      key={gallery.id}
                      type="button"
                      onClick={() => setSidebarGalleryId(gallery.id)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                        isActiveGallery
                          ? "border-purple-300 bg-purple-50 text-purple-800"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          Galeria {index + 1}
                        </span>
                        <span className="block max-w-[220px] truncate text-[10px] text-zinc-400">
                          {gallery.id}
                        </span>
                      </span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                        {photoCount} foto{photoCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {galeriaSeleccionada && (
            <div className={`${shouldShowGalleryBlockSelector ? "mt-2" : ""} flex items-start justify-between gap-2`}>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                  Galeria
                </div>
                <p className={`${isMobileViewport ? "mt-0.5 text-[11px]" : "mt-1 text-xs"} text-zinc-700`}>
                  {selectedGalleryPhotos.length} foto{selectedGalleryPhotos.length === 1 ? "" : "s"} en este bloque.
                </p>
              </div>
              {!simplifiedForAssistant && (
                <span className="max-w-[120px] truncate rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500">
                  {galeriaSeleccionada.id}
                </span>
              )}
            </div>
          )}

          {galeriaSeleccionada && (
            <>
              {!simplifiedForAssistant && (
                <div className="mt-2">
                  <GalleryLayoutSelector
                    title="Layout permitido"
                    options={layoutState.allowedLayoutOptions}
                    activeLayoutId={layoutState.selectedLayout}
                    onSelect={handleSwitchLayout}
                    compact={isMobileViewport}
                    emptyMessage="Esta galeria usa el layout actual sin presets configurados."
                  />
                </div>
              )}

            {selectedGalleryPhotos.length > 0 ? (
              <div
                ref={galleryPhotoListRef}
                role="list"
                className="mt-2 flex flex-col gap-1.5"
              >
                {displayedGalleryPhotoRows.map((photoRow, visualIndex) => {
                  const photo = photoRow?.photo;
                  const photoKey = photoRow?.rowKey;
                  if (!photo || !photoKey) return null;

                  const isSelectedPhoto =
                    selectedPhotoTarget &&
                    (selectedPhotoTarget.cellId && photo.cellId
                      ? selectedPhotoTarget.cellId === photo.cellId
                      : selectedPhotoTarget.sourceIndex === photo.sourceIndex);
                  const isDraggingPhoto = galleryDragState?.photoKey === photoKey;
                  const isDropTarget =
                    galleryDragState &&
                    galleryDragState.toIndex === visualIndex;
                  const isHiddenByLayout =
                    visiblePhotoLimit !== null &&
                    visualIndex >= visiblePhotoLimit;
                  const positionLabel = `Foto ${visualIndex + 1} de ${selectedGalleryPhotos.length}`;
                  const photoUploadTarget = buildGalleryPhotoTarget(photo);
                  const photoReplacementUploadKey = buildGalleryReplacementUploadKey(
                    galeriaSeleccionada?.id,
                    photoUploadTarget
                  );
                  const isPhotoReplacementUploading = isReplacementUploadActive(photoReplacementUploadKey);

                  return (
                    <div
                      key={photoKey}
                      ref={(node) => setGalleryPhotoRowNode(photoKey, node)}
                      role="listitem"
                      aria-busy={isPhotoReplacementUploading}
                      data-gallery-photo-row="true"
                      className={`relative flex min-h-[58px] items-center gap-2 rounded-lg border bg-white p-1.5 transition ${
                        isSelectedPhoto
                          ? "border-purple-400 ring-2 ring-purple-100"
                          : "border-zinc-200"
                      } ${isDraggingPhoto ? "invisible" : ""} ${
                        isDropTarget ? "shadow-[0_0_0_2px_rgba(168,85,247,0.22)]" : ""
                      }`}
                    >
                      {isDropTarget && (
                        <span className="absolute -top-0.5 left-2 right-2 h-0.5 rounded bg-purple-400" />
                      )}
                      <button
                        type="button"
                        onPointerDown={(event) => handleGalleryPhotoDragStart(event, photoRow, visualIndex)}
                        onKeyDown={(event) => handleGalleryPhotoHandleKeyDown(event, photo)}
                        disabled={selectedGalleryPhotos.length < 2 || isPhotoReplacementUploading}
                        aria-label={`Reordenar ${positionLabel}`}
                        title="Arrastra desde aqui para reordenar"
                        className="flex h-10 w-8 shrink-0 touch-none items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-500 cursor-grab active:cursor-grabbing disabled:cursor-default disabled:text-zinc-300"
                      >
                        <GripVertical size={16} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => startPhotoReplacement(photo, { openFilePicker: true })}
                        disabled={isPhotoReplacementUploading}
                        aria-label={`Reemplazar ${positionLabel}`}
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 disabled:cursor-wait"
                        title="Reemplazar foto"
                      >
                        <img
                          src={photo.mediaUrl}
                          alt={photo.alt || positionLabel}
                          className="h-full w-full object-cover"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => selectGalleryPhoto(photo)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Seleccionar ${positionLabel}`}
                      >
                        <span className="block truncate text-xs font-medium text-zinc-700">
                          {positionLabel}
                        </span>
                        <span className="block truncate text-[11px] text-zinc-400">
                          Celda {Number(photo.sourceIndex) + 1}
                          {isHiddenByLayout ? " - oculta en este layout" : ""}
                        </span>
                      </button>

                      {isHiddenByLayout && (
                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          Oculta
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => startPhotoReplacement(photo, { openFilePicker: true })}
                        disabled={isPhotoReplacementUploading}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 disabled:cursor-wait disabled:text-zinc-300 disabled:hover:bg-zinc-50"
                        aria-label={`Subir o elegir reemplazo para ${positionLabel}`}
                        title="Reemplazar"
                      >
                        {isPhotoReplacementUploading ? (
                          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Upload size={15} aria-hidden="true" />
                        )}
                      </button>
                      {isPhotoReplacementUploading && (
                        <ImageReplacementOverlay text="Subiendo imagen..." />
                      )}
                    </div>
                  );
                })}
                {galleryDragState && draggedGalleryPhoto && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none fixed z-[100] flex min-h-[58px] items-center gap-2 rounded-lg border border-purple-300 bg-white p-1.5 shadow-xl ring-2 ring-purple-100"
                    style={{
                      left: `${resolveDragPreviewLeft(galleryDragState)}px`,
                      top: `${(galleryDragState.pointerY || 0) - (galleryDragState.grabOffsetY || 0)}px`,
                      width: galleryDragState.rowWidth ? `${galleryDragState.rowWidth}px` : undefined,
                    }}
                  >
                    <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-500">
                      <GripVertical size={16} aria-hidden="true" />
                    </span>
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                      <img
                        src={draggedGalleryPhoto.mediaUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-700">
                        Foto {Number(galleryDragState.toIndex || 0) + 1} de {selectedGalleryPhotos.length}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-400">
                        Celda {Number(draggedGalleryPhoto.sourceIndex) + 1}
                        {visiblePhotoLimit !== null && Number(galleryDragState.toIndex) >= visiblePhotoLimit
                          ? " - oculta en este layout"
                          : ""}
                      </span>
                    </span>
                    {visiblePhotoLimit !== null && Number(galleryDragState.toIndex) >= visiblePhotoLimit && (
                      <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Oculta
                      </span>
                    )}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600">
                      <Upload size={15} aria-hidden="true" />
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 rounded border border-dashed border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-500">
                Esta galeria todavia no tiene fotos asignadas.
              </p>
            )}

            {!simplifiedForAssistant && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  disabled={
                    !selectedPhotoTarget ||
                    isSelectedPhotoReplacementUploading ||
                    selectedPhotoTarget.displayIndex <= 0
                  }
                  onClick={() => handleMoveSelectedPhoto(-1)}
                  className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
                >
                  Subir
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedPhotoTarget ||
                    isSelectedPhotoReplacementUploading ||
                    selectedPhotoTarget.displayIndex >= selectedGalleryPhotos.length - 1
                  }
                  onClick={() => handleMoveSelectedPhoto(1)}
                  className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
                >
                  Bajar
                </button>
                <button
                  type="button"
                  disabled={!selectedPhotoTarget || isSelectedPhotoReplacementUploading}
                  onClick={openSelectedPhotoReplacementPicker}
                  className={`rounded border px-1.5 py-1 text-[11px] ${
                    galleryEditMode === "replace"
                      ? "border-purple-300 bg-purple-50 text-purple-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600 disabled:text-zinc-300"
                  }`}
                >
                  Reemplazar
                </button>
                <button
                  type="button"
                  disabled={!selectedPhotoTarget || isSelectedPhotoReplacementUploading}
                  onClick={handleRemoveSelectedPhoto}
                  className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
                >
                  Quitar
                </button>
              </div>
            )}

            </>
          )}
        </section>
      )}

      {celdaActiva && !simplifiedForAssistant && (
        <div
          className={`border border-emerald-200 bg-emerald-50 ${
            isMobileViewport ? "rounded-lg px-2.5 py-1.5" : "rounded-xl px-3 py-2"
          }`}
        >
          {isMobileViewport && (
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              Modo galeria
            </div>
          )}
          <p className={`${isMobileViewport ? "mt-0.5 text-[11px]" : "mt-1 text-xs"} text-zinc-700`}>
            {textoAyudaGaleria}
          </p>
          <button
            type="button"
            onClick={limpiarCeldaActiva}
            className={`font-medium text-zinc-600 hover:text-zinc-900 underline ${
              isMobileViewport ? "mt-1.5 text-[11px]" : "mt-2 text-xs"
            }`}
          >
            Quitar imagen de la celda activa
          </button>
        </div>
      )}

      {panelNotice && (
        <p className="rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
          {panelNotice}
        </p>
      )}

      {!simplifiedForAssistant && (
      <div className="shrink-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              Imagenes disponibles
            </div>
            <p className="text-xs text-zinc-500">
              Biblioteca subida disponible para el lienzo.
            </p>
          </div>
        </div>
        <button
          onClick={handleUploadButtonClick}
          className={`mb-2 flex w-full shrink-0 items-center gap-2 font-medium shadow-sm transition-all ${
            isMobileViewport ? "py-1.5 px-3 rounded-lg text-sm" : "py-2 px-4 rounded-xl"
          } ${
            celdaActiva
              ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
              : "bg-purple-100 hover:bg-purple-200 text-purple-800"
          }`}
        >
          <span>{celdaActiva ? "Subir y asignar" : "Subir imagen"}</span>
        </button>
        <GaleriaDeImagenes
          imagenes={imagenes || []}
          imagenesEnProceso={imagenesEnProceso || []}
          cargarImagenes={cargarImagenes}
          borrarImagen={borrarImagen}
          hayMas={hayMas}
          seccionActivaId={seccionActivaId}
          cargando={cargando}
          onSelectImage={handleAvailableImageSelected}
          getImageActions={getAvailableImageActions}
          onSeleccionadasChange={setImagenesSeleccionadas}
        />
      </div>
      )}
    </div>
  );
}
