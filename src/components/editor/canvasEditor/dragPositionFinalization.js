import { canonicalizeFinalizedDragPatch } from "../../../domain/editor/canvasObjectPositioning.js";
import { resolveCanonicalNodePose } from "./konvaCanonicalPose.js";

// React-Konva does not reapply unchanged position props after an imperative drag.
// Reconcile the accepted pose before the caller freezes the drag overlay for settling.
export function finalizeDragPosition({
  node,
  resolveObjectStageY,
  onPositionReconciled,
  ...canonicalization
}) {
  const patch = canonicalizeFinalizedDragPatch(canonicalization);
  if (!node || typeof node.position !== "function") return patch;

  const acceptedObject = { ...canonicalization.objOriginal, ...patch };
  const livePose = resolveCanonicalNodePose(node, acceptedObject);
  const stageY = resolveObjectStageY(acceptedObject);
  const x = Number(acceptedObject.x);
  if (!Number.isFinite(x) || !Number.isFinite(stageY)) return patch;

  const position = {
    x: x + (livePose.usesOriginOffset ? livePose.rawOffsetX : 0),
    y: stageY + (livePose.usesOriginOffset ? livePose.rawOffsetY : 0),
  };
  if (position.x === livePose.rawX && position.y === livePose.rawY) return patch;

  node.position(position);
  onPositionReconciled?.();
  node.getLayer?.()?.batchDraw?.();
  return patch;
}
