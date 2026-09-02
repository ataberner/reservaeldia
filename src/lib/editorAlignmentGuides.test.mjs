import test from "node:test";
import assert from "node:assert/strict";

import {
  GUIDE_RELATIONS,
  buildElementGuideCandidate,
  buildReachGuideSegments,
  chooseGuideAxisDecision,
  getGuideAxisAnchors,
  resolveCanvasDistanceForScreenPx,
  resolveExactSectionSnapDelta,
  resolveGuideMatch,
  resolveGuideVisualMetrics,
  resolveLockedGuideDecision,
  selectGuideCandidatesByAxis,
  shouldBypassGuideSnap,
} from "./editorAlignmentGuides.js";

const SELF_BOX = Object.freeze({ x: 100, y: 100, width: 40, height: 30 });

function shiftedBox(box, axis, delta) {
  return {
    ...box,
    [axis]: box[axis] + delta,
  };
}

test("section, center, edge and mixed relations keep explicit semantics", () => {
  const centerCenter = resolveGuideMatch({
    axis: "x",
    selfBox: SELF_BOX,
    targetValue: 120,
    targetAnchorKind: "center",
  });
  const edgeEdge = resolveGuideMatch({
    axis: "x",
    selfBox: SELF_BOX,
    targetValue: 140,
    targetAnchorKind: "end",
  });
  const centerEdge = resolveGuideMatch({
    axis: "x",
    selfBox: SELF_BOX,
    targetValue: 120,
    targetAnchorKind: "start",
  });

  assert.equal(GUIDE_RELATIONS.SECTION_CENTER, "section-center");
  assert.equal(centerCenter.semantic, GUIDE_RELATIONS.CENTER_CENTER);
  assert.equal(edgeEdge.semantic, GUIDE_RELATIONS.EDGE_EDGE);
  assert.equal(centerEdge.semantic, GUIDE_RELATIONS.CENTER_EDGE);
});

test("an active element snap applies the complete delta with no geometric residue", () => {
  const guide = buildElementGuideCandidate({
    axis: "x",
    selfBox: SELF_BOX,
    target: {
      id: "target",
      box: { x: 146, y: 0, width: 40, height: 30 },
    },
    targetAnchorKind: "start",
  });

  assert.equal(guide.match.delta, 6);
  const snapped = shiftedBox(SELF_BOX, "x", guide.match.delta);
  const snappedAnchor = getGuideAxisAnchors(snapped, "x").find(
    (anchor) => anchor.kind === guide.selfAnchorKind
  );
  assert.equal(snappedAnchor.value, guide.value);
  assert.equal(Math.abs(snappedAnchor.value - guide.value), 0);
});

test("section-center snap also applies an exact delta", () => {
  const deltaX = resolveExactSectionSnapDelta("x", SELF_BOX, 400);
  const deltaY = resolveExactSectionSnapDelta("y", SELF_BOX, 250);
  const snapped = shiftedBox(shiftedBox(SELF_BOX, "x", deltaX), "y", deltaY);

  assert.equal(snapped.x + snapped.width / 2, 400);
  assert.equal(snapped.y + snapped.height / 2, 250);
});

test("candidate preselection is bounded independently for X and Y", () => {
  const targets = [
    { id: "x-relevant", box: { x: 100, y: 900, width: 40, height: 30 } },
    { id: "y-relevant", box: { x: 900, y: 100, width: 40, height: 30 } },
    { id: "global-near-1", box: { x: 160, y: 160, width: 40, height: 30 } },
    { id: "global-near-2", box: { x: 170, y: 170, width: 40, height: 30 } },
    { id: "global-near-3", box: { x: 180, y: 180, width: 40, height: 30 } },
  ];

  const candidates = selectGuideCandidatesByAxis(SELF_BOX, targets, {
    limitPerAxis: 3,
  });

  assert.equal(candidates.x[0].targetId, "x-relevant");
  assert.equal(candidates.x[0].match.distance, 0);
  assert.equal(candidates.y[0].targetId, "y-relevant");
  assert.equal(candidates.y[0].match.distance, 0);
  assert.equal(candidates.x.length, 3);
  assert.equal(candidates.y.length, 3);
});

test("candidate ties are deterministic and relation priority avoids chatter", () => {
  const targets = [
    { id: "z-target", box: { x: 100, y: 0, width: 40, height: 30 } },
    { id: "a-target", box: { x: 100, y: 300, width: 40, height: 30 } },
  ];
  const candidates = selectGuideCandidatesByAxis(SELF_BOX, targets);

  assert.equal(candidates.x[0].targetId, "a-target");
  assert.equal(candidates.x[0].semantic, GUIDE_RELATIONS.CENTER_CENTER);
});

test("section bias wins close conflicts but a clearly better element wins", () => {
  assert.deepEqual(
    chooseGuideAxisDecision({
      sectionDistance: 3,
      bestElement: { dist: 1 },
      sectionRadius: 6,
      elementRadius: 10,
      sectionPriorityBias: 4,
    }),
    { source: "seccion" }
  );
  assert.equal(
    chooseGuideAxisDecision({
      sectionDistance: 6,
      bestElement: { dist: 1 },
      sectionRadius: 6,
      elementRadius: 10,
      sectionPriorityBias: 2,
    }).source,
    "elemento"
  );
  assert.equal(
    chooseGuideAxisDecision({
      sectionDistance: 11,
      bestElement: { dist: 12 },
      sectionRadius: 6,
      elementRadius: 10,
      sectionPriorityBias: 2,
    }),
    null
  );
});

