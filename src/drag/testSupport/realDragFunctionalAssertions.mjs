import assert from "node:assert/strict";
import { makeDefaultCountdown } from "../../components/editor/countdown/countdownUtils.js";

// Test-only fixture: use the real family's defaults, then replace identity and
// clock-dependent data. No published asset, font or preset fetch is necessary.
export function makeCountdownFixture({
  id = "active", seccionId = "s1", x = 240, y = 120,
  width = 300, height = 90, fechaObjetivo = "2035-06-15T12:00:00.000Z",
} = {}) {
  return {
    ...makeDefaultCountdown({ fechaISO: fechaObjetivo, x, y, width, height }),
    id, seccionId, fontFamily: "Arial", mostrarCuentaRegresiva: true,
  };
}

// This function is self-contained so Puppeteer can serialize it. All reads are
// functional observations outside timing windows; no setter, draw or event is
// invoked. The optional window argument permits deterministic reader tests.
export function collectRealInteractionSnapshot({ ids = ["active"] } = {}, targetWindow = window) {
  const refs = targetWindow._elementRefs || {};
  const first = ids.map((id) => refs[id]).find(Boolean);
  const stage = first?.getStage?.();
  if (!stage) return null;
  const clone = (value) => value == null ? null : JSON.parse(JSON.stringify(value));
  const className = (node) => node?.getClassName?.() || null;
  const visible = (node) => Boolean(node?.isVisible?.()) &&
    (typeof node.getAbsoluteOpacity !== "function" || node.getAbsoluteOpacity() > 0);
  const ownerId = (node) => {
    for (let current = node; current && current !== stage; current = current.getParent?.()) {
      const id = current.id?.();
      if (id && refs[id] === current) return id;
    }
    return null;
  };
  const pose = (node) => node ? Object.fromEntries(
    ["x", "y", "width", "height", "rotation", "scaleX", "scaleY", "offsetX", "offsetY"]
      .map((key) => [key, typeof node[key] === "function" ? node[key]() : null])
  ) : null;
  const frameLeaves = (indicator) => indicator.getChildren().filter((node) =>
    ["Line", "Rect"].includes(className(node))
  ).map((node) => {
    const points = className(node) === "Line" ? node.points() : null;
    const hasArea = points
      ? points.length >= 6 && new Set(points.filter((_, index) => index % 2 === 0)).size > 1 &&
        new Set(points.filter((_, index) => index % 2 === 1)).size > 1
      : node.width() > 0 && node.height() > 0;
    const strokeEnabled = typeof node.strokeEnabled !== "function" || node.strokeEnabled();
    const hasStroke = typeof node.strokeWidth !== "function" || node.strokeWidth() > 0;
    return { type: className(node), visible: visible(node), hasArea,
      paintsFrame: visible(node) && hasArea && strokeEnabled && hasStroke,
      pose: pose(node), points: points ? [...points] : null };
  });
  const indicators = stage.find(".selection-bounds-indicator").map((indicator) => ({
    nodeIdentity: indicator._id ?? null, groupVisible: visible(indicator), frames: frameLeaves(indicator),
  }));
  const transformers = stage.find("Transformer").map((transformer) => {
    const attached = transformer.nodes();
    const attachedOwners = [...new Set(attached.map(ownerId).filter(Boolean))];
    const liveBounds = attached.map((node) => node.getClientRect({ relativeTo: stage }));
    const hasArea = liveBounds.some((rect) => rect.width > 0 && rect.height > 0);
    return { nodeIdentity: transformer._id ?? null, visible: visible(transformer),
      attachedIds: attached.map((node) => node.id?.() || null), attachedOwners,
      borderEnabled: transformer.borderEnabled(), enabledAnchors: [...transformer.enabledAnchors()],
      paintsFrame: visible(transformer) && transformer.borderEnabled() && attached.length > 0 && hasArea,
      liveBounds };
  });
  const objects = targetWindow._objetosActuales || [];
  const groupSession = targetWindow._groupDragSession;
  return {
    atMs: targetWindow.performance?.now?.() ?? null,
    selection: clone(targetWindow._elementosSeleccionados || []),
    runtime: clone(targetWindow.__EDITOR_SELECTION_RUNTIME__?.getSnapshot?.()),
    globalDragging: Boolean(targetWindow._isDragging),
    // The live group session contains a Stage and listener callbacks; retain
    // only serializable identity/lifecycle data, never clone the live graph.
    groupSession: groupSession ? {
      sessionId: groupSession.sessionId || null, engine: groupSession.engine || null,
      phase: groupSession.phase || null, active: Boolean(groupSession.active),
      leaderId: groupSession.leaderId || null, elementIds: [...(groupSession.elementIds || [])],
      lastPreviewDelta: clone(groupSession.lastPreviewDelta),
    } : null,
    inlineEditorIds: [...targetWindow.document.querySelectorAll("[data-inline-editor-id]")]
      .map((node) => node.getAttribute("data-inline-editor-id")),
    activeElement: {
      tag: targetWindow.document.activeElement?.tagName || null,
      editable: Boolean(targetWindow.document.activeElement?.isContentEditable),
    },
    guideCount: stage.findOne(".canvas-guide-layer")?.getChildren().length ?? null,
    nodes: ids.map((id) => {
      const node = refs[id];
      const object = objects.find((entry) => entry.id === id);
      const special = object?.tipo === "galeria" ? node?.findOne?.(".gallery-transform-frame")
        : object?.tipo === "countdown" ? node?.findOne?.(".countdown-hitbox") : null;
      return { id, object: clone(object), type: className(node), pose: pose(node),
        dragging: Boolean(node?.isDragging?.()), draggable: Boolean(node?.draggable?.()),
        visualBounds: node?.getClientRect?.({ relativeTo: stage }) || null,
        specializedFrame: special ? { name: special.name(), pose: pose(special),
          bounds: special.getClientRect({ relativeTo: stage }) } : null };
    }),
    indicators, transformers,
    visibleIndicatorFrames: indicators.reduce((count, entry) => count + entry.frames.filter((frame) => frame.paintsFrame).length, 0),
    visibleTransformerFrames: transformers.filter((entry) => entry.paintsFrame).length,
  };
}

