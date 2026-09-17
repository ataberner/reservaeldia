import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");

// A freshly installed workspace has no Next/browser caches. The 5A cold run
// exceeded 150s while compiling; this remains bounded and does not retry tests.
test("desktop/mobile browser runs local Next and CSP blocks remote effects and assets", { timeout: 300000 }, async (context) => {
  assert.ok(process.env.RESERVA_TEST_CHROME, "Falta Chromium instalado para la prueba de navegador.");
  const browser = await puppeteer.launch({ executablePath: process.env.RESERVA_TEST_CHROME, headless: true,
    userDataDir: path.join(process.env.RESERVA_LOCAL_SESSION, "browser-profile"),
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"],
  });
  context.after(() => browser.close());
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const failures = [];
  cdp.on("Network.loadingFailed", (event) => { if (event.blockedReason === "csp") failures.push(event.blockedReason); });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let response;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { response = await page.goto("http://localhost:3100", { waitUntil: "domcontentloaded", timeout: 5000 }); if (response.status() === 200) break; }
    catch { /* startup/compilation only; all navigation stays on loopback */ }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  assert.equal(response?.status(), 200);
  assert.match(response.headers()["content-security-policy"], /connect-src 'self' http:\/\/127.0.0.1/);
  await page.waitForFunction(() => document.querySelector("#__next")?.children.length > 0);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844, isMobile: true }]) {
    await page.setViewport(viewport);
    const blocked = await page.evaluate(async () => {
      const result = {};
      try { await fetch("https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit", { method: "POST", body: "synthetic-must-never-leave" }); result.fetch = false; }
      catch { result.fetch = true; }
      result.asset = await new Promise((resolve) => { const img = new Image(); img.onerror = () => resolve(true); img.onload = () => resolve(false); img.src = "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/synthetic-must-never-request?alt=media"; });
      return result;
    });
    assert.deepEqual(blocked, { fetch: true, asset: true });
  }
  assert.ok(failures.length >= 4, "CDP debe confirmar bloqueo CSP previo al transporte.");
  assert.deepEqual(errors.filter((message) => /Firebase.*(incompatible|requiere|unknown)|connect.*emulator/i.test(message)), []);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="status"]');
  await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "browser-evidence.json"), JSON.stringify({ nextStatus: response.status(), viewports: ["1280x800", "390x844"], cspBlockedRequests: failures.length, firebaseInitializationErrors: 0, limitation: "CSP covers application requests and embedded assets; not an OS firewall or browser-wide traffic guarantee" }, null, 2));
});
