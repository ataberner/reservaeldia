import assert from "node:assert/strict";
import test from "node:test";

import {
  computeModalVistaPreviaLayout,
  computeModalVistaPreviaSingleViewportLayout,
  PREVIEW_MODAL_VIEWPORTS,
} from "./modalVistaPreviaLayout.js";

test("modal preview desktop layout modes remain stable", () => {
  assert.equal(
    computeModalVistaPreviaLayout({ stageWidth: 1500, stageHeight: 760 }).mode,
    "showcase-overlap"
  );
  assert.equal(
    computeModalVistaPreviaLayout({ stageWidth: 1100, stageHeight: 680 }).mode,
    "dual-column-compact"
  );
  assert.equal(
    computeModalVistaPreviaLayout({ stageWidth: 390, stageHeight: 620 }).mode,
    "stacked-priority"
  );
});

test("single viewport mobile layout makes the mobile frame primary", () => {
  const stackedLayout = computeModalVistaPreviaLayout({
    stageWidth: 390,
    stageHeight: 620,
  });
  const mobileFocusedLayout = computeModalVistaPreviaSingleViewportLayout({
    stageWidth: 390,
    stageHeight: 620,
    viewport: PREVIEW_MODAL_VIEWPORTS.MOBILE,
  });
  const desktopFocusedLayout = computeModalVistaPreviaSingleViewportLayout({
    stageWidth: 390,
    stageHeight: 620,
    viewport: PREVIEW_MODAL_VIEWPORTS.DESKTOP,
  });

  assert.equal(mobileFocusedLayout.mode, "single-viewport");
  assert.equal(mobileFocusedLayout.viewport, PREVIEW_MODAL_VIEWPORTS.MOBILE);
  assert.equal(desktopFocusedLayout.viewport, PREVIEW_MODAL_VIEWPORTS.DESKTOP);
  assert.ok(mobileFocusedLayout.cardWidth <= 390);
  assert.ok(mobileFocusedLayout.cardHeight <= 620);
  assert.ok(mobileFocusedLayout.cardHeight > stackedLayout.mobileCardHeight);
  assert.ok(mobileFocusedLayout.frame.scale > desktopFocusedLayout.frame.scale);
});
