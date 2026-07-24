#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");
const sharp = require("../functions/node_modules/sharp");

const PORT = 3019;
const ROOT = path.resolve(__dirname, "..");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCROLL_TOLERANCE = 1;

function requestOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Number(response.statusCode || 0) < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestOk(BASE_URL)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`El servidor no respondió en ${BASE_URL}.`);
}

function startDevServer() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_DEV_DIST_DIR: `.next-dev-countdown-frame-upload-${PORT}`,
      NEXT_PUBLIC_FIREBASE_MODE: "prod",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  const collect = (chunk) => {
    output = `${output}${String(chunk || "")}`.slice(-16000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  return { child, output: () => output };
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

async function createFixtures(directory) {
  const pngPath = path.join(directory, "flores.png");
  const pngReplacementPath = path.join(directory, "flores-reemplazo.png");
  const svgPath = path.join(directory, "lineas.svg");
  const invalidPngPath = path.join(directory, "invalido.png");

  const floralSvg = Buffer.from(`
    <svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="600" cy="600" r="500" fill="none" stroke="#b45309" stroke-width="70"/>
      <circle cx="600" cy="120" r="90" fill="#fb7185"/>
      <circle cx="1080" cy="600" r="90" fill="#a78bfa"/>
      <circle cx="600" cy="1080" r="90" fill="#34d399"/>
      <circle cx="120" cy="600" r="90" fill="#60a5fa"/>
    </svg>
  `);
  await sharp(floralSvg)
    .png()
    .toFile(pngPath);
  await sharp(floralSvg)
    .rotate(20, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pngReplacementPath);
  fs.writeFileSync(
    svgPath,
    '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg"><circle cx="600" cy="600" r="520" fill="none" stroke="#773dbe" stroke-width="30"/></svg>',
    "utf8"
  );
  fs.writeFileSync(invalidPngPath, "esto no es un png", "utf8");

  return { invalidPngPath, pngPath, pngReplacementPath, svgPath };
}

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
}

async function prepareScroll(page) {
  await page.evaluate(() => {
    const root = document.querySelector(
      "[data-countdown-frame-upload-harness]"
    );
    const panel = document.querySelector(
      "[data-countdown-frame-internal-scroll]"
    );
    const button = document.querySelector(
      'button[aria-label="Subir frame"], button[aria-label="Reemplazar frame"]'
    );
    const section = panel?.parentElement;
    if (!root || !panel || !button || !section) {
      throw new Error("upload-harness-elements-missing");
    }
    root.scrollTop = Math.max(0, section.offsetTop - 48);
    const panelRect = panel.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    panel.scrollTop += buttonRect.top - panelRect.top - 96;
  });
  await settle(page);
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      "[data-countdown-frame-upload-harness]"
    );
    const panel = document.querySelector(
      "[data-countdown-frame-internal-scroll]"
    );
    const pageEnd = document.querySelector("[data-countdown-frame-page-end]");
    const panelEnd = document.querySelector(
      "[data-countdown-frame-internal-end]"
    );
    const preview = document.querySelector("[data-preview-viewport]");
    const previewShell = preview?.querySelector(
      "[data-countdown-preview-motion]"
    );
    const frame =
      preview?.querySelector('.cd-preview-svg[aria-hidden="true"]') ||
      preview?.querySelector('img[aria-hidden="true"]') ||
      preview?.querySelector('span[aria-hidden="true"]');
    const rootRect = root.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const pageEndRect = pageEnd.getBoundingClientRect();
    const panelEndRect = panelEnd.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect() || null;
    const previewShellRect = previewShell?.getBoundingClientRect() || null;
    const frameRect = frame?.getBoundingClientRect() || null;
    const panelPaddingBottom =
      Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0;

    return {
      activeLabel: document.activeElement?.getAttribute("aria-label") || "",
      windowY: window.scrollY,
      rootTop: root.scrollTop,
      panelTop: panel.scrollTop,
      rootHeight: root.scrollHeight,
      rootClientHeight: root.clientHeight,
      rootWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      panelWidth: panel.scrollWidth,
      panelClientWidth: panel.clientWidth,
      pageResidual:
        root.scrollHeight -
        (pageEndRect.bottom - rootRect.top + root.scrollTop),
      panelResidual:
        panel.scrollHeight -
        (panelEndRect.bottom - panelRect.top + panel.scrollTop),
      panelPaddingBottom,
      documentHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
      bodyHeight: document.body.scrollHeight,
      previewOverflow:
        preview ? getComputedStyle(preview).overflow : "",
      previewWidth: preview?.scrollWidth || 0,
      previewClientWidth: preview?.clientWidth || 0,
      previewHeight: preview?.scrollHeight || 0,
      previewClientHeight: preview?.clientHeight || 0,
      frameTransform: frame?.style?.transform || "",
      frameInsidePreview:
        !frameRect ||
        !previewShellRect ||
        (
          frameRect.left >= previewShellRect.left - 1 &&
          frameRect.right <= previewShellRect.right + 1 &&
          frameRect.top >= previewShellRect.top - 1 &&
          frameRect.bottom <= previewShellRect.bottom + 1
        ),
      previewRectWidth: previewRect?.width || 0,
    };
  });
}

