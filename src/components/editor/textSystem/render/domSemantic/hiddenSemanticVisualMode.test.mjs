import test from "node:test";
import assert from "node:assert/strict";

import { resolveHiddenSemanticVisualMode } from "./hiddenSemanticVisualMode.js";

test("canvas-first hidden semantic mode keeps native text visuals fully hidden", () => {
  assert.deepEqual(
    resolveHiddenSemanticVisualMode({
      usesTransformedBackendLayout: false,
    }),
    {
      shouldUseNativeSelectionVisuals: false,
      selectionVisualMode: "synthetic",
      editorOpacity: 0,
    }
  );
});

test("transformed hidden semantic mode preserves native selection visuals", () => {
  assert.deepEqual(
    resolveHiddenSemanticVisualMode({
      usesTransformedBackendLayout: true,
    }),
    {
      shouldUseNativeSelectionVisuals: true,
      selectionVisualMode: "native",
      editorOpacity: 1,
    }
  );
});
