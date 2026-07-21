import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decidePressSelection,
  shouldArmPredragRelease,
} from "../components/editor/textSystem/render/konva/elementInteractionDecisions.js";
import { resolveTouchDragIntent } from "./editorTouchDragIntent.js";

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const touchDragConsumers = [
  {
    label: "generic canvas element",
    source: readSource(
      "../components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx"
    ),
  },
  {
    label: "Gallery",
    source: readSource("../components/editor/GaleriaKonva.jsx"),
  },
  {
    label: "countdown",
    source: readSource("../components/editor/countdown/CountdownKonva.jsx"),
  },
];

const stageInteractionSource = readSource(
  "../components/editor/canvasEditor/useCanvasEditorStageInteraction.js"
);
const stageComposerSource = readSource(
  "../components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx"
);
const transformerSource = readSource(
  "../components/editor/textSystem/render/konva/SelectionTransformer.jsx"
);
const selectionBoundsSource = readSource(
  "../components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx"
);
const sectionBackgroundSource = readSource(
  "../components/editor/FondoSeccion.jsx"
);

const sharedTouchIntentHelpers = [
  "allowNativeTouchScrollOnKonvaPress",
  "claimNativeTouchDrag",
  "releaseNativeTouchScrollOnKonvaPress",
];

function assertHelperCall(source, helperName, label) {
  assert.ok(
    new RegExp(`\\b${helperName}\\s*\\(`).test(source),
    `${label} must call the shared ${helperName} helper`
  );
}

function assertSourceMatches(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

test("selected and newly selected elements share the same direction gate before predrag", () => {
  const selectedPress = decidePressSelection({
    hasOnSelect: true,
    effectiveIsSelected: true,
    effectiveSelectionCount: 1,
    inlineEditPointerActive: false,
    selectionGestureSuppressed: false,
    button: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
  });
  const unselectedPress = decidePressSelection({
    hasOnSelect: true,
    effectiveIsSelected: false,
    effectiveSelectionCount: 0,
    inlineEditPointerActive: false,
    selectionGestureSuppressed: false,
    button: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
  });

  assert.equal(
    shouldArmPredragRelease({
      assumeSingleSelection: selectedPress.allowSameGestureDrag,
      isSelected: true,
      selectionCount: 1,
      manualGroupDragEligible: false,
    }),
    true
  );
  assert.equal(unselectedPress.allowSameGestureDrag, true);
  assert.equal(
    shouldArmPredragRelease({
      assumeSingleSelection: unselectedPress.allowSameGestureDrag,
      isSelected: false,
      selectionCount: 0,
      manualGroupDragEligible: false,
    }),
    true
  );

  const vertical = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 2,
    deltaY: 18,
  });
  const horizontal = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 18,
    deltaY: 2,
  });
  const tap = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 2,
    deltaY: 2,
  });

  assert.equal(vertical.decision, "scroll");
  assert.equal(horizontal.decision, "drag");
  assert.equal(tap.decision, "pending");
});