function assertStableScroll(before, after, label) {
  assert.ok(
    Math.abs(after.rootTop - before.rootTop) <= SCROLL_TOLERANCE,
    `${label}: scroll general cambió ${before.rootTop} -> ${after.rootTop}`
  );
  assert.ok(
    Math.abs(after.panelTop - before.panelTop) <= SCROLL_TOLERANCE,
    `${label}: scroll interno cambió ${before.panelTop} -> ${after.panelTop}`
  );
  assert.ok(
    Math.abs(after.windowY - before.windowY) <= SCROLL_TOLERANCE,
    `${label}: window.scrollY cambió ${before.windowY} -> ${after.windowY}`
  );
}

function assertNoResidualSpace(metrics, viewport) {
  assert.ok(
    Math.abs(metrics.pageResidual) <= 1,
    `${viewport}: espacio residual de página ${metrics.pageResidual}px`
  );
  assert.ok(
    metrics.panelResidual <= metrics.panelPaddingBottom + 2,
    `${viewport}: espacio residual interno ${metrics.panelResidual}px`
  );
  assert.ok(
    metrics.rootWidth <= metrics.rootClientWidth + 1,
    `${viewport}: overflow horizontal del root`
  );
  assert.ok(
    metrics.panelWidth <= metrics.panelClientWidth + 1,
    `${viewport}: overflow horizontal del panel`
  );
  assert.equal(metrics.previewOverflow, "hidden");
  assert.ok(
    metrics.previewWidth <= metrics.previewClientWidth + 1,
    `${viewport}: overflow horizontal en preview`
  );
  assert.ok(metrics.frameInsidePreview, `${viewport}: frame recortado`);
}

function assertStableOuterHeight(before, after, label) {
  assert.ok(
    Math.abs(after.rootHeight - before.rootHeight) <= 1,
    `${label}: el contenido raíz cambió ${before.rootHeight}px -> ${after.rootHeight}px`
  );
}

async function chooseFile(page, filePath, { keyboard = false } = {}) {
  const selector =
    'button[aria-label="Subir frame"], button[aria-label="Reemplazar frame"]';
  const before = await readMetrics(page);
  const chooserPromise = page.waitForFileChooser();
  if (keyboard) {
    await page.focus(selector);
    await page.keyboard.press("Enter");
  } else {
    await page.click(selector);
  }
  const chooser = await chooserPromise;
  const opened = await readMetrics(page);
  assertStableScroll(before, opened, `apertura de ${path.basename(filePath)}`);
  await chooser.accept([filePath]);
  return { before, opened };
}

