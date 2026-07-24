import test from "node:test";
import assert from "node:assert/strict";

import {
  getFrameAssetPrimaryError,
  hasTransparentPixelInRgba,
  inspectFrameAssetFile,
  inspectPngFile,
} from "./frameAssetInspector.js";

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function chunk(type, data = Buffer.alloc(0)) {
  return Buffer.concat([
    uint32(data.length),
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4),
  ]);
}

function pngBytes({ width = 1200, height = 1200, colorType = 6 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", Buffer.from([0])),
    chunk("IEND"),
  ]);
}

function fileFromBytes(bytes, overrides = {}) {
  return {
    name: "flores.png",
    type: "image/png",
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
    },
    ...overrides,
  };
}

test("frontend validates a transparent PNG using signature and decoded dimensions", async () => {
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({
    width: 1200,
    height: 1200,
    close() {},
  });
  try {
    const report = await inspectPngFile(fileFromBytes(pngBytes()));
    assert.equal(report.valid, true);
    assert.equal(report.type, "png");
    assert.equal(report.mimeType, "image/png");
    assert.equal(report.checks.hasAlpha, true);
    assert.ok(report.assetBase64.length > 0);
  } finally {
    globalThis.createImageBitmap = previous;
  }
});

test("frontend rejects spoofed and corrupt PNG before replacing form state", async () => {
  const spoofed = await inspectFrameAssetFile(
    fileFromBytes(Buffer.from("<svg />"))
  );
  assert.equal(spoofed.valid, false);
  assert.equal(
    getFrameAssetPrimaryError(spoofed),
    "El archivo no es un SVG o PNG válido."
  );

  const corrupt = await inspectFrameAssetFile(
    fileFromBytes(pngBytes().subarray(0, 40))
  );
  assert.equal(corrupt.valid, false);
  assert.match(getFrameAssetPrimaryError(corrupt), /leer el archivo/i);
});

test("frontend keeps opaque PNG valid and exposes actionable warnings", async () => {
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({
    width: 1200,
    height: 1200,
    close() {},
  });
  try {
    const report = await inspectPngFile(
      fileFromBytes(pngBytes({ colorType: 2 }))
    );
    assert.equal(report.valid, true);
    assert.match(report.warnings.join(" "), /transparencia/i);
  } finally {
    globalThis.createImageBitmap = previous;
  }
});

test("frontend distinguishes an alpha channel from actual transparent pixels", async () => {
  assert.equal(
    hasTransparentPixelInRgba(
      new Uint8ClampedArray([255, 255, 255, 255, 10, 20, 30, 0])
    ),
    true
  );
  assert.equal(
    hasTransparentPixelInRgba(
      new Uint8ClampedArray([255, 255, 255, 255, 10, 20, 30, 255])
    ),
    false
  );

  const previousBitmap = globalThis.createImageBitmap;
  const previousCanvas = globalThis.OffscreenCanvas;
  globalThis.createImageBitmap = async () => ({
    width: 1200,
    height: 1200,
    close() {},
  });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return {
        clearRect() {},
        drawImage() {},
        getImageData: () => ({
          data: new Uint8ClampedArray([255, 255, 255, 255]),
        }),
      };
    }
  };
  try {
    const report = await inspectPngFile(fileFromBytes(pngBytes()));
    assert.equal(report.valid, true);
    assert.equal(report.checks.hasAlpha, true);
    assert.equal(report.checks.hasTransparency, false);
    assert.match(report.warnings.join(" "), /transparencia visible/i);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    globalThis.OffscreenCanvas = previousCanvas;
  }
});

test("error presentation collapses technical SVG and size failures", () => {
  assert.equal(
    getFrameAssetPrimaryError({
      criticalErrors: ["El SVG contiene <script>."],
    }),
    "El SVG contiene elementos no permitidos."
  );
  assert.equal(
    getFrameAssetPrimaryError({
      criticalErrors: ["El PNG supera el tamaño máximo."],
    }),
    "La imagen supera el tamaño máximo permitido."
  );
});
