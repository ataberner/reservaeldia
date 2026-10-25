import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { operator, ordinary, adminClaim } from "./providerBetaFixtures.mjs";
import { createProviderDirectoryFixtures, venueDraft, photographerDraft } from "./providerDirectoryFixtures.mjs";
import { assertEditorFlowSession, contract, origin, waitForFixture } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
const desktop = { width: 1440, height: 1000, deviceScaleFactor: 1 };
const mobile = { width: 390, height: 844, deviceScaleFactor: 1 };
async function contains(page, text) { await page.waitForFunction(text => document.body.textContent.includes(text), {}, text); }
async function ready(page) { await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')); }
async function click(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll("button")].some(node => node.textContent.trim() === text && !node.disabled), {}, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text && !node.disabled), text);
  const button = handle.asElement();
  await button.evaluate(node => node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  // The shared page uses smooth scrolling. Wait for a reachable target rather
  // than assuming two animation frames complete a long twelve-card scroll.
  await page.waitForFunction(node => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (node === hit || node.contains(hit)) return true;
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return false;
  }, {}, button);
  assert.ok(await button.evaluate(node => { const rect = node.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return node === hit || node.contains(hit); }), `${text} is reachable`);
  await button.click(); await handle.dispose();
}
async function field(page, label, value, select = false) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent.trim() === label)?.querySelector("input,select"), label);
  const input = handle.asElement(); assert.ok(input, `Accessible field ${label}`);
  if (select) await input.select(value);
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
async function loadedImages(page, minimum) {
  await page.waitForFunction(minimum => [...document.querySelectorAll('img[src^="blob:"]')].filter(image => image.complete && image.naturalWidth > 0).length >= minimum, {}, minimum);
}

