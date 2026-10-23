import assert from "node:assert/strict";
import path from "node:path";

// Injected promises exercise the real React UI without contacting a remote site.
export async function runGiftLinkMetadataBrowserCases(page, directory, { clickText, fill }) {
  const open = async () => {
    await page.click("#open");
    await page.waitForSelector('[role="dialog"]');
    await page.click("#gift-tab-links");
  };
  const requestCount = () => page.evaluate(() => window.metadataRequests.length);
  const waitForRequest = async (count) => { await page.waitForFunction((previous) => window.metadataRequests.length > previous, {}, count); return count; };
  const add = async (url) => {
    const count = await requestCount();
    await fill("#gift-new-link", url);
    await clickText("Agregar");
    await page.waitForSelector('input[id^="gift-title-"]');
    return waitForRequest(count);
  };
  const retry = async () => { const count = await requestCount(); await clickText("Completar desde el enlace"); return waitForRequest(count); };
  const resolve = async (index, result) => {
    await page.evaluate(({ requestIndex, metadata }) => window.metadataRequests[requestIndex].resolve(metadata), { requestIndex: index, metadata: result });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const title = () => page.$eval('input[id^="gift-title-"]', (node) => node.value);
  const image = () => page.$eval('input[id^="gift-image-"]', (node) => node.value);
  const full = { status: "found", title: "Cafetera del sitio", imageUrl: "https://example.com/cafetera.jpg" };
  const verifyMetadataLayout = async (width) => {
    await page.setViewport({ width, height: 844 });
    await page.$eval('.metadataControls', (node) => node.scrollIntoView({ block: "center" }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.$eval('.metadataControls', (node) => {
      const box = node.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && node.scrollWidth <= node.clientWidth;
    }), true);
    await page.screenshot({ path: path.join(directory, `metadata-mobile-${width}.png`) });
  };

  if (process.env.GIFTS_UI_METADATA_LAYOUT_ONLY === "1") {
    await open();
    await add("https://example.com/layout");
    await fill('input[id^="gift-title-"]', "Un regalo para casa");
    await verifyMetadataLayout(320);
    await clickText("Cancelar");
    return;
  }

  await open();
  const first = await add("https://example.com/manual");
  assert.match(await page.$eval('[role="status"]', (node) => node.textContent), /Buscando/);
  await fill('input[id^="gift-title-"]', "Mi nombre manual");
  await page.click("#gift-tab-accounts");
  await resolve(first, full);
  await page.click("#gift-tab-links");
  assert.equal(await title(), "Mi nombre manual");
  assert.equal(await image(), full.imageUrl);
  await fill('input[id^="gift-image-"]', "https://example.com/manual.jpg");
  const empty = await retry();
  await resolve(empty, { status: "empty", title: "", imageUrl: "" });
  assert.equal(await title(), "Mi nombre manual");
  assert.equal(await image(), "https://example.com/manual.jpg");
  assert.match(await page.$eval('[role="status"]', (node) => node.textContent), /manualmente/);
  await clickText("Cancelar");

  await open();
  const automatic = await add("https://example.com/a");
  await clickText("Guardar datos");
  assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /nombre/);
  await resolve(automatic, full);
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  assert.equal(await title(), full.title);
  assert.equal(await image(), full.imageUrl);
  await fill('input[id^="gift-url-"]', "https://example.com/b");
  assert.equal(await title(), "");
  assert.equal(await image(), "");
  const older = await retry();
  await fill('input[id^="gift-url-"]', "https://example.com/c");
  const newer = await retry();
  await resolve(newer, { status: "found", title: "El regalo nuevo", imageUrl: "" });
  await resolve(older, full);
  assert.equal(await title(), "El regalo nuevo");
  assert.equal(await image(), "");
  const afterManualClear = await retry();
  await fill('input[id^="gift-title-"]', "Escribí y borré");
  await fill('input[id^="gift-title-"]', "");
  await fill('input[id^="gift-image-"]', "https://example.com/manual-final.jpg");
  await resolve(afterManualClear, full);
  assert.equal(await title(), "");
  assert.equal(await image(), "https://example.com/manual-final.jpg");
  await clickText("Cancelar");

  await open();
  const removed = await add("https://example.com/removed");
  await clickText("Quitar regalo");
  await resolve(removed, full);
  assert.equal(await page.$$eval('.linkCard, .linkEditor', (nodes) => nodes.length), 0);
  const canceled = await add("https://example.com/canceled");
  await clickText("Cancelar");
  await open();
  const replacement = await add("https://example.com/canceled");
  await resolve(canceled, full);
  assert.equal(await title(), "");
  await resolve(replacement, { status: "found", title: "Nombre vigente", imageUrl: "" });
  assert.equal(await title(), "Nombre vigente");
  await clickText("Cancelar");

  await open();
  const failed = await add("https://example.com/unavailable");
  await page.evaluate((index) => window.metadataRequests[index].reject(new Error("Fixture failure")), failed);
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("No pudimos"));
  await fill('input[id^="gift-title-"]', "Regalo completado a mano");
  await clickText("Guardar datos");
  assert.equal(await page.evaluate(() => window.saved[0].giftLinks[0].title), "Regalo completado a mano");

  await open();
  const savePending = await add("https://example.com/save-before-metadata");
  await fill('input[id^="gift-title-"]', "Guardar ahora");
  await page.screenshot({ path: path.join(directory, "metadata-desktop.png") });
  // Preserve the in-flight fixture; switching device emulation would reload the page.
  for (const width of [390, 320]) {
    await verifyMetadataLayout(width);
  }
  await clickText("Guardar datos");
  await resolve(savePending, full);
  const saved = await page.evaluate(() => window.saved[1]);
  assert.equal(saved.giftLinks[1].title, "Guardar ahora");
  assert.equal(saved.giftLinks[1].imageUrl, "");
  assert.equal(Object.hasOwn(saved, "requests"), false);
  assert.equal(await page.$('[role="dialog"]'), null);
}
