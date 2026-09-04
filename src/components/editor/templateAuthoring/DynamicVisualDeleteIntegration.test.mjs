import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const canvasSource = read("../../CanvasEditor.jsx");
const shortcutsSource = read("../../../hooks/useKeyboardShortcuts.js");
const backgroundUiSource = read("../canvasEditor/useCanvasEditorSectionBackgroundUi.js");

test("dynamic visual alertdialog freezes the global canvas shortcuts", () => {
  assert.match(shortcutsSource, /disabled = false/);
  assert.match(
    shortcutsSource,
    /const handleKeyDown = \(e\) => \{\s*if \(disabled\) return;/
  );
  assert.match(shortcutsSource, /puedeMoverSeleccion,\s*disabled,/);
  assert.match(
    canvasSource,
    /disabled: dynamicVisualDeleteState\.isOpen/
  );
});

test("delete flow captures focus before opening and restores to a surviving editor target", () => {
  assert.match(canvasSource, /captureDynamicVisualDeleteFocus/);
  assert.match(
    canvasSource,
    /captureDynamicVisualDeleteFocus\(\{ preferOptionButton: true \}\)/
  );
  assert.match(canvasSource, /captureDynamicVisualDeleteFocus\(\);/);
  assert.match(canvasSource, /botonOpcionesRef\.current\?\.querySelector/);
  assert.match(canvasSource, /editorOverlayRootRef\.current/);
  assert.match(canvasSource, /tabIndex=\{-1\}/);
  assert.match(
    canvasSource,
    /onRestoreFocus: restoreDynamicVisualDeleteFocus/
  );
});

test("delete dialog names the affected schema fields", () => {
  assert.match(canvasSource, /resolveDynamicVisualDeleteFieldLabels/);
  assert.match(canvasSource, /plan\.affected\.fieldKeys/);
  assert.match(canvasSource, /fieldLabels,/);
});

test("image conversions that remove roots pass through the dynamic visual planner", () => {
  assert.match(
    canvasSource,
    /requestCanvasObjectDelete\(\{\s*selectedIds: \[objectId\],\s*conversion:/s
  );
  assert.match(
    canvasSource,
    /kind: "section-base-image"[\s\S]*reemplazarFondo\(options\)/
  );
  assert.match(
    backgroundUiSource,
    /kind: "background-decoration"[\s\S]*convertirImagenEnDecoracionFondo/
  );
  assert.match(
    backgroundUiSource,
    /kind: "edge-decoration"[\s\S]*convertImageObjectToSectionEdgeDecorationState/
  );
  assert.match(
    canvasSource,
    /planDynamicFieldVisualDeletion\(\{[\s\S]*const pendingConversion = dynamicVisualRootConversionRef\.current;/
  );
  assert.match(
    canvasSource,
    /nextObjects,\s*nextFieldsSchema: plan\.nextFieldsSchema,\s*nextDetachedVisuals: plan\.nextDetachedVisuals,\s*nextSections,/s
  );
});
