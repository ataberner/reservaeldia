import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createProviderAdminSearchFixtures, SEARCH_ROW_COUNT, SEARCH_TARGET, SEARCH_GROUP } from "./providerAdminSearchFixtures.mjs";
import { operator, ordinary } from "./providerBetaFixtures.mjs";
import { assertEditorFlowSession, contract, origin } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
const viewports = [{ width: 1440, height: 1000, deviceScaleFactor: 1 }, { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }];
async function contains(page, text) { await page.waitForFunction(text => document.body.textContent.includes(text), {}, text); }
async function ready(page) { await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /Cargando fichas|Preparando categorías/.test(node.textContent))); }
async function click(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll("button")].some(node => (node.getAttribute("aria-label") || node.textContent).trim() === text && !node.disabled), {}, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll("button")].find(node => (node.getAttribute("aria-label") || node.textContent).trim() === text && !node.disabled), text);
  const button = handle.asElement();
  await button.evaluate(node => node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  await page.waitForFunction(node => {
    const rect = node.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (node === hit || node.contains(hit)) return true;
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); return false;
  }, {}, button);
  await button.click(); await handle.dispose();
}
async function field(page, label, value, select = false) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent.trim() === label)?.querySelector("input,select"), label);
  const input = handle.asElement(); assert.ok(input, `Accessible field ${label}`);
  if (select) { await input.focus(); await input.select(value); }
  else { await input.click({ clickCount: 3 }); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await input.type(value); }
  await handle.dispose();
}
async function login(page, user) {
  await page.goto(`${origin}/?auth=login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-email", { visible: true });
  await page.type("#login-email", user.email); await page.type("#login-password", user.password);
  await page.click('[aria-labelledby="login-modal-title"] button[type="submit"]');
  await page.waitForFunction(() => location.pathname.replace(/\/$/, "") === "/dashboard");
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /Preparando tu espacio|Restableciendo la conexi/.test(node.textContent)));
}
const countRows = page => page.$$eval("tbody tr", nodes => nodes.length);

test("administrative search completes across 3205 records on desktop/mobile with truthful loading, errors and pagination", { timeout: 540000 }, async () => {
  const session = assertEditorFlowSession(), folder = path.join(session, "provider-admin-search-screenshots");
  await mkdir(folder, { recursive: true });
  const fixture = await createProviderAdminSearchFixtures();
  const evidence = { project: contract.LOCAL_PROJECT, synthetic: true, remoteEffects: false, rows: SEARCH_ROW_COUNT, datasetHash: fixture.datasetHash, screenshots: [], checks: [], blockedRemoteRequests: 0, listRequests: 0 };
  const browser = await require("puppeteer").launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true, userDataDir: path.join(session, "provider-admin-search-profile"),
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  let currentPage, holdList = false, heldRequest, failList = false;
  async function pageFor(viewport) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(90000); await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (/^(data:|blob:|about:)/.test(request.url())) { void request.continue(); return; }
      try { contract.assertLocalUrl(request.url()); } catch { evidence.blockedRemoteRequests += 1; void request.abort("blockedbyclient"); return; }
      if (new URL(request.url()).pathname.endsWith("/adminProvidersV1") && request.method() === "POST") {
        let data; try { data = JSON.parse(request.postData()).data; } catch { /* Non-JSON request is not list. */ }
        if (data?.operation === "list") {
          evidence.listRequests += 1;
          if (failList) { void request.abort("failed"); return; }
          if (holdList) { heldRequest = request; return; }
        }
      }
      void request.continue();
    });
    currentPage = page; return page;
  }
  async function screenshot(page, name, target) {
    if (target) await page.$eval(target, node => node.scrollIntoView({ block: "start", behavior: "instant" }));
    else await page.evaluate(() => document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.querySelector("main")?.scrollWidth || 0) }));
    assert.ok(dimensions.width <= dimensions.viewport + 1, `No horizontal overflow: ${JSON.stringify(dimensions)}`);
    await page.screenshot({ path: path.join(folder, name) }); evidence.screenshots.push(name);
  }
  async function search(page, text) { await field(page, "Buscar por nombre o correo", text); await click(page, "Buscar fichas"); await ready(page); }
  try {
    const visitor = await pageFor(viewports[0]);
    await visitor.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" }); await contains(visitor, "Iniciar sesión");
    assert.equal(await countRows(visitor), 0); await visitor.browserContext().close();
    for (const [index, viewport] of viewports.entries()) {
      const page = await pageFor(viewport); await login(page, operator);
      await page.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" }); await contains(page, "Página 1"); await ready(page);
      const before = evidence.listRequests;
      await search(page, "alamo final"); await contains(page, SEARCH_TARGET);
      assert.equal(evidence.listRequests - before, 1, "One user search invokes one complete backend list, no client scan loop");
      assert.equal(await countRows(page), 1); await contains(page, "Página 1");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Siguiente")?.disabled), true);
      await screenshot(page, index ? "02-search-mobile.png" : "01-search-desktop.png", index ? "tbody" : undefined);
      await click(page, "Filtros");
      assert.equal(await page.$eval('button[aria-controls]', node => node.getAttribute("aria-expanded")), "true");
      await field(page, "Categoría", "salones-fiestas", true); await field(page, "Localidad", "La Plata");
      await field(page, "Responsable", "responsable", true); await field(page, "Pendientes", "false", true);
      // The compact toolbar precedes the optional fields. Return to its submit
      // action using the keyboard, preserving the real focus/navigation check.
      await page.keyboard.down("Shift");
      for (let step = 0; step < 8; step++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.textContent.trim() === "Buscar fichas")) break;
      }
      await page.keyboard.up("Shift");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Buscar fichas");
      await page.keyboard.press("Enter"); await ready(page); assert.equal(await countRows(page), 1);
      await click(page, SEARCH_TARGET); await contains(page, "Identificador permanente:");
      await click(page, "Volver al listado"); await contains(page, SEARCH_TARGET); await ready(page);
      for (const label of ["Categoría", "Responsable", "Pendientes"]) await field(page, label, "", true);
      await field(page, "Localidad", ""); await search(page, SEARCH_GROUP); assert.equal(await countRows(page), 20);
      await click(page, "Siguiente"); await contains(page, "Página 2"); await ready(page); assert.equal(await countRows(page), 1);
      await click(page, "Anterior"); await contains(page, "Página 1"); await ready(page); assert.equal(await countRows(page), 20);
      await search(page, "no-existing-synthetic-provider"); assert.equal(await countRows(page), 0);
      await contains(page, "No hay coincidencias");
      assert.doesNotMatch(await page.$eval("body", node => node.textContent), /Sin coincidencias en esta página|Hay más registros por consultar/);
      await search(page, "alamo final"); assert.equal(await countRows(page), 1);
      if (index === 0) {
        holdList = true; await click(page, "Buscar fichas"); await contains(page, "Cargando fichas…");
        assert.equal(await countRows(page), 0); assert.doesNotMatch(await page.$eval("body", node => node.textContent), /\b1 fichas en esta página\b|No hay coincidencias/);
        await screenshot(page, "03-loading.png");
        assert.ok(heldRequest); holdList = false; await heldRequest.continue(); heldRequest = null;
        await ready(page); assert.equal(await countRows(page), 1);
        failList = true; await click(page, "Buscar fichas"); await page.waitForSelector('[role="alert"]'); await ready(page);
        await contains(page, "No pudimos completar la acción. Volvé a intentarlo.");
        assert.equal(await countRows(page), 0); assert.doesNotMatch(await page.$eval("body", node => node.textContent), /No hay coincidencias|\b1 fichas en esta página\b/);
        await screenshot(page, "04-error.png", '[role="alert"]'); failList = false;
        await click(page, "Volver a intentar la búsqueda"); await ready(page); await contains(page, SEARCH_TARGET); assert.equal(await countRows(page), 1);
      }
      evidence.checks.push(`${viewport.width}x${viewport.height}: one-call late match, combined filters, keyboard submit, detail/back, 20+1 matching pagination, final miss, recovery`);
      await page.browserContext().close();
    }
    const common = await pageFor(viewports[1]); await login(common, ordinary);
    await common.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" }); await contains(common, "Esta sección está reservada para superadmin.");
    assert.equal(await countRows(common), 0); assert.doesNotMatch(await common.$eval("body", node => node.textContent), /Álamo Final/);
    evidence.checks.push("anonymous/common denied; normal login still reaches dashboard; loading/error never show stale rows or false empty");
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) { try { await currentPage.screenshot({ path: path.join(folder, "failure.png") }); evidence.screenshots.push("failure.png"); } catch { /* Original failure wins. */ } }
    throw error;
  } finally {
    if (heldRequest) { try { await heldRequest.abort(); } catch { /* Browser may already be closed. */ } }
    await browser.close(); await fixture.cleanup();
    await writeFile(path.join(session, "provider-admin-search-browser-evidence.json"), JSON.stringify(evidence, null, 2));
  }
});
