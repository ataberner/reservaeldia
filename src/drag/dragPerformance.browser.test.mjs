import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const RUNNER_SHA256 = hash(readFileSync(fileURLToPath(import.meta.url)));
const percentile = (values, quantile) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * quantile))] : null;
export const summarizeSamples = (values) => ({ count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: values.length ? Math.max(...values) : null });

export function createPerformanceScene(family, count, zoom) {
  const active = { id: "active", tipo: "forma", figura: "rect", x: 80, y: 120, width: 80, height: 50, seccionId: "s1" };
  if (["text", "rotated"].includes(family)) Object.assign(active, { tipo: "texto", texto: "Reserva el Día", width: 180, height: 40, rotation: family === "rotated" ? 45 : 0, fontSize: 24, fontFamily: "Arial" });
  if (family === "image") Object.assign(active, { tipo: "imagen", width: 120, height: 80,
    src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#94b9ca"/><rect x="15" y="15" width="90" height="50" fill="#527a89"/></svg>')}` });
  if (family === "gallery") Object.assign(active, { tipo: "galeria", width: 180, height: 40, currentLayout: "grid_1x2", defaultLayout: "grid_1x2", allowedLayouts: ["grid_1x2"], gap: 8, cells: [{ bg: "#ac99d0" }, { bg: "#a8c8ca" }] });
  if (family === "group") Object.assign(active, { tipo: "grupo", width: 115, height: 60, children: [
    { id: "child-1", tipo: "forma", figura: "rect", x: 0, y: 0, width: 50, height: 45, color: "#8ba6cf" },
    { id: "child-2", tipo: "forma", figura: "rect", x: 65, y: 15, width: 50, height: 45, color: "#c594bb" },
  ] });
  const objects = [active, ...Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
    id: `target-${index}`, tipo: index % 3 === 0 ? "texto" : "forma", figura: "rect", texto: `Texto ${index}`,
    x: 460 + index % 7 * 42, y: 40 + Math.floor(index / 7) * 48, width: 30, height: 24, fontSize: 12, seccionId: "s1",
  }))];
  if (family === "multiselect") {
    if (objects.length === 1) objects.push({ ...active, id: "target-0" });
    Object.assign(objects[1], { tipo: "forma", x: 180, y: 210, width: 60, height: 40 });
  }
  if (family === "multisection") objects.slice(1).forEach((object, index) => { if (index % 2 === 0) { object.seccionId = "s0"; object.y %= 150; } });
  return { objects, selected: family === "multiselect" ? ["active", "target-0"] : ["active"], zoom,
    sections: family === "multisection" ? [{ id: "s0", altura: 200, orden: 0 }, { id: "s1", altura: 800, orden: 1 }] : [{ id: "s1", altura: 1000, orden: 0 }] };
}

