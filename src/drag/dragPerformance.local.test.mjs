import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createPerformanceScene, installPerformanceProbe, runControlledGesture } from "./dragPerformance.browser.test.mjs";
import { makeCountdownFixture, readRealInteractionSnapshot, assertSettledVisuals, assertSettledInteraction, assertKeyboardHistoryReady, assertGroupChildrenPreserved, assertSelectionTranslation, assertImmediateDestination, assertImmediateTranslation } from "./testSupport/realDragFunctionalAssertions.mjs";
import { installRealLongTaskProbe, installRealReactCommitProbe } from "./testSupport/realDragObservations.mjs";
import { installRealSampleProbe } from "./testSupport/realDragSampleProbe.mjs";
import { pollPersistedPose } from "./testSupport/pollPersistedPose.mjs";
import { writeJsonAtomically } from "./testSupport/writeJsonAtomically.mjs";
import { verifySeedAfterTimeout } from "./testSupport/verifySeedAfterTimeout.mjs";
import { buildPersistableRenderState } from "../components/editor/persistence/borradorSyncRenderState.js";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { LOCAL_PROJECT, LOCAL_BUCKET, EMULATORS, HOST } = require("../../shared/firebaseEnvironment.cjs");
const ORIGIN = "http://localhost:3100";
const AUTH_ORIGIN = `http://${HOST}:${EMULATORS.auth}`;
const FIRESTORE_ORIGIN = `http://${HOST}:${EMULATORS.firestore}`;
const ALLOWED_PORTS = new Set(["3100", ...Object.values(EMULATORS).map(String)]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const inside = (parent, child) => { const relative = path.relative(parent, child); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };

// Explicit loopback destinations and a demo-only session are mandatory. This
// runner never imports Firebase SDKs, root dotenv, ADC or browser profiles.
function validateSession() {
  assert.ok(process.env.DRAG_PERF_LOCAL_SESSION, "DRAG_PERF_LOCAL_SESSION must name a running canonical local session");
  const session = realpathSync(path.resolve(process.env.DRAG_PERF_LOCAL_SESSION));
  assert.ok(inside(realpathSync(path.join(ROOT, ".local-isolation")), session));
  const marker = json(path.join(session, "session.json"));
  assert.equal(marker.owner, "reservaeldia-local");
  assert.equal(marker.project, LOCAL_PROJECT);
  assert.ok(!marker.stopped, "session must still be running");
  const workspace = path.join(session, "workspace");
  const env = json(path.join(workspace, "scripts/local/sessionEnvironment.json"));
  assert.equal(env.GCLOUD_PROJECT, LOCAL_PROJECT);
  assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, LOCAL_PROJECT);
  assert.equal(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, LOCAL_BUCKET);
  assert.equal(env.NEXT_PUBLIC_FIREBASE_MODE, "emulators");
  assert.equal(env.EMAIL_MODE, "disabled");
  assert.ok(env.NODE_OPTIONS.includes("networkGuard.cjs"));
  for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "CLOUDSDK_CONFIG", "XDG_CONFIG_HOME"]) assert.ok(inside(session, path.resolve(env[key])), `${key} must be private to the session`);
  for (const [service, port] of Object.entries(EMULATORS)) {
    const configured = json(path.join(workspace, "firebase.local.json")).emulators[service];
    assert.deepEqual(configured, { host: HOST, port, ...(service === "firestore" ? { websocketPort: 19150 } : {}) });
  }
  assert.ok(existsSync(env.RESERVA_TEST_CHROME), "cached browser required; no download");
  return { session, workspace, env, marker };
}

function allowedBrowserUrl(value) {
  const url = new URL(value);
  return ["about:", "data:", "blob:"].includes(url.protocol) ||
    (["http:", "ws:"].includes(url.protocol) && ["localhost", HOST].includes(url.hostname) && ALLOWED_PORTS.has(url.port));
}

async function localRequest(url, options = {}, allowedFailureStatuses = []) {
  assert.ok([AUTH_ORIGIN, FIRESTORE_ORIGIN].includes(new URL(url).origin));
  const response = await fetch(url, { ...options, redirect: "error", signal: options.signal || AbortSignal.timeout(15000) });
  // Never include response bodies or auth tokens in error output.
  assert.ok(response.ok || allowedFailureStatuses.includes(response.status), `synthetic emulator request failed: ${response.status} ${new URL(url).pathname}`);
  if (response.status === 404) return null;
  return response.json();
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, firestoreValue(entry)])) } };
}

export function createRealPerformanceScene(family, count) {
  const scene = createPerformanceScene(family, count, 1);
  // Exercise the central area of the full dashboard without changing its
  // CSS/zoom. This fixture location is fixed across before/after runs.
  scene.objects[0].x = 240;
  if (family === "multiselect") scene.objects[1].x = 340;
  scene.sections = scene.sections.map((section) => ({ ...section, altoModo: "fijo", fondo: "#ffffff" }));
  for (const object of scene.objects) {
    object.color = "#3566a6";
    if (object.tipo === "texto") object.fontFamily = "Arial";
    if (object.tipo === "forma") {
      // The real shape renderer supports embedded text. Keep geometry controls
      // plain instead of accidentally exercising that additional text owner.
      delete object.texto; delete object.fontSize; delete object.fontFamily;
    }
  }
  if (family === "image") scene.objects[0].src = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#3765a0"/><circle cx="80" cy="30" r="18" fill="#ffd899"/></svg>').toString("base64")}`;
  if (family === "countdown") scene.objects[0] = makeCountdownFixture();
  if (family === "group") scene.objects[0].children = [
    { id: "group-child-shape", tipo: "forma", figura: "rect", x: 0, y: 0, width: 60, height: 60, color: "#3566a6" },
    { id: "group-child-text", tipo: "texto", x: 65, y: 20, width: 50, height: 24, texto: "Grupo", fontSize: 14, fontFamily: "Arial", color: "#202020" },
  ];
  if (family === "group") {
    // Seed a saved group's canonical child shape, including the existing text
    // persistence defaults. Reload must still preserve every child field.
    scene.objects[0] = buildPersistableRenderState({ objetos: [scene.objects[0]], secciones: scene.sections }).objetos[0];
  }
  return scene;
}

function matrix(kind) {
  let cases;
  if (["smoke", "handoff"].includes(kind)) cases = ["shape", "text", "rotated", "image", "gallery", "countdown", "group", "multiselect", "multisection"].map((family) => ({ family, count: 10 }));
  else if (kind === "text-smoke") cases = [{ family: "text", count: 10 }];
  else if (kind === "focus") cases = [10, 100].map((count) => ({ family: "text", count }));
  else if (kind === "ux") cases = ["horizontal", "vertical", "diagonal", "reverse", "micro", "fast", "immediate"].map((trajectory) => ({ family: "text", count: 10, trajectory }));
  else {
    assert.equal(kind, "core", "Unknown real drag matrix");
    cases = ["shape", "text"].flatMap((family) => [1, 10, 50, 100].map((count) => ({ family, count })));
  }
  if (process.env.DRAG_PERF_TRAJECTORIES) {
    assert.equal(kind, "ux", "trajectory filtering applies only to the UX matrix");
    const requested = process.env.DRAG_PERF_TRAJECTORIES.split(",");
    assert.ok(requested.every((trajectory) => cases.some((scenario) => scenario.trajectory === trajectory)));
    cases = cases.filter((scenario) => requested.includes(scenario.trajectory));
  }
  const scales = process.env.DRAG_PERF_SCALES ? process.env.DRAG_PERF_SCALES.split(",").map(Number) : [1, .6];
  assert.ok(scales.every((scale) => [1, .6].includes(scale)));
  return cases.filter(({ family, count }) => (!process.env.DRAG_PERF_FAMILIES || process.env.DRAG_PERF_FAMILIES.split(",").includes(family)) &&
    (!process.env.DRAG_PERF_COUNTS || process.env.DRAG_PERF_COUNTS.split(",").map(Number).includes(count)))
    .flatMap((scenario) => scales.map((zoom) => ({ ...scenario, zoom, trajectory: scenario.trajectory || "sweep" })));
}

async function calibrateRealScale(page, target) {
  // Both disposable variants declare the same initial zoom prop in their
  // source manifest. The real useViewportScale applies its existing 1.15 boost;
  // this assertion observes the result, never rewrites CSS or Konva transforms.
  await page.waitForFunction((scale) => {
    const stage = window._elementRefs?.active?.getStage();
    return stage && Math.abs(stage.container().getBoundingClientRect().width / stage.width() - scale) < .00001;
  }, { timeout: 10000 }, target);
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), false);
  assert.ok(page.viewport().width > 1024, "same desktop viewport must be retained at both effective scales");
}

async function installRealProbes(page, diagnostic) {
  if (diagnostic) await installRealDiagnosticAdapter(page);
  await installPerformanceProbe(page, { diagnostic });
  await installRealLongTaskProbe(page);
  if (diagnostic) await installRealSampleProbe(page);
}