test("all touch-draggable renderers wire the shared scroll lease, direction gate, and drag claim", () => {
  for (const { label, source } of touchDragConsumers) {
    assertSourceMatches(
      source,
      /from\s+["']@\/lib\/editorTouchDragIntent["']/,
      `${label} must import touch intent authority from the shared module`
    );

    for (const helperName of sharedTouchIntentHelpers) {
      assertHelperCall(source, helperName, label);
    }

    assertHelperCall(source, "resolveTouchDragIntent", label);
    assert.equal(
      source.includes("createTouchStationaryHoldGate"),
      false,
      `${label} must not reintroduce elapsed-time or stationary-hold drag ownership`
    );

    const allowIndex = source.indexOf("allowNativeTouchScrollOnKonvaPress(");
    const claimIndex = source.indexOf("claimNativeTouchDrag(");
    const startDragIndex = source.indexOf(".startDrag", claimIndex);
    assert.ok(
      allowIndex >= 0 && claimIndex >= 0,
      `${label} must acquire and later claim native-scroll ownership`
    );
    assert.ok(
      startDragIndex > claimIndex,
      `${label} must claim touch drag ownership before starting Konva drag`
    );
  }
});

test("touch renderer cancellation paths pair pointercancel listeners and shared lease cleanup", () => {
  for (const { label, source } of touchDragConsumers) {
    assertSourceMatches(
      source,
      /addEventListener\(["']pointercancel["']/,
      `${label} must observe pointercancel`
    );
    assertSourceMatches(
      source,
      /removeEventListener\(["']pointercancel["']/,
      `${label} must remove its pointercancel listener`
    );
    assertHelperCall(
      source,
      "releaseNativeTouchScrollOnKonvaPress",
      `${label} cleanup`
    );
  }
});

test("Stage preserves native vertical pan and restores it on pointer cancellation", () => {
  assertSourceMatches(
    stageComposerSource,
    /<Stage[\s\S]{0,600}?preventDefault=\{false\}/,
    "the Stage must not globally cancel native touch defaults"
  );
  assertSourceMatches(
    stageInteractionSource,
    /content\.style\.touchAction\s*=\s*["']pan-y["']/,
    "idle Stage interaction must allow vertical native scrolling"
  );
  assertSourceMatches(
    stageInteractionSource,
    /stage\.on\(["']dragstart["'],\s*setEditMode\)/,
    "intentional drag must switch the Stage to edit touch-action"
  );
  assertSourceMatches(
    stageInteractionSource,
    /stage\.on\(["']dragend["'],\s*setScrollMode\)/,
    "drag end must restore native vertical scrolling"
  );
  assertSourceMatches(
    stageInteractionSource,
    /stage\.on\(["']pointercancel["'],\s*stopDragging\)/,
    "pointer cancellation must restore scroll mode"
  );
  assertSourceMatches(
    stageInteractionSource,
    /stage\.off\(["']pointercancel["'],\s*stopDragging\)/,
    "pointer cancellation cleanup must be symmetrical"
  );
});

test("resize controls keep their own gesture owner while passive canvas visuals allow scroll", () => {
  assertSourceMatches(
    transformerSource,
    /onTouchStart=\{handleResizeAnchorPressStart\}/,
    "resize anchors must keep their dedicated touch-start path"
  );
  assertSourceMatches(
    transformerSource,
    /onPointerDown=\{handleResizeAnchorPressStart\}/,
    "resize anchors must keep their dedicated pointer path"
  );
  assert.equal(
    transformerSource.includes("@/lib/editorTouchDragIntent"),
    false,
    "the object drag-intent helper must not take ownership from resize controls"
  );
  assertSourceMatches(
    selectionBoundsSource,
    /name=["']ui selection-bounds-indicator["']\s+listening=\{false\}/,
    "passive selection bounds must remain outside hit testing"
  );
  assert.ok(
    (sectionBackgroundSource.match(/preventDefault=\{false\}/g) || []).length >= 3,
    "non-drag section visuals must not cancel native vertical scrolling"
  );
});

test("scroll ownership keeps tap suppression until the next real press without terminal listeners", () => {
  const genericSource = touchDragConsumers[0].source;
  const gallerySource = touchDragConsumers[1].source;
  const countdownSource = touchDragConsumers[2].source;

  assertSourceMatches(
    genericSource,
    /touchScrollSelectionSuppressUntilRef\.current\s*=\s*Number\.POSITIVE_INFINITY/,
    "generic elements must not let a long scroll outlive selection suppression"
  );
  assertSourceMatches(
    genericSource,
    /touchScrollSelectionSuppressUntilRef\.current\s*=\s*0[\s\S]*resetTouchDragIntent\(\)/,
    "generic selection suppression must reset only from the next real press"
  );
  assert.equal(
    genericSource.includes("touchScrollSelectionReleaseDetachRef"),
    false,
    "generic scroll suppression must not retain terminal listeners per element"
  );
  assert.equal(
    gallerySource.includes("}, 450)"),
    false,
    "Gallery must not expire scroll suppression from a timer started on move"
  );
  assertSourceMatches(
    countdownSource,
    /cancelledForScroll\s*=\s*true/,
    "countdown must persist scroll ownership in its press session"
  );
  assertSourceMatches(
    countdownSource,
    /cancelledForScroll\s*&&\s*!ownsActiveDragSession/,
    "countdown must clear a scroll-owned press only from its terminal listener"
  );
  assert.equal(
    countdownSource.includes("}, 450)"),
    false,
    "countdown must not expire scroll suppression while the finger is still down"
  );
});
