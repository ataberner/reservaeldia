// components/MiniToolbarTabImagen.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Upload } from "lucide-react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";
import {
  readEditorObjectById,
  readEditorSelectionSnapshot,
} from "@/lib/editorRuntimeBridge";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
  getGalleryAllowedLayoutState,
  getSelectedGalleryPhotoUsages,
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

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function buildGalleryPhotoFromLibraryImage(img) {
  const mediaUrl =
    img?.url ||
    img?.src ||
    img?.downloadURL ||
    img?.mediaUrl ||
    (typeof img === "string" ? img : null);
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
  const galleryPhotoListRef = useRef(null);
  const galleryPhotoRowNodesRef = useRef(new Map());
  const galleryPhotoRowRectsBeforeUpdateRef = useRef(null);
  const galleryPhotoRowAnimationFrameRef = useRef(null);
  const galleryPhotoDragSessionRef = useRef(null);
  const galleryPhotoDragCleanupRef = useRef(null);

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
    };

    syncSelection();

    window.addEventListener("editor-selection-change", syncSelection);
    window.addEventListener("editor-gallery-cell-change", syncSelection);

    return () => {
      window.removeEventListener("editor-selection-change", syncSelection);
      window.removeEventListener("editor-gallery-cell-change", syncSelection);
    };
  }, []);

  const galeriaSeleccionada = useMemo(() => {
    if (!Array.isArray(editorSelection.selectedIds) || editorSelection.selectedIds.length !== 1) {
      return null;
    }

    const selectedId = editorSelection.selectedIds[0];
    const obj = readEditorObjectById(selectedId);
    return obj?.tipo === "galeria" ? obj : null;
  }, [editorSelection.selectedIds]);

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
    if (optimisticGalleryOrder?.galleryId !== galeriaSeleccionada?.id) {
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
    if (optimisticGalleryOrder?.galleryId !== galeriaSeleccionada?.id) return;

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

    if (galeriaSeleccionada) {
      return "Selecciona una celda en el lienzo para decidir donde se carga la proxima imagen.";
    }

    return "Selecciona un bloque de galeria para activar el modo de carga por celdas.";
  }, [celdaActiva, galeriaSeleccionada, totalCeldasGaleria]);

  const limpiarCeldaActiva = () => {
    if (!celdaActiva || typeof window.asignarImagenACelda !== "function") return;
    const ok = window.asignarImagenACelda(null, "cover");
    if (ok) {
      setPanelNotice("Imagen quitada de la celda activa.");
    }
  };

  const commitGalleryMutation = useCallback((mutation, successMessage) => {
    if (!galeriaSeleccionada || !mutation) return false;

    if (!mutation.changed) {
      const reasonMessages = {
        "fixed-gallery-full": "Esta galeria fija no tiene celdas libres. La expansion de grilla sigue deshabilitada.",
        "target-not-found": "Selecciona una foto de esta galeria primero.",
        "layout-not-allowed": "Ese layout no esta permitido para esta galeria.",
        "already-selected": "Ese layout ya esta seleccionado.",
        "missing-media": "No se encontro una imagen valida para aplicar.",
      };
      setPanelNotice(reasonMessages[mutation.reason] || "No hubo cambios para aplicar.");
      return false;
    }

    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
        detail: {
          id: galeriaSeleccionada.id,
          cambios: mutation.gallery,
        },
      })
    );
    setPanelNotice(successMessage);
    return true;
  }, [galeriaSeleccionada]);

  const selectGalleryPhoto = useCallback((photo) => {
    setSelectedPhotoTarget({
      cellId: photo.cellId,
      sourceIndex: photo.sourceIndex,
      displayIndex: photo.displayIndex,
      mediaUrl: photo.mediaUrl,
    });
  }, []);

  const startPhotoReplacement = useCallback((photo) => {
    selectGalleryPhoto(photo);
    setGalleryEditMode("replace");
    setPanelNotice(
      `Elige una imagen disponible o sube una nueva para reemplazar la foto ${Number(photo?.displayIndex || 0) + 1}.`
    );
  }, [selectGalleryPhoto]);

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
      "Foto quitada de la galeria seleccionada."
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

  const handleSwitchLayout = useCallback((layoutId) => {
    if (!galeriaSeleccionada) return;
    commitGalleryMutation(
      switchGalleryLayout(galeriaSeleccionada, layoutId),
      "Layout seleccionado para esta galeria."
    );
  }, [commitGalleryMutation, galeriaSeleccionada]);

  const handleAvailableImageSelected = useCallback((img) => {
    const photo = buildGalleryPhotoFromLibraryImage(img);

    if (galeriaSeleccionada) {
      if (celdaActiva && typeof window.asignarImagenACelda === "function") {
        const ok = window.asignarImagenACelda(photo, "cover");
        if (ok) {
          setPanelNotice("Imagen asignada a la celda activa.");
          return;
        }
      }

      if (galleryEditMode === "replace" && selectedPhotoTarget) {
        const committed = commitGalleryMutation(
          replaceGalleryPhoto(galeriaSeleccionada, selectedPhotoTarget, photo),
          "Foto reemplazada en la galeria seleccionada."
        );
        if (committed) {
          setGalleryEditMode("add");
        }
        return;
      }

      commitGalleryMutation(
        addGalleryPhotos(galeriaSeleccionada, photo),
        "Foto agregada a la galeria seleccionada."
      );
      return;
    }

    if (!img || typeof img.url !== "string") return;
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT, {
        detail: {
          id: `img-${Date.now()}`,
          tipo: "imagen",
          src: img.url,
          ancho: Number.isFinite(img.ancho) ? img.ancho : undefined,
          alto: Number.isFinite(img.alto) ? img.alto : undefined,
          seccionId: seccionActivaId,
        },
      })
    );
    setMostrarGaleria(false);
  }, [
    celdaActiva,
    commitGalleryMutation,
    galeriaSeleccionada,
    galleryEditMode,
    seccionActivaId,
    selectedPhotoTarget,
    setMostrarGaleria,
  ]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${isMobileViewport ? "gap-2" : "gap-3"}`}>
      <section
        className={`border border-zinc-200 bg-white ${
          isMobileViewport ? "rounded-lg px-2.5 py-2" : "rounded-xl px-3 py-2.5"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              Galeria seleccionada
            </div>
            <p className={`${isMobileViewport ? "mt-0.5 text-[11px]" : "mt-1 text-xs"} text-zinc-700`}>
              {galeriaSeleccionada
                ? `${selectedGalleryPhotos.length} foto${selectedGalleryPhotos.length === 1 ? "" : "s"} en esta galeria.`
                : "Selecciona una galeria del lienzo para editar sus fotos."}
            </p>
          </div>
          {galeriaSeleccionada?.id && (
            <span className="max-w-[120px] truncate rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500">
              {galeriaSeleccionada.id}
            </span>
          )}
        </div>

        {galeriaSeleccionada && (
          <>
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

                  return (
                    <div
                      key={photoKey}
                      ref={(node) => setGalleryPhotoRowNode(photoKey, node)}
                      role="listitem"
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
                        disabled={selectedGalleryPhotos.length < 2}
                        aria-label={`Reordenar ${positionLabel}`}
                        title="Arrastra desde aqui para reordenar"
                        className="flex h-10 w-8 shrink-0 touch-none items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-500 cursor-grab active:cursor-grabbing disabled:cursor-default disabled:text-zinc-300"
                      >
                        <GripVertical size={16} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => startPhotoReplacement(photo)}
                        aria-label={`Reemplazar ${positionLabel}`}
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
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
                        onClick={() => startPhotoReplacement(photo)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                        aria-label={`Subir o elegir reemplazo para ${positionLabel}`}
                        title="Reemplazar"
                      >
                        <Upload size={15} aria-hidden="true" />
                      </button>
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

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={!selectedPhotoTarget || selectedPhotoTarget.displayIndex <= 0}
                onClick={() => handleMoveSelectedPhoto(-1)}
                className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
              >
                Subir
              </button>
              <button
                type="button"
                disabled={
                  !selectedPhotoTarget ||
                  selectedPhotoTarget.displayIndex >= selectedGalleryPhotos.length - 1
                }
                onClick={() => handleMoveSelectedPhoto(1)}
                className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
              >
                Bajar
              </button>
              <button
                type="button"
                disabled={!selectedPhotoTarget}
                onClick={() => {
                  setGalleryEditMode("replace");
                  setPanelNotice("Elige una imagen disponible o sube una nueva para reemplazar la foto seleccionada.");
                }}
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
                disabled={!selectedPhotoTarget}
                onClick={handleRemoveSelectedPhoto}
                className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-600 disabled:text-zinc-300"
              >
                Quitar
              </button>
            </div>

            <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Layout permitido
              </div>
              {layoutState.hasPresetContract ? (
                <select
                  value={layoutState.selectedLayout}
                  className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600"
                  onChange={(event) => handleSwitchLayout(event.target.value)}
                >
                  {layoutState.allowedLayoutOptions.map((layoutOption) => (
                    <option key={layoutOption.id} value={layoutOption.id}>
                      {layoutOption.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  Esta galeria usa el layout actual sin presets configurados.
                </p>
              )}
              <p className="mt-1 text-[11px] text-zinc-400">
                Solo se muestran layouts permitidos por la plantilla; las fotos ocultas se conservan.
              </p>
            </div>
          </>
        )}
      </section>

      <div
        className={`border ${
          isMobileViewport ? "rounded-lg px-2.5 py-1.5" : "rounded-xl px-3 py-2"
        } ${
          celdaActiva
            ? "border-emerald-200 bg-emerald-50"
            : "border-zinc-200 bg-zinc-50"
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
        {celdaActiva && (
          <button
            type="button"
            onClick={limpiarCeldaActiva}
            className={`font-medium text-zinc-600 hover:text-zinc-900 underline ${
              isMobileViewport ? "mt-1.5 text-[11px]" : "mt-2 text-xs"
            }`}
          >
            Quitar imagen de la celda activa
          </button>
        )}
      </div>

      {panelNotice && (
        <p className="rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
          {panelNotice}
        </p>
      )}

      <button
        onClick={abrirSelector}
        className={`flex items-center gap-2 w-full font-medium shadow-sm transition-all ${
          isMobileViewport ? "py-1.5 px-3 rounded-lg text-sm" : "py-2 px-4 rounded-xl"
        } ${
          celdaActiva
            ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
            : "bg-purple-100 hover:bg-purple-200 text-purple-800"
        }`}
      >
        <span>{celdaActiva ? "Subir y asignar" : "Subir imagen"}</span>
      </button>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              Imagenes disponibles
            </div>
            <p className="text-xs text-zinc-500">
              {galeriaSeleccionada
                ? galleryEditMode === "replace"
                  ? "Elige una imagen para reemplazar la foto seleccionada, o sube una nueva."
                  : "Elige una imagen para agregarla a la galeria seleccionada."
                : "Biblioteca subida; no es la lista local de la galeria seleccionada."}
            </p>
          </div>
        </div>
        <GaleriaDeImagenes
          imagenes={imagenes || []}
          imagenesEnProceso={imagenesEnProceso || []}
          cargarImagenes={cargarImagenes}
          borrarImagen={borrarImagen}
          hayMas={hayMas}
          seccionActivaId={seccionActivaId}
          cargando={cargando}
          onSelectImage={handleAvailableImageSelected}
          onSeleccionadasChange={setImagenesSeleccionadas}
        />
      </div>
    </div>
  );
}
