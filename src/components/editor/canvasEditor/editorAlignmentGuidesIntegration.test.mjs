import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const hookSource = source("../../../hooks/useGuiasCentrado.js");
const editorSource = source("../../CanvasEditor.jsx");
const composerSource = source(
  "../textSystem/render/konva/CanvasStageContentComposer.jsx"
);
const guideLayerSource = source("./CanvasGuideLayer.jsx");
const rendererSource = source(
  "../textSystem/render/konva/ElementoCanvasRenderer.jsx"
);
const countdownSource = source("../countdown/CountdownKonva.jsx");
const gallerySource = source("../GaleriaKonva.jsx");
const individualDragSource = source("../../../drag/dragIndividual.js");

test("guide lifecycle clears synchronously on every invalid or terminal path", () => {
  assert.doesNotMatch(hookSource, /requestAnimationFrame\s*\(/);
  assert.match(
    hookSource,
    /if \(!node\) \{\s*clearGuideLines\(\);\s*finishPerf\?\.\(\{ reason: "missing-node" \}\)/
  );
  assert.match(
    hookSource,
    /if \(!stage\) \{\s*clearGuideLines\(\);\s*finishPerf\?\.\(\{ reason: "missing-stage" \}\)/
  );
  assert.match(
    hookSource,
    /if \(!initialBox\) \{\s*clearGuideLines\(\);[\s\S]*?reason: "missing-self-box-before"/
  );
  assert.match(
    hookSource,
    /if \(!postSnapBox\) \{\s*clearGuideLines\(\);[\s\S]*?reason: "missing-self-box-after"/
  );
  assert.match(hookSource, /catch \(e\) \{\s*clearGuideLines\(\);/);
  assert.match(
    hookSource,
    /snapLockRef\.current\.ownerSessionId !== guideSessionId/
  );
  assert.match(
    composerSource,
    /clearDragGuides\(\{ reason: "unmount", source: "composer-unmount" \}\)/
  );
  assert.match(
    composerSource,
    /clearDragGuides\(\{[\s\S]*?reason: "drag-end"/
  );
});

test("all individual families use the same synchronous guide owner", () => {
  assert.match(
    rendererSource,
    /previewDragIndividual\(e, obj, onDragMovePersonalizado/
  );
  assert.match(
    countdownSource,
    /previewDragIndividual\(e, obj, onDragMovePersonalizado/
  );
  assert.match(
    gallerySource,
    /onDragMovePersonalizado\?\.\([\s\S]*?pipeline: "individual"/
  );
  assert.match(composerSource, /scheduleGuideEvaluation\(guideRequest\)/);
  assert.match(
    composerSource,
    /guideDragFrameRef\.current = \{\s*rafId: 0,\s*payload: guideRequest,\s*\};\s*flushScheduledGuideEvaluation\(\);/
  );
  assert.doesNotMatch(
    composerSource,
    /requestAnimationFrame\(\(\) => \{\s*flushScheduledGuideEvaluation\(\)/
  );
  assert.match(composerSource, /const guideOutcome = mostrarGuias\(/);
  assert.match(composerSource, /syncControlledDragOverlayBounds\(/);
});

test("desktop modifier travels in the existing drag request and touch remains canonical", () => {
  assert.match(
    individualDragSource,
    /resolvePointerTypeFromNativeEvent\(nativeEvent\)/
  );
  assert.match(individualDragSource, /isTouchLikePointerType\(pointerType\)/);
  assert.match(
    individualDragSource,
    /modifierState: buildIndividualDragModifierState\(e\?\.evt\)/
  );
  assert.match(
    gallerySource,
    /modifierState: buildIndividualDragModifierState\(e\?\.evt\)/
  );
  assert.match(composerSource, /modifierState: meta\?\.modifierState \|\| null/);
  assert.match(hookSource, /shouldBypassGuideSnap\(guideRequest\.modifierState\)/);
});

test("visual scale has one representation path and dead guide configuration is gone", () => {
  assert.match(editorSource, /visualScale: escalaVisual/);
  assert.match(editorSource, /guideVisualScale=\{escalaVisual\}/);
  assert.doesNotMatch(
    editorSource,
    /margenSensibilidad|snapToEdges|snapToCenters|snapStrength/
  );
  assert.match(guideLayerSource, /resolveGuideVisualMetrics\(/);
  assert.match(guideLayerSource, /visualScale/);
  assert.doesNotMatch(composerSource, /guiaLineas\.map/);
  assert.equal((composerSource.match(/<CanvasGuideLayer/g) || []).length, 1);
});
