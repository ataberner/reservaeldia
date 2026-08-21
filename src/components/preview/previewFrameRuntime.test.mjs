import test from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_FRAME_LAYOUT_MODES,
  PREVIEW_FRAME_SCROLL_AUTHORITIES,
  applyPreviewFrameScale,
  buildPreviewFrameSrcDoc,
  observePreviewFrameReadiness,
  observePreviewFrameTiming,
  resolvePreviewFrameLayoutMode,
} from "./previewFrameRuntime.js";

function createStyleRecorder() {
  const store = {};
  return new Proxy(store, {
    get(target, key) {
      if (key === "setProperty") {
        return (name, value) => {
          target[name] = value;
        };
      }
      if (key === "removeProperty") {
        return (name) => {
          delete target[name];
        };
      }
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

function createElementStub() {
  let scrollTop = 0;
  let scrollTopWrites = 0;
  return {
    attributes: {},
    style: createStyleRecorder(),
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value) {
      scrollTop = value;
      scrollTopWrites += 1;
    },
    get scrollTopWrites() {
      return scrollTopWrites;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createFrameStub() {
  const children = [];
  const documentElement = createElementStub();
  const body = createElementStub();
  const frameWindow = {
    events: [],
    listenerRegistrations: [],
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    addEventListener(type, listener, options) {
      this.listenerRegistrations.push({ type, listener, options });
    },
    dispatchEvent(event) {
      this.events.push(event.type);
    },
    requestAnimationFrame(callback) {
      callback();
    },
  };
  const frameDocument = {
    documentElement,
    body,
    head: {
      appendChild(node) {
        children.push(node);
      },
    },
    getElementById(id) {
      return children.find((node) => node.id === id) || null;
    },
    createElement(tagName) {
      return {
        tagName,
        id: "",
        textContent: "",
      };
    },
  };

  return {
    event: {
      target: {
        contentDocument: frameDocument,
        contentWindow: frameWindow,
      },
    },
    frameDocument,
    frameWindow,
    children,
  };
}

test("preview frame srcDoc injects viewport and layout metadata before iframe load", () => {
  const html = "<!doctype html><html lang=\"es\"><head></head><body><main></main></body></html>";
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "mobile",
    layoutMode: "parity",
  });

  assert.match(srcDoc, /<html[^>]*data-preview-viewport="mobile"/);
  assert.match(srcDoc, /<html[^>]*data-preview-layout-mode="parity"/);
  assert.match(srcDoc, /<body[^>]*data-preview-viewport="mobile"/);
  assert.match(srcDoc, /<body[^>]*data-preview-layout-mode="parity"/);
});

test("preview frame can decouple desktop section layout height from a taller iframe window", () => {
  const html =
    '<!doctype html><html><head></head><body><section class="sec" data-modo="pantalla"></section></body></html>';
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    layoutViewportHeight: 820,
  });

  assert.match(srcDoc, /data-preview-layout-viewport-height="820"/);
  assert.match(
    srcDoc,
    /\.sec\[data-modo="pantalla"\][^{]*\{[^}]*height: 820px !important/s
  );
});

test("preview timing metadata and collector are injected only for a diagnostic session", () => {
  const html =
    "<!doctype html><html lang=\"es\"><head></head><body><main></main></body></html>";
  const normalSrcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "desktop",
  });
  const diagnosticSrcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "desktop",
    previewTiming: {
      sessionId: "session-123",
      surface: "desktop-mockup",
    },
  });

  assert.doesNotMatch(normalSrcDoc, /preview-timing-collector/);
  assert.doesNotMatch(normalSrcDoc, /data-preview-timing-session/);
  assert.match(
    diagnosticSrcDoc,
    /data-preview-timing-session="session-123"/
  );
  assert.match(
    diagnosticSrcDoc,
    /data-preview-timing-surface="desktop-mockup"/
  );
  assert.match(diagnosticSrcDoc, /data-preview-timing-collector="1"/);
  assert.match(diagnosticSrcDoc, /invitation-loader-hidden/);
  assert.doesNotMatch(diagnosticSrcDoc, /<main[^>]*session-123/);
});

