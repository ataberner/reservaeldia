import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  chooseGuideAxisDecision, resolveCanvasDistanceForScreenPx, resolveLockedGuideDecision,
} from "../../lib/editorAlignmentGuides.js";
import { makeScene, withDiagnosticFlags } from "./loadGuideDiagnostics.mjs";

const EPSILON_SCREEN_PX = 0.01;
const almostEqual = (left, right) => Math.abs(left - right) < 1e-7;

function measureLockBoundary(kind, visualScale, ageMs) {
  const activationScreenPx = kind === "element" ? 10 : 6;
  const releaseScreenPx = kind === "element" ? 18 : 14;
  const expectedBoundaryScreenPx = releaseScreenPx * (ageMs <= 120 ? 1.75 : 1);
  const target = { id: "reference", box: { x: 100, y: 200, width: 200, height: 200 } };
  const lock = kind === "element"
    ? { source: "elemento", targetId: target.id, targetAnchorKind: "center", selfAnchorKind: "center" }
    : { source: "seccion" };
  lock.lockedAtMs = 1000;
  lock.releaseRadius = resolveCanvasDistanceForScreenPx(releaseScreenPx, visualScale);
  const samples = [-EPSILON_SCREEN_PX, 0, EPSILON_SCREEN_PX].map((epsilon) => {
    const distanceScreenPx = expectedBoundaryScreenPx + epsilon;
    const distanceCanvas = resolveCanvasDistanceForScreenPx(distanceScreenPx, visualScale);
    const decision = resolveLockedGuideDecision({
      axis: "x", lock, targets: [target],
      selfBox: { ...target.box, x: target.box.x + distanceCanvas },
      sectionDistance: distanceCanvas,
      sectionReleaseRadius: resolveCanvasDistanceForScreenPx(14, visualScale),
      elementReleaseRadius: resolveCanvasDistanceForScreenPx(18, visualScale),
      nowMs: 1000 + ageMs, lockMinMs: 120, softReleaseMultiplier: 1.75,
    });
    return { distanceScreenPx, distanceCanvas, retained: decision?.locked === true };
  });
  assert.equal(samples[0].retained, true);
  assert.equal(samples[2].retained, false);
  const activationSamples = [-EPSILON_SCREEN_PX, EPSILON_SCREEN_PX].map((epsilon) => {
    const distanceScreenPx = activationScreenPx + epsilon;
    const distance = resolveCanvasDistanceForScreenPx(distanceScreenPx, visualScale);
    const decision = chooseGuideAxisDecision({
      sectionDistance: kind === "section" ? distance : Infinity,
      bestElement: kind === "element" ? { g: { targetId: target.id }, dist: distance } : null,
      sectionRadius: resolveCanvasDistanceForScreenPx(6, visualScale),
      elementRadius: resolveCanvasDistanceForScreenPx(10, visualScale),
      sectionPriorityBias: resolveCanvasDistanceForScreenPx(4, visualScale),
    });
    return { distanceScreenPx, acquired: Boolean(decision) };
  });
  assert.equal(activationSamples[0].acquired, true);
  assert.equal(activationSamples[1].acquired, false);
  return { kind, visualScale, ageMs, expectedBoundaryScreenPx, samples, activationSamples };
}

function guideCoordinates(lines, axis) {
  return [...new Set(lines.filter((line) => axis === "x"
    ? line.type === "reach-x" || line.type === "seccion-cx"
    : line.type === "reach-y" || line.type === "seccion-cy")
    .map((line) => line.points[axis === "x" ? 0 : 1]))];
}

function runTrajectory({ name, kind = "element", visualScale, points, closeCandidates = false, diagonal = false }) {
  return withDiagnosticFlags(false, ({ setNow }) => {
    const scene = makeScene({ elementCount: kind === "section" ? 1 : closeCandidates ? 3 : 2, movingType: "forma", visualScale });
    scene.moving.width(200);
    scene.moving.height(200);
    scene.targets.forEach((node) => { node.width(200); node.height(200); });
    if (closeCandidates) {
      scene.targets[1].x(100 + 16 / visualScale);
      scene.targets[1].y(200);
    }
    scene.prepare();
    const baseX = kind === "section" ? 300 : 100;
    const baseY = diagonal ? 200 : 700;
    const initialAnchorX = baseX + 100;
    const samples = points.map(({ atMs, dxScreen, dyScreen = 0 }) => {
      setNow(1000 + atMs);
      // Real Konva drag writes the cursor-derived raw position for each event.
      // Never accumulate from the previous snapped output in this probe.
      const rawX = baseX + dxScreen / visualScale;
      const rawY = baseY + dyScreen / visualScale;
      scene.moving.x(rawX);
      scene.moving.y(rawY);
      const result = scene.evaluate();
      assert.ok(result, "the production guide evaluation must finish");
      const lines = scene.lines();
      const xGuides = guideCoordinates(lines, "x");
      const yGuides = guideCoordinates(lines, "y");
      const x = scene.moving.x();
      const y = scene.moving.y();
      const initialAnchorActive = xGuides.some((coordinate) => almostEqual(coordinate, initialAnchorX));
      return {
        atMs, raw: { x: rawX, y: rawY, dxScreen, dyScreen }, applied: { x, y },
        correctionScreen: { x: (x - rawX) * visualScale, y: (y - rawY) * visualScale },
        xGuides, yGuides,
        anchorState: initialAnchorActive ? "initial-anchor" : xGuides.length ? "different-anchor" : "free",
        snapCommitted: result.snapCommitted, snapMovedNode: result.snapMovedNode,
      };
    });
    return { name, kind, visualScale, closeCandidates, diagonal, samples };
  });
}

