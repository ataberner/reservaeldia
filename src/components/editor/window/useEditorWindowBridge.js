// src/components/editor/window/useEditorWindowBridge.js
import { useEffect, useRef } from "react";
import { registerCountdownAuditContext } from "@/domain/countdownAudit/runtime";
import { isCountdownVisible } from "@/domain/eventDetails/countdownEventDetails";
import { canMutateSection } from "@/domain/editor/protectedSections";
import {
  applySectionBaseImage,
  normalizeSectionBackgroundModel,
} from "@/domain/sections/backgrounds";
import {
  CANVAS_EDITOR_COMPATIBILITY_KEYS,
  EDITOR_BRIDGE_EVENTS,
} from "@/lib/editorBridgeContracts";
import {
  clearEditorSnapshotResolvers,
  ensureEditorSnapshotAdapter,
  readEditorObjectSnapshot,
  readEditorSectionInfo,
  syncEditorSnapshotResolvers,
} from "@/lib/editorSnapshotAdapter";
import {
  resolveDynamicFieldScrollTarget,
} from "@/domain/templates/dynamicFieldTargets";

/**
 * Puente con window:
 * - window.canvasEditor
 * - window.__getSeccionInfo
 * - window.__getObjById
 */
export default function useEditorWindowBridge({
  seccionesOrdenadas,
  secciones,
  setSecciones,
  seccionActivaId,
  objetos,
  altoCanvas,
  readOnly = false,
  calcularOffsetY,
  cambiarColorFondoSeccion,
  onDeshacer,
  onRehacer,
  historialLength,
  futurosLength,
  stageRef,
  elementRefs,
  getTemplateAuthoringSnapshot,
  getTemplateAuthoringStatus,
  updateTemplateAuthoringDefault,
  updateTemplateAuthoringDateTextFormat,
  updateTemplateAuthoringEventPersonNames,
  updateTemplateAuthoringEventLocation,
  updateTemplateAuthoringEventTimes,
  eventDetailsConfig,
  updateEventDetailsConfig,
  repairTemplateAuthoringState,
  ensureInlineEditSettledBeforeCriticalAction,
  flushPersistenceNow,
  selectionRuntime,
}) {
  const EXTRA_CANVAS_EDITOR_COMPATIBILITY_KEYS = [
    "cambiarColorFondoSeccion",
    "secciones",
  ];
  const templateAuthoringBridgeReadyNotifiedRef = useRef(false);

  const mergeCanvasEditor = (patch = {}) => {
    if (typeof window === "undefined") return;
    // Compatibility boundary: preview/header tooling still reads window.canvasEditor.
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      ...patch,
    };
  };

  const clearCanvasEditorKeys = (keys = []) => {
    if (typeof window === "undefined") return;
    if (!window.canvasEditor || typeof window.canvasEditor !== "object") return;
    keys.forEach((key) => {
      if (key in window.canvasEditor) delete window.canvasEditor[key];
    });
    if (Object.keys(window.canvasEditor).length === 0) {
      delete window.canvasEditor;
    }
  };

  const resolveViewportScroll = () => {
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer || typeof window === "undefined") return null;

    const mainElement = stageContainer.closest?.("main");
    if (mainElement) return mainElement;

    let current = stageContainer.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const overflowY = String(style.overflowY || "").toLowerCase();
      const overflow = String(style.overflow || "").toLowerCase();
      const isScrollable =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay" ||
        overflow === "auto" ||
        overflow === "scroll" ||
        overflow === "overlay";

      if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }
      current = current.parentElement;
    }

    return window;
  };

  const resolveStageRect = () => {
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    const stageRect = stageContainer?.getBoundingClientRect?.();
    if (!stage || !stageContainer || !stageRect) return null;
    if (!Number.isFinite(stageRect.top) || !Number.isFinite(stageRect.height)) {
      return null;
    }
    return { stage, stageContainer, stageRect };
  };

  const resolveTargetViewportRect = (target) => {
    const safeTarget = target && typeof target === "object" ? target : null;
    const targetObject = safeTarget?.object || null;
    const objectId = String(safeTarget?.objectId || targetObject?.id || "").trim();
    if (!objectId) return null;

    const stageState = resolveStageRect();
    if (!stageState) return null;

    const { stage, stageRect } = stageState;
    const node = elementRefs?.current?.[objectId] || null;
    const stageWidth =
      Number(stage.width?.()) || Number(stage.attrs?.width) || 800;
    const stageHeight =
      Number(stage.height?.()) || Number(altoCanvas) || Number(stage.attrs?.height) || 1;
    const scaleX = stageWidth > 0 ? Number(stageRect.width || 0) / stageWidth : 1;
    const scaleY = stageHeight > 0 ? Number(stageRect.height || 0) / stageHeight : scaleX;

    if (node && typeof node.getClientRect === "function") {
      const nodeRect = node.getClientRect({ relativeTo: stage });
      if (
        nodeRect &&
        Number.isFinite(nodeRect.y) &&
        Number.isFinite(nodeRect.height)
      ) {
        const top = stageRect.top + nodeRect.y * scaleY;
        const height = Math.max(1, Number(nodeRect.height) * scaleY);
        return {
          top,
          bottom: top + height,
          height,
        };
      }
    }

    const sectionId = String(targetObject?.seccionId || "").trim();
    const rawY = Number(targetObject?.y);
    if (!sectionId || !Number.isFinite(rawY)) return null;

    const index = Array.isArray(seccionesOrdenadas)
      ? seccionesOrdenadas.findIndex((section) => section?.id === sectionId)
      : -1;
    if (index < 0) return null;

    const offsetY = calcularOffsetY(seccionesOrdenadas, index);
    const logicalTop = offsetY + rawY;
    const rawHeight =
      Number(targetObject?.height) ||
      Number(targetObject?.alto) ||
      Number(targetObject?.fontSize) ||
      Number(targetObject?.tamano) ||
      32;
    const top = stageRect.top + logicalTop * scaleY;
    const height = Math.max(1, rawHeight * scaleY);

    return {
      top,
      bottom: top + height,
      height,
    };
  };

  const scrollToViewportRect = (targetRect, options = {}) => {
    if (typeof window === "undefined") return false;
    if (!targetRect) return false;

    const viewport = resolveViewportScroll();
    if (!viewport) return false;

    let viewportTop = 0;
    let viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let currentScroll = window.scrollY || window.pageYOffset || 0;

    if (viewport !== window) {
      const viewportRect = viewport.getBoundingClientRect?.();
      if (!viewportRect) return false;
      viewportTop = viewportRect.top;
      viewportHeight = viewport.clientHeight || (viewportRect.bottom - viewportRect.top) || 0;
      currentScroll = viewport.scrollTop || 0;
    }

    if (!(viewportHeight > 0)) return false;

    const targetCenter = (targetRect.top + targetRect.bottom) / 2;
    const desiredCenter = viewportTop + viewportHeight / 2;
    const targetScroll = Math.max(0, currentScroll + targetCenter - desiredCenter);
    if (Math.abs(targetScroll - currentScroll) < 2) return true;

    const behavior = options?.behavior || "smooth";
    if (viewport === window) {
      window.scrollTo({ top: Math.round(targetScroll), behavior });
    } else {
      viewport.scrollTo({ top: Math.round(targetScroll), behavior });
    }

    return true;
  };

  const resolveObjectScrollTarget = (objectId) => {
    const safeObjectId = String(objectId || "").trim();
    if (!safeObjectId) return null;
    const targetObject =
      (Array.isArray(objetos) ? objetos : []).find((item) => item?.id === safeObjectId) || null;
    if (!targetObject) return null;
    return {
      objectId: safeObjectId,
      object: targetObject,
    };
  };

  const scrollToEditorObjectById = (objectId, options = {}) => {
    const target = resolveObjectScrollTarget(objectId);
    if (!target) return false;
    const targetRect = resolveTargetViewportRect(target);
    return scrollToViewportRect(targetRect, options);
  };

  const focusEditorObjectById = (objectId, options = {}) => {
    const target = resolveObjectScrollTarget(objectId);
    if (!target) return false;

    const shouldSelect = options?.select !== false;
    if (shouldSelect && typeof selectionRuntime?.setCommittedSelection === "function") {
      selectionRuntime.setCommittedSelection([target.objectId], {
        source: options?.source || "editor-object-focus",
      });
      selectionRuntime.clearTransientState?.({
        clearPreselection: true,
        clearMarquee: true,
        clearPendingDrag: true,
        clearDragVisual: true,
      });
    }

    if (options?.scroll === false) return true;
    const targetRect = resolveTargetViewportRect(target);
    return scrollToViewportRect(targetRect, options);
  };

  const scrollToDynamicFieldTarget = (fieldKeys, options = {}) => {
    if (typeof window === "undefined") return false;
    const snapshot =
      typeof getTemplateAuthoringSnapshot === "function"
        ? getTemplateAuthoringSnapshot()
        : null;
    const target = resolveDynamicFieldScrollTarget({
      fieldsSchema: snapshot?.fieldsSchema,
      fieldKeys,
      objetos,
    });
    if (!target) return false;

    const targetRect = resolveTargetViewportRect(target);
    if (!targetRect) return false;

    return scrollToViewportRect(targetRect, options);
  };

  const replaceFirstSectionBackgroundImage = (imageUrl, options = {}) => {
    if (typeof window === "undefined" || readOnly) return false;
    if (typeof setSecciones !== "function") return false;
    const src = String(imageUrl || "").trim();
    if (!src) return false;
    const expectedSectionId = String(options?.sectionId || options?.expectedSectionId || "").trim();

    const firstSection = Array.isArray(seccionesOrdenadas)
      ? seccionesOrdenadas[0]
      : null;
    const backgroundModel = normalizeSectionBackgroundModel(firstSection, {
      sectionHeight: firstSection?.altura,
    });
    if (
      !firstSection?.id ||
      (expectedSectionId && String(firstSection.id) !== expectedSectionId) ||
      backgroundModel.base.fondoTipo !== "imagen" ||
      !backgroundModel.base.fondoImagen ||
      !canMutateSection(firstSection)
    ) {
      return false;
    }

    setSecciones((previous) => {
      const current = Array.isArray(previous) ? previous : [];
      const currentFirstSection = [...current].sort(
        (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
      )[0];
      const currentBackgroundModel = normalizeSectionBackgroundModel(currentFirstSection, {
        sectionHeight: currentFirstSection?.altura,
      });

      if (
        !currentFirstSection?.id ||
        (expectedSectionId && String(currentFirstSection.id) !== expectedSectionId) ||
        currentBackgroundModel.base.fondoTipo !== "imagen" ||
        !currentBackgroundModel.base.fondoImagen ||
        !canMutateSection(currentFirstSection)
      ) {
        return previous;
      }

      return applySectionBaseImage(
        current,
        currentFirstSection.id,
        src,
        { preservePlacement: options?.preservePlacement !== false }
      );
    });

    return true;
  };

  if (typeof window !== "undefined") {
    const snapshot = ensureEditorSnapshotAdapter(window);
    mergeCanvasEditor({
      cambiarColorFondoSeccion,
      snapshot,
    });
  }

  useEffect(() => {
    const snapshot = ensureEditorSnapshotAdapter(window);
    const templateAuthoringSnapshotReader =
      typeof getTemplateAuthoringSnapshot === "function"
        ? getTemplateAuthoringSnapshot
        : undefined;

    mergeCanvasEditor({
      cambiarColorFondoSeccion,
      snapshot,
      seccionActivaId,
      secciones,
      deshacer: onDeshacer,
      rehacer: onRehacer,
      stageRef: stageRef.current,
      getHistorial: () => ({ historial: historialLength, futuros: futurosLength }),
      getTemplateAuthoringSnapshot: templateAuthoringSnapshotReader,
      scrollToDynamicFieldTarget,
      scrollToEditorObjectById,
      focusEditorObjectById,
      replaceFirstSectionBackgroundImage,
      updateTemplateAuthoringDefault:
        typeof updateTemplateAuthoringDefault === "function"
          ? updateTemplateAuthoringDefault
          : undefined,
      updateTemplateAuthoringDateTextFormat:
        typeof updateTemplateAuthoringDateTextFormat === "function"
          ? updateTemplateAuthoringDateTextFormat
          : undefined,
      updateTemplateAuthoringEventPersonNames:
        typeof updateTemplateAuthoringEventPersonNames === "function"
          ? updateTemplateAuthoringEventPersonNames
          : undefined,
      updateTemplateAuthoringEventLocation:
        typeof updateTemplateAuthoringEventLocation === "function"
          ? updateTemplateAuthoringEventLocation
          : undefined,
      updateTemplateAuthoringEventTimes:
        typeof updateTemplateAuthoringEventTimes === "function"
          ? updateTemplateAuthoringEventTimes
          : undefined,
      getEventDetailsConfig: () => eventDetailsConfig || null,
      updateEventDetailsConfig:
        typeof updateEventDetailsConfig === "function"
          ? updateEventDetailsConfig
          : undefined,
      getTemplateAuthoringStatus:
        typeof getTemplateAuthoringStatus === "function"
          ? getTemplateAuthoringStatus
          : undefined,
      repairTemplateAuthoringState:
        typeof repairTemplateAuthoringState === "function"
          ? repairTemplateAuthoringState
          : undefined,
      ensureInlineEditSettledBeforeCriticalAction:
        typeof ensureInlineEditSettledBeforeCriticalAction === "function"
          ? ensureInlineEditSettledBeforeCriticalAction
          : undefined,
      flushPersistenceNow:
        typeof flushPersistenceNow === "function"
          ? flushPersistenceNow
          : undefined,
    });

    if (!templateAuthoringSnapshotReader) {
      templateAuthoringBridgeReadyNotifiedRef.current = false;
      return;
    }

    if (templateAuthoringBridgeReadyNotifiedRef.current) return;
    templateAuthoringBridgeReadyNotifiedRef.current = true;

    let authoringDetail = { reason: "bridge-ready" };
    try {
      authoringDetail = {
        reason: "bridge-ready",
        ...(templateAuthoringSnapshotReader() || {}),
      };
    } catch {
      // The bridge remains registered even if a transient snapshot read fails.
    }

    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE, {
        detail: authoringDetail,
      })
    );
  }, [
    cambiarColorFondoSeccion,
    calcularOffsetY,
    objetos,
    readOnly,
    seccionActivaId,
    secciones,
    seccionesOrdenadas,
    setSecciones,
    altoCanvas,
    onDeshacer,
    onRehacer,
    historialLength,
    futurosLength,
    stageRef,
    elementRefs,
    getTemplateAuthoringSnapshot,
    getTemplateAuthoringStatus,
    updateTemplateAuthoringDefault,
    updateTemplateAuthoringDateTextFormat,
    updateTemplateAuthoringEventPersonNames,
    updateTemplateAuthoringEventLocation,
    updateTemplateAuthoringEventTimes,
    eventDetailsConfig,
    updateEventDetailsConfig,
    repairTemplateAuthoringState,
    ensureInlineEditSettledBeforeCriticalAction,
    flushPersistenceNow,
    selectionRuntime,
  ]);

  useEffect(() => {
    registerCountdownAuditContext({
      getCurrentCountdown: () =>
        (Array.isArray(objetos) ? objetos : []).find(
          (item) => item?.tipo === "countdown" && isCountdownVisible(item)
        ) || null,
      getCurrentSections: () => (Array.isArray(seccionesOrdenadas) ? [...seccionesOrdenadas] : []),
      stageRef,
      seccionActivaId,
    });
  }, [objetos, seccionesOrdenadas, stageRef, seccionActivaId]);

  useEffect(() => {
    const getSectionInfo = (id) => {
      try {
        const idx = seccionesOrdenadas.findIndex((s) => s.id === id);
        if (idx === -1) return null;

        const height = Number(
          seccionesOrdenadas[idx]?.altura ?? seccionesOrdenadas[idx]?.height ?? 400
        );

        const top = calcularOffsetY(seccionesOrdenadas, idx);
        return { idx, top, height };
      } catch {
        return null;
      }
    };
    const getObjectById = (id) => (objetos || []).find((o) => o.id === id) || null;

    syncEditorSnapshotResolvers({
      getSectionInfo,
      getObjectById,
    });

    window.__getSeccionInfo = (id) => readEditorSectionInfo(window, id);
    window.__getObjById = (id) => readEditorObjectSnapshot(window, id);

    return () => {
      clearEditorSnapshotResolvers(window);
      delete window.__getSeccionInfo;
      delete window.__getObjById;
    };
  }, [seccionesOrdenadas, calcularOffsetY, objetos]);

  useEffect(() => {
    return () => {
      clearCanvasEditorKeys([
        ...CANVAS_EDITOR_COMPATIBILITY_KEYS,
        ...EXTRA_CANVAS_EDITOR_COMPATIBILITY_KEYS,
        "getHistorial",
      ]);
    };
  }, []);

  // altoCanvas queda disponible para futuras extensiones del bridge.
  void altoCanvas;
}

