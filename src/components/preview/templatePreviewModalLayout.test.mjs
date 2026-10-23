import assert from "node:assert/strict";
import test from "node:test";

import { resolveTemplatePreviewViewportLayout } from "./templatePreviewModalLayout.js";

test("template preview fills the available tablet height without changing its width", () => {
  const portrait = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 768,
    stageWidth: 736,
    stageHeight: 1024,
  });
  const landscape = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 1024,
    stageWidth: 980,
    stageHeight: 768,
  });

  assert.equal(portrait.previewViewport, "desktop");
  assert.equal(portrait.isTabletHost, true);
  assert.equal(portrait.scaledWidth, 736);
  assert.equal(portrait.scaledHeight, 1024);
  assert.ok(portrait.viewportHeight > 820);
  assert.equal(portrait.layoutViewportHeight, 820);

  assert.equal(landscape.previewViewport, "desktop");
  assert.equal(landscape.isTabletHost, true);
  assert.equal(landscape.scaledWidth, 980);
  assert.equal(landscape.scaledHeight, 768);
  assert.equal(landscape.layoutViewportHeight, 820);
});

test("template preview fills mobile height while preserving invitation layout", () => {
  const mobile = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 390,
    stageWidth: 366,
    stageHeight: 812,
  });

  assert.equal(mobile.previewViewport, "mobile");
  assert.equal(mobile.isMobileHost, true);
  assert.equal(mobile.isTabletHost, false);
  assert.equal(mobile.viewportWidth, 390);
  assert.equal(mobile.viewportHeight * mobile.scale, 812);
  assert.equal(mobile.layoutViewportHeight, 844);
  assert.equal(mobile.scaledWidth, 366);
  assert.equal(mobile.scaledHeight, 812);
});

test("template preview selects mobile layout before the stage has measured", () => {
  const initialMobile = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 390,
  });

  assert.equal(initialMobile.previewViewport, "mobile");
  assert.equal(initialMobile.viewportHeight, 844);
  assert.equal(initialMobile.layoutViewportHeight, 844);
});

test("template preview fills desktop height immediately above the tablet boundary", () => {
  const desktop = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 1025,
    stageWidth: 980,
    stageHeight: 900,
  });

  assert.equal(desktop.previewViewport, "desktop");
  assert.equal(desktop.isTabletHost, false);
  assert.equal(desktop.viewportWidth, 1280);
  assert.ok(Math.abs(desktop.viewportHeight * desktop.scale - 900) < 0.001);
  assert.equal(desktop.layoutViewportHeight, 820);
  assert.equal(desktop.scaledWidth, 980);
  assert.equal(desktop.scaledHeight, 900);
});

test("template preview never leaves a vertical gap or clips its viewing window", () => {
  for (const [hostViewportWidth, stageWidth, stageHeight] of [
    [375, 325, 633],
    [390, 340, 810],
    [430, 380, 898],
    [667, 617, 250],
    [1024, 974, 320],
    [1025, 975, 900],
    [1366, 978, 768],
    [1920, 978, 1080],
    [240, 190, 180],
  ]) {
    const result = resolveTemplatePreviewViewportLayout({
      hostViewportWidth,
      stageWidth,
      stageHeight,
    });

    assert.equal(result.scaledHeight, stageHeight);
    assert.ok(Math.abs(result.viewportHeight * result.scale - stageHeight) < 0.001);
    assert.ok(result.scaledWidth <= stageWidth);
    assert.equal(result.layoutViewportHeight, result.isMobileHost ? 844 : 820);
    assert.equal(result.viewportWidth, result.isMobileHost ? 390 : 1280);
  }
});
