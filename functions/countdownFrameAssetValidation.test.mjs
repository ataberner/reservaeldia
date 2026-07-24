import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const {
  inspectCountdownPngBuffer,
} = require("./lib/countdownPresets/frameAssetValidation.js");
const {
  COUNTDOWN_FRAME_ASSET_LIMITS,
} = require("./lib/shared/countdownFrameAssetContract.cjs");
const serviceSource = readFileSync(
  new URL("./src/countdownPresets/service.ts", import.meta.url),
  "utf8"
);

async function createPng({
  width = 1200,
  height = 1200,
  transparent = true,
  alpha = transparent ? 0 : 1,
  channels = transparent ? 4 : 3,
} = {}) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4
        ? { r: 255, g: 255, b: 255, alpha }
        : { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
}

test("backend decodes a transparent PNG and records canonical metadata", async () => {
  const buffer = await createPng();
  const report = await inspectCountdownPngBuffer(
    buffer,
    "flores.png",
    "image/png"
  );
  assert.equal(report.valid, true);
  assert.equal(report.checks.width, 1200);
  assert.equal(report.checks.height, 1200);
  assert.equal(report.checks.hasAlpha, true);
  assert.equal(report.checks.hasTransparency, true);
  assert.equal(report.checks.mimeType, "image/png");
});

test("backend accepts opaque PNG with a non-blocking transparency warning", async () => {
  const report = await inspectCountdownPngBuffer(
    await createPng({ transparent: false }),
    "textura.png",
    "image/png"
  );
  assert.equal(report.valid, true);
  assert.equal(report.checks.hasAlpha, false);
  assert.equal(report.checks.hasTransparency, false);
  assert.match(report.warnings.join(" "), /transparencia/i);
});

test("backend does not confuse a fully opaque alpha channel with transparency", async () => {
  const report = await inspectCountdownPngBuffer(
    await createPng({ channels: 4, alpha: 1 }),
    "fondo-blanco.png",
    "image/png"
  );
  assert.equal(report.valid, true);
  assert.equal(report.checks.hasAlpha, true);
  assert.equal(report.checks.hasTransparency, false);
  assert.match(report.warnings.join(" "), /transparencia visible/i);
});

test("staging and publication preserve the original PNG bytes and MIME", () => {
  assert.match(serviceSource, /let uploadBuffer = frameBuffer/);
  assert.match(
    serviceSource,
    /uploadWithToken\(\s*draftSvgPath,\s*uploadBuffer,\s*expectedMimeType/
  );
  assert.match(serviceSource, /await source\.copy\(target\)/);
  assert.doesNotMatch(
    serviceSource,
    /frameBuffer[\s\S]{0,400}\.(?:flatten|jpeg|webp)\(/
  );
});

test("backend rejects spoofed MIME, corrupt bytes, excessive weight, and unsafe dimensions", async () => {
  const valid = await createPng();
  await assert.rejects(
    inspectCountdownPngBuffer(valid, "flores.png", "image/svg+xml"),
    /SVG o PNG válido/i
  );
  await assert.rejects(
    inspectCountdownPngBuffer(Buffer.from("<svg />"), "flores.png", "image/png"),
    /PNG válido|leer/i
  );
  await assert.rejects(
    inspectCountdownPngBuffer(
      Buffer.alloc(COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxBytes + 1),
      "flores.png",
      "image/png"
    ),
    /tamaño máximo/i
  );
  await assert.rejects(
    inspectCountdownPngBuffer(
      await createPng({ width: 599, height: 599 }),
      "flores.png",
      "image/png"
    ),
    /resolución demasiado baja/i
  );
  await assert.rejects(
    inspectCountdownPngBuffer(
      await createPng({ width: 6001, height: 600 }),
      "flores.png",
      "image/png"
    ),
    /dimensiones|proporción/i
  );
});
