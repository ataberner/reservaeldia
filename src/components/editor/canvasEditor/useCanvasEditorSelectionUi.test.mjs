import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import * as hoverLifecycle from "../textSystem/render/konva/hoverLifecycle.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const source = readFileSync(new URL("./useCanvasEditorSelectionUi.js", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const hookModule = { exports: {} };
new Function("require", "module", "exports", outputText)((id) => {
  if (id === "react") return React;
  if (id === "@/components/editor/textSystem/render/konva/hoverLifecycle") return hoverLifecycle;
  throw new Error("Unexpected dependency: " + id);
}, hookModule, hookModule.exports);
const { resolveCanvasHoverIdUpdate } = hookModule.exports;

test("hover policy blocks new hover targets while a global interaction is active", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", "obj-2", {
      interactionSuppressed: true,
    }),
    "obj-1"
  );
});

test("hover policy still allows clearing hover while a global interaction is active", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", null, {
      interactionSuppressed: true,
    }),
    null
  );
});

test("hover policy preserves normal hover updates while idle", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", "obj-2", {
      interactionSuppressed: false,
    }),
    "obj-2"
  );
});
