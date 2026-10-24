import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  assertEditorFlowSession, contract, createEditorFlowFixtures,
  functionUrl, origin, waitForFixture,
} from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
const desktop = { width: 1280, height: 800, deviceScaleFactor: 1 };
const mobile = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const editedText = "Texto guardado desde la interfaz";

async function clickCardAction(page, title, action, { step, observations, expectedSlug = null, beforeClick = null }) {
  const record = { step, action, clicked: false, eventObserved: false, eventMatchesExpected: false };
  observations.push(record);
  await page.waitForFunction(({ title, action }) => [...document.querySelectorAll("article")].some(card =>
    card.querySelector("h3")?.textContent.trim() === title && [...card.querySelectorAll("button")].some(button => button.textContent.trim() === action && !button.disabled)
  ), {}, { title, action });
  const handle = await page.evaluateHandle(({ title, action }) => {
    const card = [...document.querySelectorAll("article")].find(item => item.querySelector("h3")?.textContent.trim() === title && [...item.querySelectorAll("button")].some(button => button.textContent.trim() === action));
    return [...card.querySelectorAll("button")].find(button => button.textContent.trim() === action && !button.disabled);
  }, { title, action });
  const button = handle.asElement();
  assert.ok(button, "Expected a real visible card action");
  const inspect = () => button.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { pathname: location.pathname, queryKeys: [...new URLSearchParams(location.search).keys()].sort(),
      connected: node.isConnected, disabled: node.disabled, inert: Boolean(node.closest("[inert]")),
      ariaHidden: Boolean(node.closest('[aria-hidden="true"]')),
      loaderPresent: [...document.querySelectorAll('[role="status"]')].some(item => /Preparando tu espacio|Restableciendo la conexi/.test(item.textContent)),
      x, y, width: rect.width, height: rect.height, hitTag: hit?.tagName || null,
      hitsControl: Boolean(hit && (hit === node || node.contains(hit))) };
  });
  let observation;
  try {
    record.initial = await inspect();
    // Home cards mount before their startup loader releases inert. A geometric
    // ElementHandle.click alone can hit that overlay and silently lose the click.
    await page.waitForFunction(node => node.isConnected && !node.disabled && !node.closest('[inert], [aria-hidden="true"]') &&
      ![...document.querySelectorAll('[role="status"]')].some(item => /Preparando tu espacio|Restableciendo la conexi/.test(item.textContent)), {}, button);
    await button.scrollIntoView();
    await page.waitForFunction(async node => {
      if (!node.isConnected || node.disabled || node.closest('[inert], [aria-hidden="true"]')) return false;
      const first = node.getBoundingClientRect();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y), style = getComputedStyle(node);
      return node.isConnected && !node.disabled && !node.closest('[inert], [aria-hidden="true"]') &&
        style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0 &&
        rect.width > 0 && rect.height > 0 && x > 0 && x < innerWidth && y > 0 && y < innerHeight &&
        ["x", "y", "width", "height"].every(key => Math.abs(first[key] - rect[key]) < 0.5) &&
        Boolean(hit && (hit === node || node.contains(hit)));
    }, {}, button);
    record.ready = await inspect();
    assert.equal(record.ready.hitsControl, true, "A card action must receive its physical click");
    if (expectedSlug) {
      // Passive, scoped observation of the existing event. No dispatch, app
      // state writes or persistence bridge; the listener is always removed.
      observation = await page.evaluateHandle(slug => {
        const state = { observed: false, matchesExpected: false };
        const listener = event => { state.observed = true; state.matchesExpected = event.detail?.slug === slug; };
        window.addEventListener("abrir-borrador", listener);
        return { state, stop: () => window.removeEventListener("abrir-borrador", listener) };
      }, expectedSlug);
    }
    if (beforeClick) await beforeClick();
    await page.mouse.click(record.ready.x, record.ready.y);
    record.clicked = true;
    if (observation) {
      await page.waitForFunction(value => value.state.observed, {}, observation);
      const state = await observation.evaluate(value => value.state);
      record.eventObserved = state.observed;
      record.eventMatchesExpected = state.matchesExpected;
      assert.equal(state.matchesExpected, true, "The real draft event must identify the expected owned draft");
      await page.waitForFunction(slug => new URLSearchParams(location.search).get("slug") === slug, {}, expectedSlug);
      record.expectedSlugReached = true;
    }
  } catch (error) {
    try { record.failureState = await inspect(); } catch { record.controlUnavailable = true; }
    if (observation) {
      try {
        const state = await observation.evaluate(value => value.state);
        record.eventObserved = state.observed;
        record.eventMatchesExpected = state.matchesExpected;
      } catch { /* Navigation may have destroyed this read-only observation. */ }
    }
    throw error;
  } finally {
    if (observation) {
      try { await observation.evaluate(value => value.stop()); } catch { /* Context already gone. */ }
      await observation.dispose();
    }
    await handle.dispose();
  }
}

