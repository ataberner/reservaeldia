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

test("template preview preserves the existing mobile geometry", () => {
  const mobile = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 390,
    stageWidth: 366,
    stageHeight: 812,
  });

  assert.equal(mobile.previewViewport, "mobile");
  assert.equal(mobile.isMobileHost, true);
  assert.equal(mobile.isTabletHost, false);
  assert.equal(mobile.viewportWidth, 390);
  assert.equal(mobile.viewportHeight, 844);
  assert.equal(mobile.layoutViewportHeight, 844);
  assert.equal(mobile.scaledWidth, 366);
  assert.equal(mobile.scaledHeight, 792);
});

test("template preview selects mobile layout before the stage has measured", () => {
  const initialMobile = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 390,
  });

  assert.equal(initialMobile.previewViewport, "mobile");
  assert.equal(initialMobile.viewportHeight, 844);
  assert.equal(initialMobile.layoutViewportHeight, 844);
});

test("template preview preserves desktop geometry immediately above the tablet boundary", () => {
  const desktop = resolveTemplatePreviewViewportLayout({
    hostViewportWidth: 1025,
    stageWidth: 980,
    stageHeight: 900,
  });

  assert.equal(desktop.previewViewport, "desktop");
  assert.equal(desktop.isTabletHost, false);
  assert.equal(desktop.viewportWidth, 1280);
  assert.equal(desktop.viewportHeight, 820);
  assert.equal(desktop.layoutViewportHeight, 820);
  assert.equal(desktop.scaledWidth, 980);
  assert.equal(desktop.scaledHeight, 628);
});
