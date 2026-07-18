import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDashboardExportExclusions,
  cloneDashboardStageLayersForExport,
  dashboardExportExcludeProps,
  exportDashboardImageFromStage,
  getDashboardExportExcludedName,
  isDashboardExportExcludedLayer,
  isDashboardExportExcludedNode,
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

test("dashboard export hides editor-only layers and marked nodes in the clone", () => {
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
    clonedLayerCount: 2,
    excludedLayerCount: 1,
  });
  assert.equal(isDashboardExportExcludedLayer(sourceStage.children[0]), true);
  assert.equal(stageClone.children[0].visibleValue, false);
  assert.equal(stageClone.children[1].visibleValue, true);

  const exclusionResult = applyDashboardExportExclusions(stageClone);
  assert.equal(exclusionResult.excludedNodeCount, 2);
  assert.equal(stageClone.children[1].children[0].visibleValue, false);
  assert.equal(stageClone.children[1].children[1].visibleValue, true);
});

test("dashboard export rejects invalid stages before loading Konva", async () => {
  await assert.rejects(
    () => exportDashboardImageFromStage(null),
    /Stage invalido/
  );
});