async function waitForEditor(page, textId, expectedText) {
  await page.waitForSelector('.konvajs-content canvas', { visible: true });
  await page.waitForFunction(({ textId, expectedText }) => {
    const object = window.editorSnapshot?.getObjectById?.(textId);
    const node = window._elementRefs?.[textId];
    return object?.texto === expectedText && node?.getStage?.() && node?.isVisible?.();
  }, {}, { textId, expectedText });
  await page.waitForSelector('[aria-label="Volver al dashboard"]', { visible: true });
  await page.waitForFunction(() => !document.querySelector('[data-dashboard-scroll-root="true"][inert]') && ![...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes("Estamos preparando tu invitacion")));
}

async function closeDesktopSidebarThroughUi(page, documentName) {
  const close = await page.$('#sidebar-panel button[title="Cerrar panel"]');
  if (close) {
    try { await close.click(); } finally { await close.dispose(); }
  }
  // The template-card pointer can land over a newly mounted sidebar tab and
  // open its hover panel. Its ordinary outside-click behavior closes it.
  // The document name in CanvasEditorHeader is a read-only label.
  const handle = await page.evaluateHandle(name => [...document.querySelectorAll('[data-dashboard-header="true"] div[title]')]
    .find(node => node.textContent.trim() === name && !node.closest('button, a, input, [role="button"], [contenteditable="true"]')), documentName);
  try {
    const label = handle.asElement();
    assert.ok(label, "Expected the read-only document name in the editor header");
    await label.click();
  } finally { await handle.dispose(); }
  await page.waitForSelector("#sidebar-panel", { hidden: true });
}

async function assertUsableViewport(page, selector) {
  const geometry = await page.$eval(selector, node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth };
  });
  assert.ok(geometry.width > 0 && geometry.height > 0, "Visible UI has nonzero geometry");
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1, "Primary UI fits horizontally");
  assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.viewportHeight + 1, "Primary UI fits vertically");
  assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, "Document has no horizontal overflow");
  return geometry;
}

