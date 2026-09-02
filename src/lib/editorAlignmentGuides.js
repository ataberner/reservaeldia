export const GUIDE_RELATIONS = Object.freeze({
  SECTION_CENTER: "section-center",
  CENTER_CENTER: "center-center",
  EDGE_EDGE: "edge-edge",
  CENTER_EDGE: "center-edge",
});

const AXIS_ANCHOR_KINDS = Object.freeze(["center", "start", "end"]);
const RELATION_PRIORITY = Object.freeze({
  [GUIDE_RELATIONS.CENTER_CENTER]: 0,
  [GUIDE_RELATIONS.EDGE_EDGE]: 1,
  [GUIDE_RELATIONS.CENTER_EDGE]: 2,
});
const ANCHOR_PRIORITY = Object.freeze({ center: 0, start: 1, end: 2 });

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function compareStrings(left, right) {
  const safeLeft = String(left || "");
  const safeRight = String(right || "");
  if (safeLeft === safeRight) return 0;
  return safeLeft < safeRight ? -1 : 1;
}

export function normalizeGuideBox(box = null) {
  const x = toFiniteNumber(box?.x);
  const y = toFiniteNumber(box?.y);
  const width = toFiniteNumber(box?.width);
  const height = toFiniteNumber(box?.height);
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    width < 0 ||
    height < 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

export function normalizeGuideVisualScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.min(4, Math.max(0.2, numeric));
}

export function resolveCanvasDistanceForScreenPx(screenPx, visualScale = 1) {
  const safeScreenPx = Math.max(0, toFiniteNumber(screenPx, 0));
  return safeScreenPx / normalizeGuideVisualScale(visualScale);
}

export function resolveGuideVisualMetrics(semantic, visualScale = 1) {
  const scale = normalizeGuideVisualScale(visualScale);
  const screenMetrics = (() => {
    if (semantic === GUIDE_RELATIONS.SECTION_CENTER) {
      return {
        strokeWidth: 2,
        dash: null,
        opacity: 0.9,
        shadowBlur: 4,
      };
    }
    if (semantic === GUIDE_RELATIONS.CENTER_CENTER) {
      return {
        strokeWidth: 1.5,
        dash: [8, 6],
        opacity: 0.82,
        shadowBlur: 0,
      };
    }
    if (semantic === GUIDE_RELATIONS.EDGE_EDGE) {
      return {
        strokeWidth: 1,
        dash: [3, 4],
        opacity: 0.76,
        shadowBlur: 0,
      };
    }
    return {
      strokeWidth: 1.25,
      dash: [8, 4, 2, 4],
      opacity: 0.78,
      shadowBlur: 0,
    };
  })();

  return {
    strokeWidth: screenMetrics.strokeWidth / scale,
    dash: screenMetrics.dash
      ? screenMetrics.dash.map((value) => value / scale)
      : null,
    opacity: screenMetrics.opacity,
    shadowBlur: screenMetrics.shadowBlur / scale,
  };
}

export function shouldBypassGuideSnap(modifierState = null) {
  return Boolean(modifierState?.altKey) && modifierState?.isTouchLike !== true;
}

export function resolveExactSectionSnapDelta(axis, selfBoxInput, targetCenter) {
  const selfBox = normalizeGuideBox(selfBoxInput);
  const safeTargetCenter = toFiniteNumber(targetCenter);
  if (!selfBox || safeTargetCenter == null || (axis !== "x" && axis !== "y")) {
    return null;
  }
  const selfCenter = axis === "x"
    ? selfBox.x + selfBox.width / 2
    : selfBox.y + selfBox.height / 2;
  return safeTargetCenter - selfCenter;
}

export function getGuideAxisAnchors(boxInput, axis) {
  const box = normalizeGuideBox(boxInput);
  if (!box || (axis !== "x" && axis !== "y")) return [];

  if (axis === "x") {
    return [
      { kind: "center", role: "center", value: box.x + box.width / 2 },
      { kind: "start", role: "edge", value: box.x },
      { kind: "end", role: "edge", value: box.x + box.width },
    ];
  }

  return [
    { kind: "center", role: "center", value: box.y + box.height / 2 },
    { kind: "start", role: "edge", value: box.y },
    { kind: "end", role: "edge", value: box.y + box.height },
  ];
}

export function resolveGuideRelation(selfAnchor, targetAnchor) {
  if (selfAnchor?.role === "center" && targetAnchor?.role === "center") {
    return GUIDE_RELATIONS.CENTER_CENTER;
  }
  if (selfAnchor?.role === "edge" && targetAnchor?.role === "edge") {
    return GUIDE_RELATIONS.EDGE_EDGE;
  }
  return GUIDE_RELATIONS.CENTER_EDGE;
}