// Reusable with the isolated real editor. This adds no React/Konva updates or
// scheduling boundary. Diagnostics wrap existing methods only when requested;
// timing mode uses one passive RAF sampler and a mousemove timestamp listener.
export async function installPerformanceProbe(page, { diagnostic = false } = {}) {
  await page.evaluate((diagnostic) => {
    const state = { active: false, raf: 0, frames: [], inputs: [], nativeInputs: [], releases: [], motion: [], spans: {}, commits: [], startedAt: 0, diagnostic };
    const span = (name) => {
      if (!diagnostic || !state.active) return null;
      const start = performance.now();
      return () => {
        const end = performance.now(), duration = end - start;
        const entry = state.spans[name] ||= { count: 0, totalMs: 0, maxMs: 0, samplesMs: [], intervals: [] };
        entry.count++; entry.totalMs += duration; entry.maxMs = Math.max(entry.maxMs, duration); entry.samplesMs.push(duration);
        if (/handler|move-callback|mostrarGuias|CanvasStageContentComposer/.test(name)) entry.intervals.push({ start, end });
      };
    };
    window.__DRAG_PERF_PROBE = {
      span, begin: span,
      reactCommit(args) { if (diagnostic && state.active) state.commits.push({ id: args[0], phase: args[1], actualDuration: args[2], baseDuration: args[3], commitTime: args[5] }); },
      start() {
        state.frames = []; state.inputs = []; state.nativeInputs = []; state.releases = []; state.motion = []; state.spans = {}; state.commits = []; state.startedAt = performance.now(); state.active = true;
        window.__CANVAS_DRAG_PERF_STORE = null; window.__CANVAS_DRAG_PERF_LAST_SESSION = null;
        const tick = (at) => { if (!state.active) return; state.frames.push(at); state.raf = requestAnimationFrame(tick); };
        state.raf = requestAnimationFrame(tick);
      },
      stop() {
        state.active = false; cancelAnimationFrame(state.raf);
        return { startedAt: state.startedAt, endedAt: performance.now(), frames: state.frames, inputs: state.inputs, nativeInputs: state.nativeInputs, releases: state.releases, motion: state.motion, spans: state.spans, commits: state.commits,
          existingSession: diagnostic ? window.__CANVAS_DRAG_PERF_LAST_SESSION : null,
          existingTrace: diagnostic ? window.__CANVAS_DRAG_PERF_TRACE || [] : null,
          existingCounts: diagnostic ? window.__CANVAS_DRAG_PERF_STORE?.counts : null };
      },
    };
    window.__DBG_CANVAS_DRAG_PERF = diagnostic;
    window.__CANVAS_DRAG_PERF_EXPANDED = false;
    window.__CANVAS_DRAG_PERF_VERBOSE_CONSOLE = false;
    window.__DEBUG_SELECTED_DRAG = false;
    window.__DBG_CANVAS_BOX_FLOW = false;
    window.addEventListener("mouseup", (event) => {
      if (state.active) state.releases.push({ nativeTimeStamp: event.timeStamp, observedAt: performance.now() });
    }, { passive: true, capture: true });
    window.addEventListener("mousemove", () => {
      if (!state.active) return;
      const at = performance.now(); state.inputs.push(at);
      if (diagnostic) {
        const sample = window.dragPerformanceLab?.inputSample?.();
        if (sample) state.motion.push({ at, ...sample });
      }
    }, { passive: true });
    if (diagnostic) window.addEventListener("mousemove", (event) => {
      if (state.active) state.nativeInputs.push({ nativeTimeStamp: event.timeStamp, observedAt: performance.now(), x: event.clientX, y: event.clientY });
    }, { passive: true, capture: true });
    if (diagnostic) {
      const wrap = (prototype, key, name) => {
        const original = prototype?.[key];
        if (typeof original !== "function" || original.__dragLabWrapped) return;
        const replacement = function (...args) { const end = span(typeof name === "function" ? name.call(this) : name); try { return original.apply(this, args); } finally { end?.(); } };
        replacement.__dragLabWrapped = true; prototype[key] = replacement;
      };
      wrap(Element.prototype, "getBoundingClientRect", "DOM:getBoundingClientRect");
      const konva = window.__DRAG_PERF_KONVA;
      if (konva) {
        for (const key of ["drawScene", "drawHit"]) wrap(konva.Layer.prototype, key, function () { return `Konva:${key}:${this.__canvasStagePerfLabel || this.name() || "unnamed-layer"}`; });
        for (const type of ["Node", "Shape", "Container", "Group", "Text"]) if (Object.hasOwn(konva[type]?.prototype || {}, "getClientRect")) wrap(konva[type].prototype, "getClientRect", `Konva:getClientRect:${type}`);
      }
    }
  }, diagnostic);
}