test("preview frame timing drains early runtime events and cleans its listener", () => {
  const frameWindow = new EventTarget();
  frameWindow.__previewTimingEvents = [
    {
      sessionId: "session-early",
      stage: "iframe-runtime-bootstrap",
    },
  ];
  const iframe = {
    contentWindow: frameWindow,
  };
  const events = [];
  const cleanup = observePreviewFrameTiming(iframe, (event) => {
    events.push(event);
  });
  const runtimeEvent = new Event("preview-timing-event");
  Object.defineProperty(runtimeEvent, "detail", {
    value: {
      sessionId: "session-early",
      stage: "critical-fonts-ready",
    },
  });
  frameWindow.dispatchEvent(runtimeEvent);
  cleanup();
  frameWindow.dispatchEvent(runtimeEvent);

  assert.deepEqual(
    events.map((event) => event.stage),
    ["iframe-runtime-bootstrap", "critical-fonts-ready"]
  );
});

test("embedded mobile srcDocs install body authority after generated CSS and adapt root lookup", () => {
  const html =
    '<!doctype html><html><head><style data-runtime="generated">body{overflow-y:auto}</style></head>' +
    '<body><script>window.__previewMobileScrollAuthority = "document.scrollingElement";' +
    "function go(){var scrollRoot = document.scrollingElement || document.documentElement || document.body || null;return scrollRoot;}</script>" +
    "<main></main></body></html>";

  for (const previewSurface of [
    "mobile-preview-focused",
    "mobile-preview-paired",
  ]) {
    const srcDoc = buildPreviewFrameSrcDoc(html, {
      previewViewport: "mobile",
      layoutMode: "parity",
      previewSurface,
      scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
    });

    const generatedCssIndex = srcDoc.indexOf('data-runtime="generated"');
    const contractIndex = srcDoc.indexOf('id="preview-mobile-body-scroll-authority"');
    assert.ok(generatedCssIndex >= 0);
    assert.ok(contractIndex > generatedCssIndex);
    assert.match(srcDoc, new RegExp(`data-preview-surface="${previewSurface}"`));
    assert.match(srcDoc, /data-preview-scroll-authority="body"/);
    assert.match(srcDoc, /<html[^>]*style="[^"]*overflow-y:hidden/);
    assert.match(srcDoc, /<body[^>]*style="[^"]*overflow-y:auto/);
    assert.match(srcDoc, /html[^}]*overflow-y: hidden !important/s);
    assert.match(srcDoc, /body[^}]*overflow-y: auto/s);
    assert.match(srcDoc, /__previewMobileScrollAuthority = "body"/);
    assert.match(srcDoc, /window\.__resolvePreviewScrollRoot\(\)/);
    assert.doesNotMatch(srcDoc, /__previewMobileScrollAuthority = "document\.scrollingElement"/);
  }
});

test("non-embedded mobile srcDoc does not receive the body-root contract", () => {
  const html = "<!doctype html><html><head></head><body></body></html>";
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "mobile",
    layoutMode: "parity",
    previewSurface: "fullscreen-mobile",
    scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
  });

  assert.doesNotMatch(srcDoc, /preview-mobile-body-scroll-authority/);
  assert.doesNotMatch(srcDoc, /data-preview-scroll-authority="body"/);
});

test("preview frame srcDoc preserves edge decoration offset CSS variables", () => {
  const html =
    "<!doctype html><html lang=\"es\"><head></head><body>" +
    "<div class=\"sec-edge-decor sec-edge-decor--top\" " +
    "style=\"--edge-offset-desktop:64px;--edge-offset-mobile:-12px\"></div>" +
    "</body></html>";
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "desktop",
    layoutMode: "parity",
  });

  assert.match(srcDoc, /data-preview-viewport="desktop"/);
  assert.match(srcDoc, /--edge-offset-desktop:64px/);
  assert.match(srcDoc, /--edge-offset-mobile:-12px/);
});

