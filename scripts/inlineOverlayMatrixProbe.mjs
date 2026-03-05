#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

function sleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

const url =
  readArg("url") ||
  process.env.INLINE_PROBE_URL ||
  "http://localhost:3000/dashboard?phase_atomic_v2=1";
const outputPath =
  readArg("output") ||
  process.env.INLINE_PROBE_OUTPUT ||
  "artifacts/inline-alignment-report.json";
const waitMs = toPositiveNumber(readArg("waitMs"), 1500);
const timeoutMs = toPositiveNumber(readArg("timeoutMs"), 30000);
const harnessWaitMs = toPositiveNumber(readArg("harnessWaitMs"), 8000);
const maxErrorPx = toPositiveNumber(readArg("maxErrorPx"), 0.5);
const rawMinSamples = Number(readArg("minSamples", "1"));
const minSamples = Number.isFinite(rawMinSamples) && rawMinSamples >= 0 ? rawMinSamples : 1;
const probeText = readArg("probeText", "Probe");
const autoStart =
  readArg("autoStart", "1") !== "0" &&
  String(process.env.INLINE_PROBE_AUTOSTART || "1") !== "0";
const useHeadless =
  readArg("headless", "1") !== "0" &&
  String(process.env.INLINE_PROBE_HEADLESS || "1") !== "0";
const userDataDirArg =
  readArg("userDataDir") ||
  process.env.INLINE_PROBE_USER_DATA_DIR ||
  "artifacts/inline-probe-user-data";
const requireInlineApi =
  readArg("requireInlineApi", "0") === "1" ||
  String(process.env.INLINE_PROBE_REQUIRE_API || "0") === "1";
const requireHarness =
  readArg("requireHarness", "1") !== "0" &&
  String(process.env.INLINE_PROBE_REQUIRE_HARNESS || "1") !== "0";
const allowAuthGate =
  readArg("allowAuthGate", "0") === "1" ||
  String(process.env.INLINE_PROBE_ALLOW_AUTH_GATE || "0") === "1";
const interactiveWaitMs = toNonNegativeNumber(
  readArg(
    "interactiveWaitMs",
    String(
      process.env.INLINE_PROBE_INTERACTIVE_WAIT_MS ||
      (useHeadless ? 0 : 120000)
    )
  ),
  useHeadless ? 0 : 120000
);

function summarizeTrace(trace = [], maxErr = 0.5) {
  const phases = new Set(["after-first-paint", "post-layout"]);
  const candidates = trace.filter((entry) => {
    const phase = entry?.phase || entry?.eventName || null;
    return phases.has(phase);
  });
  const failures = candidates.filter((entry) => {
    const dx = Math.abs(Number(entry?.dx || 0));
    const dy = Math.abs(Number(entry?.dy || 0));
    return dx > maxErr || dy > maxErr;
  });
  const sampleCount = candidates.length;
  const passRate = sampleCount > 0
    ? Number((((sampleCount - failures.length) / sampleCount) * 100).toFixed(2))
    : null;
  return {
    sampleCount,
    failures: failures.length,
    passRate,
    maxErrorPx: maxErr,
  };
}

