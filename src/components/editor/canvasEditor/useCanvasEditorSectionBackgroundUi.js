import { useCallback, useEffect, useMemo } from "react";
import { calcularOffsetY } from "@/utils/layout";
import {
  desanclarImagenDeFondo,
  convertirDecoracionFondoEnImagen,
  convertirImagenEnDecoracionFondo,
} from "@/utils/accionesFondo";
import {
  applySectionSolidBackground,
  convertImageObjectToSectionEdgeDecorationState,
  normalizeSectionBackgroundModel,
  removeBackgroundDecoration,
  removeSectionEdgeDecoration,
  resolveEdgeDecorationCanvasRenderBox,
  setSectionEdgeDecorationEnabled,
  updateBackgroundDecorationsParallax,
} from "@/domain/sections/backgrounds";
import {
  resolveGroupingSelectionCandidate,
  resolveMultiSelectionMenuCandidate,
} from "@/domain/editor/grouping";

export default function useCanvasEditorSectionBackgroundUi({
  altoCanvas,
  secciones,
  seccionesOrdenadas,
  objetos,
  elementosSeleccionados,
  seccionActivaId,
  backgroundEditSectionId,
  sectionDecorationEdit,
  editingId,
  requestInlineEditFinishRef,
  elementRefs,
  backgroundEditNodeRefs,
  normalizarAltoModo,
  ALTURA_PANTALLA_EDITOR,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  setBackgroundEditSectionId,
  setIsBackgroundEditInteracting,
  setSectionDecorationEdit,
  setSeccionActivaId,
  setMostrarPanelZ,
  selectionClearPolicy,
  canManageSite = false,
}) {
  const canUseAdvancedDecorations = canManageSite === true;

  useEffect(() => {
    if (canUseAdvancedDecorations) return;
    setSectionDecorationEdit((previous) =>
      previous?.sectionId && previous?.decorationId ? null : previous
    );
  }, [canUseAdvancedDecorations, setSectionDecorationEdit]);

  useEffect(() => {
    setSectionDecorationEdit((previous) => {
      if (!previous?.sectionId || !previous?.decorationId) return previous;
      const targetSection = secciones.find(
        (section) => section?.id === previous.sectionId
      );
      if (!targetSection) return null;
      const backgroundModel = normalizeSectionBackgroundModel(targetSection, {
        sectionHeight: targetSection.altura,
      });
      if (previous.kind === "edge-decoration") {
        const safeSlot =
          previous.slot === "bottom" ? "bottom" : previous.slot === "top" ? "top" : "";
        const decoration = safeSlot
          ? backgroundModel.decoracionesBorde?.[safeSlot]
          : null;
        return decoration?.src && decoration.enabled !== false ? previous : null;
      }
      const decoration = backgroundModel.decoraciones.find(
        (item) => item.id === previous.decorationId
      );
      return decoration ? previous : null;
    });
  }, [secciones, setSectionDecorationEdit]);

  useEffect(() => {
    setSectionDecorationEdit((previous) => {
      if (!previous?.sectionId || !seccionActivaId) return previous;
      if (previous.sectionId === seccionActivaId) return previous;
      return null;
    });
  }, [seccionActivaId, setSectionDecorationEdit]);

  const cambiarColorFondoSeccion = useCallback(
    (seccionId, nuevoColor) => {
      setSectionDecorationEdit((previous) =>
        previous?.sectionId === seccionId ? null : previous
      );
      setSecciones((previous) =>
        applySectionSolidBackground(previous, seccionId, nuevoColor)
      );
    },
    [setSecciones, setSectionDecorationEdit]
  );

  const usarImagenComoDecoracionFondo = useCallback(
    (elementoImagen) => {
      const safeImage =
        elementoImagen && typeof elementoImagen === "object"
          ? elementoImagen
          : null;
      const selectedNode = safeImage?.id
        ? elementRefs.current?.[safeImage.id] || null
        : null;
      const targetSectionIndex = seccionesOrdenadas.findIndex(
        (section) => section?.id === safeImage?.seccionId
      );
      const targetSection =
        targetSectionIndex >= 0 ? seccionesOrdenadas[targetSectionIndex] : null;
      const sectionOffsetY =
        targetSectionIndex >= 0
          ? calcularOffsetY(seccionesOrdenadas, targetSectionIndex, altoCanvas)
          : 0;
      const fallbackLocalY =
        normalizarAltoModo(targetSection?.altoModo) === "pantalla" &&
        Number.isFinite(Number(safeImage?.yNorm))
          ? Number(safeImage.yNorm) * ALTURA_PANTALLA_EDITOR
          : safeImage?.y;
      const renderedImageSnapshot =
        safeImage && targetSection
          ? {
              ...safeImage,
              x:
                typeof selectedNode?.x === "function" &&
                Number.isFinite(Number(selectedNode.x()))
                  ? Number(selectedNode.x())
                  : safeImage.x,
              y:
                typeof selectedNode?.y === "function" &&
                Number.isFinite(Number(selectedNode.y()))
                  ? Number(selectedNode.y()) - sectionOffsetY
                  : fallbackLocalY,
              width:
                typeof selectedNode?.width === "function" &&
                Number.isFinite(Number(selectedNode.width()))
                  ? Number(selectedNode.width())
                  : safeImage.width,
              height:
                typeof selectedNode?.height === "function" &&
                Number.isFinite(Number(selectedNode.height()))
                  ? Number(selectedNode.height())
                  : safeImage.height,
              scaleX:
                typeof selectedNode?.scaleX === "function" &&
                Number.isFinite(Number(selectedNode.scaleX()))
                  ? Number(selectedNode.scaleX())
                  : safeImage.scaleX,
              scaleY:
                typeof selectedNode?.scaleY === "function" &&
                Number.isFinite(Number(selectedNode.scaleY()))
                  ? Number(selectedNode.scaleY())
                  : safeImage.scaleY,
              rotation:
                typeof selectedNode?.rotation === "function" &&
                Number.isFinite(Number(selectedNode.rotation()))
                  ? Number(selectedNode.rotation())
                  : safeImage.rotation,
            }
          : elementoImagen;

      convertirImagenEnDecoracionFondo({
        elementoImagen: renderedImageSnapshot,
        secciones,
        objetos,
        setSecciones,
        setObjetos,
        setElementosSeleccionados,
        setSeccionActivaId,
        setSectionDecorationEdit,
        setMostrarPanelZ,
      });
    },
    [
      ALTURA_PANTALLA_EDITOR,
      altoCanvas,
      elementRefs,
      normalizarAltoModo,
      objetos,
      secciones,
      seccionesOrdenadas,
      setElementosSeleccionados,
      setObjetos,
      setSeccionActivaId,
      setSecciones,
      setSectionDecorationEdit,
      setMostrarPanelZ,
    ]
  );

  const usarImagenComoDecoracionBorde = useCallback(
    (elementoImagen, slot) => {
      if (editingId) {
        requestInlineEditFinishRef.current?.("edge-decoration-conversion");
      }

      const result = convertImageObjectToSectionEdgeDecorationState({
        sections: secciones,
        objects: objetos,
        imageObject: elementoImagen,
        slot,
      });
      if (!result?.decoration || !Array.isArray(result.sections)) return;

      setSecciones(result.sections);
      setObjetos(result.objects);
      setElementosSeleccionados([]);
      setSeccionActivaId?.(result.sectionId);
      selectionClearPolicy?.prepareForBackgroundDecorationEdit?.();
      setSectionDecorationEdit(null);
      setMostrarPanelZ(false);
    },
    [
      editingId,
      objetos,
      requestInlineEditFinishRef,
      secciones,
      selectionClearPolicy,
      setElementosSeleccionados,
      setObjetos,
      setSeccionActivaId,
      setSecciones,
      setSectionDecorationEdit,
      setMostrarPanelZ,
    ]
  );

  const registerBackgroundEditNode = useCallback(
    (sectionId, node) => {
      const safeSectionId = String(sectionId || "").trim();
      if (!safeSectionId) return;

      if (node) {
        backgroundEditNodeRefs.current[safeSectionId] = node;
        return;
      }

      delete backgroundEditNodeRefs.current[safeSectionId];
    },
    [backgroundEditNodeRefs]
  );

  const handleBackgroundEditInteractionChange = useCallback(
    (isActive) => {
      setIsBackgroundEditInteracting(Boolean(isActive));
    },
    [setIsBackgroundEditInteracting]
  );

  const requestBackgroundEdit = useCallback(
    (sectionId) => {
      const safeSectionId = String(sectionId || "").trim();
      if (!safeSectionId) return;

      if (editingId) {
        requestInlineEditFinishRef.current?.("section-base-image-edit");
      }

      setMostrarPanelZ(false);
      selectionClearPolicy?.prepareForSectionBackgroundEdit?.();
      setSectionDecorationEdit(null);
      setIsBackgroundEditInteracting(false);
      setSeccionActivaId(safeSectionId);
      setBackgroundEditSectionId(safeSectionId);
    },
    [
      editingId,
      requestInlineEditFinishRef,
      setBackgroundEditSectionId,
      setIsBackgroundEditInteracting,
      selectionClearPolicy,
      setSectionDecorationEdit,
      setSeccionActivaId,
      setMostrarPanelZ,
    ]
  );

  const activeBackgroundDecorationMenuItem = useMemo(() => {
    if (!canUseAdvancedDecorations) return null;
    if (!sectionDecorationEdit?.sectionId || !sectionDecorationEdit?.decorationId) {
      return null;
    }
    if (sectionDecorationEdit.kind === "edge-decoration") {
      return null;
    }

    const sectionIndex = seccionesOrdenadas.findIndex(
      (section) => section?.id === sectionDecorationEdit.sectionId
    );
    if (sectionIndex === -1) return null;

    const targetSection = seccionesOrdenadas[sectionIndex];
    const sectionHeight = Math.max(1, Number(targetSection.altura) || 1);
    const backgroundModel = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight,
    });
    const decoration = backgroundModel.decoraciones.find(
      (item) => item.id === sectionDecorationEdit.decorationId
    );
    if (!decoration) return null;

    const offsetY = calcularOffsetY(seccionesOrdenadas, sectionIndex, altoCanvas);
    return {
      id: `decoracion-fondo:${targetSection.id}:${decoration.id}`,
      tipo: "decoracion-fondo",
      nombre: decoration.nombre || "Decoración",
      src: decoration.src,
      seccionId: targetSection.id,
      decorationId: decoration.id,
      x: decoration.x,
      y: offsetY + decoration.y,
      width: decoration.width,
      height: decoration.height,
      rotation: decoration.rotation || 0,
      backgroundMotionMode: backgroundModel.parallax || "none",
    };
  }, [altoCanvas, canUseAdvancedDecorations, sectionDecorationEdit, seccionesOrdenadas]);

  const activeEdgeDecorationMenuItem = useMemo(() => {
    if (!canUseAdvancedDecorations) return null;
    if (
      sectionDecorationEdit?.kind !== "edge-decoration" ||
      !sectionDecorationEdit?.sectionId ||
      !sectionDecorationEdit?.slot
    ) {
      return null;
    }

    const slot =
      sectionDecorationEdit.slot === "bottom"
        ? "bottom"
        : sectionDecorationEdit.slot === "top"
          ? "top"
          : "";
    if (!slot) return null;

    const sectionIndex = seccionesOrdenadas.findIndex(
      (section) => section?.id === sectionDecorationEdit.sectionId
    );
    if (sectionIndex === -1) return null;

    const targetSection = seccionesOrdenadas[sectionIndex];
    const sectionHeight = Math.max(1, Number(targetSection.altura) || 1);
    const backgroundModel = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight,
    });
    const decoration = backgroundModel.decoracionesBorde?.[slot];
    if (!decoration?.src || decoration.enabled === false) return null;

    const renderBox = resolveEdgeDecorationCanvasRenderBox(decoration, {
      slot,
      sectionHeight,
      canvasWidth: 800,
    });
    const offsetY = calcularOffsetY(seccionesOrdenadas, sectionIndex, altoCanvas);
    const offsetPx = Number.isFinite(Number(decoration.offsetDesktopPx))
      ? Number(decoration.offsetDesktopPx)
      : 0;
    const localY =
      slot === "bottom"
        ? sectionHeight - renderBox.bandHeight - offsetPx
        : offsetPx;

    return {
      id: `decoracion-borde:${targetSection.id}:${slot}`,
      tipo: "decoracion-borde",
      nombre: decoration.nombre || (slot === "top" ? "Decoración arriba" : "Decoración abajo"),
      src: decoration.src,
      seccionId: targetSection.id,
      decorationId: `edge:${slot}`,
      slot,
      enabled: decoration.enabled !== false,
      x: 0,
      y: offsetY + localY,
      width: renderBox.bandWidth,
      height: renderBox.bandHeight,
      rotation: 0,
    };
  }, [altoCanvas, canUseAdvancedDecorations, sectionDecorationEdit, seccionesOrdenadas]);

  const activeBaseBackgroundMenuItem = useMemo(() => {
    if (!backgroundEditSectionId) return null;

    const targetSection = seccionesOrdenadas.find(
      (section) => section?.id === backgroundEditSectionId
    );
    if (!targetSection) return null;

    const backgroundModel = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight: targetSection.altura,
    });
    if (
      backgroundModel.base.fondoTipo !== "imagen" ||
      !backgroundModel.base.fondoImagen
    ) {
      return null;
    }

    return {
      id: `imagen-fondo-seccion:${targetSection.id}`,
      tipo: "imagen-fondo-seccion",
      nombre: "Imagen de fondo",
      src: backgroundModel.base.fondoImagen,
      seccionId: targetSection.id,
      backgroundMotionMode: backgroundModel.parallax || "none",
    };
  }, [backgroundEditSectionId, seccionesOrdenadas]);

  const activeBackgroundMotionSectionId =
    activeBackgroundDecorationMenuItem?.seccionId ||
    activeBaseBackgroundMenuItem?.seccionId ||
    null;

  const groupingSelection = useMemo(
    () =>
      resolveGroupingSelectionCandidate({
        objetos,
        selectedIds: elementosSeleccionados,
      }),
    [elementosSeleccionados, objetos]
  );
  const multiSelectionMenu = useMemo(
    () =>
      resolveMultiSelectionMenuCandidate({
        objetos,
        selectedIds: elementosSeleccionados,
      }),
    [elementosSeleccionados, objetos]
  );

  const overlaySelection = useMemo(() => {
    if (activeEdgeDecorationMenuItem) {
      return {
        kind: "section-edge-decoration",
        menuItem: activeEdgeDecorationMenuItem,
      };
    }

    if (activeBackgroundDecorationMenuItem) {
      return {
        kind: "background-decoration",
        menuItem: activeBackgroundDecorationMenuItem,
      };
    }

    if (activeBaseBackgroundMenuItem) {
      return {
        kind: "section-base-image",
        sectionId: activeBaseBackgroundMenuItem.seccionId,
        menuItem: activeBaseBackgroundMenuItem,
      };
    }

    if (elementosSeleccionados.length === 1) {
      const selectedObject =
        objetos.find((item) => item.id === elementosSeleccionados[0]) || null;
      if (!selectedObject) return null;

      return {
        kind: "canvas-object",
        objectId: selectedObject.id,
        menuItem: selectedObject,
      };
    }

    if (!multiSelectionMenu.eligible) return null;

    return {
      kind: "multi-selection",
      selectedIds: multiSelectionMenu.selectedIds,
      selectedObjects: multiSelectionMenu.selectedObjects,
      canGroupSelection: groupingSelection.eligible === true,
      menuItem: null,
    };
  }, [
    activeEdgeDecorationMenuItem,
    activeBackgroundDecorationMenuItem,
    activeBaseBackgroundMenuItem,
    elementosSeleccionados,
    groupingSelection.eligible,
    multiSelectionMenu.eligible,
    multiSelectionMenu.selectedIds,
    multiSelectionMenu.selectedObjects,
    objetos,
  ]);

  const handleDesanclarImagenFondoBase = useCallback(() => {
    if (!activeBaseBackgroundMenuItem?.seccionId) return;

    setSectionDecorationEdit(null);
    setBackgroundEditSectionId(null);
    setIsBackgroundEditInteracting(false);
    setSeccionActivaId(activeBaseBackgroundMenuItem.seccionId);
    desanclarImagenDeFondo({
      seccionId: activeBaseBackgroundMenuItem.seccionId,
      secciones,
      objetos,
      setSecciones,
      setObjetos,
      setElementosSeleccionados,
    });
    setMostrarPanelZ(false);
  }, [
    activeBaseBackgroundMenuItem,
    objetos,
    secciones,
    setBackgroundEditSectionId,
    setElementosSeleccionados,
    setIsBackgroundEditInteracting,
    setObjetos,
    setSeccionActivaId,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const handleFinalizarAjusteFondoBase = useCallback(() => {
    setBackgroundEditSectionId(null);
    setIsBackgroundEditInteracting(false);
    setMostrarPanelZ(false);
  }, [
    setBackgroundEditSectionId,
    setIsBackgroundEditInteracting,
    setMostrarPanelZ,
  ]);

  const handleConvertirDecoracionFondoEnImagen = useCallback(() => {
    if (!activeBackgroundDecorationMenuItem) return;

    convertirDecoracionFondoEnImagen({
      seccionId: activeBackgroundDecorationMenuItem.seccionId,
      decorationId: activeBackgroundDecorationMenuItem.decorationId,
      secciones,
      objetos,
      setSecciones,
      setObjetos,
      setElementosSeleccionados,
      setSectionDecorationEdit,
      setSeccionActivaId,
    });
    setMostrarPanelZ(false);
  }, [
    activeBackgroundDecorationMenuItem,
    objetos,
    secciones,
    setElementosSeleccionados,
    setObjetos,
    setSeccionActivaId,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const handleEliminarDecoracionFondo = useCallback(() => {
    if (!activeBackgroundDecorationMenuItem) return;

    setSecciones((previous) =>
      removeBackgroundDecoration(
        previous,
        activeBackgroundDecorationMenuItem.seccionId,
        activeBackgroundDecorationMenuItem.decorationId
      )
    );
    setSectionDecorationEdit((previous) => {
      if (
        previous?.sectionId === activeBackgroundDecorationMenuItem.seccionId &&
        previous?.decorationId === activeBackgroundDecorationMenuItem.decorationId
      ) {
        return null;
      }
      return previous;
    });
    setMostrarPanelZ(false);
  }, [
    activeBackgroundDecorationMenuItem,
    setSecciones,
    setSectionDecorationEdit,
    setMostrarPanelZ,
  ]);

  const handleToggleDecoracionBorde = useCallback(
    (slot) => {
      if (!activeEdgeDecorationMenuItem) return;
      const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
      if (!safeSlot) return;

      setSecciones((previous) =>
        setSectionEdgeDecorationEnabled(
          previous,
          activeEdgeDecorationMenuItem.seccionId,
          safeSlot,
          activeEdgeDecorationMenuItem.enabled === false
        )
      );
      setMostrarPanelZ(false);
    },
    [activeEdgeDecorationMenuItem, setSecciones, setMostrarPanelZ]
  );

  const handleEliminarDecoracionBorde = useCallback(
    (slot) => {
      if (!activeEdgeDecorationMenuItem) return;
      const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
      if (!safeSlot) return;

      setSecciones((previous) =>
        removeSectionEdgeDecoration(
          previous,
          activeEdgeDecorationMenuItem.seccionId,
          safeSlot
        )
      );
      setSectionDecorationEdit((previous) => {
        if (
          previous?.kind === "edge-decoration" &&
          previous?.sectionId === activeEdgeDecorationMenuItem.seccionId &&
          previous?.slot === safeSlot
        ) {
          return null;
        }
        return previous;
      });
      setMostrarPanelZ(false);
    },
    [
      activeEdgeDecorationMenuItem,
      setSecciones,
      setSectionDecorationEdit,
      setMostrarPanelZ,
    ]
  );

  const handleFinalizarAjusteDecoracionFondo = useCallback(() => {
    setSectionDecorationEdit(null);
    setMostrarPanelZ(false);
  }, [setSectionDecorationEdit, setMostrarPanelZ]);

  const handleActualizarMovimientoDecoracionFondo = useCallback(
    (nextMotionMode) => {
      if (!activeBackgroundMotionSectionId) return;

      const normalizedMode =
        String(nextMotionMode || "").trim().toLowerCase() === "none"
          ? "none"
          : "dynamic";

      setSecciones((previous) =>
        updateBackgroundDecorationsParallax(
          previous,
          activeBackgroundMotionSectionId,
          normalizedMode,
          {
            sectionHeight: secciones.find(
              (section) => section?.id === activeBackgroundMotionSectionId
            )?.altura,
          }
        )
      );
    },
    [activeBackgroundMotionSectionId, secciones, setSecciones]
  );

  useEffect(() => {
    if (!backgroundEditSectionId) {
      setIsBackgroundEditInteracting(false);
      return;
    }

    const targetSection = secciones.find(
      (section) => section?.id === backgroundEditSectionId
    );
    if (!targetSection) {
      setBackgroundEditSectionId(null);
      setIsBackgroundEditInteracting(false);
      return;
    }

    const baseBackground = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight: targetSection.altura,
    }).base;
    if (baseBackground.fondoTipo !== "imagen" || !baseBackground.fondoImagen) {
      setBackgroundEditSectionId(null);
      setIsBackgroundEditInteracting(false);
      return;
    }

    if (sectionDecorationEdit?.sectionId && sectionDecorationEdit?.decorationId) {
      setBackgroundEditSectionId(null);
      setIsBackgroundEditInteracting(false);
      return;
    }

    if (elementosSeleccionados.length > 0) {
      setBackgroundEditSectionId(null);
      setIsBackgroundEditInteracting(false);
      return;
    }

    if (seccionActivaId && seccionActivaId !== backgroundEditSectionId) {
      setBackgroundEditSectionId(null);
      setIsBackgroundEditInteracting(false);
    }
  }, [
    backgroundEditSectionId,
    elementosSeleccionados.length,
    seccionActivaId,
    secciones,
    sectionDecorationEdit,
    setBackgroundEditSectionId,
    setIsBackgroundEditInteracting,
  ]);

  useEffect(() => {
    if (overlaySelection) return;
    setMostrarPanelZ(false);
  }, [overlaySelection, setMostrarPanelZ]);

  return {
    cambiarColorFondoSeccion,
    usarImagenComoDecoracionFondo,
    usarImagenComoDecoracionBorde,
    registerBackgroundEditNode,
    handleBackgroundEditInteractionChange,
    requestBackgroundEdit,
    activeBackgroundDecorationMenuItem,
    activeBaseBackgroundMenuItem,
    overlaySelection,
    handleDesanclarImagenFondoBase,
    handleFinalizarAjusteFondoBase,
    handleConvertirDecoracionFondoEnImagen,
    handleEliminarDecoracionFondo,
    handleToggleDecoracionBorde,
    handleEliminarDecoracionBorde,
    handleFinalizarAjusteDecoracionFondo,
    handleActualizarMovimientoDecoracionFondo,
  };
}