test("preview frame readiness waits for the generated loader to finish exactly once", () => {
  const frameWindow = new EventTarget();
  let loaderNode = {};
  const body = {
    getAttribute(name) {
      return name === "data-loader-ready" ? "0" : null;
    },
  };
  const frameDocument = {
    body,
    getElementById(id) {
      return id === "inv-loader" ? loaderNode : null;
    },
  };
  const iframe = {
    contentDocument: frameDocument,
    contentWindow: frameWindow,
  };
  const readyEvents = [];
  const cleanup = observePreviewFrameReadiness(iframe, (event) => {
    readyEvents.push(event);
  });

  assert.equal(readyEvents.length, 0);

  body.getAttribute = (name) =>
    name === "data-loader-ready" ? "1" : null;
  loaderNode = null;
  frameWindow.dispatchEvent(new Event("invitation-loader-hidden"));
  frameWindow.dispatchEvent(new Event("invitation-loader-hidden"));

  assert.equal(readyEvents.length, 1);
  assert.equal(readyEvents[0].reason, "loader-hidden-event");
  cleanup();
});

test("preview frame readiness resolves on load when HTML has no loader protocol", () => {
  const frameDocument = {
    body: {
      getAttribute() {
        return null;
      },
    },
    getElementById() {
      return null;
    },
  };
  const iframe = {
    contentDocument: frameDocument,
    contentWindow: new EventTarget(),
  };
  const readyEvents = [];

  observePreviewFrameReadiness(iframe, (event) => {
    readyEvents.push(event);
  });

  assert.equal(readyEvents.length, 1);
  assert.equal(readyEvents[0].reason, "frame-load");
});

test("preview frame readiness cleanup ignores a late result from an obsolete session", () => {
  const frameWindow = new EventTarget();
  let loaderNode = {};
  let loaderState = "0";
  const frameDocument = {
    body: {
      getAttribute(name) {
        return name === "data-loader-ready" ? loaderState : null;
      },
    },
    getElementById(id) {
      return id === "inv-loader" ? loaderNode : null;
    },
  };
  const iframe = {
    contentDocument: frameDocument,
    contentWindow: frameWindow,
  };
  let readyCalls = 0;
  const cleanup = observePreviewFrameReadiness(iframe, () => {
    readyCalls += 1;
  });

  cleanup();
  loaderState = "1";
  loaderNode = null;
  frameWindow.dispatchEvent(new Event("invitation-loader-hidden"));

  assert.equal(readyCalls, 0);
});

test("preview frame layout mode defaults to parity with legacy rollback values", () => {
  assert.equal(resolvePreviewFrameLayoutMode(), PREVIEW_FRAME_LAYOUT_MODES.PARITY);
  assert.equal(resolvePreviewFrameLayoutMode("1"), PREVIEW_FRAME_LAYOUT_MODES.PARITY);
  assert.equal(resolvePreviewFrameLayoutMode("legacy"), PREVIEW_FRAME_LAYOUT_MODES.LEGACY);
  assert.equal(resolvePreviewFrameLayoutMode("0"), PREVIEW_FRAME_LAYOUT_MODES.LEGACY);
  assert.equal(resolvePreviewFrameLayoutMode("off"), PREVIEW_FRAME_LAYOUT_MODES.LEGACY);
});

