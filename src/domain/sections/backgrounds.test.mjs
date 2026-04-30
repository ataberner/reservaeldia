import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSectionEdgeDecorationsPayload,
  convertImageObjectToSectionEdgeDecorationState,
  resolveEdgeDecorationCanvasHeight,
  resolveEdgeDecorationCanvasRenderBox,
  updateSectionEdgeDecorationOffset,
} from "./backgrounds.js";

const defaultSizingFields = {
  heightModel: "intrinsic-clamp",
  intrinsicWidth: null,
  intrinsicHeight: null,
  minHeightDesktopPx: 96,
  maxHeightDesktopPx: 280,
  minHeightMobilePx: 64,
  maxHeightMobilePx: 150,
};

test("convertImageObjectToSectionEdgeDecorationState creates top slot and removes source object", () => {
  const sections = [{ id: "section-1", decoracionesBorde: {} }];
  const objects = [
    {
      id: "image-1",
      tipo: "imagen",
      seccionId: "section-1",
      src: "https://cdn.example.com/top.png",
      width: 320,
      height: 120,
      nombre: "Top flowers",
    },
    {
      id: "text-1",
      tipo: "texto",
      seccionId: "section-1",
      texto: "Hello",
    },
  ];

  const result = convertImageObjectToSectionEdgeDecorationState({
    sections,
    objects,
    imageObject: objects[0],
    slot: "top",
  });

  assert.equal(result.removedObjectId, "image-1");
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].id, "text-1");
  assert.equal(result.sections[0].decoracionesBorde.top.src, "https://cdn.example.com/top.png");
  assert.equal(result.sections[0].decoracionesBorde.top.nombre, "Top flowers");
  assert.equal(result.sections[0].decoracionesBorde.bottom, undefined);
});

test("convertImageObjectToSectionEdgeDecorationState creates bottom slot and removes source object", () => {
  const sections = [{ id: "section-1", decoracionesBorde: {} }];
  const imageObject = {
    id: "image-bottom",
    tipo: "imagen",
    seccionId: "section-1",
    src: "https://cdn.example.com/bottom.png",
    width: 400,
    height: 160,
  };

  const result = convertImageObjectToSectionEdgeDecorationState({
    sections,
    objects: [imageObject],
    imageObject,
    slot: "bottom",
  });

  assert.equal(result.removedObjectId, "image-bottom");
  assert.deepEqual(result.objects, []);
  assert.equal(result.sections[0].decoracionesBorde.bottom.src, "https://cdn.example.com/bottom.png");
  assert.equal(result.sections[0].decoracionesBorde.top, undefined);
});

test("updateSectionEdgeDecorationOffset preserves top slot fields and clamps desktop offset", () => {
  const sections = [
    {
      id: "section-1",
      decoracionesBorde: {
        top: {
          enabled: true,
          src: "https://cdn.example.com/top.png",
          storagePath: "sections/top.png",
          decorId: "decor-top",
          nombre: "Top flowers",
          heightDesktopRatio: 0.4,
          heightMobileRatio: 0.22,
          offsetDesktopPx: 4,
          offsetMobilePx: 8,
          mode: "contain-x",
        },
      },
    },
  ];

  const result = updateSectionEdgeDecorationOffset(
    sections,
    "section-1",
    "top",
    { offsetDesktopPx: 999 }
  );

  assert.deepEqual(result[0].decoracionesBorde.top, {
    enabled: true,
    src: "https://cdn.example.com/top.png",
    storagePath: "sections/top.png",
    decorId: "decor-top",
    nombre: "Top flowers",
    ...defaultSizingFields,
    maxSectionRatioDesktop: 0.4,
    maxSectionRatioMobile: 0.22,
    heightDesktopRatio: 0.4,
    heightMobileRatio: 0.22,
    offsetDesktopPx: 240,
    offsetMobilePx: 8,
    mode: "contain-x",
  });
});

test("updateSectionEdgeDecorationOffset preserves bottom disabled state and clamps mobile offset", () => {
  const sections = [
    {
      id: "section-1",
      decoracionesBorde: {
        bottom: {
          enabled: false,
          src: "https://cdn.example.com/bottom.png",
          offsetDesktopPx: 12,
          offsetMobilePx: 0,
        },
      },
    },
  ];

  const result = updateSectionEdgeDecorationOffset(
    sections,
    "section-1",
    "bottom",
    { offsetMobilePx: -999 }
  );

  assert.equal(result[0].decoracionesBorde.bottom.enabled, false);
  assert.equal(result[0].decoracionesBorde.bottom.offsetDesktopPx, 12);
  assert.equal(result[0].decoracionesBorde.bottom.offsetMobilePx, -240);
});

