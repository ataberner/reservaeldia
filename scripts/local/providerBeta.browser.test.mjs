import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createProviderBetaFixtures, operator, ordinary } from "./providerBetaFixtures.mjs";
import { assertEditorFlowSession, contract, origin, waitForFixture } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
const desktop = { width: 1440, height: 1000, deviceScaleFactor: 1 };
const mobile = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const responsiveMobile = { width: mobile.width, height: mobile.height, deviceScaleFactor: 1 };
async function click(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll("button")].some(node => node.textContent.trim() === text && !node.disabled), {}, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text && !node.disabled), text);
  await handle.asElement().evaluate(node => node.scrollIntoView({ block: "center", inline: "center" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await handle.asElement().evaluate(node => { const rect = node.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return node === hit || node.contains(hit); }), `Button ${text} is reachable by pointer`);
  await handle.asElement().click(); await handle.dispose();
}
async function field(page, label, value, select = false) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent.trim() === label)?.querySelector("input,textarea,select"), label);
  const input = handle.asElement(); assert.ok(input, `Accessible field ${label}`);
  if (select) await input.select(value);
  else { await input.click({ clickCount: 3 }); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await input.type(value); }
  await handle.dispose();
}
async function contains(page, text) { await page.waitForFunction(text => document.body.textContent.includes(text), {}, text); }
async function waitPreview(page, version, images = 0) {
  await page.waitForFunction(({ version, images }) => {
    const preview = document.querySelector('[aria-label="Vista previa privada de la ficha"]');
    const busy = [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes("Procesando…"));
    const loaded = preview ? [...preview.querySelectorAll('img[src^="blob:"]')].filter(image => image.complete && image.naturalWidth > 0).length : 0;
    return !busy && preview?.textContent.includes(`Vista privada · ${version}`) && loaded >= images;
  }, {}, { version, images });
}
async function upload(page, label, files) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent.trim() === label)?.querySelector('input[type="file"]'), label);
  assert.ok(handle.asElement(), `Accessible upload ${label}`);
  await handle.asElement().uploadFile(...files); await handle.dispose();
}
async function fits(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth, main: document.querySelector("main")?.scrollWidth || 0 }));
  assert.ok(Math.max(size.body, size.html, size.main) <= size.viewport + 1, `Horizontal overflow at ${size.viewport}: ${JSON.stringify(size)}`);
}
async function login(page, user) {
  await page.goto(`${origin}/?auth=login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-email", { visible: true });
  await page.type("#login-email", user.email); await page.type("#login-password", user.password);
  await page.click('[aria-labelledby="login-modal-title"] button[type="submit"]');
  await page.waitForFunction(() => location.pathname.replace(/\/$/, "") === "/dashboard");
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /Preparando tu espacio|Restableciendo la conexi/.test(node.textContent)));
}

test("real private provider administration works on desktop/mobile and ordinary couple login keeps its dashboard/editor", { timeout: 540000 }, async () => {
  const session = assertEditorFlowSession();
  const folder = path.join(session, "providers-screenshots"); await mkdir(folder, { recursive: true });
  const evidence = { project: contract.LOCAL_PROJECT, viewports: ["1440x1000", "390x844"], screenshots: [], blockedRemoteRequests: 0, checks: [], remoteEffects: false };
  const fixture = await createProviderBetaFixtures();
  const browser = await require("puppeteer").launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true,
    userDataDir: path.join(session, "providers-browser-profile"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  let currentPage;
  async function pageFor(viewport) {
    const context = await browser.createBrowserContext(); const page = await context.newPage();
    page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(90000); await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (/^(data:|blob:|about:)/.test(request.url())) { void request.continue(); return; }
      try { contract.assertLocalUrl(request.url()); } catch { evidence.blockedRemoteRequests += 1; void request.abort("blockedbyclient"); return; }
      void request.continue();
    });
    currentPage = page; return page;
  }
  async function screenshot(page, name, fullPage = false) {
    await page.evaluate(name => {
      if (!location.pathname.startsWith("/admin/proveedores")) return;
      const target = name.includes("preview") ? document.querySelector('[aria-label="Vista previa privada de la ficha"]')
        : name.includes("photos") ? [...document.querySelectorAll("h2")].find(node => node.textContent === "Fotos") : null;
      if (target) target.scrollIntoView({ block: "start" });
      else document.querySelector("main")?.scrollTo(0, 0);
    }, name);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await fits(page); await page.screenshot({ path: path.join(folder, name), fullPage }); evidence.screenshots.push(name);
  }
  async function action(page, name, message, reason) {
    await click(page, name);
    if (reason) await field(page, "Motivo de la acción", reason);
    await click(page, `Confirmar ${name.toLowerCase()}`);
    await contains(page, message);
  }
  try {
    const visitor = await pageFor(desktop);
    await visitor.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" });
    await contains(visitor, "Iniciar sesión");
    assert.equal(await visitor.$('input[autocomplete="organization"]'), null);
    evidence.checks.push("anonymous administrative route denied");
    await visitor.browserContext().close();

    const page = await pageFor(desktop); await login(page, operator);
    await page.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" });
    await contains(page, "No hay fichas para mostrar");
    await screenshot(page, "01-list-desktop.png");
    await click(page, "Crear ficha");
    await field(page, "Nombre comercial", "Estudio Aurora · prueba local");
    await field(page, "Categoría principal", "foto-video", true);
    await field(page, "Descripción breve", "Fotografía de casamientos con una mirada cercana.");
    await field(page, "Descripción completa", "Equipo de fotografía sintético para comprobar la administración privada. Esta ficha sólo existe en emuladores locales.");
    await field(page, "Correo comercial", "aurora@example.test");
    await field(page, "Localidad", "La Plata"); await field(page, "Provincia", "Buenos Aires");
    await field(page, "País (código)", "AR"); await field(page, "Zonas de cobertura", "La Plata\nBuenos Aires");
    await click(page, "Guardar borrador"); await contains(page, "Borrador guardado. La versión aprobada se conserva.");
    const stored = await waitForFixture(async () => {
      const result = await fixture.db.collection("proveedores").where("nombre", "==", "Estudio Aurora · prueba local").get();
      return result.empty ? false : result.docs[0];
    }, "UI must persist the provider through the callable");
    fixture.providerIds.add(stored.id);
    await page.evaluate(() => scrollTo(0, 0)); await screenshot(page, "02-form-desktop.png");
    await page.setViewport(responsiveMobile); await contains(page, "Identificador permanente:"); await screenshot(page, "03-form-mobile.png", true);
    await page.setViewport(desktop); await click(page, "Publicación");
    await action(page, "Enviar a revisión", "Revisión enviada.");
    const approveDisabled = await page.evaluate(() => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Aprobar revisión")?.disabled);
    assert.equal(approveDisabled, true, "A revision must be opened before UI approval");
    await click(page, "Ver revisión enviada"); await waitPreview(page, "revisión enviada");
    const privateView = await page.$eval('[aria-label="Vista previa privada de la ficha"]', node => node.textContent);
    assert.match(privateView, /Consultar presupuesto/); assert.match(privateView, /Sin fotografía/);
    await screenshot(page, "04-preview-desktop.png", true);
    await action(page, "Aprobar revisión", "Revisión aprobada.");
    assert.equal((await fixture.db.doc(`proveedores/${stored.id}`).get()).data().visible, false);
    evidence.checks.push("UI create/save/submit/review/approve persisted with public visibility false");
    await click(page, "Información");
    const logoFile = path.join(session, "synthetic-provider-logo.png");
    const secondFile = path.join(session, "synthetic-provider-gallery.png");
    await require("sharp")({ create: { width: 96, height: 96, channels: 3, background: "#692b9a" } }).png().toFile(logoFile);
    await require("sharp")({ create: { width: 96, height: 96, channels: 3, background: "#f1d8a7" } }).png().toFile(secondFile);
    await upload(page, "Cargar logo", [logoFile]); await contains(page, "Logo cargado.");
    await click(page, "Guardar borrador"); await contains(page, "Borrador guardado.");
    let media = (await fixture.db.doc(`proveedores/${stored.id}`).get()).data();
    assert.ok(media.imagenes.logo?.storagePath); assert.equal(media.imagenes.galeria.length, 0);
    assert.equal(media.aprobada.contenido.imagenes.logo, null, "Pending upload must not replace approved media");
    const logoPath = media.imagenes.logo.storagePath;
    await upload(page, "Agregar imágenes a la galería", [logoFile, secondFile]); await contains(page, "2 imagen(es) agregada(s)");
    await field(page, "Descripción de la imagen 1", "Primera imagen sintética");
    await field(page, "Descripción de la imagen 2", "Segunda imagen sintética");
    await page.click('[aria-label="Subir imagen 2"]');
    await click(page, "Usar de portada");
    await click(page, "Guardar borrador"); await contains(page, "Borrador guardado.");
    media = (await fixture.db.doc(`proveedores/${stored.id}`).get()).data();
    assert.equal(media.imagenes.galeria[0].alt, "Segunda imagen sintética");
    assert.equal(media.imagenes.portada.storagePath, media.imagenes.galeria[0].storagePath);
    await click(page, "Quitar de galería 1");
    await click(page, "Guardar borrador"); await contains(page, "Borrador guardado.");
    const removed = (await fixture.db.doc(`proveedores/${stored.id}`).get()).data();
    assert.equal(removed.imagenes.galeria.length, 1);
    assert.equal(removed.imagenes.portada.storagePath, media.imagenes.portada.storagePath);
    assert.equal(removed.imagenes.logo.storagePath, logoPath);
    await page.waitForFunction(() => [...document.querySelectorAll('img[src^="blob:"]')].length >= 3);
    await page.setViewport(responsiveMobile); await contains(page, "Identificador permanente:"); await screenshot(page, "10-photos-mobile.png", true); await page.setViewport(desktop);
    await click(page, "Publicación"); await click(page, "Ver versión aprobada");
    await waitPreview(page, "versión aprobada");
    assert.match(await page.$eval('[aria-label="Vista previa privada de la ficha"]', node => node.textContent), /Sin fotografía/);
    await action(page, "Enviar a revisión", "Revisión enviada.");
    await click(page, "Ver revisión enviada");
    await waitPreview(page, "revisión enviada", 3);
    await screenshot(page, "11-photos-preview-desktop.png", true);
    await action(page, "Solicitar correcciones", "Correcciones solicitadas.", "Revisar la descripción de las fotos sintéticas");
    evidence.checks.push("independent logo upload persists without gallery", "gallery upload/reorder/remove persists and preserves selected cover/logo", "pending media leaves approved snapshot unchanged", "private review images load authenticated blobs", "request corrections preserves approved content");
    await click(page, "Información"); await field(page, "Nombre comercial", "Edición pendiente de Aurora");
    await click(page, "Guardar borrador"); await contains(page, "Borrador guardado.");
    await click(page, "Publicación"); await click(page, "Ver versión aprobada");
    await waitPreview(page, "versión aprobada");
    assert.match(await page.$eval('[aria-label="Vista previa privada de la ficha"]', node => node.textContent), /Estudio Aurora · prueba local/);
    await action(page, "Pausar ficha", "Ficha pausada.", "Pausa administrativa sintética");
    await click(page, "Historial"); await contains(page, "Historial administrativo");
    await screenshot(page, "05-history-desktop.png");
    await click(page, "Publicación"); await action(page, "Reactivar ficha", "Ficha reactivada dentro de la beta privada.");
    await action(page, "Archivar ficha", "Ficha archivada.", "Archivo sintético de prueba");
    assert.ok((await fixture.db.doc(`proveedores/${stored.id}`).get()).data().aprobada);
    evidence.checks.push("resume and archive preserve approved snapshot/history");
    await click(page, "Volver al listado"); await page.setViewport(responsiveMobile);
    await contains(page, "Edición pendiente de Aurora"); await screenshot(page, "06-list-mobile.png", true);
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement && document.activeElement !== document.body), "Keyboard can focus a control");
    evidence.checks.push("approved preview preserved after draft edit", "pause retained history", "desktop/mobile without horizontal overflow", "keyboard focus");
    await page.browserContext().close();

    const couple = await pageFor(mobile);
    await login(couple, ordinary); await screenshot(couple, "07-couple-dashboard-mobile.png");
    await couple.goto(`${origin}/admin/proveedores/`, { waitUntil: "domcontentloaded" });
    await contains(couple, "Esta sección está reservada para superadmin.");
    assert.equal(await couple.$('input[autocomplete="organization"]'), null);
    await screenshot(couple, "08-common-user-denied.png");
    const slug = "provider-beta-couple-invitation";
    await fixture.createDocument(`borradores/${slug}`, { userId: ordinary.uid, nombre: "Casamiento sintético", estado: "activo", objetos: [{ id: "couple-title", tipo: "texto", texto: "Nuestra invitación de casamiento", seccionId: "section", x: 80, y: 80, width: 400, fontSize: 30, fontFamily: "Arial", color: "#4b244a" }], secciones: [{ id: "section", orden: 0, altoModo: "fijo", altura: 700, fondo: "#fffaf3" }], createdAt: new Date(), updatedAt: new Date() });
    await couple.goto(`${origin}/dashboard/?slug=${slug}`, { waitUntil: "domcontentloaded" });
    await couple.waitForSelector(".konvajs-content canvas", { visible: true });
    await couple.waitForFunction(() => window.editorSnapshot?.getObjectById?.("couple-title")?.texto === "Nuestra invitación de casamiento" && window._elementRefs?.["couple-title"]?.isVisible?.());
    await couple.waitForFunction(() => !document.querySelector('[data-dashboard-scroll-root="true"][inert]') && ![...document.querySelectorAll('[role="status"]')].some(node => /Estamos preparando tu invitaci[oó]n/.test(node.textContent)));
    const assistantClose = await couple.$('#sidebar-panel button[title="Cerrar panel"]');
    if (assistantClose) { await assistantClose.click(); await assistantClose.dispose(); }
    await couple.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await screenshot(couple, "09-couple-editor-mobile.png");
    evidence.checks.push("existing email login defaults to dashboard", "common account admin denied", "owned wedding invitation opens in existing editor");
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(folder, "failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await writeFile(path.join(session, "providers-browser-evidence.json"), JSON.stringify(evidence, null, 2));
    await browser.close(); await fixture.cleanup();
  }
});
