import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTDOWN_FRAME_ASSET_LIMITS,
  inspectCountdownPngBytes,
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
} from "./countdownFrameAssetContract.js";

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

function pngFixture({
  width = 1200,
  height = 1200,
  colorType = 6,
  transparencyChunk = false,
  includeEnd = true,
} = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
  ];
  if (transparencyChunk) chunks.push(chunk("tRNS", Buffer.from([0])));
  chunks.push(chunk("IDAT", Buffer.from([0])));
  if (includeEnd) chunks.push(chunk("IEND"));
  return Buffer.concat(chunks);
}

test("infers additive frame types while preserving legacy SVG refs", () => {
  assert.equal(
    resolveCountdownFrameAssetType({ type: "png", storagePath: "frame.bin" }),
    "png"
  );
  assert.equal(
    resolveCountdownFrameAssetType({
      storagePath: "assets/countdown/frames/preset/frame.svg",
    }),
    "svg"
  );
  assert.equal(
    resolveCountdownFrameAssetType({
      mimeType: "image/png",
      storagePath: "opaque",
    }),
    "png"
  );
  assert.equal(normalizeCountdownFrameColorMode("png", "currentColor"), "fixed");
  assert.equal(
    normalizeCountdownFrameColorMode("svg", "currentColor"),
    "currentColor"
  );
});

test("accepts an alpha-capable 1200px PNG and leaves decoded transparency unresolved", () => {
  const report = inspectCountdownPngBytes(pngFixture());
  assert.equal(report.valid, true);
  assert.equal(report.checks.width, 1200);
  assert.equal(report.checks.height, 1200);
  assert.equal(report.checks.hasAlpha, true);
  assert.equal(report.checks.hasTransparency, null);
  assert.deepEqual(report.criticalErrors, []);
});

test("keeps transparency as a recommendation and rejects unsafe geometry", () => {
  const opaque = inspectCountdownPngBytes(
    pngFixture({ colorType: 2 })
  );
  assert.equal(opaque.valid, true);
  assert.match(opaque.warnings.join(" "), /transparencia/i);

  const small = inspectCountdownPngBytes(
    pngFixture({ width: 599, height: 599 })
  );
  assert.equal(small.valid, false);
  assert.match(small.criticalErrors.join(" "), /resolución demasiado baja/i);

  const extreme = inspectCountdownPngBytes(
    pngFixture({ width: 2400, height: 600 })
  );
  assert.equal(extreme.valid, false);
  assert.match(extreme.criticalErrors.join(" "), /proporción/i);
});

test("rejects renamed, corrupt, oversized, and excessive-dimension PNG data", () => {
  const renamed = inspectCountdownPngBytes(Buffer.from("<svg />"));
  assert.equal(renamed.valid, false);
  assert.match(renamed.criticalErrors[0], /PNG válido/i);

  const corrupt = inspectCountdownPngBytes(
    pngFixture({ includeEnd: false })
  );
  assert.equal(corrupt.valid, false);
  assert.match(corrupt.criticalErrors.join(" "), /leer/i);

  const oversized = inspectCountdownPngBytes(
    Buffer.concat([
      pngFixture(),
      Buffer.alloc(COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxBytes),
    ])
  );
  assert.equal(oversized.valid, false);
  assert.match(oversized.criticalErrors.join(" "), /tamaño máximo/i);

  const excessive = inspectCountdownPngBytes(
    pngFixture({ width: 6001, height: 4000 })
  );
  assert.equal(excessive.valid, false);
  assert.match(excessive.criticalErrors.join(" "), /dimensiones/i);
});