async function run() {
  const resolvedUserDataDir = userDataDirArg
    ? path.resolve(process.cwd(), userDataDirArg)
    : null;
  if (resolvedUserDataDir) {
    await fs.mkdir(resolvedUserDataDir, { recursive: true });
  }
  const browser = await puppeteer.launch({
    headless: useHeadless ? "new" : false,
    userDataDir: resolvedUserDataDir || undefined,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    const runtimeDiagnostics = {
      pageErrors: [],
      requestFailures: [],
      consoleErrors: [],
    };
    page.on("pageerror", (error) => {
      const message = error?.stack || error?.message || String(error);
      if (runtimeDiagnostics.pageErrors.length < 20) {
        runtimeDiagnostics.pageErrors.push(message);
      }
    });
    page.on("requestfailed", (request) => {
      if (runtimeDiagnostics.requestFailures.length < 40) {
        runtimeDiagnostics.requestFailures.push({
          url: request?.url?.() || null,
          method: request?.method?.() || null,
          resourceType: request?.resourceType?.() || null,
          errorText: request?.failure?.()?.errorText || null,
        });
      }
    });
    page.on("console", (msg) => {
      const type = String(msg?.type?.() || "").toLowerCase();
      if (type !== "error") return;
      if (runtimeDiagnostics.consoleErrors.length < 40) {
        runtimeDiagnostics.consoleErrors.push(msg?.text?.() || "");
      }
    });
    await page.evaluateOnNewDocument(() => {
      window.__INLINE_DEBUG = true;
      if (window.__INLINE_MICROMOVE_DEBUG === undefined) {
        window.__INLINE_MICROMOVE_DEBUG = false;
      }
      const currentAB = (window.__INLINE_AB && typeof window.__INLINE_AB === "object")
        ? window.__INLINE_AB
        : {};
      window.__INLINE_AB = {
        ...currentAB,
        overlayEngine: "phase_atomic_v2",
      };
    });
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    await page.waitForSelector("body", { timeout: timeoutMs });
    let inlineHarnessReady = false;
    try {
      await page.waitForFunction(
        () => Boolean(window.__INLINE_TEST && typeof window.__INLINE_TEST === "object"),
        { timeout: Math.max(1000, Math.min(timeoutMs, harnessWaitMs)) }
      );
      inlineHarnessReady = true;
    } catch {
      inlineHarnessReady = false;
    }
    if (!inlineHarnessReady && !useHeadless && interactiveWaitMs > 0) {
      try {
        await page.waitForFunction(
          () => Boolean(window.__INLINE_TEST && typeof window.__INLINE_TEST === "object"),
          { timeout: interactiveWaitMs }
        );
        inlineHarnessReady = true;
      } catch {
        inlineHarnessReady = false;
      }
    }

    const setupResult = await page.evaluate(async ({ autoStart: shouldAutoStart, probeText: textValue }) => {
      const result = {
        harnessReady: Boolean(window.__INLINE_TEST && typeof window.__INLINE_TEST === "object"),
        clearedTrace: false,
        autoStartRequested: Boolean(shouldAutoStart),
        startResult: null,
        valueResult: null,
        stateBefore: null,
        stateAfter: null,
      };
      result.stateBefore = typeof window.__INLINE_TEST?.getProbeState === "function"
        ? window.__INLINE_TEST.getProbeState()
        : null;
      if (typeof window.__INLINE_TEST?.clearTrace === "function") {
        window.__INLINE_TEST.clearTrace();
        result.clearedTrace = true;
      }
      if (shouldAutoStart && typeof window.__INLINE_TEST?.startFirstTextEdit === "function") {
        result.startResult = await window.__INLINE_TEST.startFirstTextEdit();
      }
      if (
        result.startResult?.ok &&
        typeof window.__INLINE_TEST?.setInlineValue === "function" &&
        typeof textValue === "string"
      ) {
        result.valueResult = await window.__INLINE_TEST.setInlineValue(textValue);
      }
      result.stateAfter = typeof window.__INLINE_TEST?.getProbeState === "function"
        ? window.__INLINE_TEST.getProbeState()
        : null;
      return result;
    }, { autoStart, probeText });

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const probePayload = await page.evaluate(async ({ maxErrorPx: maxErr }) => {
      const hasInlineApi = Boolean(
        window.__INLINE_TEST && typeof window.__INLINE_TEST.runMatrix === "function"
      );
      const matrixResult = hasInlineApi
        ? await window.__INLINE_TEST.runMatrix({ maxErrorPx: maxErr })
        : null;
      const trace = Array.isArray(window.__INLINE_TRACE) ? [...window.__INLINE_TRACE] : [];
      const overlayCount = document.querySelectorAll("[data-inline-editor-id]").length;
      const bodyText =
        typeof document?.body?.innerText === "string"
          ? document.body.innerText.slice(0, 400)
          : "";
      const bodyTextNormalized = typeof bodyText === "string"
        ? bodyText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        : "";
      const title = typeof document?.title === "string" ? document.title : "";
      const pathname = typeof window?.location?.pathname === "string"
        ? window.location.pathname
        : "";
      const hasDashboardRoot = Boolean(document.querySelector('[data-dashboard-scroll-root="true"]'));
      const hasCanvasContainer = Boolean(document.querySelector('[data-canvas-container="true"]'));
      const isLikelyAuthGate =
        bodyTextNormalized.includes("iniciar sesion") ||
        bodyTextNormalized.includes("completando inicio de sesion") ||
        bodyTextNormalized.includes("inicia sesion con google") ||
        bodyTextNormalized.includes("sign in with google") ||
        bodyTextNormalized.includes("google");
      const inlineTestKeys = window.__INLINE_TEST && typeof window.__INLINE_TEST === "object"
        ? Object.keys(window.__INLINE_TEST).sort()
        : [];
      return {
        generatedAt: new Date().toISOString(),
        locationHref: window.location.href,
        userAgent: window.navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        hasInlineApi,
        overlayCount,
        title,
        pathname,
        hasDashboardRoot,
        hasCanvasContainer,
        isLikelyAuthGate,
        bodyTextSnippet: bodyText,
        inlineTestKeys,
        trace,
        matrixResult,
      };
    }, { maxErrorPx });

    if (requireInlineApi && !probePayload?.hasInlineApi) {
      throw new Error(
        "Inline API unavailable. Open an inline edit session first or run without --requireInlineApi=1."
      );
    }

    const fallbackMatrixResult = {
      generatedAt: new Date().toISOString(),
      engine: "fallback",
      sampleCount: Array.isArray(probePayload?.trace) ? probePayload.trace.length : 0,
      summary: summarizeTrace(probePayload?.trace || [], maxErrorPx),
      trace: probePayload?.trace || [],
      note: "runMatrix API not available yet; fallback summary from __INLINE_TRACE.",
    };

    const report = {
      generatedAt: probePayload?.generatedAt || new Date().toISOString(),
      locationHref: probePayload?.locationHref || url,
      userAgent: probePayload?.userAgent || null,
      dpr: probePayload?.dpr || null,
      headless: useHeadless,
      userDataDir: resolvedUserDataDir,
      interactiveWaitMs,
      hasInlineApi: Boolean(probePayload?.hasInlineApi),
      overlayCount: Number(probePayload?.overlayCount || 0),
      inlineHarnessReady,
      title: probePayload?.title || null,
      pathname: probePayload?.pathname || null,
      hasDashboardRoot: Boolean(probePayload?.hasDashboardRoot),
      hasCanvasContainer: Boolean(probePayload?.hasCanvasContainer),
      isLikelyAuthGate: Boolean(probePayload?.isLikelyAuthGate),
      inlineTestKeys: Array.isArray(probePayload?.inlineTestKeys)
        ? probePayload.inlineTestKeys
        : [],
      bodyTextSnippet: probePayload?.bodyTextSnippet || "",
      runtimeDiagnostics,
      setupResult,
      matrixResult: probePayload?.matrixResult || fallbackMatrixResult,
    };

    const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await fs.writeFile(absoluteOutputPath, JSON.stringify(report, null, 2), "utf8");

    const summary = report?.matrixResult?.summary || null;
    const sampleCount = Number(summary?.sampleCount || 0);
    const pageErrors = Array.isArray(report?.runtimeDiagnostics?.pageErrors)
      ? report.runtimeDiagnostics.pageErrors
      : [];
    const hasMissingNextDocumentError = pageErrors.some((entry) =>
      String(entry || "").includes(".next-dev\\server\\pages\\_document.js")
    );
    if (hasMissingNextDocumentError) {
      throw new Error(
        "Next dev runtime is broken (missing .next-dev/server/pages/_document.js). Run `npm run dev:reset` and retry."
      );
    }
    if (report.isLikelyAuthGate && !allowAuthGate) {
      throw new Error(
        "Auth gate detected on target page. Open probe with --headless=0 and reuse --userDataDir to keep login."
      );
    }
    if (requireHarness && !report.inlineHarnessReady) {
      const dashboardNotMounted =
        !report.hasDashboardRoot &&
        !report.hasCanvasContainer &&
        report.pathname === "/dashboard/";
      const hasTemplateLoadError = Array.isArray(report?.runtimeDiagnostics?.consoleErrors)
        ? report.runtimeDiagnostics.consoleErrors.some((entry) =>
            String(entry || "").toLowerCase().includes("error al cargar plantillas")
          )
        : false;
      if (dashboardNotMounted && hasTemplateLoadError) {
        throw new Error(
          "Dashboard loaded without authenticated editor session (template load error + no dashboard root). Log in in headful mode and open a draft (/dashboard?slug=...)."
        );
      }
      if (dashboardNotMounted) {
        throw new Error(
          "Dashboard root not mounted. Log in first and open a draft so CanvasEditor mounts before probing."
        );
      }
      throw new Error(
        "Inline harness not ready (window.__INLINE_TEST missing). Ensure dashboard/canvas mounted and authenticated."
      );
    }
    if (minSamples > 0 && sampleCount < minSamples) {
      throw new Error(
        `Probe collected ${sampleCount} samples (< ${minSamples}). Auto-start may have failed or no editable text exists.`
      );
    }

    console.log("[inlineOverlayMatrixProbe] OK");
    console.log(`- url: ${url}`);
    console.log(`- output: ${absoluteOutputPath}`);
    console.log(`- headless: ${useHeadless ? "yes" : "no"}`);
    console.log(`- userDataDir: ${resolvedUserDataDir || "none"}`);
    if (!useHeadless) {
      console.log(`- interactiveWaitMs: ${interactiveWaitMs}`);
    }
    console.log(`- harness: ${report.inlineHarnessReady ? "ready" : "not-ready"}`);
    console.log(`- inlineApi: ${report.hasInlineApi ? "available" : "fallback"}`);
    console.log(`- authGate: ${report.isLikelyAuthGate ? "yes" : "no"}`);
    if (Array.isArray(report.inlineTestKeys) && report.inlineTestKeys.length > 0) {
      console.log(`- inlineTestKeys: ${report.inlineTestKeys.join(", ")}`);
    }
    if (setupResult?.startResult) {
      console.log(
        `- autoStart: ${setupResult.startResult.ok ? "ok" : "failed"} (${setupResult.startResult.reason || setupResult.startResult.id || "n/a"})`
      );
    }
    if (summary) {
      console.log(
        `- summary: samples=${summary.sampleCount ?? "n/a"}, failures=${summary.failures ?? "n/a"}, passRate=${summary.passRate ?? "n/a"}%`
      );
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[inlineOverlayMatrixProbe] FAILED");
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
