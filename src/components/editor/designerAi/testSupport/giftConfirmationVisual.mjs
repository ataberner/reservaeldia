// Offline visual fixture. Requires a completed Next export and the dedicated
// Chromium installed by local:prepare; never starts Next/Firebase or a provider.
// RESERVA_TEST_CHROME=<absolute dedicated chrome.exe>
// node src/components/editor/designerAi/testSupport/giftConfirmationVisual.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDesignerAiGiftProposal } from "../../../../domain/editor/designerAiGiftApproval.js";
import { buildDesignerAiCapabilitySnapshot } from "../../../../domain/editor/designerAiCapabilities.js";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("../../../../../functions/node_modules/typescript");
const puppeteer = require("puppeteer");
const fixtureOnly = process.argv.includes("--fixture-only");
assert.ok(fixtureOnly || process.env.RESERVA_TEST_CHROME, "Set RESERVA_TEST_CHROME to the isolated Chromium executable.");
const cssRoot = path.join(root, "out", "_next", "static", "css");
const css = readdirSync(cssRoot).filter(name => name.endsWith(".css")).map(name => readFileSync(path.join(cssRoot, name), "utf8")).join("\n");
assert.ok(css.includes("overflow-wrap:anywhere"), "Rebuild Next so the confirmation styles are included.");
const source = readFileSync(new URL("../DesignerAiGiftConfirmation.jsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } });
const componentModule = { exports: {} };
new Function("require", "module", "exports", outputText)(id => {
  assert.equal(id, "react"); return React;
}, componentModule, componentModule.exports);
const Component = componentModule.exports.default;
const rawGifts = { enabled: true, bank: { alias: "DESTINO.ANTERIOR", cbu: "1234567890123456789012" },
  visibility: { alias: true, cbu: true, giftListLink: true }, giftListUrl: "https://regalos.example.test/lista-anterior" };
const snapshot = buildDesignerAiCapabilitySnapshot({ renderSnapshot: { gifts: rawGifts },
  documentNameState: { documentId: "synthetic", documentKind: "draft", name: "Casamiento Ana y Luz", editable: true, hydrated: true } });
const actions = [
  { type: "story.set_text", arguments: { text: "Historia sintética" } },
  { type: "gifts.set_method", arguments: { method: "alias", value: "DESTINO.NUEVO.CONFIRMADO", visible: true } },
  { type: "gifts.set_method", arguments: { method: "giftListLink", value: `https://regalos.example.test/listas/${"una-ruta-larga-".repeat(8)}?referencia=invitacion-sintetica`, visible: true } },
];
const proposal = createDesignerAiGiftProposal({ actions, snapshot, rawGifts });
const card = renderToStaticMarkup(React.createElement(Component, { proposal, onConfirm() {}, onCancel() {} }));
const output = path.join(root, ".local-isolation", "assistant-security", "gift-confirmation-visual");
mkdirSync(output, { recursive: true });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'; img-src 'none'; connect-src 'none'"><style>${css}</style><style>html,body{margin:0;height:100%;font-family:Arial,sans-serif;background:#eee}#fixture{height:100vh;max-width:390px;margin:auto;display:flex;flex-direction:column;overflow:hidden;background:white}#fixture p{margin-top:0}header,footer{flex-shrink:0;padding:12px;border:1px solid #eee}footer textarea{width:100%;height:68px;border:1px solid #ccc;border-radius:12px;padding:8px;resize:none}h3{margin-bottom:8px}</style></head><body><main id="fixture"><header>✦ Tu asistente</header>${card}<footer><label for="message" class="sr-only">Mensaje</label><textarea id="message" placeholder="Contame que tenes en mente..."></textarea></footer></main></body></html>`;
writeFileSync(path.join(output, "fixture.html"), html);
if (fixtureOnly) { console.log(JSON.stringify({ fixture: path.join(output, "fixture.html") })); process.exit(0); }
const browser = await puppeteer.launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true,
  userDataDir: path.join(output, "browser-profile"), args: ["--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND"] });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", request => request.abort());
  const results = [];
  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const measurements = await page.evaluate(() => {
      const region = document.querySelector('[role="region"]');
      return { viewport: window.innerWidth, documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
        regionOverflow: region.scrollWidth > region.clientWidth + 1,
        buttonHeights: [...region.querySelectorAll("button")].map(button => button.getBoundingClientRect().height) };
    });
    assert.equal(measurements.documentOverflow, false);
    assert.equal(measurements.regionOverflow, false);
    assert.ok(measurements.buttonHeights.every(height => height >= 44));
    await page.screenshot({ path: path.join(output, `${viewport.width}-top.png`) });
    await page.evaluate(() => document.querySelector('[role="region"]').scrollTo(0, 100000));
    await page.screenshot({ path: path.join(output, `${viewport.width}-buttons.png`) });
    results.push(measurements);
  }
  writeFileSync(path.join(output, "measurements.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }));
} finally { await browser.close(); }
