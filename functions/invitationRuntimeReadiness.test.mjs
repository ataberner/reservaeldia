/* eslint-env browser -- page.evaluate callbacks execute in Chromium's document. */
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { buildPreviewFrameSrcDoc } from "../src/components/preview/previewFrameRuntime.js";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { generarInvitationLoaderRuntimeHTML } = requireBuiltModule(
  "lib/utils/generarInvitationLoaderRuntime.js"
);
const { generarMotionEffectsRuntimeHTML } = requireBuiltModule(
  "lib/utils/generarMotionEffectsRuntime.js"
);

const loaderRuntime = generarInvitationLoaderRuntimeHTML();
const boundedTimeoutLoaderRuntime = loaderRuntime.replace(
  "var MAX_WAIT_MS = 10000;",
  "var MAX_WAIT_MS = 250;"
);
const motionRuntime = generarMotionEffectsRuntimeHTML();
const previewFrameModule = readFileSync(
  new URL("../src/components/preview/previewFrameRuntime.js", import.meta.url), "utf8"
);
const instantSvg = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#692B9A"/></svg>'
)}`;
const delayedSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#FAF5FF"/></svg>'
);

function buildRuntimePage({
  firstImageSrc,
  firstObjectImageSrc = "",
  laterImageSrc = "",
  loaderRuntimeHtml = loaderRuntime,
  motionRuntimeHtml = motionRuntime,
  afterRuntimeHtml = "",
}) {
  const laterSection = laterImageSrc
    ? `
      <section class="sec" id="later-section">
        <img src="${laterImageSrc}" alt="" loading="eager" />
      </section>
    `
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script>
    window.__readinessTrace = {
      firstImageLoad: null,
      loaderHidden: null,
      loaderHiddenCount: 0,
      firstSectionCompleteAtHidden: null,
      invitationOpacityAtHidden: null,
      runtimeFailed: null,
      runtimeReady: null,
      windowLoad: null
    };
    window.addEventListener("invitation-runtime-ready", function(event){
      window.__readinessTrace.runtimeReady = performance.now();
      window.__readinessTrace.runtimeReadyDetail = event.detail;
    });
    window.addEventListener("invitation-runtime-failed", function(event){
      window.__readinessTrace.runtimeFailed = event.detail;
    });
    window.addEventListener("invitation-loader-hidden", function(){
      window.__readinessTrace.loaderHidden = performance.now();
      window.__readinessTrace.loaderHiddenCount += 1;
      var firstSectionImages = Array.from(
        document.querySelectorAll("#first-section img")
      );
      window.__readinessTrace.firstSectionCompleteAtHidden =
        firstSectionImages.every(function(image){
          return image.complete && image.naturalWidth > 0;
        });
      window.__readinessTrace.invitationOpacityAtHidden = Number(
        getComputedStyle(document.querySelector(".inv")).opacity
      );
    });
    window.addEventListener("load", function(){
      window.__readinessTrace.windowLoad = performance.now();
    });
    document.addEventListener("DOMContentLoaded", function(){
      if (window.parent !== window && window.parent.watchInvitation) {
        window.parent.watchInvitation();
      }
    });
  </script>
</head>
<body data-loader-ready="0">
  ${loaderRuntimeHtml}
  <div class="inv">
    <section class="sec" id="first-section">
      <div class="sec-bg" data-bg-kind="image">
        <img
          class="sec-bg-image"
          src="${firstImageSrc}"
          alt=""
          loading="eager"
          fetchpriority="high"
          onload="window.__readinessTrace.firstImageLoad = performance.now()"
        />
      </div>
      ${firstObjectImageSrc
        ? `<img class="objeto" src="${firstObjectImageSrc}" alt="" loading="eager" fetchpriority="high" />`
        : ""}
      <p>Reserva el Día</p>
    </section>
    ${laterSection}
  </div>
  ${motionRuntimeHtml}
  ${afterRuntimeHtml}
</body>
</html>`;
}

