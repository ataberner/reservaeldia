import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import puppeteer from "puppeteer";
import { runGiftLinkMetadataBrowserCases } from "./giftLinkMetadataBrowserCases.mjs";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const webpackRuntime = require("next/dist/compiled/webpack/webpack");
webpackRuntime.init();

async function buildHarness(directory) {
  const entry = path.join(directory, "entry.jsx");
  const jsxLoader = path.join(directory, "jsx-loader.cjs");
  const cssLoader = path.join(directory, "css-loader.cjs");
  await fs.writeFile(jsxLoader, `const sucrase = require(${JSON.stringify(require.resolve("sucrase"))}); module.exports = function(source) { return sucrase.transform(source, { transforms: ['jsx'], production: true }).code; };`);
  await fs.writeFile(cssLoader, `module.exports = function(source) { const names = [...source.matchAll(/\\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(match => match[1]); return 'const style = document.createElement("style"); style.textContent = ' + JSON.stringify(source) + '; document.head.appendChild(style); module.exports = ' + JSON.stringify(Object.fromEntries(names.map(name => [name,name]))) + ';'; };`);
  await fs.writeFile(entry, `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import GiftDataModal from ${JSON.stringify(path.join(projectRoot, "src/components/editor/gifts/GiftDataModal.jsx"))};
    import { createDefaultGiftConfig } from ${JSON.stringify(path.join(projectRoot, "src/domain/gifts/config.js"))};
    const original = createDefaultGiftConfig();
    original.bank.alias = 'cuenta.pesos.fixture';
    original.visibility.cbu = false;
    original.bankUsd.cbu = 'CUENTA.OCULTA.FIXTURE';
    original.visibilityUsd.cbu = false;
    window.saved = [];
    window.metadataRequests = [];
    const loadLinkMetadata = ${Boolean(process.env.GIFTS_UI_METADATA_ONLY)} ? (url) => new Promise((resolve, reject) => window.metadataRequests.push({ url, resolve, reject })) : undefined;
    function Harness() {
      const [open, setOpen] = useState(false);
      const [config, setConfig] = useState(original);
      window.currentConfig = config;
      return <><button id="open" onClick={() => setOpen(true)}>Agregar dato de regalo</button><button id="outside">Otro control</button>{open && <GiftDataModal config={config} loadLinkMetadata={loadLinkMetadata} onClose={() => setOpen(false)} onSave={next => { window.saved.push(next); setConfig(next); setOpen(false); }} />}</>;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  `);
  await new Promise((resolve, reject) => {
    webpackRuntime.webpack({
      mode: "development", devtool: false, entry,
      output: { path: directory, filename: "bundle.js" },
      resolve: { extensions: [".js", ".jsx", ".cjs"], alias: { "@": path.join(projectRoot, "src") }, modules: [path.join(projectRoot, "node_modules"), "node_modules"] },
      module: { rules: [{ test: /\.jsx$/, use: jsxLoader }, { test: /\.module\.css$/, use: cssLoader }] },
    }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve());
  });
  await fs.writeFile(path.join(directory, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
}

// Opt-in local Chrome coverage: GIFTS_UI_BROWSER=1 node --test <this file>.
// GIFTS_UI_VISIBILITY_ONLY=1 runs only the hidden-field regression.
// GIFTS_UI_METADATA_ONLY=1 exercises injected metadata promises without external network.
// Add GIFTS_UI_METADATA_LAYOUT_ONLY=1 for just the 320px metadata-controls check.
test(process.env.GIFTS_UI_METADATA_LAYOUT_ONLY ? "gift metadata controls fit at 320px" : process.env.GIFTS_UI_METADATA_ONLY ? "gift metadata lookup protects manual edits, cancellation and request races" : process.env.GIFTS_UI_VISIBILITY_ONLY ? "gift editor preserves hidden fields when clearing, rewriting and switching tabs" : "gift editor saves only on confirmation, handles links and works on desktop and mobile", {
  timeout: 120000,
  skip: process.env.GIFTS_UI_BROWSER !== "1" && process.env.GIFTS_UI_VISIBILITY_ONLY !== "1" && process.env.GIFTS_UI_METADATA_ONLY !== "1",
}, async () => {
  const isolationRoot = path.join(projectRoot, ".local-isolation");
  await fs.mkdir(isolationRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(isolationRoot, "gifts-editor-ui-"));
  await buildHarness(directory);
  const server = http.createServer(async (request, response) => {
    const name = request.url === "/bundle.js" ? "bundle.js" : "index.html";
    response.setHeader("Content-Type", name.endsWith("js") ? "text/javascript" : "text/html");
    response.end(await fs.readFile(path.join(directory, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, userDataDir: path.join(directory, "browser-profile"), args: ["--no-sandbox", "--disable-background-networking"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) => request.url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? request.continue() : request.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const clickText = async (text) => {
      await page.evaluate((label) => { const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label); if (!button) throw new Error(`Missing button: ${label}`); button.click(); }, text);
    };
    const fill = async (selector, value) => {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");
      await page.type(selector, value);
    };
    if (process.env.GIFTS_UI_METADATA_ONLY) {
      await runGiftLinkMetadataBrowserCases(page, directory, { clickText, fill });
      assert.deepEqual(errors, []);
      console.log(`Gift metadata screenshots: ${directory}`);
      return;
    }
    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.click('[aria-controls="gift-account-usd"]');
    await fill("#gift-usd-cbu", "");
    await fill("#gift-usd-cbu", "NUEVA.CUENTA.OCULTA");
    assert.equal(await page.$eval('[aria-label="Mostrar CBU de cuenta USD"]', (node) => node.checked), false);
    await fill("#gift-usd-holder", "Titular nuevo");
    assert.equal(await page.$eval('[aria-label="Mostrar Titular de cuenta USD"]', (node) => node.checked), true);
    await page.click('[aria-label="Mostrar Titular de cuenta USD"]');
    await fill("#gift-usd-holder", "");
    await page.click("#gift-tab-links");
    await page.click("#gift-tab-accounts");
    await page.click('[aria-controls="gift-account-usd"]');
    await fill("#gift-usd-holder", "Titular oculto tras cambiar pestaña");
    assert.equal(await page.$eval('[aria-label="Mostrar Titular de cuenta USD"]', (node) => node.checked), false);
    await clickText("Como invitado");
    const visibleText = await page.$eval('.guestContent', (node) => node.textContent);
    assert.doesNotMatch(visibleText, /NUEVA.CUENTA.OCULTA|Titular oculto/);
    await clickText("Cancelar");
    if (process.env.GIFTS_UI_VISIBILITY_ONLY) { assert.deepEqual(errors, []); return; }
    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.click('[aria-controls="gift-account-usd"]');
    await fill("#gift-usd-alias", "cancelar.usd.fixture");
    await clickText("Cancelar");
    assert.equal(await page.evaluate(() => window.saved.length), 0);
    assert.equal(await page.evaluate(() => window.currentConfig.bankUsd.alias), "");
    assert.equal(await page.evaluate(() => document.activeElement.id), "open");

    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Guardar datos");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Cerrar regalos");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.saved.length), 0);

    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.click('[aria-controls="gift-account-usd"]');
    await fill("#gift-usd-alias", "cuenta.dolares.fixture");
    await fill("#gift-usd-holder", "Titular de ejemplo");
    await page.click("#gift-tab-links");
    await fill("#gift-new-link", "https://example.com/cafetera");
    await clickText("Agregar");
    await page.waitForSelector('input[id^="gift-title-"]');
    await clickText("Guardar datos");
    assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /nombre/);
    await fill('input[id^="gift-title-"]', "Cafetera para casa");
    await fill('input[id^="gift-image-"]', "https://example.com/fixture.jpg");
    await clickText("Listo");
    await fill("#gift-new-link", "https://example.com/cafetera");
    await clickText("Agregar");
    assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /ya está/);
    await fill("#gift-new-link", "javascript:alert(1)");
    await clickText("Agregar");
    assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /válido/);
    await page.screenshot({ path: path.join(directory, "desktop-links.png") });
    await clickText("Como invitado");
    assert.equal(await page.$$eval('[class="guestAccount"]', (nodes) => nodes.length), 2);
    assert.match(await page.$eval('[class="guestContent"]', (node) => node.textContent), /Cafetera para casa/);
    assert.equal(await page.$eval('a[href="https://example.com/cafetera"]', (node) => node.rel), "noopener noreferrer");
    await page.screenshot({ path: path.join(directory, "desktop-preview.png") });
    await clickText("Guardar datos");
    const saved = await page.evaluate(() => window.saved[0]);
    assert.equal(saved.bank.alias, "cuenta.pesos.fixture");
    assert.equal(saved.bankUsd.alias, "cuenta.dolares.fixture");
    assert.equal(saved.giftLinks[0].title, "Cafetera para casa");
    assert.equal(saved.giftLinks[0].imageUrl, "https://example.com/fixture.jpg");

    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.click("#gift-tab-links");
    await page.click('.linkCopy input[type="checkbox"]');
    await clickText("Como invitado");
    assert.equal(await page.$('a[href="https://example.com/cafetera"]'), null);
    await clickText("Volver a editar");
    await page.click('[aria-label="Editar Cafetera para casa"]');
    await fill('input[id^="gift-title-"]', "Cafetera elegida");
    await fill('input[id^="gift-image-"]', "http://example.com/insecure.jpg");
    await clickText("Listo");
    assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /imagen/);
    await fill('input[id^="gift-image-"]', "https://example.com/fixture.jpg");
    await clickText("Listo");
    await page.click('.linkCopy input[type="checkbox"]');
    await fill("#gift-new-link", "https://example.com/cena");
    await clickText("Agregar");
    await page.waitForSelector('input[id^="gift-title-"]');
    await clickText("Quitar regalo");
    assert.equal(await page.$$eval('.linkCard', (nodes) => nodes.length), 1);
    await clickText("Guardar datos");
    assert.equal(await page.evaluate(() => window.saved[1].giftLinks[0].title), "Cafetera elegida");
    assert.equal(await page.evaluate(() => window.saved[1].giftLinks[0].visible), true);

    for (const width of [390, 320]) {
      await page.setViewport({ width, height: 844 });
      await page.click("#open");
      await page.waitForSelector('[role="dialog"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(directory, `mobile-${width}-accounts.png`) });
      await page.click("#gift-tab-links");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(directory, `mobile-${width}-links.png`) });
      await clickText("Como invitado");
      await page.screenshot({ path: path.join(directory, `mobile-${width}-preview.png`) });
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(errors, []);
    console.log(`Gift editor screenshots: ${directory}`);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
