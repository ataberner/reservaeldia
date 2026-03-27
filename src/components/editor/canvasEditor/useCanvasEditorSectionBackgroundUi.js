import { useCallback, useEffect, useMemo } from "react";
import { calcularOffsetY } from "@/utils/layout";
import {
  desanclarImagenDeFondo,
  convertirDecoracionFondoEnImagen,
  convertirImagenEnDecoracionFondo,
} from "@/utils/accionesFondo";
import {
  applySectionSolidBackground,
  normalizeSectionBackgroundModel,
  removeBackgroundDecoration,
  updateBackgroundDecorationsParallax,
} from "@/domain/sections/backgrounds";

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
  setElementosPreSeleccionados,
  setSeleccionActiva,
  setInicioSeleccion,
  setAreaSeleccion,
  setBackgroundEditSectionId,
  setIsBackgroundEditInteracting,
  setSectionDecorationEdit,
  setSeccionActivaId,
  setMostrarPanelZ,
}) {
  useEffect(() => {
    setSectionDecorationEdit((previous) => {
      if (!previous?.sectionId || !previous?.decorationId) return previous;
      const targetSection = secciones.find(
        (section) => section?.id === previous.sectionId
      );
      if (!targetSection) return null;
      const decoration = normalizeSectionBackgroundModel(targetSection, {
        sectionHeight: targetSection.altura,
      }).decoraciones.find((item) => item.id === previous.decorationId);
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
      setElementosSeleccionados([]);
      setElementosPreSeleccionados([]);
      setSeleccionActiva(false);
      setInicioSeleccion(null);
      setAreaSeleccion(null);
      setSectionDecorationEdit(null);
      setIsBackgroundEditInteracting(false);
      setSeccionActivaId(safeSectionId);
      setBackgroundEditSectionId(safeSectionId);
    },
    [
      editingId,
      requestInlineEditFinishRef,
      setAreaSeleccion,
      setBackgroundEditSectionId,
      setElementosPreSeleccionados,
      setElementosSeleccionados,
      setInicioSeleccion,
      setIsBackgroundEditInteracting,
      setSectionDecorationEdit,
      setSeleccionActiva,
      setSeccionActivaId,
      setMostrarPanelZ,
    ]
  );

  const activeBackgroundDecorationMenuItem = useMemo(() => {
    if (!sectionDecorationEdit?.sectionId || !sectionDecorationEdit?.decorationId) {
      return null;
    }

    const sectionIndex = seccionesOrdenadas.findIndex(
      (section) => section?.id === sectionDecorationEdit.sectionId
    );
    if (sectionIndex === -1) return null;

    const targetSection = seccionesOrdenadas[sectionIndex];
    const backgroundModel = normalizeSectionBackgroundModel(targetSection, {
      sectionHeight: targetSection.altura,
    });
    const decoration = backgroundModel.decoraciones.find(
      (item) => item.id === sectionDecorationEdit.decorationId
    );
    if (!decoration) return null;

    const offsetY = calcularOffsetY(seccionesOrdenadas, sectionIndex, altoCanvas);
    return {
      id: `decoracion-fondo:${targetSection.id}:${decoration.id}`,
      tipo: "decoracion-fondo",
      nombre: decoration.nombre || "Decoracion del fondo",
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
  }, [altoCanvas, sectionDecorationEdit, seccionesOrdenadas]);

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

  const overlaySelection = useMemo(() => {
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

    if (elementosSeleccionados.length !== 1) return null;
    const selectedObject =
      objetos.find((item) => item.id === elementosSeleccionados[0]) || null;
    if (!selectedObject) return null;

    return {
      kind: "canvas-object",
      objectId: selectedObject.id,
      menuItem: selectedObject,
    };
  }, [
    activeBackgroundDecorationMenuItem,
    activeBaseBackgroundMenuItem,
    elementosSeleccionados,
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
    if (overlaySelection?.menuItem) return;
    setMostrarPanelZ(false);
  }, [overlaySelection, setMostrarPanelZ]);

  return {
    cambiarColorFondoSeccion,
    usarImagenComoDecoracionFondo,
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
    handleFinalizarAjusteDecoracionFondo,
    handleActualizarMovimientoDecoracionFondo,
  };
}