async function nodeSnapshot(page, id = "active") {
  return page.evaluate((id) => {
    const node = window._elementRefs?.[id], object = window._objetosActuales?.find((object) => object.id === id);
    if (!node || !object) return null;
    const stage = node.getStage(), rect = stage.container().getBoundingClientRect();
    // Specialized Group roots do not declare their own width/height. Reuse
    // their existing frame. Try the original root-local point first for other
    // families; only fall back when live DOM/Konva hit testing rejects it.
    const specialFrame = object.tipo === "galeria" ? node.findOne(".gallery-transform-frame")
      : object.tipo === "countdown" ? node.findOne(".countdown-hitbox") : null;
    const pointNode = specialFrame || node;
    const pointWidth = pointNode.width(), pointHeight = pointNode.height();
    const originalLocal = { x: Math.min(20, Math.max(1, pointWidth / 2)), y: Math.min(20, Math.max(1, pointHeight / 2)) };
    const candidates = [{ name: "original-inset", local: originalLocal },
      { name: "center", local: { x: pointWidth / 2, y: pointHeight / 2 } },
      ...[[.25, .25], [.75, .25], [.25, .75], [.75, .75]].map(([x, y]) =>
        ({ name: "quarter-" + x + "-" + y, local: { x: pointWidth * x, y: pointHeight * y } })),
      { name: "opposite-inset", local: { x: pointWidth - originalLocal.x, y: pointHeight - originalLocal.y } }];
    const scale = rect.width / stage.width(), attempts = [], seen = new Set();
    const transform = pointNode.getAbsoluteTransform();
    for (const candidate of candidates) {
      const key = candidate.local.x + ":" + candidate.local.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const absolute = transform.point(candidate.local);
      const point = { x: rect.left + absolute.x * scale, y: rect.top + absolute.y * scale };
      const hit = stage.getIntersection(absolute), hitAncestry = [];
      let hitIncludesExpectedRoot = false;
      for (let current = hit; current && current !== stage; current = current.getParent()) {
        if (current === node) hitIncludesExpectedRoot = true;
        hitAncestry.push({ type: current.getClassName(), id: current.id(), name: current.name() });
      }
      const screenHit = document.elementFromPoint(point.x, point.y);
      const screenHitInStage = Boolean(screenHit && stage.container().contains(screenHit));
      const valid = Number.isFinite(point.x) && Number.isFinite(point.y) &&
        screenHit?.tagName === "CANVAS" && screenHitInStage && hitIncludesExpectedRoot &&
        !hitAncestry.some((entry) => entry.type === "Transformer");
      attempts.push({ candidate: candidate.name, local: candidate.local, point, absolute,
        hitName: hit?.getParent()?.id() || hit?.id() || null, hitAncestry, hitIncludesExpectedRoot,
        screenHitTag: screenHit?.tagName || null, screenHitClass: String(screenHit?.className || ""), screenHitInStage, valid });
      if (valid) break;
    }
    // Post-release/reload snapshots may have no exposed hit point. Preserve
    // geometry and failed attempts; only pregesture assertions require a hit.
    const chosen = attempts.find((attempt) => attempt.valid) || attempts[0];
    return { atMs: performance.now(), point: chosen.point,
      pointSource: specialFrame ? specialFrame.name() : "root",
      specializedFrameMissing: ["galeria", "countdown"].includes(object.tipo) && !specialFrame,
      pointLocal: chosen.local, pointValid: chosen.valid, pointCandidate: chosen.candidate, pointAttempts: attempts,
      hitAncestry: chosen.hitAncestry, hitIncludesExpectedRoot: chosen.hitIncludesExpectedRoot,
      screenHitInStage: chosen.screenHitInStage, screenHitClass: chosen.screenHitClass,
      scale, stageWidth: stage.width(), stageHeight: stage.height(), rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      node: { x: node.x(), y: node.y(), width: node.width(), height: node.height(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY(), offsetX: node.offsetX(), offsetY: node.offsetY(), __canonicalPoseMode: node.getAttr("__canonicalPoseMode") || null, draggable: node.draggable() },
      // Read-only evidence for repeated destinations after real undo. Never
      // clear Konva's private drag cache to make a synthetic gesture succeed.
      nativeDragNodeId: node._id,
      nativeDragLastPosition: node._lastPos ? { x: node._lastPos.x, y: node._lastPos.y } : null,
      stagePose: { x: stage.x(), y: stage.y(), scaleX: stage.scaleX(), scaleY: stage.scaleY() },
      nodeRectInStage: node.getClientRect({ relativeTo: stage }),
      hitName: chosen.hitName,
      screenHitTag: chosen.screenHitTag,
      object: { id: object.id, x: object.x, y: object.y, rotation: object.rotation, seccionId: object.seccionId },
      sections: window._seccionesOrdenadas?.map((section) => ({ id: section.id, altura: section.altura, altoModo: section.altoModo })) || [],
      inlineEditorIds: [...document.querySelectorAll("[data-inline-editor-id]")].map((entry) => entry.getAttribute("data-inline-editor-id")),
      activeCount: window._objetosActuales.length, dragging: node.isDragging(),
      selection: window._elementosSeleccionados || null,
      guideCount: stage.findOne(".canvas-guide-layer")?.getChildren().length ?? null,
      overlays: stage.find(".selection-bounds-indicator").map((overlay) => ({
        visible: overlay.isVisible(), rect: overlay.getClientRect(),
        children: overlay.getChildren().map((child) => ({ type: child.getClassName(), visible: child.isVisible(), x: child.x(), y: child.y(), width: child.width(), height: child.height() })),
      })) };
  }, id);
}

function assertRealDragHit(snapshot, label) {
  const detail = JSON.stringify({ id: snapshot?.object?.id, point: snapshot?.point,
    pointSource: snapshot?.pointSource, pointLocal: snapshot?.pointLocal, pointValid: snapshot?.pointValid,
    pointCandidate: snapshot?.pointCandidate, pointAttempts: snapshot?.pointAttempts,
    specializedFrameMissing: snapshot?.specializedFrameMissing,
    hitAncestry: snapshot?.hitAncestry, hitIncludesExpectedRoot: snapshot?.hitIncludesExpectedRoot,
    screenHitTag: snapshot?.screenHitTag, screenHitClass: snapshot?.screenHitClass,
    screenHitInStage: snapshot?.screenHitInStage, stageContainerRect: snapshot?.rect });
  assert.ok(snapshot && !snapshot.specializedFrameMissing, label + ": specialized drag frame must exist; " + detail);
  assert.equal(snapshot.pointValid, true, label + ": no exposed interior point hits the requested root; " + detail);
  assert.ok(Number.isFinite(snapshot.point.x) && Number.isFinite(snapshot.point.y), label + ": finite drag point required; " + detail);
  assert.equal(snapshot.screenHitTag, "CANVAS", label + ": drag point must be exposed on canvas; " + detail);
  assert.equal(snapshot.screenHitInStage, true, label + ": drag point canvas must belong to this Stage; " + detail);
  assert.equal(snapshot.hitIncludesExpectedRoot, true, label + ": drag point must hit the requested root or a descendant; " + detail);
  assert.ok(!snapshot.hitAncestry.some((entry) => entry.type === "Transformer"), label + ": drag point must not hit a transform control; " + detail);
}

async function installRealDiagnosticAdapter(page) {
  await page.evaluate(() => {
    const stage = window._elementRefs.active.getStage();
    const constructors = {};
    for (const node of [stage, ...stage.find(() => true)]) {
      for (let prototype = Object.getPrototypeOf(node); prototype; prototype = Object.getPrototypeOf(prototype)) {
        const name = prototype.constructor?.name;
        if (["Node", "Shape", "Container", "Group", "Text", "Layer"].includes(name)) constructors[name] = prototype.constructor;
      }
    }
    window.__DRAG_PERF_KONVA = constructors;
    // Read-only adapter for the shared diagnostic input sampler. No DOM reads,
    // state updates or scheduling; its overhead remains diagnostic-only.
    const overlays = stage.find(".selection-bounds-indicator");
    const guides = stage.findOne(".canvas-guide-layer");
    window.dragPerformanceLab = {
      inputSample() {
        return { pointer: stage.getPointerPosition(), node: window._elementRefs.active?.position(), lines: guides?.getChildren().length || 0,
          overlays: overlays.map((overlay) => ({ visible: overlay.isVisible(), children: overlay.getChildren().map((child) => ({
            type: child.getClassName(), visible: child.isVisible(), x: child.x(), y: child.y(), width: child.width(), height: child.height(),
          })) })) };
      },
    };
  });
}

// Functional-only observer. It adds synchronous read work, never product state
// writes, scheduling or a CDP roundtrip between the final move and release.
// Its evidence is excluded from timing populations and is not presentation time.
async function beginFunctionalGuideObservation(page) {
  return page.evaluate(() => {
    const probe = window.__DRAG_PERF_PROBE;
    if (!probe || probe.stopFunctionalGuideObservation) throw new Error("Functional observer lifecycle mismatch");
    const read = (event = null, phase = "current") => {
      const node = window._elementRefs.active, stage = node.getStage();
      const frame = node.findOne?.(".gallery-transform-frame") ||
        node.findOne?.(".countdown-hitbox") || node;
      const frameRect = frame.getClientRect({ relativeTo: stage, skipShadow: true, skipStroke: true });
      const lines = (stage.findOne(".canvas-guide-layer")?.getChildren() || [])
        .filter((line) => line.getClassName() === "Line" && line.isVisible() && line.getAbsoluteOpacity() > 0)
        .map((line) => {
          const transform = stage.getAbsoluteTransform().copy().invert().multiply(line.getAbsoluteTransform());
          const points = line.points();
          const stagePoints = [];
          for (let index = 0; index + 1 < points.length; index += 2) {
            const point = transform.point({ x: points[index], y: points[index + 1] });
            stagePoints.push(point.x, point.y);
          }
          return { points: stagePoints, stroke: line.stroke(), strokeWidth: line.strokeWidth() };
        });
      return { phase, atMs: performance.now(), nativeTimeStamp: event?.timeStamp ?? null,
        pointer: event ? { x: event.clientX, y: event.clientY } : null,
        nodePose: { x: node.x(), y: node.y() }, frameRect, stageWidth: stage.width(), lines,
        groupSession: window._groupDragSession ? {
          engine: window._groupDragSession.engine, phase: window._groupDragSession.phase,
          sessionId: window._groupDragSession.sessionId,
          pointerDownStage: { ...window._groupDragSession.pointerDownStage },
          activationPointerStage: window._groupDragSession.activationPointerStage ? { ...window._groupDragSession.activationPointerStage } : null,
          lastPreviewDelta: window._groupDragSession.lastPreviewDelta ? { ...window._groupDragSession.lastPreviewDelta } : null,
          hasPreviewSinceActivation: window._groupDragSession.hasPreviewSinceActivation,
        } : null };
    };
    let lastMove = null, beforeRelease = null;
    const onMove = (event) => { if (event.buttons & 1) lastMove = read(event, "last-mousemove-bubble"); };
    // Installed before mouse.down: precedes family-specific pointerup listeners
    // attached by the press. Native Konva mouseup cleanup has not run yet.
    const onRelease = (event) => { if (event.button === 0) beforeRelease = read(event, "pointerup-capture"); };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("pointerup", onRelease, { capture: true, passive: true });
    probe.stopFunctionalGuideObservation = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerup", onRelease, true);
      delete probe.stopFunctionalGuideObservation;
      return { lastMove, beforeRelease, current: read(), measurement: false };
    };
    return read(null, "before-gesture");
  });
}