test(
  "generated readiness waits initially, then opens without blocking on slow or failed resources",
  { timeout: 90_000 },
  async (t) => {
    const timers = new Set();
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/previewFrameRuntime.js") {
        response.writeHead(200, { "content-type": "text/javascript" });
        response.end(previewFrameModule);
        return;
      }
      if (url.pathname === "/preview") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><html><body>
          <div id="outer-loader">Preparando</div>
          <script type="module">
            import { observePreviewFrameReadiness } from "/previewFrameRuntime.js";
            const frame = document.createElement("iframe");
            frame.style.cssText = "width:100%;height:700px;visibility:hidden";
            window.previewTrace = { ready: 0, errors: [] };
            window.watchInvitation = () => observePreviewFrameReadiness(frame, () => {
              window.previewTrace.ready++;
              frame.style.visibility = "visible";
              document.getElementById("outer-loader").remove();
            }, { onError: error => window.previewTrace.errors.push(error.reason) });
            frame.src = "/" + ${JSON.stringify(url.searchParams.get("scenario") || "first-timeout")}
              + "?viewport=" + ${JSON.stringify(url.searchParams.get("viewport") || "desktop")};
            document.body.appendChild(frame);
          </script></body></html>`);
        return;
      }
      const delayedResponse = (delayMs) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (response.destroyed) return;
          response.writeHead(200, {
            "cache-control": "no-store",
            "content-length": delayedSvg.length,
            "content-type": "image/svg+xml",
          });
          response.end(delayedSvg);
        }, delayMs);
        timers.add(timer);
      };

      if (url.pathname === "/first-slow.svg") {
        delayedResponse(700);
        return;
      }
      if (url.pathname === "/later-slow.svg") {
        delayedResponse(1_800);
        return;
      }
      if (url.pathname === "/first-object-slow.svg") {
        delayedResponse(900);
        return;
      }
      if (url.pathname === "/beyond-budget.svg") {
        delayedResponse(3_500);
        return;
      }
      if (url.pathname === "/slow-defer.js") {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (response.destroyed) return;
          response.writeHead(200, { "content-type": "text/javascript" });
          response.end("window.deferredScriptLoaded = true;");
        }, 3_000);
        timers.add(timer);
        return;
      }
      if (url.pathname === "/missing.svg") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }

      let html = url.pathname === "/first-slow"
        ? buildRuntimePage({ firstImageSrc: "/first-slow.svg" })
        : url.pathname === "/timeout-then-ready"
          ? buildRuntimePage({
            firstImageSrc: "/first-slow.svg",
            loaderRuntimeHtml: boundedTimeoutLoaderRuntime,
          })
        : url.pathname === "/first-error"
          ? buildRuntimePage({ firstImageSrc: "/missing.svg" })
        : url.pathname === "/first-timeout"
          ? buildRuntimePage({ firstImageSrc: "/beyond-budget.svg" })
        : url.pathname === "/object-timeout"
          ? buildRuntimePage({ firstImageSrc: instantSvg, firstObjectImageSrc: "/beyond-budget.svg" })
        : url.pathname === "/missing-runtime"
          ? buildRuntimePage({ firstImageSrc: instantSvg, motionRuntimeHtml: "", loaderRuntimeHtml: boundedTimeoutLoaderRuntime })
        : url.pathname === "/slow-dom"
          ? buildRuntimePage({ firstImageSrc: instantSvg, afterRuntimeHtml: '<script defer src="/slow-defer.js"></script>' })
          : url.pathname === "/first-object-slow"
            ? buildRuntimePage({
              firstImageSrc: instantSvg,
              firstObjectImageSrc: "/first-object-slow.svg",
            })
            : buildRuntimePage({
              firstImageSrc: instantSvg,
              laterImageSrc: "/later-slow.svg",
            });
      if (url.searchParams.has("viewport")) {
        html = buildPreviewFrameSrcDoc(html, {
          previewViewport: url.searchParams.get("viewport"), layoutMode: "parity",
        });
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(html);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const { default: puppeteer } = await import("puppeteer");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      executablePath: puppeteer.executablePath(),
      headless: "shell",
      timeout: 60_000,
    });
    t.after(async () => {
      await browser.close().catch(() => {});
      for (const timer of timers) clearTimeout(timer);
      await new Promise((resolve) => server.close(resolve));
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    // Synthetic loopback resources only; never contact Firebase or remote assets.
    async function newPage() {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        void (request.url().startsWith(origin + "/") || /^(data:|about:)/.test(request.url())
          ? request.continue() : request.abort());
      });
      return page;
    }

    const laterPage = await newPage();
    await laterPage.goto(`${origin}/later-slow`, { waitUntil: "domcontentloaded" });
    await laterPage.waitForFunction(
      () => window.__readinessTrace?.loaderHiddenCount === 1,
      { timeout: 5_000 }
    );
    const beforeLaterImage = await laterPage.evaluate(() => window.__readinessTrace);
    assert.equal(beforeLaterImage.runtimeFailed, null);
    assert.equal(beforeLaterImage.loaderHiddenCount, 1);
    assert.equal(
      beforeLaterImage.windowLoad,
      null,
      "a later eager image must not keep the initial loader open"
    );
    assert.ok(beforeLaterImage.runtimeReady < beforeLaterImage.loaderHidden);
    await laterPage.waitForFunction(
      () => Number.isFinite(window.__readinessTrace?.windowLoad),
      { timeout: 5_000 }
    );
    await laterPage.close();

    const firstPage = await newPage();
    await firstPage.goto(`${origin}/first-slow`, { waitUntil: "domcontentloaded" });
    await firstPage.waitForFunction(
      () => window.__readinessTrace?.loaderHiddenCount === 1,
      { timeout: 5_000 }
    );
    const firstSectionTrace = await firstPage.evaluate(() => window.__readinessTrace);
    assert.equal(firstSectionTrace.runtimeFailed, null);
    assert.ok(Number.isFinite(firstSectionTrace.firstImageLoad));
    assert.ok(
      firstSectionTrace.runtimeReady >= firstSectionTrace.firstImageLoad,
      "the first-section background must be renderable before readiness"
    );
    assert.ok(firstSectionTrace.loaderHidden > firstSectionTrace.runtimeReady);
    assert.equal(firstSectionTrace.loaderHiddenCount, 1);
    assert.equal(firstSectionTrace.firstSectionCompleteAtHidden, true);
    assert.equal(firstSectionTrace.invitationOpacityAtHidden, 1);
    await firstPage.close();

    const firstObjectPage = await newPage();
    await firstObjectPage.goto(`${origin}/first-object-slow`, {
      waitUntil: "domcontentloaded",
    });
    await firstObjectPage.waitForFunction(
      () => window.__readinessTrace?.loaderHiddenCount === 1,
      { timeout: 5_000 }
    );
    const firstObjectTrace = await firstObjectPage.evaluate(
      () => window.__readinessTrace
    );
    assert.equal(firstObjectTrace.runtimeFailed, null);
    assert.equal(firstObjectTrace.firstSectionCompleteAtHidden, true);
    assert.equal(firstObjectTrace.invitationOpacityAtHidden, 1);
    assert.ok(firstObjectTrace.loaderHidden >= 900);
    await firstObjectPage.close();

    const timedOutPage = await newPage();
    await timedOutPage.goto(`${origin}/timeout-then-ready`, {
      waitUntil: "domcontentloaded",
    });
    await timedOutPage.waitForFunction(
      () => window.__readinessTrace?.loaderHiddenCount === 1,
      { timeout: 2_000 }
    );
    await timedOutPage.waitForFunction(
      () => Number.isFinite(window.__readinessTrace?.runtimeReady),
      { timeout: 5_000 }
    );
    const timedOutTrace = await timedOutPage.evaluate(() => ({
      ...window.__readinessTrace,
      loaderPresent: Boolean(document.getElementById("inv-loader")),
      invitationOpacity: Number(
        getComputedStyle(document.querySelector(".inv")).opacity
      ),
      loaderError: document.body.hasAttribute("data-loader-error"),
    }));
    assert.equal(timedOutTrace.loaderHiddenCount, 1);
    assert.equal(timedOutTrace.loaderPresent, false);
    assert.equal(timedOutTrace.invitationOpacity, 1);
    assert.equal(timedOutTrace.loaderError, false);
    assert.ok(timedOutTrace.loaderHidden < timedOutTrace.runtimeReady);
    assert.ok(Number.isFinite(timedOutTrace.firstImageLoad));
    await timedOutPage.close();

    const failedPage = await newPage();
    await failedPage.goto(`${origin}/first-error`, { waitUntil: "domcontentloaded" });
    await failedPage.waitForFunction(
      () => window.__readinessTrace?.loaderHiddenCount === 1,
      { timeout: 5_000 }
    );
    const failedTrace = await failedPage.evaluate(() => ({
      ...window.__readinessTrace,
      loaderPresent: Boolean(document.getElementById("inv-loader")),
      loaderHasError: document.body.hasAttribute("data-loader-error"),
      invitationOpacity: Number(
        getComputedStyle(document.querySelector(".inv")).opacity
      ),
    }));
    assert.ok(Number.isFinite(failedTrace.runtimeReady));
    assert.equal(failedTrace.runtimeFailed, null);
    assert.equal(failedTrace.runtimeReadyDetail.criticalBackground, "error");
    assert.equal(failedTrace.runtimeReadyDetail.criticalImageFailures, 1);
    assert.equal(failedTrace.loaderHiddenCount, 1);
    assert.equal(failedTrace.loaderPresent, false);
    assert.equal(failedTrace.loaderHasError, false);
    assert.equal(failedTrace.invitationOpacity, 1);
    await failedPage.close();

    for (const scenario of ["first-timeout", "object-timeout", "missing-runtime", "slow-dom"]) {
      const page = await newPage();
      await page.goto(`${origin}/${scenario}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__readinessTrace.loaderHiddenCount === 1, { timeout: 5_000 });
      const trace = await page.evaluate(() => ({
        ...window.__readinessTrace, error: document.body.hasAttribute("data-loader-error"),
      }));
      assert.equal(trace.error, false, scenario);
      assert.equal(trace.runtimeFailed, null, scenario);
      assert.equal(trace.invitationOpacityAtHidden, 1, scenario);
      if (scenario.endsWith("timeout")) {
        assert.equal(trace.runtimeReadyDetail.criticalImagesTimedOut, true, scenario);
        assert.equal(trace.firstSectionCompleteAtHidden, false, scenario);
        await page.waitForFunction(() => Array.from(document.querySelectorAll("#first-section img"))
          .every(image => image.complete && image.naturalWidth > 0));
        assert.equal(await page.evaluate(() => window.__readinessTrace.loaderHiddenCount), 1);
      }
      if (scenario === "missing-runtime") assert.equal(trace.runtimeReady, null);
      await page.close();
    }

    for (const viewport of ["desktop", "mobile"]) {
      for (const scenario of ["first-timeout", "first-error"]) {
        const page = await newPage();
        await page.setViewport({ width: viewport === "mobile" ? 390 : 1280, height: 844 });
        await page.goto(`${origin}/preview?scenario=${scenario}&viewport=${viewport}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.previewTrace?.ready === 1, { timeout: 6_000 });
        const trace = await page.evaluate(() => {
          const frame = document.querySelector("iframe");
          return {
            ...window.previewTrace,
            outerLoader: Boolean(document.getElementById("outer-loader")),
            visibility: getComputedStyle(frame).visibility,
            runtime: frame.contentWindow.__readinessTrace,
          };
        });
        assert.deepEqual(trace.errors, [], `${viewport}/${scenario}`);
        assert.equal(trace.outerLoader, false);
        assert.equal(trace.visibility, "visible");
        assert.equal(trace.runtime.runtimeFailed, null);
        assert.equal(trace.runtime.loaderHiddenCount, 1);
        await page.close();
      }
    }
  }
);