test("parity preview frame scale keeps the mobile iframe document scrollable", () => {
  const stub = createFrameStub();
  stub.frameDocument.documentElement.scrollTop = 18;

  applyPreviewFrameScale(stub.event, 0.5, "mobile", { layoutMode: "parity" });

  assert.equal(stub.frameDocument.documentElement.attributes["data-preview-scale"], "0.5");
  assert.equal(
    stub.frameDocument.documentElement.attributes["data-preview-raster-scale"],
    "scaled"
  );
  assert.equal(stub.frameDocument.documentElement.attributes["data-preview-viewport"], "mobile");
  assert.equal(stub.frameDocument.documentElement.attributes["data-preview-layout-mode"], "parity");
  assert.equal(stub.frameDocument.documentElement.style.height, "auto");
  assert.equal(stub.frameDocument.documentElement.style.overflowY, "auto");
  assert.equal(stub.frameDocument.body.style.height, "auto");
  assert.equal(stub.frameDocument.body.style.overflowY, "visible");
  assert.equal(stub.frameDocument.documentElement.scrollTop, 18);
  assert.match(stub.children[0].textContent, /::-webkit-scrollbar/);
  assert.match(
    stub.children[0].textContent,
    /html\[data-preview-viewport="mobile"\]\[data-preview-layout-mode="parity"\]/
  );
  assert.match(stub.children[0].textContent, /overflow-y: visible !important/);
  assert.match(
    stub.children[0].textContent,
    /html\[data-preview-raster-scale="scaled"\] \.sec-bg-image/
  );
  assert.match(
    stub.children[0].textContent,
    /left: var\(--bg-image-left, 0px\);[\s\S]*top: var\(--bg-image-top, 0px\);[\s\S]*transform: none;[\s\S]*will-change: auto;/
  );
  assert.match(
    stub.children[0].textContent,
    /\.sec\[data-decor-parallax="soft"\] \.sec-bg-image,[\s\S]*\.sec\[data-decor-parallax="dynamic"\] \.sec-bg-image[\s\S]*translate: 0 var\(--bg-parallax-y, 0px\);[\s\S]*will-change: translate;/
  );
  assert.doesNotMatch(
    stub.children[0].textContent,
    /top: calc\(var\(--bg-image-top, 0px\) \+ var\(--bg-parallax-y, 0px\)\)/
  );
  assert.match(
    stub.children[0].textContent,
    /data-preview-raster-scale="scaled"[^}]*\.sec-divider svg[\s\S]*position: relative;[\s\S]*left: -1px;[\s\S]*width: calc\(100% \+ 2px\);/
  );
  assert.match(
    stub.children[0].textContent,
    /data-preview-raster-scale="scaled"[^}]*\.sec-divider--top svg[\s\S]*top: -1px;[\s\S]*height: calc\(100% \+ 1px\);/
  );
  assert.match(
    stub.children[0].textContent,
    /data-preview-raster-scale="scaled"[^}]*\.sec-divider--bottom svg[\s\S]*height: calc\(100% \+ 1px\);/
  );
  assert.deepEqual(stub.frameWindow.events, ["preview:mobile-scroll:enable", "resize"]);
});

test("native-scale preview leaves generated image transforms authoritative", () => {
  const stub = createFrameStub();

  applyPreviewFrameScale(stub.event, 1, "desktop", { layoutMode: "parity" });

  assert.equal(
    stub.frameDocument.documentElement.attributes["data-preview-raster-scale"],
    "native"
  );
  assert.doesNotMatch(
    stub.children[0].textContent,
    /html\[data-preview-raster-scale="native"\] \.sec-bg-image/
  );
  assert.doesNotMatch(
    stub.children[0].textContent,
    /data-preview-raster-scale="native"[^}]*\.sec-divider--bottom svg/
  );
});

