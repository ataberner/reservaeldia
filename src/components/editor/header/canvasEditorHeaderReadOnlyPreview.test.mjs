import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardHeaderSource = readFileSync(
  new URL("../../DashboardHeader.jsx", import.meta.url),
  "utf8"
);
const canvasEditorHeaderSource = readFileSync(
  new URL("./CanvasEditorHeader.jsx", import.meta.url),
  "utf8"
);
const dashboardPageSource = readFileSync(
  new URL("../../../pages/dashboard.js", import.meta.url),
  "utf8"
);

test("the administrative read-only editor exposes one preview action", () => {
  assert.match(
    dashboardHeaderSource,
    /editorReadOnly && \(isTemplateSession \|\| allowReadOnlyPreview\)/
  );
  assert.match(
    canvasEditorHeaderSource,
    /readOnlyPreviewOnly\s*\? `\$\{primaryHeaderButton\} hidden h-10 px-4 md:inline-flex`\s*: `\$\{previewHeaderButton\} hidden md:inline-flex`/
  );
  assert.match(
    canvasEditorHeaderSource,
    /\{!readOnlyPreviewOnly \? \(\s*<button[\s\S]*?\{previewButtonLabel\}[\s\S]*?<\/button>\s*\) : null\}/
  );
});

test("the read-only preview modal receives no publication callback", () => {
  assert.match(
    dashboardPageSource,
    /onPublish=\{\s*previewGateState\.canPublishFromPreview\s*\? publicarDesdeVistaPrevia\s*: undefined\s*\}/
  );
  assert.match(
    dashboardPageSource,
    /showPublishActions=\{previewGateState\.canPublishFromPreview\}/
  );
});