test("updateSectionEdgeDecorationOffset leaves missing slots unchanged", () => {
  const sections = [
    {
      id: "section-1",
      decoracionesBorde: {
        top: {
          src: "https://cdn.example.com/top.png",
        },
      },
    },
  ];

  const result = updateSectionEdgeDecorationOffset(
    sections,
    "section-1",
    "bottom",
    { offsetDesktopPx: 20 }
  );

  assert.deepEqual(result, sections);
});

test("edge decoration normalization adds intrinsic-clamp defaults and layout budget", () => {
  const result = buildSectionEdgeDecorationsPayload({
    decoracionesBorde: {
      top: {
        src: "https://cdn.example.com/top.png",
        heightDesktopRatio: 0.9,
        heightMobileRatio: 0.02,
        minHeightDesktopPx: 12,
        maxHeightDesktopPx: 9999,
        maxSectionRatioDesktop: 0.9,
      },
      layout: {
        maxCombinedSectionRatioDesktop: 0.95,
        maxCombinedSectionRatioMobile: 0.05,
      },
    },
  });

  assert.equal(result.top.heightModel, "intrinsic-clamp");
  assert.equal(result.top.heightDesktopRatio, 0.55);
  assert.equal(result.top.heightMobileRatio, 0.08);
  assert.equal(result.top.minHeightDesktopPx, 24);
  assert.equal(result.top.maxHeightDesktopPx, 640);
  assert.equal(result.top.maxSectionRatioDesktop, 0.55);
  assert.equal(result.top.maxSectionRatioMobile, 0.08);
  assert.deepEqual(result.layout, {
    maxCombinedSectionRatioDesktop: 0.75,
    maxCombinedSectionRatioMobile: 0.16,
  });
});

test("edge decoration canvas height uses intrinsic clamp unless ratio-band is explicit", () => {
  const intrinsicClampHeight = resolveEdgeDecorationCanvasHeight(
    {
      src: "https://cdn.example.com/top.png",
      intrinsicWidth: 800,
      intrinsicHeight: 360,
      maxHeightDesktopPx: 180,
      maxSectionRatioDesktop: 0.3,
    },
    {
      sectionHeight: 500,
      canvasWidth: 800,
    }
  );
  const ratioBandHeight = resolveEdgeDecorationCanvasHeight(
    {
      src: "https://cdn.example.com/top.png",
      heightModel: "ratio-band",
      intrinsicWidth: 800,
      intrinsicHeight: 360,
      maxHeightDesktopPx: 180,
      maxSectionRatioDesktop: 0.3,
    },
    {
      sectionHeight: 500,
      canvasWidth: 800,
    }
  );

  assert.equal(intrinsicClampHeight, 150);
  assert.equal(ratioBandHeight, 360);
});

test("edge decoration canvas render box preserves aspect ratio in cover mode", () => {
  const topBox = resolveEdgeDecorationCanvasRenderBox(
    {
      src: "https://cdn.example.com/top.png",
      intrinsicWidth: 800,
      intrinsicHeight: 360,
      maxHeightDesktopPx: 180,
      maxSectionRatioDesktop: 0.3,
      mode: "cover-x",
    },
    {
      slot: "top",
      sectionHeight: 500,
      canvasWidth: 800,
    }
  );
  const bottomBox = resolveEdgeDecorationCanvasRenderBox(
    {
      src: "https://cdn.example.com/bottom.png",
      intrinsicWidth: 800,
      intrinsicHeight: 360,
      maxHeightDesktopPx: 180,
      maxSectionRatioDesktop: 0.3,
      mode: "cover-x",
    },
    {
      slot: "bottom",
      sectionHeight: 500,
      canvasWidth: 800,
    }
  );

  assert.equal(topBox.bandHeight, 150);
  assert.equal(topBox.imageWidth, 800);
  assert.equal(topBox.imageHeight, 360);
  assert.equal(topBox.imageY, 0);
  assert.equal(bottomBox.imageY, -210);
  assert.equal(topBox.imageHeight / topBox.imageWidth, 0.45);
  assert.equal(bottomBox.bandHeight - bottomBox.imageY - bottomBox.imageHeight, 0);
});

test("edge decoration canvas render box contains without stretching", () => {
  const box = resolveEdgeDecorationCanvasRenderBox(
    {
      src: "https://cdn.example.com/tall.png",
      intrinsicWidth: 400,
      intrinsicHeight: 800,
      maxHeightDesktopPx: 180,
      maxSectionRatioDesktop: 0.3,
      mode: "contain-x",
    },
    {
      slot: "bottom",
      sectionHeight: 500,
      canvasWidth: 800,
    }
  );

  assert.equal(box.bandHeight, 150);
  assert.equal(box.imageWidth, 75);
  assert.equal(box.imageHeight, 150);
  assert.equal(box.imageX, 362.5);
  assert.equal(box.imageY, 0);
  assert.equal(box.imageHeight / box.imageWidth, 2);
});