test("private approved directory works on desktop/mobile, withdraws stale contact and preserves normal login", { timeout: 540000 }, async () => {
  const session = assertEditorFlowSession();
  const folder = path.join(session, "provider-directory-screenshots"); await mkdir(folder, { recursive: true });
  const evidence = { project: contract.LOCAL_PROJECT, viewports: ["1440x1000", "390x844"], screenshots: [], blockedRemoteRequests: 0, checks: [], remoteEffects: false };
  const fixture = await createProviderDirectoryFixtures();
  let venue = await fixture.create(venueDraft, { image: true });
  const professional = await fixture.create({ ...photographerDraft, cobertura: ["Berisso", "Ensenada"] });
  const draftImage = await fixture.upload(venue.id, "#7d6b9b");
  venue = await fixture.mutate(venue, "save", { draft: { ...venue.draft, nombre: "DRAFT-NAME-NEVER-PUBLIC", contacto: { ...venue.draft.contacto, email: "pending@example.test" }, imagenes: { portada: draftImage, logo: null, galeria: [draftImage] } } });
  // Enough approved neutral fixtures to exercise the actual UI cursor controls.
  const neutral = (await fixture.db.doc(`proveedores/${venue.id}`).get()).data();
  neutral.aprobada.contenido.imagenes = { portada: null, logo: null, galeria: [] };
  neutral.aprobada.contenido.espacio.capacidadMaxima = null;
  const batch = fixture.db.batch();
  for (let index = 0; index < 12; index += 1) {
    const id = `000_directory_ui_${String(index).padStart(2, "0")}`; fixture.providerIds.add(id);
    batch.create(fixture.db.doc(`proveedores/${id}`), { ...neutral, aprobada: { ...neutral.aprobada, contenido: { ...neutral.aprobada.contenido, nombre: `Espacio de prueba ${index + 1}` } } });
  }
  await batch.commit();
  const browser = await require("puppeteer").launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true,
    userDataDir: path.join(session, "provider-directory-browser-profile"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  let currentPage, failList = false;
  const mediaIds = new Set();
  async function pageFor(viewport) {
    const context = await browser.createBrowserContext(); const page = await context.newPage();
    page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(90000); await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (/^(data:|blob:|about:)/.test(request.url())) { void request.continue(); return; }
      try { contract.assertLocalUrl(request.url()); } catch { evidence.blockedRemoteRequests += 1; void request.abort("blockedbyclient"); return; }
      const url = new URL(request.url());
      if (url.pathname.endsWith("/providerDirectoryImageV1")) mediaIds.add(url.searchParams.get("imageId"));
      if (failList && url.pathname.endsWith("/providerDirectoryV1") && request.method() === "POST") {
        try { if (JSON.parse(request.postData()).data.operation === "list") { void request.abort("failed"); return; } } catch { /* Not a directory list payload. */ }
      }
      void request.continue();
    });
    currentPage = page; return page;
  }
  async function screenshot(page, name, target) {
    if (target) await page.$eval(target, node => node.scrollIntoView({ block: "start", behavior: "instant" }));
    else await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" }); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const size = await page.evaluate(() => ({ viewport: innerWidth, width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.querySelector("main")?.scrollWidth || 0) }));
    assert.ok(size.width <= size.viewport + 1, `No horizontal overflow: ${JSON.stringify(size)}`);
    await page.screenshot({ path: path.join(folder, name) }); evidence.screenshots.push(name);
  }
  try {
    await waitForFixture(async () => {
      try { return (await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(2000) })).status === 200; } catch { return false; }
    }, "Local Next starts serving its static favicon", 60000);
    const visitor = await pageFor(desktop);
    await visitor.goto(`${origin}/lugares/`, { waitUntil: "domcontentloaded" }); await contains(visitor, "Iniciar sesión");
    assert.equal(await visitor.$('form[aria-label="Buscar en el directorio"]'), null);
    assert.doesNotMatch(await visitor.$eval("body", node => node.textContent), /Jardín Claro|Luz Sur|DIRECTORY-PRIVATE/);
    await visitor.browserContext().close();
    evidence.checks.push("anonymous shell has no provider data");

    const page = await pageFor(desktop); await login(page, operator);
    await page.goto(`${origin}/lugares/`, { waitUntil: "domcontentloaded" }); await contains(page, "Página 1"); await ready(page);
    assert.equal(await page.$$eval('a[aria-label^="Ver ficha de "]', nodes => nodes.length), 12);
    await contains(page, "Capacidad sin informar");
    await click(page, "Siguiente"); await contains(page, "Página 2"); await contains(page, venueDraft.nombre); await ready(page);
    assert.equal(await page.$$eval('a[aria-label^="Ver ficha de "]', nodes => nodes.length), 1);
    await click(page, "Anterior"); await contains(page, "Página 1"); await ready(page);
    await field(page, "Nombre o descripción", "jardin claro"); await field(page, "Categoría", "salones-fiestas", true); await field(page, "Localidad o provincia", "La Plata"); await field(page, "Capacidad máxima desde", "150");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Buscar", "Search is reachable by keyboard after the capacity field");
    await page.keyboard.press("Enter"); await contains(page, venueDraft.nombre); await ready(page); await loadedImages(page, 1);
    assert.equal(await page.$$eval('a[aria-label^="Ver ficha de "]', nodes => nodes.length), 1);
    await screenshot(page, "01-venues-desktop.png", 'form[aria-label="Buscar en el directorio"]');
    await field(page, "Nombre o descripción", "Sin coincidencias"); await click(page, "Buscar"); await contains(page, "No encontramos fichas para esta búsqueda");
    await screenshot(page, "05-empty.png", 'form[aria-label="Buscar en el directorio"]');
    await click(page, "Limpiar filtros"); await contains(page, "Espacio de prueba"); await ready(page);
    evidence.checks.push("real pagination forward/back", "approved name/category/location/capacity search", "keyboard tab and enter submit", "unknown capacity is not zero", "empty state and clear filters");

    failList = true; await click(page, "Buscar"); await contains(page, "No pudimos cargar el directorio");
    await screenshot(page, "09-retry.png", '[role="alert"]'); failList = false;
    await click(page, "Volver a intentar"); await contains(page, "Página 1"); await ready(page);
    evidence.checks.push("network failure removes results; explicit retry recovers");

    await page.goto(`${origin}/proveedor/?id=${encodeURIComponent(venue.id)}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[aria-label="Ficha aprobada del negocio"]'); await contains(page, venueDraft.nombre); await loadedImages(page, 2);
    const detail = await page.$eval('[aria-label="Ficha aprobada del negocio"]', node => node.textContent);
    assert.match(detail, /jardin@example\.test/); assert.doesNotMatch(detail, /DRAFT-NAME|pending@example|DIRECTORY-PRIVATE|Responsable verificado/);
    assert.ok(await page.$('button')); await contains(page, "Consultar por WhatsApp"); await contains(page, "Escribir por correo");
    await screenshot(page, "03-detail-desktop.png");
    await page.setViewport(mobile); await contains(page, venueDraft.nombre); await screenshot(page, "04-detail-mobile.png", '[aria-label="Contacto comercial aprobado"]');
    assert.ok(!mediaIds.has(draftImage.id), "No pending image fetched by directory browser");
    evidence.checks.push("approved-only detail and authenticated blob images", "pending image never requested", "contact controls show approved business data", "desktop/mobile layout");

    // The button rechecks eligibility before any destination navigation. This
    // exercise cannot contact a business: the provider is paused first.
    venue = await fixture.mutate(venue, "pause", { reason: "Pausa sintética mientras la ficha está abierta" });
    await click(page, "Consultar por WhatsApp"); await contains(page, "Esta ficha no está disponible");
    assert.equal(await page.$('[aria-label="Contacto comercial aprobado"]'), null);
    await screenshot(page, "06-paused.png");
    venue = await fixture.mutate(venue, "resume"); await click(page, "Volver a intentar"); await contains(page, venueDraft.nombre);
    await fixture.setControls({ privateDirectoryEnabled: false });
    await click(page, "Escribir por correo"); await contains(page, "directorio privado");
    await page.waitForFunction(() => !document.querySelector('[aria-label="Ficha aprobada del negocio"]'));
    await page.reload({ waitUntil: "domcontentloaded" }); await contains(page, "El directorio privado está cerrado");
    await screenshot(page, "07-closed.png");
    await fixture.setControls({ privateDirectoryEnabled: true });
    await click(page, "Volver a intentar"); await contains(page, venueDraft.nombre);
    evidence.checks.push("stale contact rechecks and withdraws paused or closed provider without navigation");

    await page.goto(`${origin}/profesionales/`, { waitUntil: "domcontentloaded" }); await contains(page, photographerDraft.nombre); await ready(page);
    await field(page, "Localidad o cobertura", "Ensenada"); await field(page, "Categoría", "foto-video", true); await click(page, "Buscar"); await contains(page, photographerDraft.nombre); await ready(page);
    await contains(page, "Sin fotografía"); await screenshot(page, "02-professionals-mobile.png", 'article:has(a[aria-label^="Ver ficha de "])');
    await page.goto(`${origin}/proveedor/?id=${professional.id}`, { waitUntil: "domcontentloaded" }); await contains(page, "Zonas de cobertura");
    assert.doesNotMatch(await page.$eval('[aria-label="Ficha aprobada del negocio"]', node => node.textContent), /Dirección del establecimiento|DIRECCION-PARTICULAR-SINTETICA|Responsable verificado/);
    evidence.checks.push("professional coverage filter and neutral category fallback", "professional private address not presented");
    await page.browserContext().close();

    for (const user of [ordinary, adminClaim]) {
      const denied = await pageFor(mobile); await login(denied, user);
      await denied.goto(`${origin}/proveedor/?id=${venue.id}`, { waitUntil: "domcontentloaded" }); await contains(denied, "Esta vista está reservada para superadmin");
      assert.equal(await denied.$('[aria-label="Ficha aprobada del negocio"]'), null);
      assert.doesNotMatch(await denied.$eval("body", node => node.textContent), /jardin@example|Jardín Claro|DIRECTORY-PRIVATE/);
      if (user === ordinary) await screenshot(denied, "08-common-denied.png");
      await denied.browserContext().close();
    }
    evidence.checks.push("ordinary and claim-admin sessions denied", "existing email login still defaults to couple dashboard");
    await writeFile(path.join(session, "provider-directory-browser-evidence.json"), JSON.stringify(evidence, null, 2));
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    await writeFile(path.join(session, "provider-directory-browser-evidence.json"), JSON.stringify({ ...evidence, failed: true, message: error.message }, null, 2));
    throw error;
  } finally { await browser.close(); await fixture.cleanup(); }
});
