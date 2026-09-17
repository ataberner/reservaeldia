import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import * as layout from "./modalVistaPreviaLayout.js";
import * as frameRuntime from "./previewFrameRuntime.js";
import * as presentation from "../../domain/dashboard/previewValidationPresentation.js";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../ModalVistaPrevia.jsx", import.meta.url), "utf8");
const { code } = await swc.transform(source, {
  filename: "ModalVistaPrevia.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
const adapters = {
  "@/components/preview/modalVistaPreviaLayout": layout,
  "@/components/preview/previewFrameRuntime": frameRuntime,
  "@/domain/dashboard/previewValidationPresentation": presentation,
  "@/domain/countdownAudit/runtime": { captureCountdownAuditFromHtmlString: () => {} },
  "@/domain/dashboard/previewTiming": {}, // Effect-only diagnostics never run during static render.
  "@/components/preview/PreviewPublishNoticeLayer": () => React.createElement("div", { "data-notice": true }),
  "@/components/preview/PreviewLoadingPresentation": () => React.createElement("div", { "data-loading": true }),
};
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(
  (id) => Object.hasOwn(adapters, id) ? adapters[id] : require(id),
  compiled, compiled.exports
);
const Modal = compiled.exports.default;

test("desktop and mobile preparation failures stay visible without loading frames, including read-only", () => {
  const originalWindow = globalThis.window;
  try {
    for (const width of [390, 1440]) {
      globalThis.window = { innerWidth: width, innerHeight: 900 };
      for (const showPublishActions of [true, false]) {
        const markup = renderToStaticMarkup(React.createElement(Modal, {
          visible: true, htmlContent: null, publishError: "No se pudo confirmar el guardado.",
          onRetry: () => {}, showPublishActions,
        }));
        assert.match(markup, /role="alert"[^>]*>No se pudo confirmar el guardado\./);
        assert.match(markup, /Reintentar<\/button>/);
        assert.match(markup, /aria-label="Cerrar/);
        assert.doesNotMatch(markup, /<iframe|data-loading|data-notice/);
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("publication errors after HTML generation preserve the preview and its notice", () => {
  const markup = renderToStaticMarkup(React.createElement(Modal, {
    visible: true, htmlContent: "<html><body>Preview</body></html>",
    publishError: "No se pudo publicar.", onRetry: () => {},
  }));
  assert.match(markup, /<iframe/);
  assert.match(markup, /data-notice/);
  assert.doesNotMatch(markup, /Reintentar<\/button>|No se pudo abrir la vista previa/);
});
