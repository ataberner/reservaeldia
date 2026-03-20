// C:\Reservaeldia\src\drag\dragIndividual.js
import {
  getCanvasPointerDebugInfo,
  getCanvasSelectionDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  resetCanvasInteractionLogSample,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";
import { shouldSuppressIndividualDragForElement } from "@/drag/dragGrupal";

function resolveNodeId(node, fallback = null) {
  if (!node) return fallback;
  if (typeof node.id === "function") {
    return node.id() || fallback;
  }
  return node?.attrs?.id || fallback;
}

function buildPreviewSampleKey(nodeId) {
  return `drag-individual-preview:${nodeId || "unknown"}`;
}

export function startDragIndividual(e, dragStartPos) {
  const node = e?.currentTarget || e?.target || null;
  const nodeId = resolveNodeId(node);
  if (shouldSuppressIndividualDragForElement(nodeId)) {
    return;
  }
  const pointerPosition = e?.target?.getStage?.()?.getPointerPosition?.() || null;
  dragStartPos.current = pointerPosition;
  resetCanvasInteractionLogSample(buildPreviewSampleKey(nodeId));
  logSelectedDragDebug("drag:individual:start", {
    elementId: nodeId,
    pointer: getCanvasPointerDebugInfo(e),
    node: getKonvaNodeDebugInfo(node),
    dragStartPos: pointerPosition,
    selection: getCanvasSelectionDebugInfo(),
  });
  try { document.body.style.cursor = "grabbing"; } catch {}
}

export function previewDragIndividual(e, obj, onDragMovePersonalizado, dragMeta = null) {
  const node = e.currentTarget || e.target;
  const elementId = obj?.id || resolveNodeId(node);
  if (shouldSuppressIndividualDragForElement(elementId)) {
    return;
  }
  if (node?.position) {
    const nuevaPos = node.position();
    const sample = sampleCanvasInteractionLog(buildPreviewSampleKey(elementId), {
      firstCount: 3,
      throttleMs: 120,
    });

    if (sample.shouldLog) {
      logSelectedDragDebug("drag:individual:preview", {
        elementId,
        previewCount: sample.sampleCount,
        previewPosition: {
          x: nuevaPos.x,
          y: nuevaPos.y,
        },
        pointer: getCanvasPointerDebugInfo(e),
        node: getKonvaNodeDebugInfo(node),
        selection: getCanvasSelectionDebugInfo(),
      });
    }

    if (onDragMovePersonalizado) onDragMovePersonalizado(nuevaPos, obj.id, dragMeta);
  }
}

export function endDragIndividual(
  obj,
  node,
  onChange,
  onDragEndPersonalizado,
  hasDragged,
  dragMeta = null
) {
  const elementId = obj?.id || resolveNodeId(node);
  if (shouldSuppressIndividualDragForElement(elementId)) {
    resetCanvasInteractionLogSample(buildPreviewSampleKey(elementId));
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }
  const previewSampleKey = buildPreviewSampleKey(elementId);
  try { document.body.style.cursor = "default"; } catch {}

  if (node?.getAttr && node.getAttr("_muteNextEnd")) {
    logSelectedDragDebug("drag:individual:end-muted", {
      elementId,
      node: getKonvaNodeDebugInfo(node),
      selection: getCanvasSelectionDebugInfo(),
    });
    try { node.setAttr("_muteNextEnd", false); } catch {}
    resetCanvasInteractionLogSample(previewSampleKey);
    if (onDragEndPersonalizado) onDragEndPersonalizado(obj.id, dragMeta);
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }

  const ahora =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  if (
    window._skipIndividualEnd &&
    window._skipIndividualEnd.has(obj.id) &&
    (!window._skipUntil || ahora <= window._skipUntil)
  ) {
    logSelectedDragDebug("drag:individual:end-skipped", {
      elementId,
      node: getKonvaNodeDebugInfo(node),
      skipUntil: window._skipUntil || null,
      selection: getCanvasSelectionDebugInfo(),
    });
    try { window._skipIndividualEnd.delete(obj.id); } catch {}
    resetCanvasInteractionLogSample(previewSampleKey);
    if (onDragEndPersonalizado) onDragEndPersonalizado(obj.id, dragMeta);
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }

  const finalPose = resolveCanonicalNodePose(node, obj, {
    x: typeof node?.x === "function" ? node.x() : obj?.x,
    y: typeof node?.y === "function" ? node.y() : obj?.y,
    rotation:
      typeof node?.rotation === "function" ? node.rotation() : obj?.rotation,
  });
  const nextChange = {
    x: finalPose.x,
    y: finalPose.y,
    finalizoDrag: true,
    causa: "drag-individual"
  };

  logSelectedDragDebug("drag:individual:end", {
    elementId,
    node: getKonvaNodeDebugInfo(node),
    nextChange,
    selection: getCanvasSelectionDebugInfo(),
  });

  resetCanvasInteractionLogSample(previewSampleKey);
  onChange(obj.id, nextChange);
  if (onDragEndPersonalizado) onDragEndPersonalizado(obj.id, dragMeta);
  setTimeout(() => { hasDragged.current = false; }, 30);
}
