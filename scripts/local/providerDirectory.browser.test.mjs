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
const landscape = { width: 844, height: 390, deviceScaleFactor: 1 };
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
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => [...node.querySelectorAll("span")].some(span => span.textContent.trim() === label))?.querySelector("input,select"), label);
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
async function loadedImages(page, minimum) {
  await page.waitForFunction(minimum => [...document.querySelectorAll('img[src^="blob:"]')].filter(image => image.complete && image.naturalWidth > 0).length >= minimum, {}, minimum);
}
const venueList = '[role="region"][aria-label="Lista de lugares"]';
async function documentScrollState(page, top) {
  return page.evaluate(async requestedTop => {
    const roots = [...new Set([document.scrollingElement, document.body, document.documentElement])].filter(Boolean);
    const range = node => node.scrollHeight - node.clientHeight;
    // The site's global overflow rules make BODY the scroll owner on mobile,
    // while other layouts use the browser's usual document.scrollingElement.
    const scrollable = roots.filter(node => range(node) > 1 && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY));
    const owner = scrollable.sort((a, b) => range(b) - range(a))[0] || document.scrollingElement;
    if (typeof requestedTop === "number") {
      for (const node of roots) node.scrollTo({ top: node === owner ? requestedTop : 0, behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    return {
      documentHeight: Math.max(...roots.map(node => node.scrollHeight)),
      documentTop: Math.max(...roots.map(node => node.scrollTop)),
      documentScroller: owner.tagName,
      documentRoots: roots.map(node => ({ tag: node.tagName, height: node.scrollHeight, clientHeight: node.clientHeight, top: node.scrollTop, overflowY: getComputedStyle(node).overflowY })),
    };
  }, top);
}
async function venueLayout(page) {
  const layout = await page.evaluate(selector => {
    const list = document.querySelector(selector);
    const map = document.querySelector('aside[aria-label="Mapa de los resultados"]');
    const band = document.querySelector('[aria-label="Tu búsqueda de lugares"]');
    const discovery = document.querySelector('[aria-label="Resultados de lugares"]');
    const rect = node => { const value = node.getBoundingClientRect(); return { top: value.top, bottom: value.bottom, left: value.left, width: value.width, height: value.height }; };
    // Transparent sections inherit the surface underneath; compare what is
    // painted rather than requiring one particular CSS ownership technique.
    const surface = node => {
      for (let current = node; current; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
      }
      return "transparent";
    };
    return {
      viewport: innerHeight,
      list: { ...rect(list), scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, display: getComputedStyle(list).display },
      firstCardTop: list.querySelector("article")?.getBoundingClientRect().top,
      map: { ...rect(map), display: getComputedStyle(map).display },
      mapCanvas: rect(map.querySelector('[tabindex="0"]')),
      surfaces: { filters: surface(band), results: surface(discovery), main: surface(discovery.closest("main")) },
    };
  }, venueList);
  return { ...layout, ...await documentScrollState(page) };
}
async function assertListReset(page, label) {
  await page.waitForFunction(selector => document.querySelector(selector)?.scrollTop <= 1, {}, venueList);
  assert.ok((await venueLayout(page)).list.scrollTop <= 1, `${label}: results start at the top`);
}

test("private approved directory works on desktop/mobile, withdraws stale contact and preserves normal login", { timeout: 540000 }, async () => {
  const session = assertEditorFlowSession();
  const folder = path.join(session, "provider-directory-screenshots"); await mkdir(folder, { recursive: true });
  const evidence = { project: contract.LOCAL_PROJECT, viewports: ["1440x1000", "844x390", "390x844"], screenshots: [], blockedRemoteRequests: 0, checks: [], remoteEffects: false };
  const fixture = await createProviderDirectoryFixtures();
  let venue = await fixture.create(venueDraft, { image: true });
  const professional = await fixture.create({ ...photographerDraft, cobertura: ["Berisso", "Ensenada"] });
  const draftImage = await fixture.upload(venue.id, "#7d6b9b");
  venue = await fixture.mutate(venue, "save", { draft: { ...venue.draft, nombre: "DRAFT-NAME-NEVER-PUBLIC", contacto: { ...venue.draft.contacto, email: "pending@example.test" }, imagenes: { portada: draftImage, logo: null, galeria: [draftImage] } } });
  // Enough approved neutral fixtures to exercise the actual UI cursor controls.
  const neutral = (await fixture.db.doc(`proveedores/${venue.id}`).get()).data();
  neutral.aprobada.contenido.imagenes = { portada: null, logo: null, galeria: [] };
  neutral.aprobada.contenido.espacio.capacidadMaxima = 200;
  const batch = fixture.db.batch();
  for (let index = 0; index < 12; index += 1) {
    const id = `000_directory_ui_${String(index).padStart(2, "0")}`; fixture.providerIds.add(id);
    batch.create(fixture.db.doc(`proveedores/${id}`), { ...neutral, aprobada: { ...neutral.aprobada, contenido: { ...neutral.aprobada.contenido, nombre: `Espacio de prueba ${index + 1}` } } });
  }
  const unknownId = "000_directory_ui_unknown"; fixture.providerIds.add(unknownId);
  batch.create(fixture.db.doc(`proveedores/${unknownId}`), { ...neutral, aprobada: { ...neutral.aprobada, contenido: { ...neutral.aprobada.contenido, nombre: "Capacidad desconocida sintética", espacio: { ...neutral.aprobada.contenido.espacio, capacidadMaxima: null } } } });
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
    assert.equal(await visitor.$('form[aria-label="Encontrar un lugar para tu casamiento"]'), null);
    assert.doesNotMatch(await visitor.$eval("body", node => node.textContent), /Jardín Claro|Luz Sur|DIRECTORY-PRIVATE/);
    await visitor.browserContext().close();
    evidence.checks.push("anonymous shell has no provider data");

    const page = await pageFor(desktop); await login(page, operator);
    await page.goto(`${origin}/lugares/`, { waitUntil: "domcontentloaded" }); await contains(page, "El lugar donde empieza"); await ready(page);
    assert.equal(await page.$('[aria-label="Resultados de lugares"]'), null, "Welcome waits for the first search");
    await page.waitForSelector('form[aria-label="Encontrar un lugar para tu casamiento"] input[name="guests"]', { visible: true });
    await field(page, "Cantidad de invitados", "150"); await field(page, "¿Dónde querés celebrar?", "ar", true); await click(page, "Buscar lugares"); await contains(page, "Página 1"); await ready(page);
    assert.equal(await page.$$eval('article h2 a', nodes => nodes.length), 12);
    assert.doesNotMatch(await page.$eval('[aria-label="Resultados de lugares"]', node => node.textContent), /Capacidad desconocida sintética/, "Unknown capacity is excluded by an explicit guest count");
    const desktopBefore = await venueLayout(page);
    assert.ok(desktopBefore.documentHeight <= desktopBefore.viewport + 1, "Desktop results fit the viewport without a second document scrollbar");
    assert.ok(desktopBefore.list.top >= 0 && desktopBefore.list.bottom <= desktopBefore.viewport + 1, "Desktop list stays within the viewport");
    assert.ok(desktopBefore.map.top >= 0 && desktopBefore.map.bottom <= desktopBefore.viewport + 1, "Desktop map stays within the viewport");
    assert.ok(desktopBefore.mapCanvas.height >= 180, "Desktop map retains a usable canvas");
    assert.ok(desktopBefore.list.scrollHeight - desktopBefore.list.clientHeight > 360, "Twelve cards genuinely overflow the independent list");
    assert.notEqual(desktopBefore.surfaces.main, "transparent", "Results have a defined surface");
    assert.equal(desktopBefore.surfaces.filters, desktopBefore.surfaces.main, "Filters continue the main results surface");
    assert.equal(desktopBefore.surfaces.results, desktopBefore.surfaces.main, "Discovery continues the same surface");
    await page.$eval(venueList, node => node.scrollTo({ top: 360, behavior: "instant" }));
    await page.waitForFunction(selector => document.querySelector(selector).scrollTop >= 350, {}, venueList);
    const desktopScrolled = await venueLayout(page);
    assert.ok(desktopBefore.firstCardTop - desktopScrolled.firstCardTop >= 350, "Scrolling the list moves its cards");
    assert.ok(Math.abs(desktopBefore.documentTop - desktopScrolled.documentTop) <= 1, "List scrolling does not scroll the document");
    for (const key of ["top", "bottom", "left", "width", "height"]) assert.ok(Math.abs(desktopBefore.map[key] - desktopScrolled.map[key]) <= 1, `Map ${key} remains fixed while cards scroll`);
    await click(page, "Buscar lugares"); await ready(page);
    assert.equal(await page.$$eval('article h2 a', nodes => nodes.length), 12);
    await assertListReset(page, "Search");
    evidence.layout = { desktop: { before: desktopBefore, scrolled: desktopScrolled } };
    evidence.checks.push("desktop independently scrolls twelve cards with a stationary map and no document overflow", "filters and results share one continuous background", "search resets list scrolling");
    await click(page, "Siguiente"); await contains(page, "Página 2"); await contains(page, venueDraft.nombre); await ready(page);
    assert.equal(await page.$$eval('article h2 a', nodes => nodes.length), 1);
    await assertListReset(page, "Next page");
    await click(page, "Anterior"); await contains(page, "Página 1"); await ready(page);
    await assertListReset(page, "Previous page");
    await field(page, "Nombre o descripción", "jardin claro"); await field(page, "Tipo de lugar", "salones-fiestas", true); await field(page, "Cantidad de invitados", "150"); await field(page, "¿Dónde querés celebrar?", "provincia:AR-B", true);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Buscar lugares", "Search is reachable by keyboard after the region field");
    await page.keyboard.press("Enter"); await contains(page, venueDraft.nombre); await ready(page); await loadedImages(page, 1);
    assert.equal(await page.$$eval('article h2 a', nodes => nodes.length), 1);
    await screenshot(page, "01-venues-desktop.png", 'form[aria-label="Encontrar un lugar para tu casamiento"]');
    await field(page, "Nombre o descripción", "Sin coincidencias"); await click(page, "Buscar lugares"); await contains(page, "Todavía no encontramos ese lugar");
    await screenshot(page, "05-empty.png", 'form[aria-label="Encontrar un lugar para tu casamiento"]');
    await click(page, "Revisar mi búsqueda"); await field(page, "Nombre o descripción", ""); await field(page, "Tipo de lugar", "", true); await field(page, "¿Dónde querés celebrar?", "ar", true); await click(page, "Buscar lugares"); await contains(page, "Espacio de prueba"); await ready(page);
    evidence.checks.push("real pagination forward/back", "approved name/category/Argentina region/guest search", "keyboard tab and enter submit", "unknown capacity is excluded without inventing zero", "empty state and revise search");

    failList = true; await click(page, "Buscar lugares"); await contains(page, "No pudimos cargar el directorio");
    await screenshot(page, "09-retry.png", '[role="alert"]'); failList = false;
    await click(page, "Volver a intentar"); await contains(page, "Página 1"); await ready(page);
    evidence.checks.push("network failure removes results; explicit retry recovers");
    await page.setViewport(landscape);
    await documentScrollState(page, 0);
    const landscapeBefore = await venueLayout(page);
    assert.ok(landscapeBefore.list.clientHeight > 0, "Short landscape viewport does not collapse the results list");
    assert.ok(landscapeBefore.list.scrollHeight <= landscapeBefore.list.clientHeight + 1, "Short landscape viewport does not clip cards in an inner list");
    assert.ok(landscapeBefore.documentHeight > landscapeBefore.viewport + 480, "Short landscape viewport uses document scrolling");
    assert.ok(landscapeBefore.mapCanvas.height >= 180, "Short landscape map retains a useful canvas height");
    assert.notEqual(landscapeBefore.map.display, "none", "Landscape retains the map beside the list");
    await page.$eval(`${venueList} article:last-child h2 a`, node => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await page.waitForFunction(selector => {
      const node = document.querySelector(`${selector} article:last-child h2 a`);
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return node === hit || node.contains(hit);
    }, {}, venueList);
    const landscapeLastCard = await venueLayout(page);
    assert.ok(landscapeLastCard.documentTop - landscapeBefore.documentTop > 360, "The last landscape card is reached by scrolling the document");
    assert.ok(landscapeLastCard.list.scrollTop <= 1, "Landscape navigation does not rely on a clipped inner list");
    evidence.layout.landscape = { before: landscapeBefore, lastCard: landscapeLastCard, lastCardReachable: true };
    evidence.checks.push("short landscape viewport keeps cards reachable with document scrolling and a useful map");
    await page.setViewport(mobile);
    await documentScrollState(page, 0);
    const mobileBefore = await venueLayout(page);
    assert.ok(mobileBefore.documentHeight > mobileBefore.viewport + 480, "Mobile keeps normal document scrolling for the twelve cards");
    assert.ok(mobileBefore.list.scrollHeight <= mobileBefore.list.clientHeight + 1, "Mobile list is not a nested vertical scroller");
    assert.equal(mobileBefore.map.display, "none", "Mobile starts with the list only");
    await documentScrollState(page, 480);
    await page.waitForFunction(() => Math.max(document.scrollingElement?.scrollTop || 0, document.body.scrollTop, document.documentElement.scrollTop) >= 470);
    const mobileScrolled = await venueLayout(page);
    assert.ok(mobileBefore.firstCardTop - mobileScrolled.firstCardTop >= 470, "Document scrolling moves the mobile cards");
    assert.ok(mobileScrolled.list.scrollTop <= 1, "Mobile document scrolling does not use an inner list offset");
    evidence.layout.mobile = { before: mobileBefore, scrolled: mobileScrolled };
    await screenshot(page, "10-venues-mobile.png", 'form[aria-label="Encontrar un lugar para tu casamiento"]');
    await click(page, "Mapa");
    const mobileMap = await venueLayout(page);
    assert.notEqual(mobileMap.map.display, "none", "Map switch reveals the actual map");
    assert.equal(mobileMap.list.display, "none", "Map switch hides the list");
    await screenshot(page, "11-venues-mobile-map.png", 'aside[aria-label="Mapa de los resultados"]');
    await click(page, "Lista");
    const mobileList = await venueLayout(page);
    assert.notEqual(mobileList.list.display, "none", "List switch restores the cards");
    assert.equal(mobileList.map.display, "none", "List switch hides the map");
    await page.setViewport(desktop);
    evidence.checks.push("venue results preserve mobile document scrolling and switch between list/map without horizontal overflow");

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
