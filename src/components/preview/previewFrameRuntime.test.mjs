import test from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_FRAME_LAYOUT_MODES,
  PREVIEW_FRAME_SCROLL_AUTHORITIES,
  applyPreviewFrameScale,
  buildPreviewFrameSrcDoc,
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