test("preview scale preserves native scroll positions without gesture listeners or duplicate style nodes", () => {
  const desktop = createFrameStub();
  desktop.frameDocument.documentElement.scrollTop = 42;
  desktop.frameDocument.body.scrollTop = 7;
  const desktopDocumentWrites =
    desktop.frameDocument.documentElement.scrollTopWrites;
  const desktopBodyWrites = desktop.frameDocument.body.scrollTopWrites;

  applyPreviewFrameScale(desktop.event, 0.5, "desktop", {
    layoutMode: "parity",
  });
  applyPreviewFrameScale(desktop.event, 0.75, "desktop", {
    layoutMode: "parity",
  });

  assert.equal(desktop.frameDocument.documentElement.scrollTop, 42);
  assert.equal(desktop.frameDocument.body.scrollTop, 7);
  assert.equal(
    desktop.frameDocument.documentElement.scrollTopWrites,
    desktopDocumentWrites
  );
  assert.equal(desktop.frameDocument.body.scrollTopWrites, desktopBodyWrites);
  assert.deepEqual(desktop.frameWindow.listenerRegistrations, []);
  assert.equal(desktop.children.length, 1);

  const mobile = createFrameStub();
  mobile.frameDocument.documentElement.scrollTop = 0;
  mobile.frameDocument.body.scrollTop = 36;
  const mobileDocumentWrites =
    mobile.frameDocument.documentElement.scrollTopWrites;
  const mobileBodyWrites = mobile.frameDocument.body.scrollTopWrites;

  applyPreviewFrameScale(mobile.event, 0.5, "mobile", {
    layoutMode: "parity",
    previewSurface: "mobile-preview-paired",
    scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
  });

  assert.equal(mobile.frameDocument.documentElement.scrollTop, 0);
  assert.equal(mobile.frameDocument.body.scrollTop, 36);
  assert.equal(
    mobile.frameDocument.documentElement.scrollTopWrites,
    mobileDocumentWrites
  );
  assert.equal(mobile.frameDocument.body.scrollTopWrites, mobileBodyWrites);
  assert.deepEqual(mobile.frameWindow.listenerRegistrations, []);
  assert.equal(mobile.children.length, 1);
});

test("body authority is applied only to embedded parity mobile surfaces", () => {
  for (const previewSurface of [
    "mobile-preview-focused",
    "mobile-preview-paired",
  ]) {
    const stub = createFrameStub();

    applyPreviewFrameScale(stub.event, 0.5, "mobile", {
      layoutMode: "parity",
      previewSurface,
      scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
    });

    assert.equal(stub.frameDocument.documentElement.style.height, "100%");
    assert.equal(stub.frameDocument.documentElement.style.overflowY, "hidden");
    assert.equal(stub.frameDocument.documentElement.scrollTop, 0);
    assert.equal(stub.frameDocument.body.style.height, "100%");
    assert.equal(stub.frameDocument.body.style.overflowY, "auto");
    assert.equal(
      stub.frameDocument.documentElement.attributes["data-preview-scroll-authority"],
      "body"
    );
    assert.equal(stub.frameDocument.body.attributes["data-preview-scroll-authority"], "body");
    assert.equal(stub.frameWindow.__previewMobileScrollAuthority, "body");
    assert.equal(stub.frameWindow.__resolvePreviewScrollRoot(), stub.frameDocument.body);
    assert.match(stub.children[0].textContent, /overflow-y: hidden !important/);
    assert.match(stub.children[0].textContent, /overflow-y: auto;/);
    assert.match(stub.children[0].textContent, /#modal-rsvp/);
  }
});

test("body authority request is ignored outside embedded mobile mockups", () => {
  const stub = createFrameStub();

  applyPreviewFrameScale(stub.event, 0.5, "mobile", {
    layoutMode: "parity",
    previewSurface: "fullscreen-mobile",
    scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
  });

  assert.equal(stub.frameDocument.documentElement.style.height, "auto");
  assert.equal(stub.frameDocument.documentElement.style.overflowY, "auto");
  assert.equal(stub.frameDocument.body.style.height, "auto");
  assert.equal(stub.frameDocument.body.style.overflowY, "visible");
  assert.equal(
    stub.frameDocument.documentElement.attributes["data-preview-scroll-authority"],
    undefined
  );
  assert.equal(stub.frameWindow.__previewMobileScrollAuthority, undefined);
});

test("legacy preview frame scale keeps the previous mobile document layout override", () => {
  const stub = createFrameStub();

  applyPreviewFrameScale(stub.event, 0.5, "mobile", { layoutMode: "legacy" });

  assert.equal(stub.frameDocument.documentElement.attributes["data-preview-layout-mode"], "legacy");
  assert.equal(stub.frameDocument.documentElement.style.height, "auto");
  assert.equal(stub.frameDocument.documentElement.style.overflowY, "auto");
  assert.equal(stub.frameDocument.body.style.height, "auto");
  assert.equal(stub.frameDocument.body.style.overflowY, "hidden");
  assert.match(stub.children[0].textContent, /height: auto !important/);
});