test("real login, template creation, UI edit, persistence, reopen and private/public isolation", { timeout: 480000 }, async context => {
  const session = assertEditorFlowSession();
  assert.ok(process.env.RESERVA_TEST_CHROME, "Use the launcher's pinned Chromium");
  const puppeteer = require("puppeteer");
  const screenshots = path.join(session, "editor-flow-screenshots");
  await mkdir(screenshots, { recursive: true });
  const evidence = { status: "running", project: contract.LOCAL_PROJECT, origin, checks: [], screenshots: [],
    viewports: [desktop, mobile], blockedRemoteRequests: 0, unexpectedPageErrors: 0, localTransportFailures: [], cardActions: [],
    limitations: [
      "Synthetic verified accounts log in through the actual UI; registration and email delivery are outside this browser journey.",
      "Desktop uses actual canvas pointer/keyboard editing and autosave; mobile verifies login and reopening, not touch editing.",
      "Private legacy HTML uses the authenticated HTTP reader; it is not a modern-editor preview UI.",
      "Published HTML is an existing synthetic publication fixture; publishing, payments, external rendering and live emails remain disabled.",
      "Read-only editor bridges locate canvas geometry and verify hydrated text; no bridge mutates state or triggers persistence.",
      "Remote fonts/assets are blocked; viewport screenshots and geometry checks are not pixel-parity proof for production assets.",
    ] };
  let browser, fixtures, currentPage;
  const contexts = [];
  const pageErrors = [];
  const authTokens = new Map();
  let modernCopyRequests = 0;
  const allowedPorts = new Set(["3100", ...Object.values(contract.EMULATORS).map(String)]);

  async function screenshot(page, filename) {
    await page.screenshot({ path: path.join(screenshots, filename), fullPage: false });
    evidence.screenshots.push(filename);
  }
  async function newPage(label, viewport, { authorizationUrl = null, token = null } = {}) {
    const isolated = await browser.createBrowserContext();
    contexts.push(isolated);
    const page = await isolated.newPage();
    currentPage = page;
    await page.setViewport(viewport);
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (/^(data:|blob:|about:)/.test(url)) { void request.continue(); return; }
      try {
        const local = contract.assertLocalUrl(url);
        assert.ok(allowedPorts.has(local.port));
      } catch {
        evidence.blockedRemoteRequests += 1;
        void request.abort("blockedbyclient");
        return;
      }
      // Keep tokens in memory only. They originate from the application's own
      // successful Auth login, and are sent only to one exact local private URL.
      const authorization = request.headers().authorization;
      if (url.startsWith(`${functionUrl("")}`) && authorization?.startsWith("Bearer ")) authTokens.set(label, authorization.slice(7));
      if (url === functionUrl("copiarPlantilla") && request.method() === "POST") {
        try {
          const payload = JSON.parse(request.postData());
          assert.equal(payload.data.plantillaId, fixtures.templateId);
          fixtures.trackDraft(payload.data.slug, fixtures.users[0].uid);
          modernCopyRequests += 1;
        } catch {
          pageErrors.push({ label, name: "UnexpectedSyntheticCopyPayload" });
          void request.abort("blockedbyclient");
          return;
        }
      }
      if (authorizationUrl && url === authorizationUrl && token) {
        void request.continue({ headers: { ...request.headers(), authorization: `Bearer ${token}` } });
      } else {
        void request.continue();
      }
    });
    page.on("requestfailed", request => {
      // Record transport failures without URL paths, queries, bodies or headers.
      // The bounded evidence is restricted to this journey's local endpoints.
      try {
        const local = contract.assertLocalUrl(request.url());
        if (!allowedPorts.has(local.port) || evidence.localTransportFailures.length >= 40) return;
        const error = request.failure()?.errorText || "";
        evidence.localTransportFailures.push({ label, host: local.hostname, port: local.port,
          error: /^net::ERR_[A-Z0-9_]+$/.test(error) ? error : "UnknownNetworkFailure" });
      } catch { /* Remote URLs are counted separately; never retain their content. */ }
    });
    page.on("pageerror", error => pageErrors.push({ label, name: error.name }));
    page.on("dialog", dialog => { void dialog.dismiss(); });
    return page;
  }
  async function login(page, user, screenshotName) {
    const response = await page.goto(`${origin}/?auth=login`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-security-policy"] || "", /connect-src 'self' http:\/\/127\.0\.0\.1/);
    await page.waitForSelector("#login-email", { visible: true });
    await page.type("#login-email", user.email);
    await page.type("#login-password", user.password);
    await assertUsableViewport(page, '[aria-labelledby="login-modal-title"]');
    if (screenshotName) await screenshot(page, screenshotName);
    await page.click('[aria-labelledby="login-modal-title"] button[type="submit"]');
    await page.waitForFunction(() => location.pathname.replace(/\/$/, "") === "/dashboard");
    await page.waitForFunction(title => [...document.querySelectorAll("article h3")].some(node => node.textContent.trim() === title), {}, fixtures.templateName);
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /Preparando tu espacio|Restableciendo la conexi/.test(node.textContent)));
  }
  async function browserHtml(label, url, token, expectedStatus, marker, filename, viewport = desktop) {
    const page = await newPage(label, viewport, { authorizationUrl: url, token });
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), expectedStatus);
    const body = await page.$eval("body", node => node.textContent);
    if (expectedStatus === 200) assert.ok(body.includes(marker), "Authorized HTML must contain its synthetic marker");
    else assert.ok(!body.includes("SYNTHETIC-PRIVATE-EDITOR-FLOW") && !body.includes("SYNTHETIC-PUBLIC-EDITOR-FLOW"), "Denied HTML must not reveal synthetic content");
    if (url.includes("verInvitacion?")) {
      assert.match(response.headers()["cache-control"] || "", /private/);
      assert.match(response.headers()["cache-control"] || "", /no-store/);
    }
    await screenshot(page, filename);
    await page.browserContext().close();
  }

  try {
    fixtures = await createEditorFlowFixtures();
    browser = await puppeteer.launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true,
      userDataDir: path.join(session, "editor-flow-browser-profile"),
      args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"],
    });
    const [owner, other] = fixtures.users;
    const page = await newPage("owner", desktop);
    await login(page, owner, "01-login-desktop.png");
    assert.ok(authTokens.get("owner"), "Real Auth login must authorize dashboard calls");
    evidence.checks.push("desktop-email-login-and-dashboard");

    await clickCardAction(page, fixtures.templateName, "Usar plantilla", {
      step: "create-desktop", observations: evidence.cardActions,
      beforeClick: () => screenshot(page, "02-dashboard-desktop.png"),
    });
    await page.waitForFunction(() => Boolean(new URLSearchParams(location.search).get("slug")));
    const slug = new URL(page.url()).searchParams.get("slug");
    fixtures.trackDraft(slug, owner.uid);
    const draftRef = fixtures.db.doc(`borradores/${slug}`);
    await waitForEditor(page, fixtures.textId, "Texto inicial sintetico");
    const created = (await draftRef.get()).data();
    assert.equal(created.userId, owner.uid);
    assert.equal(created.plantillaId, fixtures.templateId);
    assert.equal(created.editor, "konva");
    assert.equal(modernCopyRequests, 1);
    await closeDesktopSidebarThroughUi(page, fixtures.templateName);
    await screenshot(page, "03-editor-created-desktop.png");
    evidence.checks.push("template-created-through-dashboard-ui");

    // Observe the existing Konva node only to map its real rendered geometry to
    // pointer coordinates. The mutation is a double click plus keyboard input.
    const point = await page.evaluate(textId => {
      const node = window._elementRefs[textId];
      const stage = node.getStage(), box = node.getClientRect();
      const container = stage.container().getBoundingClientRect();
      const x = container.left + (box.x + box.width / 2) * container.width / stage.width();
      const y = container.top + (box.y + box.height / 2) * container.height / stage.height();
      const hit = document.elementFromPoint(x, y);
      return { x, y, viewportWidth: innerWidth, viewportHeight: innerHeight,
        hitTag: hit?.tagName || null,
        hitsStageCanvas: hit?.tagName === "CANVAS" && stage.container().contains(hit) };
    }, fixtures.textId);
    // Diagnostics retain only geometry and a DOM tag, never document content.
    evidence.canvasPointer = point;
    assert.ok(point.x > 0 && point.x < desktop.width && point.y > 0 && point.y < desktop.height, "Text must be visible for a real pointer edit");
    assert.equal(point.hitsStageCanvas, true, `Text pointer must hit the stage canvas: ${JSON.stringify(point)}`);
    // count emits two real down/up pairs; clickCount alone emits only one pair
    // with a detail value and does not activate Konva's double-click handling.
    await page.mouse.click(point.x, point.y, { count: 2, delay: 100 });
    await page.waitForSelector('[data-inline-editor-content="true"][contenteditable="true"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-inline-editor-content") === "true");
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.type(editedText);
    // Native Tab blurs/commits the inline editor. Do not invoke flush bridges or
    // write Firestore from the test: wait for the application's real autosave.
    await page.keyboard.press("Tab");
    await waitForFixture(async () => {
      const data = (await draftRef.get()).data();
      return data?.objetos?.find(object => object.id === fixtures.textId)?.texto === editedText && data;
    }, "UI content did not reach Firestore through autosave", 60000);
    await page.waitForFunction(() => !document.querySelector('[data-inline-editor-content="true"][contenteditable="true"]'));
    await screenshot(page, "04-editor-saved-desktop.png");
    evidence.checks.push("pointer-keyboard-edit-persisted-by-autosave");

    await page.click('[aria-label="Volver al dashboard"]');
    await page.waitForFunction(() => !new URLSearchParams(location.search).get("slug") && !document.querySelector(".konvajs-content canvas"));
    await clickCardAction(page, fixtures.templateName, "Abrir borrador", { step: "reopen-desktop", observations: evidence.cardActions, expectedSlug: slug });
    await waitForEditor(page, fixtures.textId, editedText);
    assert.equal(new URL(page.url()).searchParams.get("slug"), slug);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page, fixtures.textId, editedText);
    await closeDesktopSidebarThroughUi(page, fixtures.templateName);
    await screenshot(page, "05-editor-reopened-desktop.png");
    evidence.checks.push("own-dashboard-card-and-full-reload-preserve-content");
    await page.browserContext().close();

    const mobilePage = await newPage("owner-mobile", mobile);
    await login(mobilePage, owner, "06-login-mobile.png");
    await clickCardAction(mobilePage, fixtures.templateName, "Abrir borrador", {
      step: "reopen-mobile", observations: evidence.cardActions, expectedSlug: slug,
      beforeClick: () => screenshot(mobilePage, "07-dashboard-mobile.png"),
    });
    await waitForEditor(mobilePage, fixtures.textId, editedText);
    await assertUsableViewport(mobilePage, '[aria-label="Volver al dashboard"]');
    const mobileCanvas = await mobilePage.$eval(".konvajs-content", node => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, left: rect.left, right: rect.right, viewport: innerWidth };
    });
    assert.ok(mobileCanvas.width > 0 && mobileCanvas.left >= -1 && mobileCanvas.right <= mobileCanvas.viewport + 1, "Mobile canvas fits horizontally");
    await screenshot(mobilePage, "08-editor-reopened-mobile.png");
    evidence.checks.push("mobile-email-login-dashboard-and-own-reopen");
    await mobilePage.browserContext().close();

    const otherPage = await newPage("other", desktop);
    await login(otherPage, other);
    await otherPage.goto(`${origin}/dashboard?slug=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
    await otherPage.waitForFunction(() => !new URLSearchParams(location.search).get("slug"));
    await otherPage.waitForFunction(title => [...document.querySelectorAll("article h3")].some(node => node.textContent.trim() === title), {}, fixtures.templateName);
    await otherPage.waitForFunction(() => {
      const root = document.querySelector('[data-dashboard-scroll-root="true"]');
      return root && !root.closest('[inert], [aria-hidden="true"]') &&
        ![...document.querySelectorAll('[role="status"]')].some(node => /Preparando tu espacio|Restableciendo la conexi|Estamos preparando tu invitacion/.test(node.textContent));
    });
    assert.equal(await otherPage.$(".konvajs-content canvas"), null);
    assert.equal(await otherPage.evaluate(text => document.body.textContent.includes(text), editedText), false);
    assert.equal(await otherPage.evaluate(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Abrir borrador")), false);
    const unchanged = (await draftRef.get()).data();
    assert.equal(unchanged.userId, owner.uid);
    assert.equal(unchanged.objetos.find(object => object.id === fixtures.textId).texto, editedText);
    await screenshot(otherPage, "09-other-account-denied.png");
    evidence.checks.push("other-account-deep-link-denied-no-canvas-or-draft-card");
    await otherPage.browserContext().close();

    // The legacy HTTP reader has no current dashboard caller. Exercise its real
    // authenticated contract separately, with a legitimate copy callable first.
    fixtures.trackDraft(fixtures.privateSlug, owner.uid);
    const copy = await fetch(functionUrl("copiarPlantillaHTML"), { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authTokens.get("owner")}` },
      body: JSON.stringify({ data: { plantillaId: fixtures.legacyTemplateId, slug: fixtures.privateSlug } }), signal: AbortSignal.timeout(60000) });
    assert.equal(copy.status, 200);
    assert.equal((await copy.json()).result.slug, fixtures.privateSlug);
    const privateUrl = `${functionUrl("verInvitacion")}?slug=${encodeURIComponent(fixtures.privateSlug)}`;
    await browserHtml("private-owner", privateUrl, authTokens.get("owner"), 200, "SYNTHETIC-PRIVATE-EDITOR-FLOW", "10-private-owner.png");
    await browserHtml("private-anonymous", privateUrl, null, 401, null, "11-private-anonymous-denied.png");
    assert.ok(authTokens.get("other"));
    await browserHtml("private-other", privateUrl, authTokens.get("other"), 403, null, "12-private-other-denied.png");
    evidence.checks.push("private-html-owner-only-and-no-store");
    const publicUrl = `${functionUrl("verInvitacionPublicada")}/i/${fixtures.publicSlug}`;
    await browserHtml("public-desktop", publicUrl, null, 200, "SYNTHETIC-PUBLIC-EDITOR-FLOW", "13-public-desktop.png");
    await browserHtml("public-mobile", publicUrl, null, 200, "SYNTHETIC-PUBLIC-EDITOR-FLOW", "14-public-mobile.png", mobile);
    await fixtures.db.doc(`publicadas/${fixtures.publicSlug}`).update({ estado: "publicada_pausada" });
    await browserHtml("public-paused", publicUrl, null, 404, null, "15-public-paused.png");
    evidence.checks.push("published-html-anonymous-desktop-mobile-and-paused-denied");
    evidence.unexpectedPageErrors = pageErrors.length;
    evidence.modernCopyRequests = modernCopyRequests;
    assert.deepEqual(pageErrors, [], "Browser journey must have no uncaught page errors");
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = { name: error.name, completedChecks: evidence.checks.length };
    // Screenshots contain only this session's synthetic fixtures. Never retain
    // headers, tokens, Auth storage, browser profile, or a whole HAR/DOM dump.
    if (currentPage && !currentPage.isClosed()) {
      try { await screenshot(currentPage, "failure.png"); } catch { /* Keep original failure. */ }
    }
    throw error;
  } finally {
    authTokens.clear();
    const closed = await Promise.allSettled(contexts.filter(item => !item.closed).map(item => item.close()));
    const remaining = await Promise.allSettled([
      ...(browser ? [browser.close()] : []),
      ...(fixtures ? [fixtures.cleanup()] : []),
    ]);
    const rejected = [...closed, ...remaining].filter(result => result.status === "rejected").length;
    evidence.cleanup = { status: rejected ? "failed" : "passed", browserClosed: !browser || !browser.connected, rejected };
    if (rejected) evidence.status = "failed";
    evidence.unexpectedPageErrors = pageErrors.length;
    await writeFile(path.join(session, "editor-flow-evidence.json"), JSON.stringify(evidence, null, 2));
    context.diagnostic(`Editor journey: ${evidence.checks.length} checks, ${evidence.screenshots.length} synthetic screenshots; ${evidence.status}`);
    assert.equal(rejected, 0, "Browser or synthetic fixture cleanup failed");
  }
});
