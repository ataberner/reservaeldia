import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDashboardExportExclusions,
  cloneDashboardStageLayersForExport,
  dashboardExportExcludeProps,
  DASHBOARD_EXPORT_RASTER_LIMITS,
  exportDashboardImageFromStage,
  getDashboardExportExcludedName,
  isDashboardExportExcludedLayer,
  isDashboardExportExcludedNode,
  resolveDashboardExportPixelRatio,
} from "./dashboardCanvasExport.js";

class MockNode {
  constructor({
    name = "",
    className = "Group",
    perfLabel = "",
    children = [],
  } = {}) {
    this.attrs = {
      ...(name ? { name } : {}),
      ...(perfLabel ? { perfLabel } : {}),
    };
    this.className = className;
    this.children = children;
    this.visibleValue = true;
    this.__canvasStagePerfLabel = perfLabel;
  }

  name() {
    return this.attrs.name || "";
  }

  hasName(name) {
    return this.name().split(/\s+/).filter(Boolean).includes(name);
  }

  getClassName() {
    return this.className;
  }

  getAttr(key) {
    return this.attrs[key];
  }

  getChildren() {
    return this.children;
  }

  add(child) {
    this.children.push(child);
  }

  visible(nextValue) {
    if (typeof nextValue === "boolean") {
      this.visibleValue = nextValue;
    }
    return this.visibleValue;
  }

  clone(attrs = {}) {
    return new MockNode({
      name: attrs.name || this.name(),
      className: this.className,
      perfLabel: this.__canvasStagePerfLabel,
      children: this.children.map((child) => child.clone()),
    });
  }
}

test("dashboard export marker appends one reusable exclusion name", () => {
  assert.equal(
    getDashboardExportExcludedName("ui-hover-indicator"),
    "ui-hover-indicator dashboard-export-exclude"
  );
  assert.equal(
    getDashboardExportExcludedName("ui dashboard-export-exclude"),
    "ui dashboard-export-exclude"
  );
  assert.deepEqual(dashboardExportExcludeProps("canvas-guide-layer"), {
    name: "canvas-guide-layer dashboard-export-exclude",
  });
});

test("dashboard export predicate excludes editor-only nodes explicitly", () => {
  assert.equal(isDashboardExportExcludedNode(new MockNode({ name: "ui" })), true);
  assert.equal(
    isDashboardExportExcludedNode(new MockNode({ name: "ui-hover-indicator" })),
    true
  );
  assert.equal(
    isDashboardExportExcludedNode(new MockNode({ name: "inline-text-edit-decorations" })),
    true
  );
  assert.equal(
    isDashboardExportExcludedNode(
      new MockNode({ name: getDashboardExportExcludedName("section-active-indicator") })
    ),
    true
  );
  assert.equal(
    isDashboardExportExcludedNode(new MockNode({ className: "Transformer" })),
    true
  );
  assert.equal(isDashboardExportExcludedNode(new MockNode({ name: "ui-card" })), false);
});

test("dashboard export skips editor-only layers before allocating their clone canvases", () => {
  const sourceStage = new MockNode({
    children: [
      new MockNode({
        perfLabel: "ui-overlay",
        children: [new MockNode({ name: "ui-hover-indicator" })],
      }),
      new MockNode({
        perfLabel: "sections-base",
        children: [
          new MockNode({ name: getDashboardExportExcludedName("section-active-indicator") }),
          new MockNode({ name: "render-content" }),
        ],
      }),
    ],
  });
  const stageClone = new MockNode();

  const cloneResult = cloneDashboardStageLayersForExport(sourceStage, stageClone);
  assert.deepEqual(cloneResult, {
    clonedLayerCount: 1,
    excludedLayerCount: 1,
  });
  assert.equal(isDashboardExportExcludedLayer(sourceStage.children[0]), true);
  assert.equal(stageClone.children.length, 1);
  assert.equal(stageClone.children[0].visibleValue, true);

  const exclusionResult = applyDashboardExportExclusions(stageClone);
  assert.equal(exclusionResult.excludedNodeCount, 1);
  assert.equal(stageClone.children[0].children[0].visibleValue, false);
  assert.equal(stageClone.children[0].children[1].visibleValue, true);
});

test("dashboard export bounds the raster allocation for a tall editor stage", () => {
  const ratio = resolveDashboardExportPixelRatio({
    width: 800,
    height: 3062,
    requestedPixelRatio: 1,
  });
  const outputWidth = 800 * ratio;
  const outputHeight = 3062 * ratio;

  assert.ok(ratio > 0 && ratio < 1);
  assert.ok(outputWidth <= DASHBOARD_EXPORT_RASTER_LIMITS.maxWidth);
  assert.ok(outputHeight <= DASHBOARD_EXPORT_RASTER_LIMITS.maxHeight);
  assert.ok(
    outputWidth * outputHeight <=
      DASHBOARD_EXPORT_RASTER_LIMITS.maxPixels + 0.001
  );
});

test("dashboard export preserves a lower requested ratio and never upscales", () => {
  assert.equal(
    resolveDashboardExportPixelRatio({
      width: 800,
      height: 500,
      requestedPixelRatio: 0.25,
    }),
    0.25
  );
  assert.equal(
    resolveDashboardExportPixelRatio({
      width: 320,
      height: 240,
      requestedPixelRatio: 2,
    }),
    1
  );
});

test("dashboard export rejects invalid stages before loading Konva", async () => {
  await assert.rejects(
    () => exportDashboardImageFromStage(null),
    /Stage invalido/
  );
});