export async function readRealInteractionSnapshot(page, ids = ["active"]) {
  return page.evaluate(collectRealInteractionSnapshot, { ids });
}

// Visual observations are deliberately separate from transient-runtime cleanup.
// A visible selected frame is not proof that the full handoff contract passed.
// Indicator Group.isVisible() alone is insufficient: clearIndicatorVisuals()
// hides its direct Line/Rect leaves while keeping the mounted Group visible.
export function assertSettledVisuals(snapshot, { selectedIds = ["active"], requireVisualFrame = true } = {}) {
  assert.ok(snapshot, "real stage must remain mounted");
  const sorted = (ids) => [...ids].sort();
  assert.deepEqual(sorted(snapshot.selection), sorted(selectedIds), "committed selection must survive drag");
  assert.ok(snapshot.runtime, "real selection runtime must be available");
  assert.deepEqual(sorted(snapshot.runtime.selectedIds), sorted(selectedIds), "runtime selection must converge");
  assert.equal(snapshot.globalDragging, false);
  assert.equal(snapshot.groupSession?.active ?? false, false, "group gesture must terminate before settled validation");
  assert.ok(snapshot.nodes.every((node) => !node.dragging), "native nodes must stop dragging");
  assert.equal(snapshot.guideCount, 0, "guides must clear at release");
  assert.deepEqual(snapshot.inlineEditorIds, [], "drag must not open inline text editing");
  if (requireVisualFrame && selectedIds.length) {
    assert.equal(snapshot.visibleIndicatorFrames + snapshot.visibleTransformerFrames, 1,
      "settled selected objects must have exactly one visible selection frame");
    for (const transformer of snapshot.transformers.filter((entry) => entry.paintsFrame)) {
      assert.deepEqual(sorted(transformer.attachedOwners), sorted(selectedIds), "visible transformer must attach to the selected roots");
    }
  }
}

// Use only after handoff has completed, not immediately after pointerup. The
// contract permits settling to retain the overlay until selected-phase is ready.
// Keep this strict even when a benchmark separately records a visual pass and a
// known residual-runtime failure; that benchmark is not integral acceptance.
export function assertSettledInteraction(snapshot, options = {}) {
  assertSettledVisuals(snapshot, options);
  assert.equal(snapshot.runtime.pendingDragSelection?.id ?? null, null, "pending drag selection must clear");
  assert.equal(snapshot.runtime.pendingDragSelection?.phase ?? null, null);
  assert.deepEqual(snapshot.runtime.dragVisualSelection?.ids || [], [], "drag visual selection must clear after handoff");
  assert.equal(snapshot.runtime.dragVisualSelection?.predragActive ?? false, false);
  assert.equal(snapshot.runtime.dragVisualSelection?.sessionKey ?? null, null);
  assert.equal(snapshot.runtime.dragVisualSelection?.dragId ?? null, null);
}

