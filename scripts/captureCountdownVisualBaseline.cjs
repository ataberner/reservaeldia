#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const DEFAULT_PORT = 3017;
const COMMITTED_BASELINE_DIRECTORY = path.resolve(
  __dirname,
  "../artifacts/countdown-phase0/baseline"
);
const MAX_TOLERATED_CHANNEL_DELTA = 2;
const MAX_TOLERATED_CHANGED_CHANNEL_RATIO = 0.0001;
let baselineFixtures = null;

async function loadBaselineFixtures() {
  if (baselineFixtures) return baselineFixtures;
  baselineFixtures = await import(
    pathToFileURL(
      path.resolve(
        __dirname,
        "../shared/countdownVisualBaselineFixtures.mjs"
      )
    ).href
  );
  return baselineFixtures;
}

function parseArgs(argv) {
  const options = {
    update: false,
    check: false,
    baseUrl: "",
    port: DEFAULT_PORT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--update") options.update = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--base-url" && next) {
      options.baseUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--port" && next) {
      options.port = Number(next);
      index += 1;
    } else {
      throw new Error(`Argumento desconocido o incompleto: ${arg}`);
    }
  }

  if (options.update && options.check) {
    throw new Error("Usa --update o --check, no ambos.");
  }
  if (!options.update && !options.check) options.check = true;
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error("--port debe ser un entero positivo.");
  }
  return options;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readPngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    bytes.toString("ascii", 1, 4) !== "PNG"
  ) {
    throw new Error("Screenshot PNG invalido.");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function requestOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(
        Number(response.statusCode || 0) >= 200 &&
          Number(response.statusCode || 0) < 500
      );
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestOk(baseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`El servidor no respondio en ${baseUrl}.`);
}

function startDevServer(port) {
  const nextBin = path.resolve(
    __dirname,
    "../node_modules/next/dist/bin/next"
  );
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(port)],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        NEXT_DEV_DIST_DIR: `.next-dev-countdown-baseline-${port}`,
        NEXT_PUBLIC_FIREBASE_MODE: "prod",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  let serverOutput = "";
  const collect = (chunk) => {
    serverOutput = `${serverOutput}${String(chunk || "")}`.slice(-12000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  return {
    child,
    getOutput: () => serverOutput,
  };
}

async function stopDevServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 4000);
    server.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function comparePngBuffersInPage(page, expectedBytes, actualBytes) {
  return page.evaluate(
    async ({ expectedSource, actualSource }) => {
      const loadImage = (source) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("png-decode-failed"));
          image.src = source;
        });
      const [expectedImage, actualImage] = await Promise.all([
        loadImage(expectedSource),
        loadImage(actualSource),
      ]);
      if (
        expectedImage.naturalWidth !== actualImage.naturalWidth ||
        expectedImage.naturalHeight !== actualImage.naturalHeight
      ) {
        return {
          dimensionsMatch: false,
          changedChannelCount: null,
          changedChannelRatio: null,
          maxChannelDelta: null,
        };
      }

      const canvas = document.createElement("canvas");
      canvas.width = expectedImage.naturalWidth;
      canvas.height = expectedImage.naturalHeight;
      const context = canvas.getContext("2d", {
        alpha: true,
        willReadFrequently: true,
      });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(expectedImage, 0, 0);
      const expectedPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(actualImage, 0, 0);
      const actualPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;

      let changedChannelCount = 0;
      let maxChannelDelta = 0;
      for (let index = 0; index < expectedPixels.length; index += 1) {
        const delta = Math.abs(expectedPixels[index] - actualPixels[index]);
        if (delta === 0) continue;
        changedChannelCount += 1;
        if (delta > maxChannelDelta) maxChannelDelta = delta;
      }

      return {
        dimensionsMatch: true,
        changedChannelCount,
        changedChannelRatio:
          expectedPixels.length > 0
            ? changedChannelCount / expectedPixels.length
            : 0,
        maxChannelDelta,
      };
    },
    {
      expectedSource: `data:image/png;base64,${expectedBytes.toString("base64")}`,
      actualSource: `data:image/png;base64,${actualBytes.toString("base64")}`,
    }
  );
}

function isToleratedRasterDrift(comparison) {
  return Boolean(
    comparison?.dimensionsMatch &&
      comparison.maxChannelDelta <= MAX_TOLERATED_CHANNEL_DELTA &&
      comparison.changedChannelRatio <=
        MAX_TOLERATED_CHANGED_CHANNEL_RATIO
  );
}

