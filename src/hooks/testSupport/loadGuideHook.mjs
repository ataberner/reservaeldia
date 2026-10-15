import { readFile } from "node:fs/promises";

export const sourceUrl = (path) => new URL(`../../${path}.js`, import.meta.url).href;
export const toDataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

export async function moduleUrl(path, imports) {
  let source = await readFile(new URL(sourceUrl(path)), "utf8");
  for (const [specifier, replacement] of Object.entries(imports)) {
    source = source.replace(JSON.stringify(specifier), JSON.stringify(replacement));
  }
  return toDataUrl(source);
}

// Execute production geometry and snapping; replace only React's single-render
// lifecycle and logging. Browser tests cover real React/Konva integration.
export const debugUrl = toDataUrl(`
  export function isSelectedDragDebugEnabled() { return false; }
  export function logSelectedDragDebug() {}
  export function sampleCanvasInteractionLog() { return { shouldLog: false, sampleCount: 0 }; }
  export function getActiveCanvasBoxFlowSession() { return null; }
  export function buildTextGeometryContractRect(rect) { return rect; }
  export function evaluateTextGeometryContractRectAlignment() { return { pass: true }; }
  export function logTextGeometryContractInvariant() {}
  export function recordTextGeometryContractSnapshot() {}
  export function startCanvasDragPerfSpan() { return () => {}; }
  export function trackCanvasDragPerf() {}
`);
export const authorityUrl = await moduleUrl("components/editor/canvasEditor/konvaAuthoritativeBounds", {
  "@/components/editor/canvasEditor/konvaCanonicalPose": sourceUrl("components/editor/canvasEditor/konvaCanonicalPose"),
});
export const frameVisualsUrl = await moduleUrl("components/editor/textSystem/render/konva/selectionFrameVisuals", {
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
});
export const geometryUrl = await moduleUrl("components/editor/textSystem/render/konva/selectionBoundsGeometry", {
  "@/components/editor/textSystem/render/konva/selectionFrameVisuals": frameVisualsUrl,
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
  "@/components/editor/canvasEditor/selectedDragDebug": debugUrl,
  "@/components/editor/canvasEditor/canvasBoxFlowDebug": debugUrl,
  "@/components/editor/canvasEditor/textGeometryContractDebug": debugUrl,
  "@/domain/gallery/galleryLayoutPresets": sourceUrl("domain/gallery/galleryLayoutPresets"),
});
export const { resolveNodeSelectionRect, resolveGallerySelectionRect } = await import(geometryUrl);
export const { default: useGuiasCentrado } = await import(await moduleUrl("hooks/useGuiasCentrado", {
  react: toDataUrl(`
    export const useCallback = (callback) => callback;
    export const useRef = (current) => ({ current });
    export const useEffect = () => {};
  `),
  "@/components/editor/canvasEditor/canvasDragPerf": debugUrl,
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
  "@/components/editor/canvasEditor/selectedDragDebug": debugUrl,
  "@/components/editor/canvasEditor/textGeometryContractDebug": debugUrl,
  "@/components/editor/textSystem/render/konva/selectionBoundsGeometry": geometryUrl,
  "@/lib/editorAlignmentGuides": sourceUrl("lib/editorAlignmentGuides"),
}));