export function assertKeyboardHistoryReady(snapshot) {
  assert.deepEqual(snapshot.inlineEditorIds, [], "history shortcut must not run in inline edit");
  assert.equal(snapshot.activeElement.editable, false);
  assert.ok(!["INPUT", "TEXTAREA", "SELECT"].includes(snapshot.activeElement.tag),
    "history shortcut must not target a form field");
}

// The repeated-destination regression must reject a missing X movement even
// when snapping changes Y. A generic "some movement occurred" check misses it.
// CDP rounds input coordinates to screen pixels; this tolerance is fixture
// precision, not a change to the editor's snapping thresholds.
export function assertImmediateDestination({ before, final, intendedDelta, alt, previous = null }) {
  const epsilon = 1 / before.scale + .01;
  const expectedNode = { x: before.node.x + intendedDelta.x, y: before.node.y + intendedDelta.y };
  assert.ok(Math.abs(final.node.x - expectedNode.x) <= epsilon,
    "immediate drag must reach the requested X destination, including after undo");
  if (alt) {
    assert.ok(Math.abs(final.node.y - expectedNode.y) <= epsilon, "Alt immediate drag must reach the requested Y destination");
  } else {
    const centerX = final.nodeRectInStage.x + final.nodeRectInStage.width / 2;
    assert.ok(Math.abs(centerX - before.stageWidth / 2) <= epsilon,
      "Normal immediate text drag must align its visual center with the section center");
  }
  if (previous) {
    assert.equal(before.nativeDragNodeId, previous.before.nativeDragNodeId,
      "repeated-destination fixture must retain the same native node after undo");
    for (const axis of ["x", "y"]) {
      assert.ok(Math.abs(before.node[axis] - previous.before.node[axis]) < .01,
        `undo must restore the initial visual ${axis} before repeating the destination`);
      assert.ok(Math.abs(expectedNode[axis] - previous.expectedNode[axis]) < .01,
        `repeat must request the identical native ${axis} destination`);
    }
  }
  return { passed: true, afterUndo: Boolean(previous), expectedNode, toleranceCanvasUnits: epsilon };
}

export function assertImmediateTranslation({ before, final, intendedDelta, beforeRelease }) {
  const epsilon = 1 / before.scale + .01;
  const expectedNode = { x: before.node.x + intendedDelta.x, y: before.node.y + intendedDelta.y };
  assert.ok(beforeRelease, "single-move regression must observe the node before pointerup");
  for (const [phase, pose] of [["before release", beforeRelease], ["after release", final.node]]) {
    for (const axis of ["x", "y"]) assert.ok(Math.abs(pose[axis] - expectedNode[axis]) <= epsilon,
      `immediate group translation must apply the full ${axis} displacement ${phase}`);
  }
  return { passed: true, expectedNode, toleranceCanvasUnits: epsilon };
}

export function assertGroupChildrenPreserved(before, after) {
  assert.equal(before?.tipo, "grupo");
  assert.equal(after?.tipo, "grupo");
  assert.equal(after.id, before.id);
  assert.deepEqual(after.children, before.children,
    "moving a persisted group must preserve its children's identities and local data");
}

export function assertSelectionTranslation(beforeObjects, afterObjects, selectedIds, epsilon = .01) {
  assert.ok(selectedIds.length > 0);
  const deltas = selectedIds.map((id) => {
    const before = beforeObjects.find((object) => object.id === id);
    const after = afterObjects.find((object) => object.id === id);
    assert.ok(before && after, `selected object ${id} must remain present`);
    assert.equal(after.seccionId, before.seccionId,
      "translation comparison is only valid within one unchanged section; otherwise compare canonical stage poses");
    if (before.tipo === "grupo") assertGroupChildrenPreserved(before, after);
    return { x: after.x - before.x, y: after.y - before.y };
  });
  for (const delta of deltas) for (const axis of ["x", "y"]) {
    assert.ok(Number.isFinite(delta[axis]) && Math.abs(delta[axis] - deltas[0][axis]) < epsilon,
      `all selected roots must move by the same ${axis} delta`);
  }
  return deltas[0];
}
