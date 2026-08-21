import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDashboardExportExclusions,
  applyDashboardExportSectionDividerSeamRepair,
  cloneDashboardStageLayersForExport,
  dashboardExportExcludeProps,
  dashboardExportSectionDividerProps,
  DASHBOARD_EXPORT_RASTER_LIMITS,
  exportDashboardImageFromStage,
  getDashboardExportExcludedName,
  isDashboardExportExcludedLayer,
  isDashboardExportExcludedNode,
  isDashboardExportSectionDividerNode,
  resolveDashboardExportPixelRatio,
  resolveDashboardExportSectionDividerOverlap,
} from "./dashboardCanvasExport.js";

class MockNode {
  constructor({
    name = "",
    className = "Group",
    perfLabel = "",
    children = [],
    attrs = {},
  } = {}) {
    this.attrs = {
      ...attrs,
      ...(name ? { name } : {}),
      ...(perfLabel ? { perfLabel } : {}),
    };
    this.className = className;
    this.children = [];
    this.parent = null;
    this.visibleValue = true;
    this.__canvasStagePerfLabel = perfLabel;
    children.forEach((child) => this.add(child));
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

  getParent() {
    return this.parent;
  }

  setAttrs(attrs = {}) {
    Object.assign(this.attrs, attrs);
  }

  add(child) {
    child.parent = this;
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
      attrs: {
        ...this.attrs,
        ...attrs,
      },
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
  assert.deepEqual(dashboardExportSectionDividerProps({ bottomFill: "#ffffff" }), {
    name: "dashboard-export-section-divider",
    dashboardExportSectionDividerBottomFill: "#ffffff",
  });
  assert.deepEqual(dashboardExportSectionDividerProps(), {});
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

test("dashboard export repairs only marked divider clips on the offscreen clone", () => {
  const regularPath = new MockNode({
    className: "Path",
    attrs: { fill: "#101010" },
  });
  const dividerGroup = new MockNode({
    attrs: {
      ...dashboardExportSectionDividerProps({
        topFill: "#f0f0f0",
        bottomFill: "#ffffff",
      }),
      clipX: 0,
      clipY: 100,
      clipWidth: 800,
      clipHeight: 600,
    },
    children: [
      new MockNode({
        className: "Path",
        attrs: { fill: "#f0f0f0" },
      }),
      new MockNode({
        className: "Path",
        attrs: { fill: "#ffffff" },
      }),
      regularPath,
    ],
  });
  const stageClone = new MockNode({ children: [dividerGroup] });

  assert.equal(isDashboardExportSectionDividerNode(dividerGroup), true);
  assert.equal(isDashboardExportSectionDividerNode(regularPath), false);
  assert.equal(isDashboardExportExcludedNode(dividerGroup), false);

  const result = applyDashboardExportSectionDividerSeamRepair(stageClone, {
    createRect: (attrs) => new MockNode({ className: "Rect", attrs }),
  });

  assert.deepEqual(result, {
    repairedGroupCount: 1,
    seamCoverCount: 2,
  });
  assert.equal(dividerGroup.attrs.clipY, 99);
  assert.equal(dividerGroup.attrs.clipHeight, 602);
  assert.equal(dividerGroup.children.length, 5);
  assert.deepEqual(dividerGroup.children[3].attrs, {
    name: "dashboard-export-section-divider-seam-cover",
    x: 0,
    y: 99,
    width: 800,
    height: 2,
    fill: "#f0f0f0",
    listening: false,
    perfectDrawEnabled: false,
  });
  assert.deepEqual(dividerGroup.children[4].attrs, {
    name: "dashboard-export-section-divider-seam-cover",
    x: 0,
    y: 699,
    width: 800,
    height: 2,
    fill: "#ffffff",
    listening: false,
    perfectDrawEnabled: false,
  });
  assert.deepEqual(regularPath.attrs, { fill: "#101010" });
});

test("dashboard export divider overlap always covers one output raster row", () => {
  assert.equal(resolveDashboardExportSectionDividerOverlap(1), 1);
  assert.equal(resolveDashboardExportSectionDividerOverlap(2), 1);
  assert.equal(resolveDashboardExportSectionDividerOverlap(0.5), 2);

  const coverRatio = resolveDashboardExportPixelRatio({
    width: 800,
    height: 2947,
    requestedPixelRatio: 2,
  });
  const overlap = resolveDashboardExportSectionDividerOverlap(coverRatio);

  assert.ok(coverRatio > 0 && coverRatio < 1);
  assert.ok(overlap * coverRatio >= 1);
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
          new MockNode({ name: "section-divider-wave" }),
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
  assert.equal(stageClone.children[0].children[2].visibleValue, true);
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