async function endFunctionalGuideObservation(page) {
  return page.evaluate(() => window.__DRAG_PERF_PROBE.stopFunctionalGuideObservation());
}

function assertSectionFrameCenter(observation, label) {
  assert.ok(observation, `${label}: functional guide observation must exist`);
  const center = observation.stageWidth / 2;
  assert.ok(Math.abs(observation.frameRect.x + observation.frameRect.width / 2 - center) < .1,
    `${label}: the visible frame center must align with the section center`);
}

function assertExactSectionCenterGuide(observation, label) {
  assertSectionFrameCenter(observation, label);
  const center = observation.stageWidth / 2;
  assert.ok(observation.lines.some(({ points, strokeWidth }) => points.length >= 4 && strokeWidth > 0 &&
    Math.abs(points[0] - center) < .1 && Math.abs(points[2] - center) < .1 &&
    Math.abs(points[1] - points[3]) > 1), `${label}: a visible vertical guide must lie at that exact center`);
}

function assertNoPostReleaseReposition(released, settled, selectedIds) {
  for (const id of selectedIds) {
    const before = released.nodes.find((node) => node.id === id);
    const after = settled.nodes.find((node) => node.id === id);
    assert.ok(before && after, `${id}: released and settled roots must exist`);
    assert.equal(after.object.seccionId, before.object.seccionId, `${id}: section must not change after release`);
    for (const axis of ["x", "y"]) assert.ok(Math.abs(after.object[axis] - before.object[axis]) < .01,
      `${id}: committed ${axis} must not move between release and settling`);
    for (const key of ["x", "y", "rotation", "scaleX", "scaleY", "offsetX", "offsetY"]) {
      assert.ok(Math.abs(after.pose[key] - before.pose[key]) < .01,
        `${id}: visual ${key} must not change between release and settling`);
    }
  }
}


async function captureRealVisualExample(page, output, family) {
  const before = await nodeSnapshot(page);
  assertRealDragHit(before, `visual ${family}`);
  const initialGuideObservation = await beginFunctionalGuideObservation(page);
  const box = initialGuideObservation.frameRect;
  const delta = initialGuideObservation.stageWidth / 2 - (box.x + box.width / 2);
  await page.mouse.move(before.point.x, before.point.y);
  await page.mouse.down();
  const activation = family.startsWith("gallery") ? 6 : 0;
  if (activation) await page.mouse.move(before.point.x + activation, before.point.y);
  // Functional screenshot only: leave a possible existing lock, then return.
  await page.mouse.move(before.point.x + activation + 40, before.point.y + 12);
  await page.mouse.move(before.point.x + activation + delta * before.scale, before.point.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const during = await nodeSnapshot(page);
  const guideEvidence = await endFunctionalGuideObservation(page);
  writeFileSync(path.join(output, `${family}-visual-guide-observation.json`), JSON.stringify(guideEvidence, null, 2));
  assertExactSectionCenterGuide(guideEvidence.current, family);
  await page.screenshot({ path: path.join(output, `${family}-during-guide.png`) });
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const released = await nodeSnapshot(page);
  await page.screenshot({ path: path.join(output, `${family}-released.png`) });
  assert.equal(released.guideCount, 0);
  return { before, during, released, guideEvidence, measurement: false,
    note: "Functional visual observation with exact center-guide assertion, deliberate pause and screenshot; excluded from performance samples." };
}


async function dismissExpectedLocalDevOverlay(page) {
  const dismissalStarted = performance.now();
  const dialogs = await page.evaluate(() => [...document.querySelectorAll("nextjs-portal")].flatMap((portal) =>
    [...(portal.shadowRoot?.querySelectorAll("[data-nextjs-dialog]") || [])].map((dialog) => dialog.textContent || "")));
  if (!dialogs.length) return 0;
  const expected = "LOCAL_FLOW_DISABLED: getAdminAccess no está habilitado para pruebas aisladas.";
  assert.ok(dialogs.every((text) => text.includes(expected)), "unexpected Next runtime overlay; preserve failure evidence instead of dismissing it");
  // Next 15 dialog's public keyboard interaction calls onClose on Escape.
  // The demo endpoint remains blocked; no app state, CSS or error handler is
  // changed. This expected local-only overlay is recorded as a limitation.
  await page.evaluate(() => {
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const dialog = portal.shadowRoot?.querySelector("[data-nextjs-dialog]");
      if (dialog) { dialog.focus(); break; }
    }
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => [...document.querySelectorAll("nextjs-portal")].every((portal) =>
    !portal.shadowRoot?.querySelector("[data-nextjs-dialog]")), { timeout: 10000 });
  if (performance.now() - dismissalStarted > 2000) console.log(`[real-drag] Expected local dev overlay close exceeded 2s: ${Math.round(performance.now() - dismissalStarted)}ms (setup only)`);
  return dialogs.length;
}

async function startSelectionPreparationTrace(page) {
  await page.evaluate(() => {
    const events = [];
    const read = (event, phase) => {
      const stage = window._elementRefs?.active?.getStage();
      const rect = stage?.container().getBoundingClientRect();
      const point = rect && { x: (event.clientX - rect.left) * stage.width() / rect.width, y: (event.clientY - rect.top) * stage.height() / rect.height };
      const leaf = point && stage.getIntersection(point);
      const ancestry = [];
      for (let node = leaf; node; node = node.getParent()) ancestry.push({ type: node.getClassName(), id: node.id(), name: node.name() });
      events.push({ at: performance.now(), type: event.type, phase, shift: event.shiftKey, target: event.target?.tagName,
        selection: [...(window._elementosSeleccionados || [])], inline: [...document.querySelectorAll('[data-inline-editor-id]')].map((element) => element.dataset.inlineEditorId), ancestry });
    };
    const handler = (event) => { read(event, 'capture'); queueMicrotask(() => read(event, 'microtask')); };
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const type of types) window.addEventListener(type, handler, { capture: true, passive: true });
    window.__selectionPreparationTrace = { stop() { for (const type of types) window.removeEventListener(type, handler, true); return events; } };
  });
}

async function selectByRealMarquee(page, ids) {
  const plan = await page.evaluate((ids) => {
    const stage = window._elementRefs.active.getStage();
    const boxes = ids.map((id) => window._elementRefs[id].getClientRect({ relativeTo: stage }));
    const rect = stage.container().getBoundingClientRect(), scale = rect.width / stage.width();
    const screen = (point) => ({ x: rect.left + point.x * scale, y: rect.top + point.y * scale });
    const attempts = [];
    // Try the same small AABB intersection from four corners. Rotated roots
    // may put the first corner under surrounding DOM UI. This does not move
    // fixtures, change their hit geometry or inject editor selection state.
    for (const [sideX, sideY] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const start = {
        x: sideX < 0 ? Math.min(...boxes.map((box) => box.x)) - 10 : Math.max(...boxes.map((box) => box.x + box.width)) + 10,
        y: sideY < 0 ? Math.min(...boxes.map((box) => box.y)) - 10 : Math.max(...boxes.map((box) => box.y + box.height)) + 10,
      };
      const end = {
        x: sideX < 0 ? Math.max(...boxes.map((box) => box.x + Math.min(20, box.width / 2))) : Math.min(...boxes.map((box) => box.x + box.width - Math.min(20, box.width / 2))),
        y: sideY < 0 ? Math.max(...boxes.map((box) => box.y + Math.min(20, box.height / 2))) : Math.min(...boxes.map((box) => box.y + box.height - Math.min(20, box.height / 2))),
      };
      const leaf = stage.getIntersection(start);
      let empty = true;
      for (let node = leaf; node && node !== stage; node = node.getParent()) {
        if (node.getClassName() === "Transformer" || Object.values(window._elementRefs).includes(node)) empty = false;
      }
      const from = screen(start), to = screen(end);
      const top = document.elementFromPoint(from.x, from.y), endTop = document.elementFromPoint(to.x, to.y);
      const attempt = { sideX, sideY, from, to, stageStart: start, stageEnd: end, empty,
        hitType: leaf?.getClassName() || null, topTag: top?.tagName ?? null, topClass: String(top?.className || ""), endTag: endTop?.tagName ?? null };
      attempts.push(attempt);
      if (empty && top?.tagName === "CANVAS" && endTop?.tagName === "CANVAS") return { ...attempt, boxes, attempts };
    }
    throw new Error(`No unobstructed empty marquee corner: ${JSON.stringify({ boxes, attempts })}`);
  }, ids);
  if (plan.attempts.length > 1) console.log(`[real-drag] Alternative marquee corner: ${JSON.stringify(plan)}`);
  await page.mouse.move(plan.from.x, plan.from.y);
  await page.mouse.down();
  await page.mouse.move(plan.to.x, plan.to.y, { steps: 3 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.up();
  await page.waitForFunction((ids) => [...(window._elementosSeleccionados || [])].sort().join('|') === [...ids].sort().join('|'), { timeout: 5000 }, ids);
  return plan;
}

async function waitForRealStartupOverlay(page) {
  // Stage refs can exist while DashboardLayout still intercepts interaction
  // with its real startup overlay. Wait for the user-visible ready state;
  // never hide the loader or write editor state to make a fixture selectable.
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')]
    .some((element) => element.textContent.includes("Estamos preparando tu invitacion")), { timeout: 30000 });
}

export function resolveRealDragEvidencePhase(value = "drag-phase3b") {
  assert.ok(["drag-phase3b", "drag-phase3c"].includes(value), "unsupported drag evidence phase");
  return value;
}

export function hasPrivateDragInstrumentation(file, source) {
  const code = source.toString("utf8");
  if (!code.includes("const __dragPerfStop = globalThis.__DRAG_PERF_PROBE")) return false;
  // The source inventory also includes the instrumenter and this runner. Their
  // marker literals are not executed probes. Inspect declarations while
  // retaining every source hash and rejecting actual injected runtime code.
  const ts = require("../../functions/node_modules/typescript");
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.equal(parsed.parseDiagnostics.length, 0, `cannot validate instrumentation in malformed source: ${file}`);
  let instrumented = false;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "__dragPerfStop") instrumented = true;
    if (!instrumented) ts.forEachChild(node, visit);
  };
  visit(parsed);
  return instrumented;
}

