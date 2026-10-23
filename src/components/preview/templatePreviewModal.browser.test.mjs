import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import puppeteer from "puppeteer";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const stageSelector = "[data-template-preview-stage]";
const viewportSelector = "[data-template-preview-viewport]";
const actionsSelector = "[data-template-preview-actions]";

const invitationHtml = `<!doctype html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { background: #143e4b; color: white; font-family: sans-serif; }
    .sec { height: 900px; padding: 32px; background: #143e4b; }
    .sec:nth-child(2) { background: #345d68; }
    #invitation-end { height: 120px; padding: 24px; background: #a84856; }
  </style></head><body data-loader-ready="1"><main class="inv">
    <section class="sec" data-modo="pantalla">Inicio de la invitación</section>
    <section class="sec">Contenido de la invitación</section>
    <footer id="invitation-end">Fin de la invitación</footer>
  </main></body></html>`;

async function buildHarness(directory) {
  const webpackRuntime = require("next/dist/compiled/webpack/webpack");
  webpackRuntime.init();
  const entry = path.join(directory, "entry.jsx");
  const jsxLoader = path.join(directory, "jsx-loader.cjs");
  const previewSessionStub = path.join(directory, "preview-session.js");
  const auditStub = path.join(directory, "countdown-audit.js");
  const mediaStub = path.join(directory, "media-library.js");

  // Only service boundaries are replaced. The modal, form, readiness, scaling,
  // source-document construction and runtime-state resolver are the real code.
  await fs.writeFile(jsxLoader, `
    const swc = require(${JSON.stringify(require.resolve("next/dist/build/swc"))});
    module.exports = function(source) {
      const callback = this.async();
      swc.transform(source, {
        filename: this.resourcePath,
        jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020',
          transform: { react: { runtime: 'automatic' } } },
        module: { type: 'es6' }
      }).then(result => callback(null, result.code), callback);
    };
  `);
  await fs.writeFile(previewSessionStub, `
    export const PREVIEW_AUTHORITY = { TEMPLATE_VISUAL: 'template-visual' };
    export function generateDashboardPreviewHtmlFromRenderState() {
      throw new Error('HTML generation is outside the offline modal fixture');
    }
  `);
  await fs.writeFile(auditStub, "export function captureCountdownAuditFromHtmlString() {}\n");
  await fs.writeFile(mediaStub, `
    export default function useTemplateMediaLibrary() {
      return { images: [], loading: false, hasMore: false, uploading: false };
    }
  `);
  await fs.writeFile(entry, `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import TemplatePreviewModal from ${JSON.stringify(path.join(projectRoot, "src/components/TemplatePreviewModal.jsx"))};
    const template = {
      id: 'offline-responsive-preview', nombre: 'Invitación de prueba',
      objetos: [], secciones: [],
      fieldsSchema: Array.from({ length: 6 }, (_, index) => ({
        key: 'field_' + index, label: 'Dato del evento ' + (index + 1),
        type: 'text', group: 'Datos del evento', applyTargets: []
      }))
    };
    const previewHtml = ${JSON.stringify(invitationHtml)};
    window.previewActions = [];
    function Harness() {
      const [mode, setMode] = useState(null);
      const [formState, setFormState] = useState(null);
      return <div data-dashboard-scroll-root="true" style={{ height: '100vh', overflow: 'auto' }}>
        <button id="open-landing" onClick={() => setMode('landing')}>Vista previa en landing</button>
        <button id="open-editor" onClick={() => setMode('editor')}>Vista previa en dashboard</button>
        <button id="open-customize" onClick={() => setMode('customize')}>Vista previa con personalización</button>
        <div style={{ height: '180vh' }}>Contenido detrás del modal</div>
        <TemplatePreviewModal visible={Boolean(mode)} template={template}
          previewHtml={previewHtml} previewStatus={{ status: 'ready' }} actionMode={mode === 'landing' ? 'landing' : 'editor'}
          showEventCustomization={mode === 'customize'}
          onClose={() => setMode(null)} formState={formState} onFormStateChange={setFormState}
          onUseTemplate={() => window.previewActions.push('landing')}
          onOpenEditorWithoutChanges={() => window.previewActions.push(mode)}
        />
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  `);

  await new Promise((resolve, reject) => {
    webpackRuntime.webpack({
      mode: "development",
      devtool: false,
      entry,
      output: { path: directory, filename: "bundle.js" },
      resolve: {
        extensions: [".js", ".jsx", ".cjs"],
        alias: {
          "@/domain/countdownAudit/runtime$": auditStub,
          "@/hooks/useTemplateMediaLibrary$": mediaStub,
          [path.join(projectRoot, "src/domain/dashboard/previewSession.js")]: previewSessionStub,
          "@": path.join(projectRoot, "src"),
        },
        modules: [path.join(projectRoot, "node_modules"), "node_modules"],
      },
      module: { rules: [{ test: /\.jsx$/, use: jsxLoader }] },
    }, (error, stats) => {
      if (error || stats.hasErrors()) {
        reject(error || new Error(stats.toString({ all: false, errors: true })));
      } else {
        resolve();
      }
    });
  });

  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const loadConfig = require("tailwindcss/loadConfig");
  const tailwindConfig = loadConfig(path.join(projectRoot, "tailwind.config.js"));
  tailwindConfig.content = [
    path.join(projectRoot, "src/components/TemplatePreviewModal.jsx"),
    path.join(projectRoot, "src/components/templates/TemplateEventForm.jsx"),
    path.join(projectRoot, "src/components/templates/TemplateMediaFieldInput.jsx"),
    path.join(projectRoot, "src/components/preview/PreviewLoadingPresentation.jsx"),
  ];
  const styles = await Promise.all(["globals.css", "styles.css"].map(
    (name) => fs.readFile(path.join(projectRoot, "styles", name), "utf8")
  ));
  // The application CDN fonts/Bootstrap are deliberately not fetched by this
  // offline regression; app-owned styles and all responsive utilities are real.
  const css = await postcss([tailwind(tailwindConfig)]).process(
    styles.join("\n").replace(/@import\s+url\([^)]*\)\s*;/g, ""),
    { from: path.join(projectRoot, "styles/globals.css") }
  );
  await fs.writeFile(path.join(directory, "styles.css"), css.css);
  const bootstrapPath = process.env.TEMPLATE_PREVIEW_BOOTSTRAP_CSS;
  if (bootstrapPath) {
    await fs.copyFile(path.resolve(bootstrapPath), path.join(directory, "bootstrap.css"));
  }
  await fs.writeFile(path.join(directory, "index.html"), `<!doctype html>
    <html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${bootstrapPath ? '<link rel="stylesheet" href="/bootstrap.css">' : ''}
    <link rel="stylesheet" href="/styles.css"></head>
    <body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
}

async function settlePreview(page) {
  await page.waitForFunction(() => {
    const frame = document.querySelector('[role="dialog"] iframe');
    return frame && !frame.hasAttribute("aria-hidden") &&
      frame.contentDocument?.getElementById("invitation-end");
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function verifyPreviewGeometry(page, label, { allowActionScroll = false } = {}) {
  await settlePreview(page);
  const geometry = await page.evaluate(({ stageSelector, viewportSelector, actionsSelector }) => {
    const box = (selectorOrNode) => {
      const node = typeof selectorOrNode === "string" ? document.querySelector(selectorOrNode) : selectorOrNode;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    return {
      dialog: box('[role="dialog"]'), stage: box(stageSelector),
      viewport: box(viewportSelector), actions: box(actionsSelector),
      primaryAction: box([...document.querySelectorAll(`${actionsSelector} button`)].find(
        (button) => ["Usar plantilla", "Crear invitacion"].includes(button.textContent.trim())
      )),
      frame: box('[role="dialog"] iframe'),
      width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      scrollLocked: document.body.style.overflow === "hidden" &&
        document.querySelector('[data-dashboard-scroll-root="true"]').style.overflow === "hidden",
    };
  }, { stageSelector, viewportSelector, actionsSelector });
  const message = `${label}: ${JSON.stringify(geometry)}`;
  assert.ok(geometry.stage.height > 0, `preview has usable height, ${message}`);
  assert.ok(Math.abs(geometry.viewport.height - geometry.stage.height) <= 1, `no bottom strip or clipped viewport, ${message}`);
  assert.ok(Math.abs(geometry.frame.height - geometry.stage.height) <= 1, `iframe fills the visible viewport, ${message}`);
  assert.ok(geometry.viewport.width <= geometry.stage.width + 1, `preview fits horizontally, ${message}`);
  assert.ok(geometry.viewport.left >= geometry.stage.left - 1 && geometry.viewport.right <= geometry.stage.right + 1, message);
  assert.ok(geometry.dialog.top >= -1 && geometry.dialog.bottom <= geometry.height + 1, `modal fits vertically, ${message}`);
  assert.ok(geometry.actions.bottom <= geometry.dialog.bottom + 1 && geometry.actions.top >= geometry.viewport.bottom - 1, `actions do not cover invitation content, ${message}`);
  if (!allowActionScroll) {
    assert.ok(geometry.primaryAction.top >= geometry.actions.top - 1 && geometry.primaryAction.bottom <= geometry.actions.bottom + 1, `primary action is fully visible without scrolling the footer, ${message}`);
  }
  assert.ok(geometry.documentWidth <= geometry.width, `no horizontal page overflow, ${message}`);
  assert.equal(geometry.scrollLocked, true, `background scroll stays locked, ${message}`);

  const scroll = await page.evaluate(() => {
    const frame = document.querySelector('[role="dialog"] iframe');
    const doc = frame.contentDocument;
    const root = doc.scrollingElement;
    root.scrollTop = root.scrollHeight;
    const end = doc.getElementById("invitation-end").getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      canonicalSectionHeight: Number(doc.documentElement.getAttribute("data-preview-layout-viewport-height")),
      actualSectionHeight: doc.querySelector('.sec[data-modo="pantalla"]').getBoundingClientRect().height,
      endTop: end.top, endBottom: end.bottom, viewportHeight: root.clientHeight,
      visibleHeight: frameRect.height, scale: frameRect.width / frame.offsetWidth,
      remainingScroll: root.scrollHeight - root.clientHeight - root.scrollTop,
      blankAfterContent: root.scrollHeight - (end.bottom + root.scrollTop),
    };
  });
  assert.ok([820, 844].includes(scroll.canonicalSectionHeight), `canonical section height is preserved, ${label}: ${JSON.stringify(scroll)}`);
  assert.ok(Math.abs(scroll.actualSectionHeight - scroll.canonicalSectionHeight) <= 1, `screen-height section uses its canonical height across resize, ${label}: ${JSON.stringify(scroll)}`);
  // CSS zoom introduces fractional scroll offsets and integer clientHeight;
  // compare in visible pixels, as for the outer modal geometry above.
  assert.ok(Math.abs(scroll.remainingScroll) * scroll.scale <= 1, `can reach the last content, ${label}: ${JSON.stringify(scroll)}`);
  assert.ok(scroll.endTop * scroll.scale >= -1 && scroll.endBottom * scroll.scale <= scroll.visibleHeight + 1, `last content is fully visible, ${label}: ${JSON.stringify(scroll)}`);
  assert.ok(Math.abs(scroll.blankAfterContent) * scroll.scale <= 1, `no artificial blank tail, ${label}: ${JSON.stringify(scroll)}`);
  return geometry;
}

// Opt-in: TEMPLATE_PREVIEW_UI_BROWSER=1 node --test <this file>.
// Builds a disposable local harness and Chromium profile under .local-isolation,
// binds only 127.0.0.1, blocks external page requests, and retains screenshots.
// It never starts Next/Firebase, reads credentials, generates remote HTML, or deploys.
// Optional TEMPLATE_PREVIEW_BOOTSTRAP_CSS supplies a local copy of the app's CDN CSS.
test("template preview fills the available height on landing and dashboard across resize and orientation", {
  timeout: 120000,
  skip: process.env.TEMPLATE_PREVIEW_UI_BROWSER !== "1",
}, async () => {
  const isolationRoot = path.join(projectRoot, ".local-isolation");
  await fs.mkdir(isolationRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(isolationRoot, "template-preview-ui-"));
  await buildHarness(directory);
  const server = http.createServer(async (request, response) => {
    const files = { "/bundle.js": "bundle.js", "/styles.css": "styles.css", "/bootstrap.css": "bootstrap.css" };
    const name = files[request.url] || "index.html";
    response.setHeader("Content-Type", name.endsWith("js") ? "text/javascript" : name.endsWith("css") ? "text/css" : "text/html");
    response.end(await fs.readFile(path.join(directory, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: path.join(directory, "browser-profile"),
      args: ["--no-sandbox", "--disable-background-networking"],
    });
    const page = await browser.newPage();
    const errors = [];
    const blockedRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().startsWith(`${origin}/`) || request.url() === "about:srcdoc") {
        request.continue();
      } else {
        blockedRequests.push(request.url());
        request.abort();
      }
    });
    await page.goto(origin);
    const results = [];
    const dimensions = [[375, 667], [390, 844], [844, 390], [320, 568], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [1024, 320], [667, 240]];
    for (const mode of ["landing", "editor", "customize"]) {
      await page.setViewport({ width: dimensions[0][0], height: dimensions[0][1] });
      await page.click(`#open-${mode}`);
      await page.waitForSelector('[role="dialog"]');
      await settlePreview(page);
      await page.screenshot({ path: path.join(directory, `${mode}-opening-mobile.png`) });
      await page.$eval('[role="dialog"] iframe', (frame) => {
        frame.contentWindow.__heightResizeIdentity = "same-invitation-document";
      });
      await page.setViewport({ width: dimensions[0][0], height: 812 });
      await verifyPreviewGeometry(page, `${mode} height-only resize`, { allowActionScroll: mode === "customize" });
      assert.equal(await page.$eval('[role="dialog"] iframe', (frame) => frame.contentWindow.__heightResizeIdentity), "same-invitation-document", "height-only resize preserves the loaded invitation");
      for (const [width, height] of dimensions) {
        await page.setViewport({ width, height });
        results.push({ mode, width, height, ...(await verifyPreviewGeometry(page, `${mode} ${width}x${height}`, { allowActionScroll: mode === "customize" })) });
        await page.screenshot({ path: path.join(directory, `${mode}-${width}x${height}.png`) });
      }
      await page.evaluate((selector) => {
        [...document.querySelectorAll(`${selector} button`)].find((button) => button.textContent.trim() === "Usar plantilla").click();
      }, actionsSelector);
      assert.equal(await page.evaluate(() => window.previewActions.at(-1)), mode);

      if (mode === "customize") {
        await page.evaluate((selector) => {
          [...document.querySelectorAll(`${selector} button`)].find((button) => button.textContent.includes("Personalizar datos")).click();
        }, actionsSelector);
        for (const [width, height] of [[320, 568], [844, 390], [1366, 768]]) {
          await page.setViewport({ width, height });
          results.push({ mode: "editor-expanded", width, height, ...(await verifyPreviewGeometry(page, `editor expanded ${width}x${height}`, { allowActionScroll: true })) });
          await page.screenshot({ path: path.join(directory, `editor-expanded-${width}x${height}.png`) });
        }
        assert.ok(await page.$('#template-field-field_0'), "real customization form remains mounted");
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="dialog"]', { hidden: true });
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      assert.equal(await page.$eval('[data-dashboard-scroll-root="true"]', (node) => node.style.overflow), "auto");
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(blockedRequests, [], "fixture must never attempt external services or assets");
    await fs.writeFile(path.join(directory, "geometry.json"), JSON.stringify(results, null, 2));
    console.log(`Template preview screenshots and geometry: ${directory}`);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
