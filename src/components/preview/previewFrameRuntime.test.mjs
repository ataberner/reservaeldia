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
  return {
    attributes: {},
    scrollTop: 0,
    style: createStyleRecorder(),
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
    Event: class {
      constructor(type) {
        this.type = type;
      }
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

test("focused mobile srcDoc installs body authority after generated CSS and adapts root lookup", () => {
  const html =
    '<!doctype html><html><head><style data-runtime="generated">body{overflow-y:auto}</style></head>' +
    '<body><script>window.__previewMobileScrollAuthority = "document.scrollingElement";' +
    "function go(){var scrollRoot = document.scrollingElement || document.documentElement || document.body || null;return scrollRoot;}</script>" +
    "<main></main></body></html>";
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "mobile",
    layoutMode: "parity",
    previewSurface: "mobile-preview-focused",
    scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
  });

  const generatedCssIndex = srcDoc.indexOf('data-runtime="generated"');
  const contractIndex = srcDoc.indexOf('id="preview-focused-body-scroll-authority"');
  assert.ok(generatedCssIndex >= 0);
  assert.ok(contractIndex > generatedCssIndex);
  assert.match(srcDoc, /data-preview-surface="mobile-preview-focused"/);
  assert.match(srcDoc, /data-preview-scroll-authority="body"/);
  assert.match(srcDoc, /<html[^>]*style="[^"]*overflow-y:hidden/);
  assert.match(srcDoc, /<body[^>]*style="[^"]*overflow-y:auto/);
  assert.match(srcDoc, /html[^}]*overflow-y: hidden !important/s);
  assert.match(srcDoc, /body[^}]*overflow-y: auto/s);
  assert.match(srcDoc, /__previewMobileScrollAuthority = "body"/);
  assert.match(srcDoc, /window\.__resolvePreviewScrollRoot\(\)/);
  assert.doesNotMatch(srcDoc, /__previewMobileScrollAuthority = "document\.scrollingElement"/);
});

test("non-focused srcDoc does not receive the body-root contract", () => {
  const html = "<!doctype html><html><head></head><body></body></html>";
  const srcDoc = buildPreviewFrameSrcDoc(html, {
    previewViewport: "mobile",
    layoutMode: "parity",
    previewSurface: "mobile-preview-paired",
    scrollAuthority: PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY,
  });

  assert.doesNotMatch(srcDoc, /preview-focused-body-scroll-authority/);
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
  assert.deepEqual(stub.frameWindow.events, ["preview:mobile-scroll:enable", "resize"]);
});

test("body authority is applied only to the focused parity mobile surface", () => {
  const stub = createFrameStub();

  applyPreviewFrameScale(stub.event, 0.5, "mobile", {
    layoutMode: "parity",
    previewSurface: "mobile-preview-focused",
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
});

test("body authority request is ignored outside mobile-preview-focused", () => {
  const stub = createFrameStub();

  applyPreviewFrameScale(stub.event, 0.5, "mobile", {
    layoutMode: "parity",
    previewSurface: "mobile-preview-paired",
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