async function captureAll({
  baseUrl,
  outputDirectory,
  comparisonDirectory = null,
}) {
  const {
    COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO,
    COUNTDOWN_VISUAL_BASELINE_SURFACES,
    buildCountdownVisualBaselineFixtureManifest,
    countdownVisualBaselineStates,
  } = await loadBaselineFixtures();
  ensureDirectory(outputDirectory);
  const browser = await puppeteer.launch({
    headless: "new",
    timeout: 90000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ],
  });
  const captures = [];
  const frozenNowMs = Date.parse(
    COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO
  );
  const pixelComparisons = new Map();

  try {
    for (const state of countdownVisualBaselineStates) {
      console.log(`[countdown-baseline] preparando ${state.id}`);
      const page = await browser.newPage();
      page.setDefaultTimeout(90000);
      page.setDefaultNavigationTimeout(90000);
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          console.log(
            `[countdown-baseline][browser:${message.type()}] ${message.text()}`
          );
        }
      });
      page.on("pageerror", (error) => {
        console.log(
          `[countdown-baseline][pageerror] ${error?.stack || error?.message || error}`
        );
      });
      await page.evaluateOnNewDocument((timestamp) => {
        const NativeDate = Date;
        class FrozenDate extends NativeDate {
          constructor(...args) {
            super(...(args.length ? args : [timestamp]));
          }
          static now() {
            return timestamp;
          }
        }
        FrozenDate.parse = NativeDate.parse;
        FrozenDate.UTC = NativeDate.UTC;
        window.Date = FrozenDate;
        window.__COUNTDOWN_ANIMATIONS_ENABLED = false;
      }, frozenNowMs);
      await page.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" },
      ]);
      await page.setViewport({
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
      });
      const url =
        `${baseUrl}/admin/countdown-presets/` +
        `?countdownBaseline=1&state=${encodeURIComponent(state.id)}`;
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      try {
        await page.waitForSelector(
          '[data-countdown-baseline-ready="true"]',
          { timeout: 90000 }
        );
      } catch (error) {
        const diagnostics = await page.evaluate(() => ({
          title: document.title,
          bodyText: document.body?.innerText?.slice(0, 5000) || "",
          ready:
            document.querySelector("[data-countdown-baseline-ready]")
              ?.getAttribute("data-countdown-baseline-ready") || null,
          state:
            document.querySelector("[data-countdown-baseline-state]")
              ?.getAttribute("data-countdown-baseline-state") || null,
        }));
        throw new Error(
          `${error.message}\nDiagnostico: ${JSON.stringify(diagnostics, null, 2)}`
        );
      }
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        }
        const frames = Array.from(document.querySelectorAll("iframe"));
        await Promise.all(
          frames.map(
            (frame) =>
              new Promise((resolve) => {
                if (frame.contentDocument?.readyState === "complete") {
                  resolve();
                  return;
                }
                frame.addEventListener("load", resolve, { once: true });
                setTimeout(resolve, 3000);
            })
          )
        );
        await new Promise((resolve, reject) => {
          const startedAt = Date.now();
          const poll = () => {
            const frames = Array.from(document.querySelectorAll("iframe"));
            const loadersClosed =
              frames.length > 0 &&
              frames.every((frame) => {
                try {
                  const body = frame.contentDocument?.body;
                  return (
                    body?.getAttribute("data-loader-ready") === "1" &&
                    !frame.contentDocument?.getElementById("inv-loader")
                  );
                } catch (_error) {
                  return false;
                }
              });
            if (loadersClosed) {
              resolve();
              return;
            }
            if (Date.now() - startedAt >= 15000) {
              reject(
                new Error(
                  "Los loaders de preview/publicacion no finalizaron dentro del timeout."
                )
              );
              return;
            }
            setTimeout(poll, 50);
          };
          poll();
        });
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });

      const stateDirectory = path.join(outputDirectory, state.id);
      ensureDirectory(stateDirectory);
      for (const surface of COUNTDOWN_VISUAL_BASELINE_SURFACES) {
        console.log(
          `[countdown-baseline] capturando ${state.id}/${surface}`
        );
        const selector = `[data-countdown-baseline-surface="${surface}"]`;
        const element = await page.$(selector);
        if (!element) {
          throw new Error(`No se encontro ${selector} para ${state.id}.`);
        }
        const fileName = `${surface}.png`;
        const absolutePath = path.join(stateDirectory, fileName);
        await element.screenshot({
          path: absolutePath,
          type: "png",
        });
        const bytes = fs.readFileSync(absolutePath);
        const captureKey = `${state.id}/${surface}`;
        if (comparisonDirectory) {
          const expectedPath = path.join(
            comparisonDirectory,
            state.id,
            fileName
          );
          if (fs.existsSync(expectedPath)) {
            const expectedBytes = fs.readFileSync(expectedPath);
            if (sha256(expectedBytes) !== sha256(bytes)) {
              pixelComparisons.set(
                captureKey,
                await comparePngBuffersInPage(page, expectedBytes, bytes)
              );
            }
          }
        }
        captures.push({
          state: state.id,
          surface,
          file: `${state.id}/${fileName}`,
          sha256: sha256(bytes),
          ...readPngDimensions(bytes),
        });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    ...buildCountdownVisualBaselineFixtureManifest(),
    captureVersion: 1,
    viewport: {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
    },
    captures,
  };
  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return { manifest, pixelComparisons };
}

