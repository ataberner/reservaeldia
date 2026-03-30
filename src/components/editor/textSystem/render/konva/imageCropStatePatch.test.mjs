import test from "node:test";
import assert from "node:assert/strict";

import { buildImageCropObjectState } from "./imageCropStatePatch.js";

function convertirAbsARel(yAbs, seccionId, secciones) {
  const sectionIndex = secciones.findIndex((section) => section.id === seccionId);
  if (sectionIndex < 0) return yAbs;

  const offsetY = secciones
    .slice(0, sectionIndex)
    .reduce((total, section) => total + Number(section?.altura || 0), 0);

  return yAbs - offsetY;
}

test("buildImageCropObjectState converts stage-space y back to section-local y for fixed sections", () => {
  const nextObject = buildImageCropObjectState({
    current: {
      id: "image-1",
      tipo: "imagen",
      seccionId: "section-2",
      x: 40,
      y: 120,
      width: 200,
      height: 120,
      cropX: 0,
      cropY: 0,
      cropWidth: 800,
      cropHeight: 600,
    },
    cropAttrs: {
      x: 48,
      y: 720,
      width: 180,
      height: 120,
      cropX: 40,
      cropY: 20,
      cropWidth: 720,
      cropHeight: 560,
      ancho: 800,
      alto: 600,
      rotation: 0,
    },
    seccionesOrdenadas: [
      { id: "section-1", altura: 600 },
      { id: "section-2", altura: 500 },
    ],
    convertirAbsARel,
    esSeccionPantallaById: () => false,
    ALTURA_PANTALLA_EDITOR: 800,
  });

  assert.equal(nextObject.x, 48);
  assert.equal(nextObject.y, 120);
  assert.equal(nextObject.width, 180);
  assert.equal(nextObject.height, 120);
  assert.equal(nextObject.cropX, 40);
  assert.equal(nextObject.cropY, 20);
  assert.equal(nextObject.cropWidth, 720);
  assert.equal(nextObject.cropHeight, 560);
  assert.equal("yNorm" in nextObject, false);
});

test("buildImageCropObjectState keeps pantalla sections in local y while updating yNorm", () => {
  const nextObject = buildImageCropObjectState({
    current: {
      id: "image-2",
      tipo: "imagen",
      seccionId: "section-screen",
      x: 32,
      yNorm: 0.2,
      width: 300,
      height: 160,
      cropX: 0,
      cropY: 0,
      cropWidth: 1000,
      cropHeight: 600,
    },
    cropAttrs: {
      x: 36,
      y: 980,
      width: 260,
      height: 160,
      cropX: 60,
      cropY: 0,
      cropWidth: 820,
      cropHeight: 600,
      ancho: 1000,
      alto: 600,
      rotation: 15,
    },
    seccionesOrdenadas: [
      { id: "section-1", altura: 500 },
      { id: "section-screen", altura: 900, altoModo: "pantalla" },
    ],
    convertirAbsARel,
    esSeccionPantallaById: (sectionId) => sectionId === "section-screen",
    ALTURA_PANTALLA_EDITOR: 800,
  });

  assert.equal(nextObject.y, 480);
  assert.equal(nextObject.yNorm, 0.6);
  assert.equal(nextObject.rotation, 15);
  assert.equal(nextObject.scaleX, 1);
  assert.equal(nextObject.scaleY, 1);
});
