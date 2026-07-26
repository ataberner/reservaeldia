import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildPreviewFrameSrcDoc,
  PREVIEW_FRAME_SCROLL_AUTHORITIES,
} from "../src/components/preview/previewFrameRuntime.js";

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const { generarHTMLDesdeSecciones } = require(
  join(currentDir, "../functions/lib/utils/generarHTMLDesdeSecciones.js")
);

const sections = Array.from({ length: 5 }, (_, index) => ({
  id: `native-scroll-section-${index + 1}`,
  orden: index + 1,
  altoModo: "fijo",
  altura: 600,
}));

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildHostHtml({
  scale = 0.436019,
  logicalWidth = 390,
  logicalHeight = 844,
} = {}) {
  const visualWidth = Math.round(logicalWidth * scale);
  const visualHeight = Math.round(logicalHeight * scale);

  return `
    <style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden}
      #modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
      #mockup-shell{position:relative;width:${visualWidth + 24}px;height:${visualHeight + 24}px;overflow:hidden;border:6px solid #ddd;border-radius:34px}
      #mockup-clip{position:absolute;inset:4px;overflow:hidden;border-radius:23px}
      #scaled-viewport{width:${visualWidth}px;height:${visualHeight}px;overflow:hidden}
      #scale-wrapper{width:${logicalWidth}px;height:${logicalHeight}px;zoom:${scale}}
      #preview{display:block;width:100%;height:100%;border:0;overflow:clip}
    </style>
    <div id="modal">
      <div id="mockup-shell">
        <div id="mockup-clip">
          <div id="scaled-viewport">
            <div id="scale-wrapper">
              <iframe id="preview" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function injectGestureTrace(html) {
  const trace = `<script data-native-scroll-test>
    window.__programmaticRootWrites = [];
    window.__nativeGestureTrace = { touchStart: null, touchEnd: null, firstScroll: null, scrollEvents: 0 };
    var nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function(){
      window.__programmaticRootWrites.push({
        method: "window.scrollTo",
        arguments: Array.prototype.slice.call(arguments)
      });
      return nativeScrollTo.apply(window, arguments);
    };
    var nativeScrollBy = window.scrollBy.bind(window);
    window.scrollBy = function(){
      window.__programmaticRootWrites.push({
        method: "window.scrollBy",
        arguments: Array.prototype.slice.call(arguments)
      });
      return nativeScrollBy.apply(window, arguments);
    };
    [Element.prototype, HTMLElement.prototype].forEach(function(prototype){
      ["scrollTo", "scrollBy"].forEach(function(method){
        var nativeMethod = prototype && prototype[method];
        if (typeof nativeMethod !== "function" || nativeMethod.__previewProbeWrapped) return;
        var wrapped = function(){
          if (this === document.documentElement || this === document.body) {
            window.__programmaticRootWrites.push({
              method: this.tagName + "." + method,
              arguments: Array.prototype.slice.call(arguments)
            });
          }
          return nativeMethod.apply(this, arguments);
        };
        wrapped.__previewProbeWrapped = true;
        prototype[method] = wrapped;
      });
    });
    [Element.prototype, HTMLElement.prototype].some(function(prototype){
      var descriptor = Object.getOwnPropertyDescriptor(prototype, "scrollTop");
      if (!descriptor || typeof descriptor.get !== "function" || typeof descriptor.set !== "function") {
        return false;
      }
      Object.defineProperty(prototype, "scrollTop", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: function(value){
          if (this === document.documentElement || this === document.body) {
            window.__programmaticRootWrites.push({
              method: this.tagName + ".scrollTop",
              arguments: [value]
            });
          }
          return descriptor.set.call(this, value);
        }
      });
      return true;
    });
    function recordFirstScroll(){
      window.__nativeGestureTrace.scrollEvents += 1;
      if (window.__nativeGestureTrace.firstScroll === null) {
        window.__nativeGestureTrace.firstScroll = performance.now();
      }
    }
    window.addEventListener("touchstart", function(){
      if (window.__nativeGestureTrace.touchStart === null) {
        window.__nativeGestureTrace.touchStart = performance.now();
      }
    }, { capture: true, passive: true });
    window.addEventListener("touchend", function(){
      if (window.__nativeGestureTrace.touchEnd === null) {
        window.__nativeGestureTrace.touchEnd = performance.now();
      }
    }, { capture: true, passive: true });
    window.addEventListener("scroll", recordFirstScroll, { capture: true, passive: true });
    document.addEventListener("DOMContentLoaded", function(){
      document.body.addEventListener("scroll", recordFirstScroll, { passive: true });
    }, { once: true });
  </script>`;
  return String(html).replace(/<\/head>/i, `${trace}</head>`);
}

async function dispatchFirstTouchGesture(page) {
  const box = await page.$eval("#preview", (iframe) => {
    const frameRect = iframe.getBoundingClientRect();
    const clipRect = document.querySelector("#scaled-viewport").getBoundingClientRect();
    const left = Math.max(frameRect.left, clipRect.left);
    const top = Math.max(frameRect.top, clipRect.top);
    const right = Math.min(frameRect.right, clipRect.right);
    const bottom = Math.min(frameRect.bottom, clipRect.bottom);
    return { x: left, y: top, width: right - left, height: bottom - top };
  });
  assert.ok(box?.width > 0 && box?.height > 0, "iframe must have visible hit bounds");

  const x = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.78;
  const endY = box.y + box.height * 0.22;
  const client = await page.createCDPSession();
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY }],
  });
  for (let step = 1; step <= 8; step += 1) {
    const y = startY + ((endY - startY) * step) / 8;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
    await wait(24);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await wait(180);
}

test(
  "focused zoomed mobile preview keeps touch and wheel on the native body scroll owner",
  {
    skip:
      process.env.PREVIEW_MOBILE_NATIVE_SCROLL !== "1"
        ? "Set PREVIEW_MOBILE_NATIVE_SCROLL=1 to run the Chromium touch capture."
        : false,
    timeout: 60_000,
  },
  async (t) => {
    const { default: puppeteer } = await import("puppeteer");
    const generatedHtml = injectGestureTrace(
      generarHTMLDesdeSecciones(sections, [], null, { isPreview: true })
    );
    const srcDoc = buildPreviewFrameSrcDoc(generatedHtml, {
      previewViewport: "mobile",
      layoutMode: "parity",
      previewSurface: "mobile-preview-focused",
      scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
    });

    const browser = await puppeteer.launch({
      headless: "shell",
      timeout: 60_000,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    t.after(async () => {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    });
    page.setDefaultTimeout(10_000);
    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(buildHostHtml(), { waitUntil: "load" });
    await page.$eval("#preview", (iframe, value) => {
      iframe.srcdoc = value;
    }, srcDoc);

    await page.waitForFunction(
      () => {
        const iframe = document.querySelector("#preview");
        return (
          iframe?.contentWindow?.__previewMobileScrollAuthority === "body" &&
          iframe?.contentDocument?.body?.getAttribute("data-preview-scroll-authority") ===
            "body"
        );
      }
    );
    const iframeHandle = await page.$("#preview");
    const frame = await iframeHandle.contentFrame();
    await wait(2_000);

    const initial = await frame.evaluate(() => ({
      scrollingElement: document.scrollingElement?.tagName,
      authority: window.__previewMobileScrollAuthority,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      htmlClientHeight: document.documentElement.clientHeight,
      htmlScrollHeight: document.documentElement.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      bodyRectHeight: document.body.getBoundingClientRect().height,
      invitationHeight: document.querySelector(".inv")?.getBoundingClientRect().height,
      bodyScrollRange: document.body.scrollHeight - document.body.clientHeight,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.equal(initial.scrollingElement, "HTML");
    assert.equal(initial.authority, "body");
    assert.equal(initial.htmlOverflowY, "hidden");
    assert.equal(initial.bodyOverflowY, "auto");
    assert.equal(initial.htmlScrollTop, 0);
    assert.equal(initial.bodyScrollTop, 0);
    assert.ok(
      initial.bodyScrollRange > 0,
      `body must be scrollable before touchstart: ${JSON.stringify(initial)}`
    );
    assert.deepEqual(initial.writes, []);

    await dispatchFirstTouchGesture(page);
    const afterTouch = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      writes: window.__programmaticRootWrites.slice(),
      trace: { ...window.__nativeGestureTrace },
    }));
    assert.equal(afterTouch.htmlScrollTop, 0);
    assert.ok(afterTouch.bodyScrollTop > 0, "first touch must move body");
    assert.deepEqual(afterTouch.writes, [], "touch must not call window.scrollTo");
    assert.ok(afterTouch.trace.firstScroll !== null, "first gesture must emit scroll");
    assert.ok(
      afterTouch.trace.firstScroll < afterTouch.trace.touchEnd,
      "native body scroll must begin before the first touchend"
    );

    await frame.evaluate(() => {
      window.__programmaticRootWrites.length = 0;
    });
    const beforeWheel = await frame.evaluate(() => document.body.scrollTop);
    const frameBox = await page.$eval("#preview", (iframe) => {
      const rect = iframe.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.move(
      frameBox.x + frameBox.width / 2,
      frameBox.y + frameBox.height / 2
    );
    for (let index = 0; index < 8; index += 1) {
      await page.mouse.wheel({ deltaY: 18 });
      await wait(16);
    }
    await wait(120);
    const afterWheel = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.equal(afterWheel.htmlScrollTop, 0);
    assert.ok(afterWheel.bodyScrollTop > beforeWheel);
    assert.deepEqual(afterWheel.writes, []);

    const modalLock = await frame.evaluate(() => {
      const before = document.body.scrollTop;
      const rsvp = document.createElement("div");
      rsvp.id = "modal-rsvp";
      rsvp.style.display = "none";
      document.body.appendChild(rsvp);
      rsvp.style.display = "flex";
      const rsvpLocked = getComputedStyle(document.body).overflowY;
      rsvp.style.display = "none";
      const rsvpRestored = getComputedStyle(document.body).overflowY;

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const generatedModalLocked = getComputedStyle(document.body).overflowY;
      document.body.style.overflow = originalOverflow;
      const generatedModalRestored = getComputedStyle(document.body).overflowY;

      return {
        before,
        after: document.body.scrollTop,
        htmlScrollTop: document.documentElement.scrollTop,
        rsvpLocked,
        rsvpRestored,
        generatedModalLocked,
        generatedModalRestored,
      };
    });
    assert.equal(modalLock.rsvpLocked, "hidden");
    assert.equal(modalLock.rsvpRestored, "auto");
    assert.equal(modalLock.generatedModalLocked, "hidden");
    assert.equal(modalLock.generatedModalRestored, "auto");
    assert.equal(modalLock.after, modalLock.before);
    assert.equal(modalLock.htmlScrollTop, 0);

    await wait(2_000);
    const afterDelayedLayout = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.equal(afterDelayedLayout.htmlScrollTop, 0);
    assert.ok(afterDelayedLayout.bodyScrollTop >= afterTouch.bodyScrollTop);
    assert.deepEqual(afterDelayedLayout.writes, []);
  }
);

test(
  "zoomed desktop preview keeps wheel deltas on the native document root through its full range",
  {
    skip:
      process.env.PREVIEW_MOBILE_NATIVE_SCROLL !== "1"
        ? "Set PREVIEW_MOBILE_NATIVE_SCROLL=1 to run the Chromium wheel capture."
        : false,
    timeout: 60_000,
  },
  async (t) => {
    const { default: puppeteer } = await import("puppeteer");
    const generatedHtml = injectGestureTrace(
      generarHTMLDesdeSecciones(sections, [], null, { isPreview: true })
    );
    const srcDoc = buildPreviewFrameSrcDoc(generatedHtml, {
      previewViewport: "desktop",
      layoutMode: "parity",
      previewSurface: "desktop-preview-focused",
    });
    const browser = await puppeteer.launch({
      headless: "shell",
      timeout: 60_000,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    t.after(async () => {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    });
    page.setDefaultTimeout(10_000);
    await page.setViewport({
      width: 1100,
      height: 760,
      deviceScaleFactor: 1.5,
    });
    await page.setContent(
      buildHostHtml({
        scale: 0.72,
        logicalWidth: 1280,
        logicalHeight: 820,
      }),
      { waitUntil: "load" }
    );
    await page.$eval("#preview", (iframe, value) => {
      iframe.srcdoc = value;
    }, srcDoc);
    await page.waitForFunction(
      () =>
        document.querySelector("#preview")?.contentDocument?.querySelectorAll(
          ".sec"
        ).length === 5
    );
    const frame = await (await page.$("#preview")).contentFrame();
    await frame.waitForFunction(() => !document.getElementById("inv-loader"));
    await frame.evaluate(() => {
      window.__programmaticRootWrites.length = 0;
    });

    const frameBox = await page.$eval("#preview", (iframe) => {
      const rect = iframe.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.move(
      frameBox.x + frameBox.width / 2,
      frameBox.y + frameBox.height / 2
    );
    for (let index = 0; index < 12; index += 1) {
      await page.mouse.wheel({ deltaY: 22 });
      await wait(16);
    }
    await wait(120);
    const middle = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      maxScrollTop:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.ok(middle.htmlScrollTop > 0);
    assert.ok(middle.htmlScrollTop < middle.maxScrollTop);
    assert.equal(middle.bodyScrollTop, 0);
    assert.deepEqual(middle.writes, []);

    for (let index = 0; index < 12; index += 1) {
      await page.mouse.wheel({ deltaY: 800 });
      await wait(16);
    }
    await wait(160);
    const end = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      maxScrollTop:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.ok(Math.abs(end.maxScrollTop - end.htmlScrollTop) < 2);
    assert.equal(end.bodyScrollTop, 0);
    assert.deepEqual(end.writes, []);

    await page.mouse.wheel({ deltaY: -180 });
    await wait(120);
    const afterReverse = await frame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.ok(afterReverse.htmlScrollTop < end.htmlScrollTop);
    assert.equal(afterReverse.bodyScrollTop, 0);
    assert.deepEqual(afterReverse.writes, []);

    const shortSrcDoc = buildPreviewFrameSrcDoc(
      injectGestureTrace(
        generarHTMLDesdeSecciones(sections.slice(0, 1), [], null, {
          isPreview: true,
        })
      ),
      {
        previewViewport: "desktop",
        layoutMode: "parity",
        previewSurface: "desktop-preview-focused",
      }
    );
    await page.$eval("#preview", (iframe, value) => {
      iframe.srcdoc = value;
    }, shortSrcDoc);
    await page.waitForFunction(
      () =>
        document.querySelector("#preview")?.contentDocument?.querySelectorAll(
          ".sec"
        ).length === 1
    );
    const shortFrame = await (await page.$("#preview")).contentFrame();
    await shortFrame.waitForFunction(
      () =>
        !document.getElementById("inv-loader") &&
        !!window.__programmaticRootWrites
    );
    await shortFrame.evaluate(() => {
      window.__programmaticRootWrites.length = 0;
    });
    await page.mouse.wheel({ deltaY: 240 });
    await wait(120);
    const shortState = await shortFrame.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      writes: window.__programmaticRootWrites.slice(),
    }));
    assert.equal(shortState.htmlScrollTop, 0);
    assert.equal(shortState.bodyScrollTop, 0);
    assert.deepEqual(shortState.writes, []);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
  }
);
