import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
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
  ${motionRuntime}
</body>
</html>`;
}

test(
  "generated readiness waits for the first section but not later eager images",
  { timeout: 30_000 },
  async (t) => {
    const timers = new Set();
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
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
      if (url.pathname === "/missing.svg") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }

      const html = url.pathname === "/first-slow"
        ? buildRuntimePage({ firstImageSrc: "/first-slow.svg" })
        : url.pathname === "/timeout-then-ready"
          ? buildRuntimePage({
            firstImageSrc: "/first-slow.svg",
            loaderRuntimeHtml: boundedTimeoutLoaderRuntime,
          })
        : url.pathname === "/first-error"
          ? buildRuntimePage({ firstImageSrc: "/missing.svg" })
          : url.pathname === "/first-object-slow"
            ? buildRuntimePage({
              firstImageSrc: instantSvg,
              firstObjectImageSrc: "/first-object-slow.svg",
            })
            : buildRuntimePage({
              firstImageSrc: instantSvg,
              laterImageSrc: "/later-slow.svg",
            });
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

    const laterPage = await browser.newPage();
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

    const firstPage = await browser.newPage();
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

    const firstObjectPage = await browser.newPage();
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

    const timedOutPage = await browser.newPage();
    await timedOutPage.goto(`${origin}/timeout-then-ready`, {
      waitUntil: "domcontentloaded",
    });
    await timedOutPage.waitForFunction(
      () => document.body?.getAttribute("data-loader-error") === "1",
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
      retryVisible:
        getComputedStyle(
          document.querySelector("[data-invitation-retry='true']")
        ).display !== "none",
    }));
    assert.equal(timedOutTrace.loaderHiddenCount, 0);
    assert.equal(timedOutTrace.loaderPresent, true);
    assert.equal(timedOutTrace.invitationOpacity, 0);
    assert.equal(timedOutTrace.retryVisible, true);
    await timedOutPage.close();

    const failedPage = await browser.newPage();
    await failedPage.goto(`${origin}/first-error`, { waitUntil: "domcontentloaded" });
    await failedPage.waitForFunction(
      () => document.body?.getAttribute("data-loader-error") === "1",
      { timeout: 5_000 }
    );
    const failedTrace = await failedPage.evaluate(() => ({
      ...window.__readinessTrace,
      loaderPresent: Boolean(document.getElementById("inv-loader")),
      loaderHasError: document
        .getElementById("inv-loader")
        ?.classList.contains("inv-loader--error"),
      invitationOpacity: Number(
        getComputedStyle(document.querySelector(".inv")).opacity
      ),
      retryVisible:
        getComputedStyle(
          document.querySelector("[data-invitation-retry='true']")
        ).display !== "none",
    }));
    assert.equal(failedTrace.runtimeReady, null);
    assert.equal(failedTrace.runtimeFailed?.reason, "first-background-failed");
    assert.equal(failedTrace.loaderHiddenCount, 0);
    assert.equal(failedTrace.loaderPresent, true);
    assert.equal(failedTrace.loaderHasError, true);
    assert.equal(failedTrace.invitationOpacity, 0);
    assert.equal(failedTrace.retryVisible, true);
    await failedPage.close();
  }
);