function buildTrajectories(visualScale) {
  const trajectories = [];
  for (const kind of ["element", "section"]) {
    const activation = kind === "element" ? 10 : 6;
    const release = kind === "element" ? 18 : 14;
    for (const early of [true, false]) {
      const boundary = release * (early ? 1.75 : 1);
      const at = early ? 20 : 121;
      const result = runTrajectory({
        name: early ? "early-cross-and-reenter" : "late-cross-and-reenter", kind, visualScale,
        points: [
          { atMs: 0, dxScreen: activation - 0.1 },
          { atMs: at, dxScreen: boundary - 0.1 },
          { atMs: at + 10, dxScreen: boundary + 0.1 },
          { atMs: at + 20, dxScreen: activation + 0.1 },
          { atMs: at + 30, dxScreen: activation - 0.1 },
        ],
      });
      assert.deepEqual(result.samples.map((sample) => sample.anchorState), [
        "initial-anchor", "initial-anchor", "free", "free", "initial-anchor",
      ]);
      trajectories.push(result);
    }
    const micro = runTrajectory({
      name: "microadjustment-and-direction-reversal", kind, visualScale,
      points: [
        { atMs: 0, dxScreen: 2 }, { atMs: 40, dxScreen: 1 },
        { atMs: 80, dxScreen: -1 }, { atMs: 130, dxScreen: -2 },
        { atMs: 170, dxScreen: 0 }, { atMs: 210, dxScreen: 2 },
      ],
    });
    assert.ok(micro.samples.every((sample) => sample.anchorState === "initial-anchor"));
    trajectories.push(micro);
  }
  const diagonal = runTrajectory({
    name: "diagonal-axis-independent-release", visualScale, diagonal: true,
    points: [
      { atMs: 0, dxScreen: 9, dyScreen: 9 },
      { atMs: 121, dxScreen: 17, dyScreen: 17 },
      { atMs: 141, dxScreen: 18.1, dyScreen: 17 },
      { atMs: 161, dxScreen: 0, dyScreen: 18.1 },
    ],
  });
  assert.equal(diagonal.samples[2].xGuides.length, 0);
  assert.equal(diagonal.samples[2].yGuides.length, 1);
  assert.equal(diagonal.samples[3].xGuides.length, 1);
  assert.equal(diagonal.samples[3].yGuides.length, 0);
  trajectories.push(diagonal);
  const close = runTrajectory({
    name: "close-candidates-release-old-and-acquire-other", visualScale, closeCandidates: true,
    points: [
      { atMs: 0, dxScreen: 2 }, { atMs: 121, dxScreen: 17 },
      { atMs: 141, dxScreen: 19 }, { atMs: 300, dxScreen: -3 },
    ],
  });
  assert.deepEqual(close.samples.map((sample) => sample.anchorState), [
    "initial-anchor", "initial-anchor", "different-anchor", "initial-anchor",
  ]);
  trajectories.push(close);
  return trajectories;
}

export function runGuideUxProbe() {
  const boundaries = [1, 0.6].flatMap((scale) => ["element", "section"].flatMap((kind) =>
    [119, 120, 121].map((ageMs) => measureLockBoundary(kind, scale, ageMs))));
  const repetitions = Array.from({ length: 5 }, () => [1, 0.6].flatMap(buildTrajectories));
  for (const repetition of repetitions.slice(1)) assert.deepEqual(repetition, repetitions[0]);
  return {
    baseline: "Phase 3 operation/UX probe; production thresholds unchanged",
    method: "Production hook, geometry and engine; single-render React adapter; counted node doubles with real Konva Transform; controlled monotonic clock; raw cursor-derived coordinates reset for every sample.",
    limitations: ["No browser input dispatch", "No mouse/trackpad/touch hardware claims", "No React lifecycle/render timing", "No FPS or perceptual smoothness claim", "Five identical runs validate deterministic output, not five independent performance measurements"],
    thresholdsScreenPx: { elementActivation: 10, sectionActivation: 6, elementReleaseAfter120ms: 18, sectionReleaseAfter120ms: 14, initialMultiplier: 1.75, initialWindowInclusiveMs: 120, elementInitialRelease: 31.5, sectionInitialRelease: 24.5 },
    boundaryProbeEpsilonScreenPx: EPSILON_SCREEN_PX,
    boundaries, deterministicRepetitions: repetitions.length, repetitionsIdentical: true,
    trajectories: repetitions[0],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = runGuideUxProbe();
  const outputDirectory = new URL("../../../.local-isolation/drag-phase3/ux/", import.meta.url);
  await mkdir(outputDirectory, { recursive: true });
  const output = new URL("guide-ux-evidence.json", outputDirectory);
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: output.pathname, boundaries: evidence.boundaries.length, trajectories: evidence.trajectories.length, repetitions: evidence.deterministicRepetitions, identical: evidence.repetitionsIdentical }));
}