function compareGuideMatches(left, right) {
  const distanceDelta = Number(left?.distance ?? Infinity) - Number(right?.distance ?? Infinity);
  if (Math.abs(distanceDelta) > 1e-9) return distanceDelta;

  const relationDelta =
    Number(RELATION_PRIORITY[left?.semantic] ?? 99) -
    Number(RELATION_PRIORITY[right?.semantic] ?? 99);
  if (relationDelta !== 0) return relationDelta;

  const targetDelta =
    Number(ANCHOR_PRIORITY[left?.targetAnchorKind] ?? 99) -
    Number(ANCHOR_PRIORITY[right?.targetAnchorKind] ?? 99);
  if (targetDelta !== 0) return targetDelta;

  return (
    Number(ANCHOR_PRIORITY[left?.selfAnchorKind] ?? 99) -
    Number(ANCHOR_PRIORITY[right?.selfAnchorKind] ?? 99)
  );
}

export function resolveGuideMatch({
  axis,
  selfBox,
  targetValue,
  targetAnchorKind = "center",
  selfAnchorKind = null,
}) {
  const numericTarget = toFiniteNumber(targetValue);
  if (numericTarget == null) return null;

  const targetRole = targetAnchorKind === "center" ? "center" : "edge";
  const targetAnchor = {
    kind: targetAnchorKind,
    role: targetRole,
    value: numericTarget,
  };
  const matches = getGuideAxisAnchors(selfBox, axis)
    .filter(
      (selfAnchor) => selfAnchorKind == null || selfAnchor.kind === selfAnchorKind
    )
    .map((selfAnchor) => {
    const delta = numericTarget - selfAnchor.value;
    return {
      axis,
      distance: Math.abs(delta),
      delta,
      selfValue: selfAnchor.value,
      targetValue: numericTarget,
      selfAnchorKind: selfAnchor.kind,
      targetAnchorKind,
      semantic: resolveGuideRelation(selfAnchor, targetAnchor),
    };
    });

  return matches.sort(compareGuideMatches)[0] || null;
}

function buildTargetGuideType(axis, targetAnchorKind) {
  if (axis === "x") {
    if (targetAnchorKind === "center") return "el-cx";
    return targetAnchorKind === "start" ? "el-left" : "el-right";
  }
  if (targetAnchorKind === "center") return "el-cy";
  return targetAnchorKind === "start" ? "el-top" : "el-bottom";
}

function buildGuideStyle(semantic) {
  if (semantic === GUIDE_RELATIONS.EDGE_EDGE) return "dotted";
  if (semantic === GUIDE_RELATIONS.CENTER_EDGE) return "dash-dot";
  return "dashed";
}

export function buildElementGuideCandidate({
  axis,
  selfBox,
  target,
  targetAnchorKind,
  selfAnchorKind = null,
}) {
  const targetBox = normalizeGuideBox(target?.box);
  if (!targetBox || !AXIS_ANCHOR_KINDS.includes(targetAnchorKind)) return null;

  const targetAnchor = getGuideAxisAnchors(targetBox, axis).find(
    (anchor) => anchor.kind === targetAnchorKind
  );
  if (!targetAnchor) return null;

  const match = resolveGuideMatch({
    axis,
    selfBox,
    targetValue: targetAnchor.value,
    targetAnchorKind,
    selfAnchorKind,
  });
  if (!match) return null;

  return {
    axis,
    value: targetAnchor.value,
    type: buildTargetGuideType(axis, targetAnchorKind),
    targetBox,
    targetId: target?.id || null,
    targetAnchorKind,
    selfAnchorKind: match.selfAnchorKind,
    priority: "elemento",
    style: buildGuideStyle(match.semantic),
    semantic: match.semantic,
    match,
  };
}

function compareGuideCandidates(left, right) {
  const matchDelta = compareGuideMatches(left?.match, right?.match);
  if (matchDelta !== 0) return matchDelta;

  const targetIdDelta = compareStrings(left?.targetId, right?.targetId);
  if (targetIdDelta !== 0) return targetIdDelta;
  return compareStrings(left?.type, right?.type);
}

function buildBestTargetCandidate(axis, selfBox, target) {
  return AXIS_ANCHOR_KINDS
    .map((targetAnchorKind) =>
      buildElementGuideCandidate({
        axis,
        selfBox,
        target,
        targetAnchorKind,
      })
    )
    .filter(Boolean)
    .sort(compareGuideCandidates)[0] || null;
}

export function selectGuideCandidatesByAxis(
  selfBox,
  targets = [],
  { limitPerAxis = 3 } = {}
) {
  const safeSelfBox = normalizeGuideBox(selfBox);
  if (!safeSelfBox || !Array.isArray(targets) || targets.length === 0) {
    return { x: [], y: [], all: [] };
  }

  const safeLimit = Math.max(1, Math.floor(toFiniteNumber(limitPerAxis, 3)));
  const selectForAxis = (axis) => {
    const selected = [];
    for (const target of targets) {
      const candidate = buildBestTargetCandidate(axis, safeSelfBox, target);
      if (!candidate) continue;
      const insertAt = selected.findIndex(
        (current) => compareGuideCandidates(candidate, current) < 0
      );
      if (insertAt < 0) selected.push(candidate);
      else selected.splice(insertAt, 0, candidate);
      if (selected.length > safeLimit) selected.pop();
    }
    return selected;
  };

  const x = selectForAxis("x");
  const y = selectForAxis("y");
  return { x, y, all: [...x, ...y] };
}