export async function runControlledGesture(page, { point, zoom = 1, alt = false, gallery = false, durationMs = 1000, steps = 60, trajectory = "sweep", direction = 1, immediateDelta = null, client = null } = {}) {
  const cdp = client || await page.createCDPSession();
  await cdp.send("Performance.enable");
  await page.mouse.move(point.x, point.y);
  if (alt) await page.keyboard.down("Alt");
  const before = await cdp.send("Performance.getMetrics");
  await page.evaluate(() => window.__DRAG_PERF_PROBE.start());
  await page.mouse.down();
  if (gallery) await page.mouse.move(point.x + 6, point.y);
  if (trajectory === "fast") { durationMs = Math.min(durationMs, 150); steps = 12; }
  if (trajectory === "immediate") { durationMs = 1; steps = 1; }
  const started = performance.now(), dispatches = [];
  let intendedDelta = null;
  for (let index = 1; index <= steps; index++) {
    const due = started + index / steps * durationMs;
    const delay = due - performance.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const progress = index / steps;
    dispatches.push(performance.now() - started);
    let dx = 280 * progress + 24 * Math.sin(progress * Math.PI * 4), dy = 120 * progress + 18 * Math.sin(progress * Math.PI * 2);
    if (trajectory === "horizontal") { dx = 280 * progress; dy = 0; }
    if (trajectory === "vertical") { dx = 0; dy = 280 * progress; }
    if (trajectory === "diagonal") { dx = 280 * progress; dy = 120 * progress; }
    if (trajectory === "reverse") { dx = (progress <= .5 ? progress : 1 - progress) * 480; dy = 30 * progress; }
    if (trajectory === "micro") { dx = 6 + 5 * Math.sin(progress * Math.PI * 4); dy = 2 * progress; }
    if (trajectory === "immediate" && immediateDelta) { dx = immediateDelta.x; dy = immediateDelta.y; }
    intendedDelta = { x: dx * direction, y: dy * direction };
    await page.mouse.move(point.x + (gallery ? 6 : 0) + dx * zoom * direction, point.y + dy * zoom * direction);
  }
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await cdp.send("Performance.getMetrics");
  const raw = await page.evaluate(() => window.__DRAG_PERF_PROBE.stop());
  const deltas = Object.fromEntries(after.metrics.map(({ name, value }) => [name, value - (before.metrics.find((entry) => entry.name === name)?.value || 0)]));
  const gaps = (values) => values.slice(1).map((value, index) => value - values[index]);
  const frameGaps = gaps(raw.frames);
  if (!client) await cdp.detach();
  return { ...raw, dispatches, durationMs, steps, trajectory, direction, intendedDelta, frameIntervals: summarizeSamples(frameGaps), inputIntervals: summarizeSamples(gaps(raw.inputs)),
    dispatchIntervals: summarizeSamples(gaps(dispatches)), framesOver8_33ms: frameGaps.filter((value) => value > 8.33).length,
    framesOver16_67ms: frameGaps.filter((value) => value > 16.67).length, framesOver24ms: frameGaps.filter((value) => value > 24).length,
    framesOver33_4ms: frameGaps.filter((value) => value > 33.4).length, framesOver50ms: frameGaps.filter((value) => value > 50).length,
    estimated60HzMissedSlots: frameGaps.reduce((total, gap) => total + Math.max(0, Math.round(gap / (1000 / 60)) - 1), 0), cdpMetricDeltas: deltas };
}

async function buildProbe(output, diagnostic) {
  const webpackPackage = require("next/dist/compiled/webpack/webpack"); webpackPackage.init();
  const mode = diagnostic ? "development" : "production";
  const rules = [{ test: /\.(jsx|ts)$/, exclude: /node_modules/, use: path.join(ROOT, "src/domain/eventDetails/testSupport/googleMapTransformerJsxLoader.cjs") }];
  const instrumentation = path.join(ROOT, "src/drag/testSupport/instrumentDragPerformance.cjs");
  if (diagnostic && existsSync(instrumentation)) rules.push({ test: /\.(js|jsx)$/, exclude: /node_modules/, enforce: "pre", use: instrumentation });
  const compiler = webpackPackage.webpack({ mode, target: "web", devtool: false,
    entry: path.join(ROOT, "src/drag/testSupport/dragPerformanceBrowser.mjs"), output: { path: output, filename: "probe.js" },
    // Next's bundled webpack references an unavailable default terser plugin.
    // Use production React without minification; this is not a Next release build.
    optimization: { minimize: false }, resolve: { extensions: [".js", ".jsx", ".mjs", ".ts"], alias: { "@": path.join(ROOT, "src") } }, module: { rules } });
  let sourceHashes = [];
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) return reject(error);
      if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      const files = [...stats.compilation.fileDependencies].filter((file) => file.startsWith(path.join(ROOT, "src")) && existsSync(file) && statSync(file).isFile());
      sourceHashes = files.sort().map((file) => ({ file: path.relative(ROOT, file).replaceAll("\\", "/"), sha256: hash(readFileSync(file)) }));
      assert.ok(![...stats.compilation.fileDependencies].some((file) => /node_modules[\\/](firebase|firebase-admin|@firebase)[\\/]/.test(file)), "offline lab cannot include Firebase");
      resolve();
    }));
  } finally { await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve())); }
  return { mode, minified: false, sourceHashes, bundleSha256: hash(readFileSync(path.join(output, "probe.js"))), privateInstrumentation: diagnostic && existsSync(instrumentation) };
}