async function runViewport(browser, fixtures, viewport) {
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(
    `${BASE_URL}/admin/countdown-presets/?countdownFrameUploadHarness=1`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector('[data-countdown-frame-upload-ready="true"]');
  await prepareScroll(page);

  const initial = await readMetrics(page);
  assertNoResidualSpace(initial, `${viewport.width}px inicial`);

  const pngUpload = await chooseFile(page, fixtures.pngPath);
  await page.waitForFunction(() =>
    document.body.innerText.includes("flores.png")
  );
  await settle(page);
  const png = await readMetrics(page);
  assertStableScroll(pngUpload.before, png, "selección PNG");
  assert.equal(png.activeLabel, "Reemplazar frame");
  assert.equal(png.frameTransform, "scale(5)");
  assertNoResidualSpace(png, `${viewport.width}px PNG 500%`);
  assertStableOuterHeight(initial, png, "carga PNG");

  const invalidUpload = await chooseFile(page, fixtures.invalidPngPath);
  await page.waitForSelector('[role="alert"]');
  await settle(page);
  const invalid = await readMetrics(page);
  assertStableScroll(invalidUpload.before, invalid, "PNG inválido");
  assert.equal(invalid.activeLabel, "Reemplazar frame");
  assertNoResidualSpace(invalid, `${viewport.width}px PNG inválido`);
  assertStableOuterHeight(initial, invalid, "PNG inválido");
  assert.ok(
    await page.evaluate(() => document.body.innerText.includes("flores.png")),
    "el archivo válido previo debe conservarse"
  );

  const replacementUpload = await chooseFile(
    page,
    fixtures.pngReplacementPath
  );
  await page.waitForFunction(() =>
    document.body.innerText.includes("flores-reemplazo.png")
  );
  await settle(page);
  const replacement = await readMetrics(page);
  assertStableScroll(replacementUpload.before, replacement, "reemplazo PNG");
  assertNoResidualSpace(replacement, `${viewport.width}px reemplazo PNG`);
  assertStableOuterHeight(initial, replacement, "reemplazo PNG");

  const svgUpload = await chooseFile(page, fixtures.svgPath, {
    keyboard: true,
  });
  await page.waitForFunction(() =>
    document.body.innerText.includes("lineas.svg")
  );
  await settle(page);
  const svg = await readMetrics(page);
  assertStableScroll(svgUpload.before, svg, "reemplazo SVG por teclado");
  assert.equal(svg.activeLabel, "Reemplazar frame");
  assert.equal(svg.frameTransform, "scale(5)");
  assertNoResidualSpace(svg, `${viewport.width}px SVG 500%`);
  assertStableOuterHeight(initial, svg, "reemplazo SVG");

  const beforeRemove = await readMetrics(page);
  const buttons = await page.$$("button");
  let removeButton = null;
  for (const button of buttons) {
    const text = await button.evaluate((node) => node.textContent?.trim());
    if (text === "Quitar") {
      removeButton = button;
      break;
    }
  }
  assert.ok(removeButton, "remove-button-missing");
  await removeButton.click();
  await page.waitForSelector('button[aria-label="Subir frame"]');
  await settle(page);
  const removed = await readMetrics(page);
  assertStableScroll(beforeRemove, removed, "eliminación de frame");
  assertNoResidualSpace(removed, `${viewport.width}px sin frame`);
  assertStableOuterHeight(initial, removed, "eliminación de frame");

  await page.close();
}

async function main() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "reservaeldia-countdown-frame-upload-")
  );
  const fixtures = await createFixtures(temporaryDirectory);
  const server = startDevServer();
  let browser;

  try {
    try {
      await waitForServer();
    } catch (error) {
      throw new Error(`${error.message}\n${server.output()}`);
    }
    browser = await puppeteer.launch({
      headless: "new",
      timeout: 90000,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    await runViewport(browser, fixtures, {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    });
    await runViewport(browser, fixtures, {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
    });
    console.log(
      "OK: upload SVG/PNG mantiene scroll, foco y geometría sin franja residual en desktop y mobile."
    );
  } finally {
    if (browser) await browser.close();
    await stopDevServer(server);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