export function chooseGuideAxisDecision({
  sectionDistance,
  bestElement = null,
  sectionRadius,
  elementRadius,
  sectionPriorityBias = 0,
}) {
  const safeSectionDistance = toFiniteNumber(sectionDistance, Infinity);
  const safeSectionRadius = Math.max(0, toFiniteNumber(sectionRadius, 0));
  const safeElementRadius = Math.max(0, toFiniteNumber(elementRadius, 0));
  const safeBias = Math.max(0, toFiniteNumber(sectionPriorityBias, 0));
  const elementDistance = toFiniteNumber(bestElement?.dist, Infinity);

  const sectionEligible = safeSectionDistance <= safeSectionRadius;
  const elementEligible = Boolean(bestElement) && elementDistance <= safeElementRadius;
  if (!sectionEligible && !elementEligible) return null;
  if (sectionEligible && !elementEligible) return { source: "seccion" };
  if (!sectionEligible && elementEligible) {
    return { source: "elemento", near: bestElement };
  }

  return elementDistance + safeBias < safeSectionDistance
    ? { source: "elemento", near: bestElement }
    : { source: "seccion" };
}

export function resolveLockedGuideDecision({
  axis,
  lock = null,
  selfBox,
  targets = [],
  sectionDistance,
  sectionReleaseRadius,
  elementReleaseRadius,
  nowMs = Date.now(),
  lockMinMs = 120,
  softReleaseMultiplier = 1.75,
}) {
  if (!lock) return null;
  const lockAgeMs = Number.isFinite(Number(lock.lockedAtMs))
    ? Math.max(0, Number(nowMs) - Number(lock.lockedAtMs))
    : Infinity;
  const releaseMultiplier = lockAgeMs <= lockMinMs ? softReleaseMultiplier : 1;

  if (lock.source === "seccion") {
    const releaseRadius = Math.max(
      0,
      toFiniteNumber(lock.releaseRadius, sectionReleaseRadius) * releaseMultiplier
    );
    return toFiniteNumber(sectionDistance, Infinity) <= releaseRadius
      ? { source: "seccion", locked: true, lockAgeMs }
      : null;
  }

  if (lock.source !== "elemento" || !lock.targetId) return null;
  const target = targets.find((candidate) => candidate?.id === lock.targetId) || null;
  const lockedGuide = buildElementGuideCandidate({
    axis,
    selfBox,
    target,
    targetAnchorKind: lock.targetAnchorKind,
    selfAnchorKind: lock.selfAnchorKind,
  });
  if (!lockedGuide) return null;

  const releaseRadius = Math.max(
    0,
    toFiniteNumber(lock.releaseRadius, elementReleaseRadius) * releaseMultiplier
  );
  if (lockedGuide.match.distance > releaseRadius) return null;

  return {
    source: "elemento",
    near: {
      g: lockedGuide,
      dist: lockedGuide.match.distance,
    },
    locked: true,
    lockAgeMs,
  };
}

function buildAxisSegment(axis, coordinate, start, end) {
  if (![coordinate, start, end].every(Number.isFinite) || end < start) return null;
  return axis === "x"
    ? [coordinate, start, coordinate, end]
    : [start, coordinate, end, coordinate];
}

export function buildReachGuideSegments({
  axis,
  coordinate,
  selfBox,
  targetBox,
  gap = 6,
  exteriorLength = 12,
}) {
  const self = normalizeGuideBox(selfBox);
  const target = normalizeGuideBox(targetBox);
  const guideCoordinate = toFiniteNumber(coordinate);
  if (!self || !target || guideCoordinate == null || (axis !== "x" && axis !== "y")) {
    return [];
  }

  const selfStart = axis === "x" ? self.y : self.x;
  const selfEnd = selfStart + (axis === "x" ? self.height : self.width);
  const targetStart = axis === "x" ? target.y : target.x;
  const targetEnd = targetStart + (axis === "x" ? target.height : target.width);
  const safeGap = Math.max(0, toFiniteNumber(gap, 0));
  const safeExteriorLength = Math.max(1, toFiniteNumber(exteriorLength, 12));

  const firstStart = Math.min(selfStart, targetStart);
  const firstEnd = selfStart <= targetStart ? selfEnd : targetEnd;
  const secondStart = selfStart <= targetStart ? targetStart : selfStart;
  const unionEnd = Math.max(selfEnd, targetEnd);
  const separation = secondStart - firstEnd;

  if (separation > 0) {
    const inset = Math.min(safeGap, separation / 4);
    const segment = buildAxisSegment(
      axis,
      guideCoordinate,
      firstEnd + inset,
      secondStart - inset
    );
    return segment ? [segment] : [];
  }

  const before = buildAxisSegment(
    axis,
    guideCoordinate,
    firstStart - safeGap - safeExteriorLength,
    firstStart - safeGap
  );
  const after = buildAxisSegment(
    axis,
    guideCoordinate,
    unionEnd + safeGap,
    unionEnd + safeGap + safeExteriorLength
  );
  return [before, after].filter(Boolean);
}