function matrix(kind) {
  const cases = [];
  for (const family of ["shape", "text", "rotated", "image", "gallery", "group", "multiselect", "multisection"]) {
    if (process.env.DRAG_PERF_FAMILIES && !process.env.DRAG_PERF_FAMILIES.split(",").includes(family)) continue;
    const counts = kind === "smoke" ? [10] : kind === "full" || ["shape", "text"].includes(family) ? [1, 10, 50, 100] : [10, 100];
    if (kind === "core" && !["shape", "text"].includes(family)) continue;
    if (kind === "ux" && !["shape", "text", "rotated"].includes(family)) continue;
    const trajectories = kind === "ux" ? ["micro", "reverse", "horizontal", "vertical", "fast", "immediate"] : ["sweep"];
    for (const count of kind === "ux" ? [10] : counts) {
      if (process.env.DRAG_PERF_COUNTS && !process.env.DRAG_PERF_COUNTS.split(",").map(Number).includes(count)) continue;
      for (const zoom of kind === "smoke" ? [1] : [1, .6]) for (const trajectory of trajectories) cases.push({ family, count, zoom, trajectory });
    }
  }
  return cases;
}

function assertFinalGesture(final, initial) {
  const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= .01, `${label}: ${actual} versus ${expected}`);
  const stageY = (object) => {
    const index = initial.sections.findIndex((section) => section.id === object.seccionId);
    return initial.sections.slice(0, Math.max(0, index)).reduce((sum, section) => sum + section.altura, 0) + object.y;
  };
  const active = final.objects.find((object) => object.id === "active");
  const persisted = final.persisted.find((object) => object.id === "active");
  close(final.activePose.x, active.x, "visual/model x");
  close(final.activePose.y, stageY(active), "visual/model stage y");
  close(persisted.x, active.x, "persistible/model x");
  close(persisted.y, active.y, "persistible/model section y");
  const original = initial.objects[0];
  assert.ok(Math.hypot(active.x - original.x, stageY(active) - stageY(original)) > 1, "gesture must move active object");
  assert.deepEqual(final.selected, initial.selected, "drag preserves selection");
  if (initial.selected.length > 1) {
    for (const id of initial.selected.slice(1)) {
      const before = initial.objects.find((object) => object.id === id), after = final.objects.find((object) => object.id === id);
      close(after.x - before.x, active.x - original.x, "follower x delta");
      close(stageY(after) - stageY(before), stageY(active) - stageY(original), "follower y delta");
      close(final.selectedNodePositions[id].x, after.x, "follower visual/model x");
      close(final.selectedNodePositions[id].y, stageY(after), "follower visual/model stage y");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) test("drag performance: isolated integration laboratory (explicit opt-in)", {
  skip: process.env.DRAG_PERF_BROWSER !== "1" ? "Set DRAG_PERF_BROWSER=1. This is a measurement, not a CI performance threshold." : false,
  timeout: 3_600_000,
}, async (t) => {
  assert.equal(process.versions.node.split(".")[0], "20");
  const diagnostic = process.env.DRAG_PERF_MODE === "diagnostic", kind = process.env.DRAG_PERF_MATRIX || "core";
  const repetitions = Number(process.env.DRAG_PERF_REPETITIONS || 5), durationMs = Number(process.env.DRAG_PERF_DURATION_MS || 1000);
  const label = process.env.DRAG_PERF_LABEL || "baseline";
  assert.match(label, /^[a-zA-Z0-9_-]+$/);
  const output = path.join(ROOT, `.local-isolation/drag-performance/${label}-${diagnostic ? "diagnostic" : "timing"}-${kind}`);
  mkdirSync(output, { recursive: true });
  const build = process.env.DRAG_PERF_USE_FROZEN === "1" ? JSON.parse(readFileSync(path.join(output, "build.json"), "utf8")) : await buildProbe(output, diagnostic);
  writeFileSync(path.join(output, "build.json"), JSON.stringify(build, null, 2));
  if (process.env.DRAG_PERF_BUILD_ONLY === "1") {
    t.diagnostic(`Frozen ${build.mode} bundle ${build.bundleSha256} at ${output}`);
    return;
  }
  assert.equal(hash(readFileSync(path.join(output, "probe.js"))), build.bundleSha256, "frozen bundle must match build manifest");
  const { default: puppeteer } = await import("puppeteer");
  const chrome = process.env.CHROME_EXECUTABLE_PATH || path.join(ROOT, ".local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe");
  assert.ok(existsSync(chrome), "cached browser required; no automatic download");
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, args: ["--disable-background-networking", "--disable-gpu", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 850, height: 1050, deviceScaleFactor: 1 });
  const errors = [], outbound = [], trials = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => /^(data:|about:)/.test(request.url()) ? request.continue() : (outbound.push(request.url()), request.abort()));
  await page.setContent('<!doctype html><body style="margin:0"><div id="app"></div></body>');
  await page.addScriptTag({ path: path.join(output, "probe.js") });
  await page.waitForFunction(() => Boolean(window.dragPerformanceLab));
  await installPerformanceProbe(page, { diagnostic });
  const client = await page.createCDPSession();
  const manifest = { version: 1, createdAt: new Date().toISOString(), label, build, runnerSha256: RUNNER_SHA256, node: process.version, chrome: await browser.version(),
    react: require("react/package.json").version, konva: require("konva/package.json").version, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
    viewport: { width: 850, height: 1050, deviceScaleFactor: 1 }, diagnostic, matrix: kind, familiesFilter: process.env.DRAG_PERF_FAMILIES || null,
    countsFilter: process.env.DRAG_PERF_COUNTS || null, repetitions, warmupPerCaseAndModifier: 1, durationMs,
    coverage: "Real guides/drag/finalizer/Gallery and controlled SelectionBoundsIndicator; synthetic shell, generic shape/text/image/group renderer, native Transformer; composer/ElementoCanvas/full handoff/persistence transport excluded. Overlay sync order is a laboratory contract (guide evaluation, conditional post-snap sync, normal sync), not a measurement of the real composer or PERF-02.",
    caveats: ["Production timing and development diagnostics are separate populations.", "Inclusive spans overlap; do not sum them.", "RAF gaps are headless scheduling observations, not displayed FPS or measured lost frames.", "The measured window includes down/up and two settling RAFs; normalize rates by endedAt-startedAt, not nominal durationMs.", "Bubble input intervals are observed event gaps, not input latency. Diagnostic capture nativeInputs can be correlated with handler intervals; this is not presentation latency.", "React Profiler samples are reported per id or deduplicated by commitTime; nested durations are not additive.", "Micro trajectory exercises small movements away from guides, not snap release.", "CDP lacks a guaranteed PaintDuration metric; paint unavailable unless separately traced.", "CPU raster backend (--disable-gpu) limits desktop extrapolation.", "Group fixture is a synthetic persisted top-level group node, not the full group renderer."] };
  writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  try {
    for (const scenario of matrix(kind)) {
      for (let repeat = -1; repeat < repetitions; repeat++) {
        for (const alt of repeat % 2 ? [true, false] : [false, true]) {
          await page.mouse.reset();
          const scene = createPerformanceScene(scenario.family, scenario.count, scenario.zoom);
          await page.evaluate((scene) => window.dragPerformanceLab.reset(scene), scene);
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const point = await page.evaluate(() => window.dragPerformanceLab.point());
          const metrics = await runControlledGesture(page, { point, zoom: scenario.zoom, alt, gallery: scenario.family === "gallery", durationMs, trajectory: scenario.trajectory, client });
          const final = await page.evaluate(() => ({ ...window.dragPerformanceLab.snapshot(), selected: window._elementosSeleccionados,
            selectedNodePositions: Object.fromEntries(window._elementosSeleccionados.map((id) => [id, window._elementRefs[id]?.position()])) }));
          assert.ok(final.commits.length > 0, `${scenario.family}: gesture must actually commit`);
          assert.equal(final.lines.length, 0, "no residual guides after release");
          assertFinalGesture(final, scene);
          trials.push({ ...scenario, actualCount: scene.objects.length, repeat, warmup: repeat < 0, alt, metrics,
            result: { commits: final.commits, activePose: final.activePose, overlayDigest: final.overlayDigest, selected: final.selected,
              objects: final.objects, persisted: final.persisted, selectedNodePositions: final.selectedNodePositions } });
        }
      }
      writeFileSync(path.join(output, "results.json"), JSON.stringify({ manifest, trials, errors, outbound }, null, 2));
      t.diagnostic(`${scenario.family} N=${scenario.count} zoom=${scenario.zoom}: ${repetitions} pairs + warmup captured`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally {
    writeFileSync(path.join(output, "results.json"), JSON.stringify({ manifest, trials, errors, outbound }, null, 2));
  }
});
