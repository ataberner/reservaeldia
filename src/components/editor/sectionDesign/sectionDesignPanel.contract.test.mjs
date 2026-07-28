import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX } from "../../../domain/dashboard/editorCanvasLayout.js";

function read(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const actionsSource = read("../canvasEditor/SectionActionsOverlay.jsx");
const canvasSource = read("../../CanvasEditor.jsx");
const sidebarSource = read("../../DashboardSidebar.jsx");
const panelSource = read("./SectionDesignPanel.jsx");

test("section design access reuses canManageSite and editor-only controls", () => {
  assert.match(
    actionsSource,
    /canManageSite && typeof onOpenSectionDesign === "function"/
  );
  assert.match(actionsSource, /data-section-design-trigger/);
  assert.match(actionsSource, /data-editor-only/);
  assert.match(canvasSource, /canManageSite &&\s*!readOnly/);
});

test("section design panel preserves section and object selection", () => {
  assert.match(panelSource, /data-preserve-canvas-selection="true"/);
  assert.doesNotMatch(panelSource, /setElementosSeleccionados|setSeccionActivaId/);
  assert.match(canvasSource, /selectedSection/);
  assert.match(canvasSource, /updateSectionDividers\(previous, seccionActivaId, patch\)/);
  assert.doesNotMatch(panelSource, /scrollTo|scrollTop|setZoom|setScale/);
  assert.match(
    canvasSource,
    /onClose=\{\(\) => closeEditorPanel\(EDITOR_PANEL_IDS\.SECTION_DESIGN\)\}/
  );
});

test("left and right panels consume the single coordinator authority", () => {
  assert.match(sidebarSource, /activePanel === EDITOR_PANEL_IDS\.LEFT/);
  assert.match(sidebarSource, /openEditorPanel\(EDITOR_PANEL_IDS\.LEFT\)/);
  assert.match(canvasSource, /openEditorPanel\(EDITOR_PANEL_IDS\.SECTION_DESIGN\)/);
  assert.doesNotMatch(
    `${sidebarSource}\n${canvasSource}`,
    /dispatchEvent\([^)]*section-design/
  );
});

test("section design panel is narrower on desktop and keeps its mobile bounds", () => {
  assert.equal(SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX, 376);
  assert.match(
    panelSource,
    /md:w-\[var\(--section-design-panel-width\)\]/
  );
  assert.match(
    panelSource,
    /"--section-design-panel-width": `\$\{SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX\}px`/
  );
  assert.match(panelSource, /bottom-\[104px\] left-2 right-2/);
});

test("section design panel exposes only divider controls", () => {
  assert.doesNotMatch(
    panelSource,
    /SelectorColorSeccion|Color de fondo|onBackgroundChange/
  );
  assert.match(panelSource, /label="Divisor superior"/);
  assert.match(panelSource, /label="Divisor inferior"/);
  assert.match(panelSource, /Altura del divisor/);
  assert.match(panelSource, /disabled=\{disabled \|\| !seccion\?\.id \|\| !hasDividers\}/);
});

test("opening and closing section design do not write selection, zoom or scroll", () => {
  const openHandler =
    canvasSource.match(
      /const handleOpenSectionDesign = useCallback\(\(\) => \{([\s\S]*?)\n\s*\}, \[/
    )?.[1] || "";

  assert.ok(openHandler);
  assert.doesNotMatch(
    openHandler,
    /setElementosSeleccionados|setSeccionActivaId|setZoom|setScale|scrollTo|scrollTop/
  );
  assert.match(openHandler, /openEditorPanel\(EDITOR_PANEL_IDS\.SECTION_DESIGN\)/);
});
