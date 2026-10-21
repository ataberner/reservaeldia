import { Transform } from "konva/lib/Util.js";
import { moduleUrl, sourceUrl, toDataUrl } from "./loadGuideHook.mjs";

// Keep production geometry, snapping and diagnostic policy. Only React's
// single-render lifecycle is adapted; these are operation counts, not timings.
const selectedDebugUrl = await moduleUrl("components/editor/canvasEditor/selectedDragDebug", {
  "@/components/editor/canvasEditor/konvaCanonicalPose": sourceUrl("components/editor/canvasEditor/konvaCanonicalPose"),
});
const contractDebugUrl = await moduleUrl("components/editor/canvasEditor/textGeometryContractDebug", {
  "@/components/editor/canvasEditor/selectedDragDebug": selectedDebugUrl,
});
const authorityUrl = await moduleUrl("components/editor/canvasEditor/konvaAuthoritativeBounds", {
  "@/components/editor/canvasEditor/konvaCanonicalPose": sourceUrl("components/editor/canvasEditor/konvaCanonicalPose"),
});
const frameVisualsUrl = await moduleUrl("components/editor/textSystem/render/konva/selectionFrameVisuals", {
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
});
const geometryUrl = await moduleUrl("components/editor/textSystem/render/konva/selectionBoundsGeometry", {
  "@/components/editor/textSystem/render/konva/selectionFrameVisuals": frameVisualsUrl,
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
  "@/components/editor/canvasEditor/selectedDragDebug": selectedDebugUrl,
  "@/components/editor/canvasEditor/canvasBoxFlowDebug": sourceUrl("components/editor/canvasEditor/canvasBoxFlowDebug"),
  "@/components/editor/canvasEditor/textGeometryContractDebug": contractDebugUrl,
  "@/domain/gallery/galleryLayoutPresets": sourceUrl("domain/gallery/galleryLayoutPresets"),
});
const { default: useGuiasCentrado } = await import(await moduleUrl("hooks/useGuiasCentrado", {
  react: toDataUrl(`
    export const useCallback = (callback) => callback;
    export const useRef = (current) => ({ current });
    export const useEffect = () => {};
  `),
  "@/components/editor/canvasEditor/canvasDragPerf": sourceUrl("components/editor/canvasEditor/canvasDragPerf"),
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
  "@/components/editor/canvasEditor/selectedDragDebug": selectedDebugUrl,
  "@/components/editor/canvasEditor/textGeometryContractDebug": contractDebugUrl,
  "@/components/editor/textSystem/render/konva/selectionBoundsGeometry": geometryUrl,
  "@/lib/editorAlignmentGuides": sourceUrl("lib/editorAlignmentGuides"),
}));

export function withDiagnosticFlags(enabled, run) {
  const previousWindow = globalThis.window;
  const previousPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
  const savedConsole = { log: console.log, group: console.group, groupEnd: console.groupEnd };
  const logs = [];
  let now = 1000;
  Object.defineProperty(globalThis, "performance", {
    configurable: true, value: { now: () => now },
  });
  globalThis.window = {
    __DEBUG_SELECTED_DRAG: enabled,
    __DBG_CANVAS_BOX_FLOW: false,
    __DBG_CANVAS_DRAG_PERF: false,
  };
  console.log = (...args) => { logs.push(args); };
  console.group = (...args) => { logs.push(args); };
  console.groupEnd = () => {};
  try {
    return run({ logs, debugWindow: globalThis.window, setNow: (value) => { now = value; } });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousPerformance) Object.defineProperty(globalThis, "performance", previousPerformance);
    else delete globalThis.performance;
    Object.assign(console, savedConsole);
  }
}

function countedNode(stage, initial = {}) {
  const attrs = {
    x: 0, y: 0, width: 20, height: 20, rotation: 0,
    scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0,
    skewX: 0, skewY: 0, visible: true, ...initial,
  };
  const counts = { clientRect: 0, transform: 0, attrs: 0, attrKeys: 0, children: 0, getters: 0 };
  const countedAttrs = new Proxy(attrs, {
    ownKeys(target) { counts.attrKeys += Reflect.ownKeys(target).length; return Reflect.ownKeys(target); },
  });
  const node = {
    attrs: countedAttrs, counts,
    getStage: () => stage,
    getParent: () => stage,
    isVisible: () => attrs.visible,
    getChildren() { counts.children += 1; return []; },
    getAttrs() { counts.attrs += 1; return countedAttrs; },
    getAbsoluteTransform() {
      counts.transform += 1;
      return new Transform().translate(attrs.x, attrs.y)
        .rotate(attrs.rotation * Math.PI / 180)
        .scale(attrs.scaleX, attrs.scaleY)
        .translate(-attrs.offsetX, -attrs.offsetY);
    },
    getClientRect() {
      counts.clientRect += 1;
      return { x: attrs.x, y: attrs.y, width: attrs.width, height: attrs.height };
    },
  };
  for (const key of Object.keys(attrs)) {
    node[key] = (value) => {
      if (value !== undefined) attrs[key] = value;
      else counts.getters += 1;
      return attrs[key];
    };
  }
  return node;
}

export function makeScene({ elementCount = 2, movingType = "texto", visualScale = 1 } = {}) {
  const stage = {};
  const moving = countedNode(stage, { x: 102, y: 700 });
  const objects = [{ id: "moving", tipo: movingType, figura: "rect", seccionId: "section" }];
  const refs = { current: { moving } };
  const targets = [];
  for (let index = 1; index < elementCount; index += 1) {
    const id = `target-${index}`;
    objects.push({ id, tipo: "forma", figura: "rect", seccionId: "section" });
    const target = countedNode(stage, { x: 100 + (index - 1) * 100, y: 200 + (index - 1) * 100 });
    refs.current[id] = target;
    targets.push(target);
  }
  let lines = [];
  const request = { elementId: "moving", sessionId: "drag-counting", source: "counting-test" };
  const guides = useGuiasCentrado({
    anchoCanvas: 800, visualScale, elementMagnetRadius: 10, sectionMagnetRadius: 6,
    seccionesOrdenadas: [{ id: "section", altura: 4000 }],
    onGuideLinesChange: (next) => { lines = next; },
  });
  return {
    moving, targets, request, guides,
    prepare: () => guides.prepararGuias(request, objects, refs),
    evaluate: () => guides.mostrarGuias(request, objects, refs),
    lines: () => structuredClone(lines),
  };
}

export function resetCounts(nodes) {
  for (const node of nodes) for (const key of Object.keys(node.counts)) node.counts[key] = 0;
}