test("hysteresis keeps the same target inside release radius and releases invalid targets", () => {
  const targets = [
    { id: "locked", box: { x: 151, y: 0, width: 40, height: 30 } },
    { id: "competitor", box: { x: 149, y: 0, width: 40, height: 30 } },
  ];
  const lock = {
    source: "elemento",
    targetId: "locked",
    targetAnchorKind: "start",
    selfAnchorKind: "end",
    releaseRadius: 18,
    lockedAtMs: 0,
  };
  const retained = resolveLockedGuideDecision({
    axis: "x",
    lock,
    selfBox: SELF_BOX,
    targets,
    sectionDistance: 100,
    sectionReleaseRadius: 14,
    elementReleaseRadius: 18,
    nowMs: 500,
  });

  assert.equal(retained.near.g.targetId, "locked");
  assert.equal(retained.near.g.selfAnchorKind, "end");
  assert.equal(
    resolveLockedGuideDecision({
      axis: "x",
      lock,
      selfBox: SELF_BOX,
      targets: targets.slice(1),
      sectionDistance: 100,
      sectionReleaseRadius: 14,
      elementReleaseRadius: 18,
      nowMs: 500,
    }),
    null
  );
});

test("reach segments stay ordered for separated and tangent boxes", () => {
  const separated = buildReachGuideSegments({
    axis: "x",
    coordinate: 120,
    selfBox: { x: 100, y: 100, width: 40, height: 20 },
    targetBox: { x: 100, y: 200, width: 40, height: 20 },
  });
  const tangent = buildReachGuideSegments({
    axis: "x",
    coordinate: 120,
    selfBox: { x: 100, y: 100, width: 40, height: 20 },
    targetBox: { x: 100, y: 120, width: 40, height: 20 },
  });

  assert.equal(separated.length, 1);
  assert.ok(separated[0][1] <= separated[0][3]);
  assert.equal(tangent.length, 2);
  tangent.forEach((points) => assert.ok(points[1] <= points[3]));
});

test("overlap, containment and stacked boxes use exterior segments", () => {
  const cases = [
    [{ x: 0, y: 0, width: 40, height: 30 }, { x: 0, y: 20, width: 40, height: 30 }],
    [{ x: 0, y: 0, width: 40, height: 60 }, { x: 0, y: 20, width: 40, height: 10 }],
    [{ x: 0, y: 0, width: 40, height: 30 }, { x: 0, y: 0, width: 40, height: 30 }],
  ];

  for (const [selfBox, targetBox] of cases) {
    const segments = buildReachGuideSegments({
      axis: "x",
      coordinate: 20,
      selfBox,
      targetBox,
    });
    assert.equal(segments.length, 2);
    segments.flat().forEach((value) => assert.ok(Number.isFinite(value)));
    segments.forEach((points) => assert.ok(points[1] <= points[3]));
    const unionStart = Math.min(selfBox.y, targetBox.y);
    const unionEnd = Math.max(
      selfBox.y + selfBox.height,
      targetBox.y + targetBox.height
    );
    assert.ok(segments[0][3] < unionStart);
    assert.ok(segments[1][1] > unionEnd);
  }
});

test("screen-space radius and visual metrics compensate scale without changing snap coordinates", () => {
  for (const scale of [1, 0.8, 0.5, 0.4]) {
    const logicalRadius = resolveCanvasDistanceForScreenPx(10, scale);
    assert.equal(logicalRadius * scale, 10);

    const metrics = resolveGuideVisualMetrics(
      GUIDE_RELATIONS.CENTER_CENTER,
      scale
    );
    assert.equal(metrics.strokeWidth * scale, 1.5);
    assert.deepEqual(metrics.dash.map((value) => value * scale), [8, 6]);
  }
  assert.equal(
    resolveGuideVisualMetrics(GUIDE_RELATIONS.SECTION_CENTER, 1).dash,
    null
  );
  assert.deepEqual(
    resolveGuideVisualMetrics(GUIDE_RELATIONS.EDGE_EDGE, 1).dash,
    [3, 4]
  );
  assert.deepEqual(
    resolveGuideVisualMetrics(GUIDE_RELATIONS.CENTER_EDGE, 1).dash,
    [8, 4, 2, 4]
  );

  const matchAtScaleOne = resolveGuideMatch({
    axis: "y",
    selfBox: SELF_BOX,
    targetValue: 132,
    targetAnchorKind: "end",
  });
  const matchAtMobileScale = resolveGuideMatch({
    axis: "y",
    selfBox: SELF_BOX,
    targetValue: 132,
    targetAnchorKind: "end",
  });
  assert.deepEqual(matchAtMobileScale, matchAtScaleOne);
});

test("Alt/Option bypasses desktop snapping and never changes touch behavior", () => {
  assert.equal(shouldBypassGuideSnap({ altKey: true, isTouchLike: false }), true);
  assert.equal(shouldBypassGuideSnap({ altKey: false, isTouchLike: false }), false);
  assert.equal(shouldBypassGuideSnap({ altKey: true, isTouchLike: true }), false);
  assert.equal(shouldBypassGuideSnap(null), false);
});