function compareBaseline(
  expectedDirectory,
  actualDirectory,
  pixelComparisons = new Map()
) {
  const expectedManifestPath = path.join(expectedDirectory, "manifest.json");
  const actualManifestPath = path.join(actualDirectory, "manifest.json");
  if (!fs.existsSync(expectedManifestPath)) {
    return {
      valid: false,
      errors: ["committed-manifest-missing"],
    };
  }

  const expected = JSON.parse(
    fs.readFileSync(expectedManifestPath, "utf8")
  );
  const actual = JSON.parse(fs.readFileSync(actualManifestPath, "utf8"));
  const expectedByKey = new Map(
    (expected.captures || []).map((capture) => [
      `${capture.state}/${capture.surface}`,
      capture,
    ])
  );
  const actualByKey = new Map(
    (actual.captures || []).map((capture) => [
      `${capture.state}/${capture.surface}`,
      capture,
    ])
  );
  const errors = [];
  const toleratedRasterDrift = [];

  for (const [key, expectedCapture] of expectedByKey) {
    const actualCapture = actualByKey.get(key);
    if (!actualCapture) {
      errors.push(`capture-missing:${key}`);
      continue;
    }
    if (expectedCapture.sha256 !== actualCapture.sha256) {
      const rasterComparison = pixelComparisons.get(key);
      if (isToleratedRasterDrift(rasterComparison)) {
        toleratedRasterDrift.push({
          key,
          ...rasterComparison,
        });
      } else {
        errors.push(`capture-sha256-mismatch:${key}`);
      }
    }
    if (
      expectedCapture.width !== actualCapture.width ||
      expectedCapture.height !== actualCapture.height
    ) {
      errors.push(`capture-dimensions-mismatch:${key}`);
    }
  }
  for (const key of actualByKey.keys()) {
    if (!expectedByKey.has(key)) errors.push(`unexpected-capture:${key}`);
  }

  return {
    valid: errors.length === 0,
    expectedCount: expectedByKey.size,
    actualCount: actualByKey.size,
    toleratedRasterDrift,
    errors,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl =
    options.baseUrl || `http://127.0.0.1:${options.port}`;
  let server = null;
  let temporaryDirectory = null;

  try {
    if (!options.baseUrl) {
      server = startDevServer(options.port);
      try {
        await waitForServer(baseUrl);
      } catch (error) {
        throw new Error(
          `${error.message}\n${server.getOutput()}`
        );
      }
    } else {
      await waitForServer(baseUrl, 15000);
    }

    // Capture outside the watched workspace in both modes. Writing screenshots
    // into the committed directory while Next dev is running can trigger a
    // rebuild halfway through the matrix and make later captures nondeterministic.
    const outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "reservaeldia-countdown-baseline-")
    );
    temporaryDirectory = outputDirectory;

    const { manifest, pixelComparisons } = await captureAll({
      baseUrl,
      outputDirectory,
      comparisonDirectory: options.check
        ? COMMITTED_BASELINE_DIRECTORY
        : null,
    });

    if (options.update) {
      fs.mkdirSync(COMMITTED_BASELINE_DIRECTORY, { recursive: true });
      fs.cpSync(outputDirectory, COMMITTED_BASELINE_DIRECTORY, {
        recursive: true,
        force: true,
      });
      console.log(
        `Baseline actualizado: ${manifest.captures.length} capturas en ${COMMITTED_BASELINE_DIRECTORY}`
      );
      return;
    }

    const comparison = compareBaseline(
      COMMITTED_BASELINE_DIRECTORY,
      outputDirectory,
      pixelComparisons
    );
    console.log(JSON.stringify(comparison, null, 2));
    if (!comparison.valid) process.exitCode = 1;
  } finally {
    await stopDevServer(server);
    if (temporaryDirectory && process.exitCode) {
      console.log(
        `[countdown-baseline] captura fallida conservada en ${temporaryDirectory}`
      );
    } else if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
