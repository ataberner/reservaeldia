import { resolveTextBoxLayout } from "../../render/konva/textBoxLayout.js";

// Probe the live Konva typography without mutating the node or mounting a visual.
// Parent transforms include preserved groups; excluding Stage removes mobile/zoom scale.
export function measureTextContentBottom({ node, rootNode, object, rootObject, text }) {
  const stage = node?.getStage?.();
  const parent = node?.getParent?.();
  if (!stage || !parent || !rootNode || node.getClassName() !== "Text") return null;

  const probe = node.clone({
    text: String(text ?? "").replace(/[ \t]+$/gm, ""),
    width: undefined,
    wrap: "none",
  });
  try {
    const naturalWidth = Math.max(1, Math.ceil(probe.getTextWidth()));
    const layout = resolveTextBoxLayout(object, naturalWidth);
    probe.setAttrs({
      width: layout.width,
      wrap: layout.wrap,
      x: node.x() - node.offsetX() + layout.offsetX,
      offsetX: layout.offsetX,
    });
    const rect = probe.getClientRect({ skipTransform: true, skipShadow: true, skipStroke: true });
    const transform = parent.getAbsoluteTransform(stage).copy().multiply(probe.getTransform());
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];
    const sectionOffsetY = rootNode.y() - (Number(rootObject.y) || 0);
    return Math.max(...corners.map((point) => transform.point(point).y)) - sectionOffsetY;
  } finally {
    probe.destroy();
  }
}