function inspectStrictHandoff(snapshot, selectedIds) {
  // Observable motion/selection invariants remain hard requirements. A known
  // residual runtime identity is reported separately, never labelled a pass.
  assertSettledVisuals(snapshot, { selectedIds });
  try { assertSettledInteraction(snapshot, { selectedIds }); return { passed: true }; }
  catch (error) { return { passed: false, message: error.message }; }
}

test("isolated real editor drag performance (explicit opt in)", {
  skip: process.env.DRAG_PERF_LOCAL !== "1" ? "Set DRAG_PERF_LOCAL=1 and DRAG_PERF_LOCAL_SESSION; local running demo only." : false,
  timeout: 3_600_000,
}, async (t) => {
  assert.equal(process.versions.node.split(".")[0], "20");
  const { session, workspace, env, marker } = validateSession();
  const { resolveCanonicalNodePose } = await import(pathToFileURL(path.join(workspace, "src/components/editor/canvasEditor/konvaCanonicalPose.js")).href);
  const ts = require("../../functions/node_modules/typescript");
  const layoutSource = readFileSync(path.join(workspace, "src/utils/layout.ts"), "utf8");
  const { calcularOffsetY } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(layoutSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`);
  const assertCanonicalPose = (snapshot) => {
    const pose = resolveCanonicalNodePose({ attrs: snapshot.node, getAttr: (key) => snapshot.node[key] }, snapshot.object);
    const index = Math.max(0, snapshot.sections.findIndex((section) => section.id === snapshot.object.seccionId));
    assert.ok(snapshot.sections.every((section) => section.altoModo !== "pantalla"), "runner fixtures require fixed-height sections");
    const expected = { x: snapshot.object.x, y: snapshot.object.y + calcularOffsetY(snapshot.sections, index) };
    for (const axis of ["x", "y"]) assert.ok(Math.abs(pose[axis] - expected[axis]) < .01, `canonical node ${axis} must match committed model in stage coordinates`);
    snapshot.canonicalPose = pose;
    snapshot.expectedCanonicalStagePose = expected;
  };
  const diagnostic = process.env.DRAG_PERF_MODE === "diagnostic";
  const evidencePhase = resolveRealDragEvidencePhase(process.env.DRAG_PERF_EVIDENCE_PHASE);
  const strictHandoff = process.env.DRAG_PERF_STRICT_HANDOFF === "1";
  const kind = process.env.DRAG_PERF_MATRIX || "core";
  const handoffModifier = process.env.DRAG_PERF_HANDOFF_MODIFIER || null;
  assert.ok(handoffModifier === null || (kind === "handoff" && ["normal", "alt"].includes(handoffModifier)),
    "handoff modifier filter must be normal or alt and only applies to the functional matrix");
  const cdpTraceEnabled = process.env.DRAG_PERF_CDP_TRACE === "1";
  const cpuProfileEnabled = process.env.DRAG_PERF_CPU_PROFILE === "1";
  const traceSettleMs = Number(process.env.DRAG_PERF_TRACE_SETTLE_MS || 0);
  assert.ok(Number.isFinite(traceSettleMs) && traceSettleMs >= 0 && traceSettleMs <= 5000,
    "dedicated trace settling must be between 0 and 5000 ms");
  assert.ok(!cpuProfileEnabled || cdpTraceEnabled, "CPU profiling requires the dedicated CDP trace flag");
  assert.ok(traceSettleMs === 0 || cdpTraceEnabled, "extra observation is only allowed in a dedicated trace run");
  assert.ok(!(cpuProfileEnabled || traceSettleMs > 0) || kind !== "handoff", "dedicated capture uses the scenario trace branch, not handoff");
  const label = process.env.DRAG_PERF_LABEL || "baseline";
  assert.match(label, /^[a-zA-Z0-9_-]+$/);
  const repetitions = Number(process.env.DRAG_PERF_REPETITIONS || 5);
  const durationMs = Number(process.env.DRAG_PERF_DURATION_MS || 1000);
  assert.ok(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 20);
  assert.ok(Number.isFinite(durationMs) && durationMs >= 200 && durationMs <= 5000);
  const output = path.join(ROOT, ".local-isolation", evidencePhase, "runs", `${label}-real-${diagnostic ? "diagnostic" : "timing"}-${kind}`);
  if (evidencePhase === "drag-phase3c") assert.ok(!existsSync(path.join(output, "manifest.json")), "do not overwrite an existing Phase 3C run");
  mkdirSync(output, { recursive: true });
  const protocolFiles = ["src/drag/dragPerformance.local.test.mjs", "src/drag/dragPerformance.browser.test.mjs",
    "src/drag/testSupport/instrumentDragPerformance.cjs", "src/drag/testSupport/realDragSampleProbe.mjs",
    "src/drag/testSupport/realDragObservations.mjs", "src/drag/testSupport/realDragFunctionalAssertions.mjs",
    "src/drag/testSupport/pollPersistedPose.mjs", "src/drag/testSupport/writeJsonAtomically.mjs",
    "src/drag/testSupport/verifySeedAfterTimeout.mjs"];
  const protocolHashes = {};
  for (const file of protocolFiles) {
    const bytes = readFileSync(path.join(ROOT, file));
    protocolHashes[file] = hash(bytes);
    const destination = path.join(output, "protocol", file);
    mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
  }
  const profile = path.join(output, `browser-profile-${Date.now()}`);
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ executablePath: env.RESERVA_TEST_CHROME, headless: true, pipe: true, userDataDir: profile,
    env, args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--disable-gpu", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  if (diagnostic) await installRealReactCommitProbe(page);
  const viewport = { width: 1365, height: 1100, deviceScaleFactor: 1 };
  await page.setViewport(viewport);
  page.setDefaultTimeout(120000);
  const errors = [], blockedOrigins = [], failedRequests = [], trials = [], networkObservations = [];
  let completed = false;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failedRequests.push({ origin: url.origin, pathname: url.pathname, reason: request.failure()?.errorText,
      method: request.method(), resourceType: request.resourceType(), observedAt: new Date().toISOString() });
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (allowedBrowserUrl(request.url())) return void request.continue();
    blockedOrigins.push(new URL(request.url()).origin);
    void request.abort();
  });
  const sourceManifest = json(path.join(session, "source-manifest.json"));
  const sourceFiles = Object.keys(sourceManifest.files).filter((file) => /^(src\/(drag|hooks\/useGuias|components\/editor)|src\/pages\/dashboard\.js$|shared\/)/.test(file));
  const sourceHashes = sourceFiles.map((file) => {
    const source = readFileSync(path.join(workspace, file));
    return { file, sha256: hash(source), privateInstrumentation: hasPrivateDragInstrumentation(file, source) };
  });
  if (!diagnostic) assert.ok(!sourceHashes.some((entry) => entry.privateInstrumentation), "timing mode requires source without private instrumentation");
  const manifest = { version: 1, label, createdAt: new Date().toISOString(), sessionCreatedAt: marker.createdAt,
    runtime: "Next development, full real editor, isolated Firebase emulators", sourceHashes,
    sourceManifestSha256: hash(readFileSync(path.join(session, "source-manifest.json"))),
    sourceManifestMeaning: "Initial canonical copy provenance only; live sourceHashes describe the actual bytes, including temporary diagnostic or after changes in this disposable experiment.",
    protocolHashes, runnerSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    sharedGestureRunnerSha256: hash(readFileSync(path.join(ROOT, "src/drag/dragPerformance.browser.test.mjs"))),
    eventSource: "Puppeteer mouse dispatch through Chrome DevTools Protocol; not physical mouse/trackpad/touch",
    mode: diagnostic ? "diagnostic" : "timing-flags-off", node: process.version, chrome: await browser.version(),
    privateInstrumentationPresent: sourceHashes.some((entry) => entry.privateInstrumentation),
    platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
    memoryGiB: os.totalmem() / 1024 ** 3, osRelease: os.release(), displayRefreshHz: null,
    reactProfiler: { available: false, commitCount: null, note: "No Profiler component is mounted. Diagnostic raw.reactRootCommits separately reports actual DevTools root callbacks only when a renderer injected; it does not count component renders." },
    viewport, matrix: kind, handoffModifier, evidencePhase, strictHandoff,
    scenarioFilters: { families: process.env.DRAG_PERF_FAMILIES || null, counts: process.env.DRAG_PERF_COUNTS || null,
      scales: process.env.DRAG_PERF_SCALES || null, trajectories: process.env.DRAG_PERF_TRAJECTORIES || null },
    repetitions: kind === "handoff" ? 5 : repetitions, warmupPerCaseAndModifier: kind === "handoff" ? 0 : 1, durationMs,
    cdpTraceEnabled, cpuProfileEnabled, traceSettleMs,
    dedicatedCapture: {
      enabled: cdpTraceEnabled, cpuSamplingIntervalUs: cpuProfileEnabled ? 1000 : null,
      selection: "Only repeat 0 Normal is traced/profiled for each scenario; warmups and Alt are not captured.",
      timeOrigin: "Trace observation timestamps are page performance.now milliseconds; gesture end comes from the existing probe stop timestamp.",
      window: "Gesture including up+2RAF, then optional observation only; no extra RAF or delay inside the gesture.",
      comparisonLimit: "Traced/profiled samples are excluded from timing comparison. A positive traceSettleMs also excludes the later final/settled observations from functional comparison. Post-gesture sampled CPU is not drag latency.",
    },
    functionalValidityMeaning: "functionalValid confirms actual motion, visual/model/persisted agreement and visible selection invariants; strictInteractionCheck separately reports the full transient-cleanup contract. A false strict check is an unresolved functional finding, not a passed integral validation.",
    coverage: "Real auth route, editor, element renderer, composer, selection overlay, guides, drag and emulator draft persistence; synthetic user and data.",
    fixtureDifferenceFromLab: "Active starts at canvas x=240 (offline x=80); multiselect companion x=340 (offline x=180), exercising the central area of the full dashboard. Other candidate positions and movement vectors are unchanged. The earlier x=80 setup was blocked by a Next dev overlay, not evidence of a product layout defect.",
    selectionPreparation: process.env.DRAG_PERF_SELECTION_METHOD === "shift-click" ? "Historical Shift+click held80ms reproduction only; excluded from accepted benchmark protocol." : "Real marquee gesture on empty canvas intersects the requested roots; two RAF callbacks before release allow its existing deferred preview to commit. Selection preparation is outside timing. No React/Konva selection setter is used.",
    expectedLocalOverlayDismissals: 0,
    fixtureIds: [], fixtureHashes: {}, fixtureStrategy: "Stable owned demo document per family/N; about:blank before replacing fixture fields; all scenario documents exist before measurement. Real keyboard undo restores the initial canonical pose between measured gestures, with emulator autosave checked outside timing. Other documents are never deleted.",
    caveats: ["Next development is not comparable numerically to offline production or deployed production.",
      "Both disposable variants use the same declared test-only initial zoom prop: requested effective scale divided by the existing 1.15 boost. Real useViewportScale applies it at the same desktop viewport; no CSS/Stage transform is injected. Current product UI does not expose these scale controls; logical test zoom is 0.869565/0.521739, observed effective scale is 1/0.6.",
      "RAF intervals observe headless scheduling, not presented frames or physical display FPS.",
      "--disable-gpu uses CPU raster and limits desktop extrapolation.",
      "The canonical demo blocks getAdminAccess. Its specific Next development error overlay is closed using Escape before gestures, with dismissal count recorded; the endpoint stays blocked. Other browser errors/overlays fail the run.",
      "Inclusive diagnostic spans overlap; diagnostic overhead excludes these samples from timing population.",
      "Browser requests are loopback restricted with canonical CSP/DNS; this is not an OS firewall."] };
  const persist = () => {
    writeJsonAtomically(path.join(output, "manifest.json"), manifest);
    writeJsonAtomically(path.join(output, "results.json"), { completed, manifest, trials, errors, failedRequests, blockedOrigins: [...new Set(blockedOrigins)] });
    if (cdpTraceEnabled) writeJsonAtomically(path.join(output, "network-observations.json"), networkObservations);
  };
  writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  try {
    const auth = await localRequest(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-api-key`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "local-developer@example.test", password: "Local-only-4A!", returnSecureToken: true }),
    });
    assert.equal(auth.localId, "local-developer");
    console.log("[real-drag] Opening isolated login route");
    const response = await page.goto(`${ORIGIN}/?auth=login`, { waitUntil: "domcontentloaded", timeout: 180000 });
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-security-policy"], /connect-src 'self' http:\/\/127.0.0.1/);
    await page.waitForSelector("#login-email");
    console.log("[real-drag] Synthetic login form ready");
    await page.type("#login-email", "local-developer@example.test");
    await page.type("#login-password", "Local-only-4A!");
    await page.$eval("#login-email", (input) => input.closest("form").querySelector('button[type="submit"]').click());
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const loginState = await page.evaluate(() => ({ pathname: location.pathname, emailLength: document.querySelector("#login-email")?.value?.length,
      passwordLength: document.querySelector("#login-password")?.value?.length, bodyText: document.body.innerText.slice(-1800) }));
    writeFileSync(path.join(output, "login-state.json"), JSON.stringify(loginState, null, 2));
    assert.ok(!loginState.bodyText.includes("Error de red. Verifica tu conexion."), "synthetic login reported a network error; inspect local request failures");
    await page.waitForFunction(() => location.pathname.startsWith("/dashboard"));
    console.log("[real-drag] Authenticated in local dashboard");
    const client = await page.createCDPSession();
    if (cdpTraceEnabled) {
      // Dedicated observation only. Explicit allowlist excludes headers, bodies,
      // query strings (including tokens), cookies and initiator argument data.
      const safeAddress = (value) => {
        const url = new URL(value);
        return { origin: url.origin, pathname: url.protocol === "data:" ? "<local-data>" : url.pathname };
      };
      await client.send("Network.enable");
      client.on("Network.requestWillBeSent", (event) => networkObservations.push({ event: "request", id: event.requestId,
        atSeconds: event.timestamp, wallTimeSeconds: event.wallTime, method: event.request.method,
        resourceType: event.type, initiatorType: event.initiator?.type, ...safeAddress(event.request.url) }));
      client.on("Network.responseReceived", (event) => networkObservations.push({ event: "response", id: event.requestId,
        atSeconds: event.timestamp, status: event.response.status, mimeType: event.response.mimeType,
        resourceType: event.type, ...safeAddress(event.response.url) }));
      client.on("Network.loadingFinished", (event) => networkObservations.push({ event: "finished", id: event.requestId,
        atSeconds: event.timestamp, encodedDataLength: event.encodedDataLength }));
      client.on("Network.loadingFailed", (event) => networkObservations.push({ event: "failed", id: event.requestId,
        atSeconds: event.timestamp, errorText: event.errorText, canceled: event.canceled, blockedReason: event.blockedReason }));
    }
    const fixtureOwner = "reservaeldia-drag-performance";
    const sessionKey = hash(marker.createdAt).slice(0, 12);
    const seedOnly = async (scenario) => {
      const scene = createRealPerformanceScene(scenario.family, scenario.count);
      manifest.fixtureHashes[`${scenario.family}:${scenario.count}`] = hash(JSON.stringify(scene));
      const slug = `drag-perf-${sessionKey}-${scenario.family}-${scenario.count}`;
      const url = `${FIRESTORE_ORIGIN}/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/borradores/${slug}`;
      // Rules deny reads of missing documents because ownership is absent.
      // Query only our synthetic user's documents; create preconditions below
      // prevent treating an inaccessible existing document as a new fixture.
      const candidates = await localRequest(`${FIRESTORE_ORIGIN}/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents:runQuery`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "borradores" }], where:
          { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "local-developer" } } },
        } }),
      });
      const previous = candidates.find((entry) => entry.document?.name.endsWith(`/borradores/${slug}`))?.document;
      if (previous) {
        assert.equal(previous.fields.userId?.stringValue, "local-developer");
        assert.equal(previous.fields.dragPerfFixtureOwner?.stringValue, fixtureOwner, "refuse to overwrite a document not owned by this runner");
        assert.equal(previous.fields.dragPerfSessionCreatedAt?.stringValue, marker.createdAt);
      }
      const document = { userId: "local-developer", nombre: `Synthetic drag ${scenario.family}`, estado: "activo", objetos: scene.objects, secciones: scene.sections,
        dragPerfFixtureOwner: fixtureOwner, dragPerfSessionCreatedAt: marker.createdAt };
      const fields = firestoreValue(document).mapValue.fields;
      fields.createdAt = fields.updatedAt = { timestampValue: new Date().toISOString() };
      // The cached emulator REST adapter parses updateTime preconditions as 0.
      // Ownership was verified above and the app is unmounted during reseed.
      const precondition = `currentDocument.exists=${Boolean(previous)}`;
      try {
        await localRequest(`${url}?${precondition}`, {
          method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ fields }),
        });
      } catch (error) {
        const verification = await verifySeedAfterTimeout({ error, expectedFields: fields,
          owner: fixtureOwner, sessionCreatedAt: marker.createdAt,
          readDocument: () => localRequest(url, { headers: { Authorization: `Bearer ${auth.idToken}` },
            signal: AbortSignal.timeout(5000) }),
        });
        (manifest.seedResponseReconciliations ||= []).push({ slug, ...verification });
        console.log("[real-drag] Timed-out seed verified by exact readback", slug);
      }
      if (!manifest.fixtureIds.includes(slug)) manifest.fixtureIds.push(slug);
      return { scene, slug };
    };
    const countSyntheticUserDrafts = async () => {
      const result = await localRequest(`${FIRESTORE_ORIGIN}/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents:runQuery`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "borradores" }], select: { fields: [{ fieldPath: "__name__" }] },
          where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "local-developer" } } } } }),
      });
      return result.filter((entry) => entry.document).length;
    };
    const seedAndOpen = async (scenario) => {
      // Unmount the previous document listener before replacing its fixture.
      await page.goto("about:blank", { waitUntil: "domcontentloaded" });
      const { scene, slug } = await seedOnly(scenario);
      await page.goto(`${ORIGIN}/dashboard/?slug=${slug}&__dragPerfScale=${scenario.zoom}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(({ count, expected }) => {
        const active = window._objetosActuales?.find((object) => object.id === "active");
        return window._elementRefs?.active?.getStage() && window._objetosActuales?.length === count && active?.x === expected.x && active?.y === expected.y;
      }, {}, { count: scene.objects.length, expected: scene.objects[0] });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      manifest.expectedLocalOverlayDismissals += await dismissExpectedLocalDevOverlay(page);
      await waitForRealStartupOverlay(page);
      await calibrateRealScale(page, scenario.zoom);
      return { scene, slug };
    };
    const readSavedPose = async (slug, remainingMs = 15000, id = "active") => {
      const saved = await localRequest(`${FIRESTORE_ORIGIN}/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/borradores/${slug}`, {
        headers: { Authorization: `Bearer ${auth.idToken}` }, signal: AbortSignal.timeout(Math.max(1, remainingMs)),
      });
      const active = saved.fields.objetos.arrayValue.values.find((entry) => entry.mapValue.fields.id.stringValue === id).mapValue.fields;
      return Object.fromEntries(["x", "y"].map((key) => [key, Number(active[key]?.doubleValue ?? active[key]?.integerValue)]));
    };
    manifest.persistenceObservation = { timeoutMs: 15000, slowThresholdMs: 5000, forceFlush: false };
    manifest.slowPersistenceObservations = [];
    const waitForSavedPose = (slug, expected, id = "active") => pollPersistedPose({
      expected, readPose: (remainingMs) => readSavedPose(slug, remainingMs, id),
      onSlow: async (observation) => {
        const interaction = await readRealInteractionSnapshot(page).catch((error) => ({ observationError: error.message }));
        const record = { slug, id, ...observation, interaction };
        manifest.slowPersistenceObservations.push(record);
        writeFileSync(path.join(output, "slow-persistence-observations.json"), JSON.stringify(manifest.slowPersistenceObservations, null, 2));
        persist();
      },
    });
    await page.goto("about:blank", { waitUntil: "domcontentloaded" });
    const uniqueSeeds = new Map(matrix(kind).map((scenario) => [`${scenario.family}:${scenario.count}`, scenario]));
    for (const scenario of uniqueSeeds.values()) await seedOnly(scenario);
    manifest.collectionSizeAtMeasurementStart = await countSyntheticUserDrafts();
    for (const scenario of matrix(kind)) {
      if (kind === "handoff") {
        // Functional evidence, separate from timing populations. Prepare via
        // the real marquee, then keep the same editor alive for five gestures.
        for (const alt of [false, true].filter((alt) => !handoffModifier || alt === (handoffModifier === "alt"))) {
          const { scene, slug } = await seedAndOpen(scenario);
          const selectedIds = scenario.family === "multiselect" ? ["active", "target-0"] : ["active"];
          await selectByRealMarquee(page, selectedIds);
          await new Promise((resolve) => setTimeout(resolve, 750));
          const initialInteraction = await readRealInteractionSnapshot(page, selectedIds);
          await installRealProbes(page, diagnostic);
          for (let repeat = 0; repeat < 5; repeat++) {
            const before = await nodeSnapshot(page);
            assertRealDragHit(before, `handoff ${scenario.family} repeat${repeat} scale${scenario.zoom} alt${alt}`);
            const beforeInteraction = await readRealInteractionSnapshot(page, selectedIds);
            assert.equal(before.stagePose.scaleX, 1); assert.equal(before.stagePose.scaleY, 1);
            const direction = repeat % 2 ? -1 : 1;
            const trajectory = repeat === 4 ? "immediate" : "sweep";
            const immediateStart = trajectory === "immediate" ? await beginFunctionalGuideObservation(page) : null;
            const immediateBox = immediateStart?.frameRect || before.nodeRectInStage;
            const expectsImmediateSnap = Boolean(immediateStart && !alt && !["group", "multiselect"].includes(scenario.family));
            const immediateBiasScreenPx = expectsImmediateSnap ? 2 : 0;
            const immediateBiasCanvasUnits = immediateBiasScreenPx / before.scale;
            const immediateCenterDeltaX = before.stageWidth / 2 - immediateBox.x - immediateBox.width / 2;
            // A previously centered frame would snap the 2px miss back to its
            // unchanged pose. Give that one-event gesture a real Y displacement
            // so commit/history checks do not incorrectly require a no-op undo.
            const immediateDelta = { x: immediateCenterDeltaX - immediateBiasCanvasUnits,
              y: Math.abs(immediateCenterDeltaX) < .1 ? 40 : 0 };
            const immediateSnapExpectation = immediateStart ? {
              expectsSnap: expectsImmediateSnap, passed: expectsImmediateSnap ? false : null, biasScreenPx: immediateBiasScreenPx,
              biasCanvasUnits: immediateBiasCanvasUnits, targetCenterX: before.stageWidth / 2,
              intendedDelta: immediateDelta,
              expectedUnsnappedFrameCenterX: before.stageWidth / 2 - immediateBiasCanvasUnits,
              expectedUnsnappedNodePose: { x: before.node.x + immediateDelta.x, y: before.node.y + immediateDelta.y },
              expectedPoseMeaning: "Calculated from requested pointer displacement, not an observed pre-snap node pose. Raw pointer coordinates are retained in the observer's lastMove/pointerup samples.",
              inputOrigin: scenario.family === "gallery" ? "after Gallery's 6-screen-pixel activation" : "mousedown",
            } : null;
            const metrics = await runControlledGesture(page, { point: before.point, zoom: before.scale, direction, alt, trajectory,
              gallery: scenario.family === "gallery", immediateDelta, durationMs, client });
            const immediateGuideEvidence = immediateStart ? await endFunctionalGuideObservation(page) : null;
            try {
              if (expectsImmediateSnap) {
                assert.ok(immediateGuideEvidence.lastMove, "immediate release must follow a real movement sample");
                // One move followed immediately by up proves the imperative snap,
                // not that React had a presentation opportunity for a guide Line.
                // Preserve that observation; the paused visual example below
                // separately requires an actual guide at the exact center.
                assertSectionFrameCenter(immediateGuideEvidence.beforeRelease, `${scenario.family}:immediate-before-release`);
                immediateSnapExpectation.visibleGuideNodesAtRelease = immediateGuideEvidence.beforeRelease.lines.length;
                immediateSnapExpectation.guideRenderingVerified = false;
                const correction = immediateGuideEvidence.beforeRelease.nodePose.x - immediateSnapExpectation.expectedUnsnappedNodePose.x;
                assert.ok(Math.abs(correction - immediateBiasCanvasUnits) < .1,
                  "Normal immediate release must actually correct the intentional 2-screen-pixel center miss");
                immediateSnapExpectation.observedCorrectionCanvasUnits = correction;
                immediateSnapExpectation.observedCorrectionScreenPx = correction * before.scale;
                for (const axis of ["x", "y"]) assert.ok(Math.abs(
                  immediateGuideEvidence.beforeRelease.nodePose[axis] - immediateGuideEvidence.lastMove.nodePose[axis]
                ) < .01, "the guide at release must describe the final movement sample");
                immediateSnapExpectation.passed = true;
              }
            } finally {
              if (immediateGuideEvidence) writeFileSync(path.join(output, `immediate-guide-${scenario.family}-${scenario.zoom}-${alt ? "alt" : "normal"}.json`),
                JSON.stringify({ scenario, repeat, alt, expected: immediateSnapExpectation, observed: immediateGuideEvidence }, null, 2));
            }
            const final = await nodeSnapshot(page);
            const releaseObservation = await readRealInteractionSnapshot(page, selectedIds);
            writeJsonAtomically(path.join(output, "last-handoff-gesture.json"), {
              scenario, repeat, alt, before, final, beforeInteraction, releaseObservation, metrics,
              immediateGuideEvidence, immediateSnapExpectation,
            });
            const immediateTranslationCheck = evidencePhase === "drag-phase3c" && trajectory === "immediate" && ["group", "multiselect"].includes(scenario.family)
              ? assertImmediateTranslation({ before, final, intendedDelta: metrics.intendedDelta,
                beforeRelease: immediateGuideEvidence?.beforeRelease?.nodePose }) : null;
            assertCanonicalPose(final);
            assert.equal(final.dragging, false);
            assert.equal(final.guideCount, 0);
            assert.ok(Math.abs(final.object.x - before.object.x) + Math.abs(final.object.y - before.object.y) > 1, "consecutive drag must commit");
            await new Promise((resolve) => setTimeout(resolve, 750));
            const settledInteraction = await readRealInteractionSnapshot(page, selectedIds);
            const strictInteractionCheck = inspectStrictHandoff(settledInteraction, selectedIds);
            writeFileSync(path.join(output, "handoff-last-observation.json"), JSON.stringify({ scenario, repeat, alt, beforeInteraction, releaseObservation, settledInteraction }, null, 2));
            assertNoPostReleaseReposition(releaseObservation, settledInteraction, selectedIds);
            assertSelectionTranslation(beforeInteraction.nodes.map((node) => node.object), settledInteraction.nodes.map((node) => node.object), selectedIds);
            const saved = {};
            for (const node of settledInteraction.nodes) saved[node.id] = await waitForSavedPose(slug, node.object, node.id);
            trials.push({ ...scenario, kind, functionalOnly: true, functionalValid: true, strictInteractionCheck, repeat, warmup: false, alt, direction, trajectory,
              effectiveScale: before.scale, viewport: page.viewport(), actualCount: scene.objects.length, before, final, beforeInteraction, releaseObservation, settledInteraction, saved, metrics, immediateGuideEvidence, immediateSnapExpectation, immediateTranslationCheck });
            persist();
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
          const settled = await nodeSnapshot(page), savedEvidence = await waitForSavedPose(slug, settled.object), savedPose = savedEvidence.pose;
          assertCanonicalPose(settled);
          Object.assign(trials.at(-1), { settled, savedPose, persistencePollWaitMs: savedEvidence.pollWaitMs });
          assert.ok(Math.abs(savedPose.x - settled.object.x) < .01 && Math.abs(savedPose.y - settled.object.y) < .01);
          const last = trials.at(-1);
          if (evidencePhase === "drag-phase3c") {
            last.settledScreenshot = `${scenario.family}-${scenario.zoom}-${alt ? "alt" : "normal"}-settled.png`;
            await page.screenshot({ path: path.join(output, last.settledScreenshot) });
          }
          const history = {};
          last.history = history;
          for (const [action, expected] of [["undo", last.before], ["redo", last.final]]) {
            assertKeyboardHistoryReady(await readRealInteractionSnapshot(page, selectedIds));
            await page.keyboard.down("Control");
            if (action === "redo") await page.keyboard.down("Shift");
            await page.keyboard.press("z");
            if (action === "redo") await page.keyboard.up("Shift");
            await page.keyboard.up("Control");
            await page.waitForFunction((expected) => {
              const actual = window._objetosActuales?.find((object) => object.id === "active");
              return actual && Math.abs(actual.x - expected.x) < .01 && Math.abs(actual.y - expected.y) < .01;
            }, { timeout: 10000 }, expected.object);
            await new Promise((resolve) => setTimeout(resolve, 750));
            const observed = await nodeSnapshot(page), savedEvidence = await waitForSavedPose(slug, expected.object), persisted = savedEvidence.pose;
            // Compare each node to its own prior visual pose. Raw text node.x
            // is deliberately not compared to canonical model.x (offset pivot).
            for (const axis of ["x", "y"]) {
              assert.ok(Math.abs(observed.node[axis] - expected.node[axis]) < .01, `${action}: visual pose must restore`);
              assert.ok(Math.abs(persisted[axis] - expected.object[axis]) < .01, `${action}: saved canonical pose must restore`);
            }
            history[action] = { observed, persisted, persistencePollWaitMs: savedEvidence.pollWaitMs };
            const interaction = await readRealInteractionSnapshot(page, selectedIds);
            history[action].interaction = interaction;
            // ejecutarDeshacer/ejecutarRehacer deliberately clear selection;
            // history restores poses, not the preceding selected-id list.
            history[action].strictInteractionCheck = inspectStrictHandoff(interaction, []);
            assert.equal(interaction.visibleIndicatorFrames + interaction.visibleTransformerFrames, 0,
              "history must clear the visible selection frame with its selected ids");
            const expectedInteraction = action === "undo" ? last.beforeInteraction : last.settledInteraction;
            for (const node of interaction.nodes) {
              const target = expectedInteraction.nodes.find((entry) => entry.id === node.id);
              for (const axis of ["x", "y"]) {
                assert.ok(Math.abs(node.object[axis] - target.object[axis]) < .01, `${action}: all selected models restore`);
                assert.ok(Math.abs(node.pose[axis] - target.pose[axis]) < .01, `${action}: all selected visuals restore`);
              }
              history[action][`${node.id}Saved`] = await waitForSavedPose(slug, target.object, node.id);
            }
            if (scenario.family === "group") assertGroupChildrenPreserved(initialInteraction.nodes[0].object, interaction.nodes[0].object);
          }
          last.history = history;
          if (!alt && !["group", "multiselect"].includes(scenario.family)) {
            await selectByRealMarquee(page, selectedIds);
            await new Promise((resolve) => setTimeout(resolve, 750));
            last.visualExample = await captureRealVisualExample(page, output, `${scenario.family}-${scenario.zoom}`);
            last.visualExample.persistence = await waitForSavedPose(slug, last.visualExample.released.object);
          }
          const beforeReload = await readRealInteractionSnapshot(page, selectedIds);
          const beforeReloadPose = await nodeSnapshot(page);
          const reloadUrl = page.url();
          await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
          await page.waitForFunction((expected) => {
            const object = window._objetosActuales?.find((entry) => entry.id === "active");
            return window._elementRefs?.active?.getStage() && object && Math.abs(object.x - expected.x) < .01 && Math.abs(object.y - expected.y) < .01;
          }, {}, beforeReloadPose.object);
          await page.evaluate(() => document.fonts.ready);
          manifest.expectedLocalOverlayDismissals += await dismissExpectedLocalDevOverlay(page);
          await waitForRealStartupOverlay(page);
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const reloaded = await nodeSnapshot(page), reloadedInteraction = await readRealInteractionSnapshot(page, selectedIds);
          assertCanonicalPose(reloaded); assert.equal(reloaded.guideCount, 0);
          assert.equal(page.url(), reloadUrl, "rehydration must reload the same saved draft without reseeding");
          const reloadedCanonicalNodes = [];
          for (const node of reloadedInteraction.nodes) {
            const visualSnapshot = await nodeSnapshot(page, node.id);
            assertCanonicalPose(visualSnapshot);
            reloadedCanonicalNodes.push({ id: node.id, snapshot: visualSnapshot });
            const expected = beforeReload.nodes.find((entry) => entry.id === node.id).object;
            for (const axis of ["x", "y"]) assert.ok(Math.abs(node.object[axis] - expected[axis]) < .01);
            if (scenario.family === "group") assertGroupChildrenPreserved(expected, node.object);
          }
          last.reload = { withoutReseed: true, beforeReload, reloaded, reloadedInteraction, reloadedCanonicalNodes };
          persist();
        }
        t.diagnostic(`${scenario.family}: selection + 5 consecutive gestures, including immediate release, captured`);
        continue;
      }
      const { scene, slug } = await seedAndOpen(scenario);
      const expectedSelection = scenario.family === "multiselect" ? ["active", "target-0"] : ["active"];
      const previousImmediateDestination = new Map();
      let probesInstalled = false;
      for (let repeat = -1; repeat < repetitions; repeat++) {
        for (const alt of repeat % 2 ? [true, false] : [false, true]) {
          let before = await nodeSnapshot(page);
          const initialSelection = before.selection || [];
          if (process.env.DRAG_PERF_SELECTION_TRACE === "1") await startSelectionPreparationTrace(page);
          if (process.env.DRAG_PERF_SELECTION_METHOD !== "shift-click" && [...initialSelection].sort().join('|') !== [...expectedSelection].sort().join('|')) {
            await selectByRealMarquee(page, expectedSelection);
          } else if (process.env.DRAG_PERF_SELECTION_METHOD === "shift-click" && !initialSelection.includes("active")) {
            await page.keyboard.down("Shift");
            await page.mouse.click(before.point.x, before.point.y, { delay: Number(process.env.DRAG_PERF_SELECTION_DELAY_MS || 80) });
            await page.keyboard.up("Shift");
          }
          if (scenario.family === "multiselect" && process.env.DRAG_PERF_SELECTION_METHOD === "shift-click") {
            const other = await nodeSnapshot(page, "target-0");
            await page.keyboard.down("Shift"); await page.mouse.click(other.point.x, other.point.y, { delay: 80 }); await page.keyboard.up("Shift");
          }
          // Route compilation, auth, seeding, font loading and selection are
          // excluded. Settling is fixed across before/after and A/B samples.
          await new Promise((resolve) => setTimeout(resolve, 750));
          before = await nodeSnapshot(page);
          if (process.env.DRAG_PERF_SELECTION_TRACE === "1") {
            const events = await page.evaluate(() => window.__selectionPreparationTrace.stop());
            writeFileSync(path.join(output, `selection-${scenario.family}-${scenario.count}-${scenario.zoom}-${scenario.trajectory}-${repeat}-${alt}.json`), JSON.stringify({ initialSelection, events, before }, null, 2));
          }
          writeFileSync(path.join(output, "last-preparation.json"), JSON.stringify({ scenario, repeat, alt, initialSelection, before }, null, 2));
          assertRealDragHit(before, `measurement ${scenario.family} repeat${repeat} scale${scenario.zoom} alt${alt}`);
          assert.ok(before.selection?.includes("active"), "the real UI must select the visible active target before measurement");
          assert.deepEqual(before.inlineEditorIds, [], "timing fixture must be selected without inline editing");
          assert.equal(before.dragging, false);
          if (!["gallery", "countdown", "multiselect"].includes(scenario.family)) assert.equal(before.node.draggable, true, "native drag family must be draggable before measurement");
          if (scenario.family !== "multiselect") assert.deepEqual(before.selection, ["active"]);
          assert.equal(before.stagePose.scaleX, 1); assert.equal(before.stagePose.scaleY, 1);
          const companionBefore = scenario.family === "multiselect" ? await nodeSnapshot(page, "target-0") : null;
          if (companionBefore) assert.deepEqual([...before.selection].sort(), ["active", "target-0"], "multiselection fixture must select both real elements");
          if (!probesInstalled) { await installRealProbes(page, diagnostic); probesInstalled = true; }
          const immediateDelta = { x: before.stageWidth / 2 - before.nodeRectInStage.x - before.nodeRectInStage.width / 2, y: 0 };
          const traced = cdpTraceEnabled && repeat === 0 && !alt;
          const cpuProfiled = traced && cpuProfileEnabled;
          const cpuProfileFile = cpuProfiled ? `cpu-${scenario.family}-${scenario.count}-${scenario.zoom}-${scenario.trajectory}.cpuprofile` : null;
          const traceObservation = traced ? { requestedSettleMs: traceSettleMs, gestureEndedAt: null, observationEndedAt: null,
            postGestureObservedMs: null, clock: "page performance.now milliseconds", functionalComparisonEligible: traceSettleMs === 0 } : null;
          let metrics, tracingStarted = false, cpuProfilerEnabled = false, cpuProfileStarted = false;
          try {
            if (traced) {
              await page.tracing.start({ path: path.join(output, `trace-${scenario.family}-${scenario.count}-${scenario.zoom}-${scenario.trajectory}.json`),
                screenshots: false, categories: ["devtools.timeline", "v8.execute", "blink.user_timing"] });
              tracingStarted = true;
            }
            if (cpuProfiled) {
              await client.send("Profiler.enable"); cpuProfilerEnabled = true;
              await client.send("Profiler.setSamplingInterval", { interval: 1000 });
              await client.send("Profiler.start"); cpuProfileStarted = true;
            }
            metrics = await runControlledGesture(page, { point: before.point, zoom: before.scale, alt, gallery: scenario.family === "gallery", trajectory: scenario.trajectory, immediateDelta, durationMs, client });
            if (traced) {
              traceObservation.gestureEndedAt = metrics.endedAt;
              if (traceSettleMs > 0) await new Promise((resolve) => setTimeout(resolve, traceSettleMs));
              traceObservation.observationEndedAt = await page.evaluate(() => performance.now());
              traceObservation.postGestureObservedMs = traceObservation.observationEndedAt - traceObservation.gestureEndedAt;
            }
          } finally {
            try {
              if (cpuProfileStarted) {
                const { profile: sampledProfile } = await client.send("Profiler.stop");
                // CDP CPU profile contains sampled stacks, not arguments, scopes or network bodies.
                writeFileSync(path.join(output, cpuProfileFile), JSON.stringify(sampledProfile));
              }
            } finally {
              try { if (cpuProfilerEnabled) await client.send("Profiler.disable"); }
              finally { if (tracingStarted) await page.tracing.stop(); }
            }
          }
          const final = await nodeSnapshot(page);
          const releaseObservation = await readRealInteractionSnapshot(page, expectedSelection);
          assertCanonicalPose(final);
          writeFileSync(path.join(output, "last-gesture.json"), JSON.stringify({ scenario, repeat, alt, before, final, metrics }, null, 2));
          let immediateDestinationCheck = null;
          if (evidencePhase === "drag-phase3c" && kind === "ux" && scenario.trajectory === "immediate") {
            immediateDestinationCheck = assertImmediateDestination({ before, final, intendedDelta: metrics.intendedDelta, alt,
              previous: previousImmediateDestination.get(alt) });
            previousImmediateDestination.set(alt, { before, expectedNode: immediateDestinationCheck.expectedNode });
          }
          const companionFinal = companionBefore ? await nodeSnapshot(page, "target-0") : null;
          if (companionFinal) {
            for (const axis of ["x", "y"]) assert.ok(Math.abs((companionFinal.object[axis] - companionBefore.object[axis]) - (final.object[axis] - before.object[axis])) < .01, `multiselection ${axis}: companion must move with leader`);
          }
          assert.equal(final.dragging, false, "release must terminate the native drag");
          assert.equal(final.guideCount, 0, "release must clear visual guides");
          assert.ok(Math.abs(final.object.x - before.object.x) + Math.abs(final.object.y - before.object.y) > 1, `${scenario.family}: gesture must commit actual model movement`);
          // Persistence and handoff observations are outside the measured window.
          // This also avoids carrying a pending autosave into the next sample.
          await new Promise((resolve) => setTimeout(resolve, 750));
          const settled = await nodeSnapshot(page);
          assertCanonicalPose(settled);
          const settledInteraction = await readRealInteractionSnapshot(page, expectedSelection);
          writeFileSync(path.join(output, "last-settled-interaction.json"), JSON.stringify({ scenario, repeat, alt, settledInteraction }, null, 2));
          const strictInteractionCheck = inspectStrictHandoff(settledInteraction, expectedSelection);
          const savedEvidence = await waitForSavedPose(slug, final.object), savedPose = savedEvidence.pose;
          assert.ok(Math.abs(savedPose.x - final.object.x) < .01 && Math.abs(savedPose.y - final.object.y) < .01, "emulator persistence must match the committed model");
          // Gallery's extra 6 screen px activates native drag and resets its
          // pointer offset. The subsequent controlled motion remains 280x120.
          const expectedDelta = metrics.intendedDelta;
          const nodeDelta = { x: final.node.x - before.node.x, y: final.node.y - before.node.y };
          trials.push({ ...scenario, repeat, warmup: repeat < 0, alt, effectiveScale: before.scale, viewport: page.viewport(), actualCount: scene.objects.length,
            before, final, companionBefore, companionFinal, releaseObservation, settled, settledInteraction, strictInteractionCheck, immediateDestinationCheck, savedPose, functionalValid: true, traced,
            cpuProfiled, cpuProfileFile, traceObservation, timingComparisonEligible: !diagnostic && !traced && !cpuProfiled,
            functionalComparisonEligible: !(traced && traceSettleMs > 0),
            persistencePollWaitMs: savedEvidence.pollWaitMs, expectedDelta, nodeDelta,
            cursorResidualReference: scenario.family === "gallery" ? "pointer displacement after the 6-screen-pixel activation motion" : "pointer displacement from mousedown",
            finalCursorResidualCanvasUnits: { x: nodeDelta.x - expectedDelta.x, y: nodeDelta.y - expectedDelta.y }, metrics });
          persist();
          // Reset with the editor's real history owner. This is outside the
          // measured window and also verifies that each gesture forms one undo.
          assertKeyboardHistoryReady(settledInteraction);
          await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
          await page.waitForFunction((expected) => {
            const current = window._objetosActuales?.find((entry) => entry.id === "active");
            return current && Math.abs(current.x - expected.x) < .01 && Math.abs(current.y - expected.y) < .01;
          }, { timeout: 10000 }, before.object);
          const resetSaved = await waitForSavedPose(slug, before.object);
          const resetSnapshot = await nodeSnapshot(page);
          assertCanonicalPose(resetSnapshot);
          if (companionBefore) {
            const companionReset = await nodeSnapshot(page, "target-0");
            assertCanonicalPose(companionReset);
            for (const axis of ["x", "y"]) assert.ok(Math.abs(companionReset.object[axis] - companionBefore.object[axis]) < .01, "undo must restore the follower too");
            trials.at(-1).companionReset = { snapshot: companionReset, saved: await waitForSavedPose(slug, companionBefore.object, "target-0") };
          }
          trials.at(-1).resetThroughUndo = { snapshot: resetSnapshot, saved: resetSaved };
          persist();
        }
      }
      t.diagnostic(`${scenario.family} N=${scenario.count}: ${repetitions} pairs + warmup captured in real editor`);
    }
    manifest.collectionSizeAtMeasurementEnd = await countSyntheticUserDrafts();
    assert.equal(manifest.collectionSizeAtMeasurementEnd, manifest.collectionSizeAtMeasurementStart, "draft count must remain fixed during measurement");
    if (strictHandoff) {
      for (const trial of trials) {
        assert.equal(trial.strictInteractionCheck?.passed, true, `strict handoff: ${trial.family} scale${trial.zoom} repeat${trial.repeat} alt${trial.alt}: ${trial.strictInteractionCheck?.message}`);
        for (const [action, history] of Object.entries(trial.history || {})) {
          assert.equal(history.strictInteractionCheck?.passed, true, `strict ${action}: ${trial.family}: ${history.strictInteractionCheck?.message}`);
        }
      }
    }
    assert.deepEqual(errors, [], "unexpected browser errors");
    completed = true;
  } catch (error) {
    // Only a synthetic, isolated page is ever opened. Preserve enough UI state
    // to explain failed setup without dumping network bodies or credentials.
    const ui = await page.evaluate(() => ({ pathname: location.pathname, bodyText: document.body.innerText.slice(0, 4000), readyState: document.readyState,
      objectCount: window._objetosActuales?.length ?? null, activeNodeReady: Boolean(window._elementRefs?.active) })).catch(() => null);
    writeFileSync(path.join(output, "failure.json"), JSON.stringify({ name: error.name, code: error.code, message: error.message,
      diagnostics: error.diagnostics ?? null, stack: error.stack, ui }, null, 2));
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    throw error;
  } finally { persist(); }
});
