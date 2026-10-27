import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
const { code } = await swc.transform(readFileSync(new URL("./AdminDraftEditingControls.jsx", import.meta.url), "utf8"), {
  filename: "AdminDraftEditingControls.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
const render = props => renderToStaticMarkup(React.createElement(compiled.exports.default, props));

test("administrative controls identify explicit editing and the return to read-only mode", () => {
  assert.match(render({}), /solo lectura[\s\S]*Editar borrador/);
  assert.match(render({ editing: true }), /se conserva el propietario[\s\S]*Volver a solo lectura/);
  assert.match(render({ busy: true }), /disabled=""[\s\S]*Procesando/);
});

test("conflict details remain visible with an explicit reload action", () => {
  const markup = render({ editing: true, error: "El propietario guardó cambios recientes." });
  assert.match(markup, /role="alert"[\s\S]*El propietario guardó cambios recientes/);
  assert.match(markup, /Recargar borrador/);
  assert.doesNotMatch(render({}), /role="alert"|Recargar borrador/);
});
