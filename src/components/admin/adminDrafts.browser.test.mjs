import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const puppeteer = require("puppeteer");
const webpackPackage = require("next/dist/compiled/webpack/webpack");
webpackPackage.init();
const { webpack } = webpackPackage;
const origin = "https://admin-drafts-fixture.invalid";

// Real directory, template cards, dialog and edit controls; all authentication,
// catalog and callable I/O is synthetic. Browser requests are locally fulfilled
// or blocked, so this verifies responsive UI without contacting Firebase.
async function compileFixture(output) {
  const write = (name, source) => {
    const filename = path.join(output, name);
    writeFileSync(filename, source);
    return filename;
  };
  const fixture = write("fixture.js", `
export const functions={};
const user={uid:'owner-synthetic',email:'invitado@example.invalid',nombre:'Persona',apellido:'de prueba',profileComplete:true};
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#f7f1eb"/><rect x="38" y="38" width="244" height="244" rx="110" fill="#e1e9d6"/><text x="160" y="155" text-anchor="middle" fill="#536144" font-size="23" font-family="serif">Magnolia</text><text x="160" y="185" text-anchor="middle" fill="#536144" font-size="14" font-family="serif">Nuestra boda</text></svg>');
let drafts=[];
window.adminDraftFixture={copies:[],failNext:true,details:0};
export function httpsCallable(_,name){return async input=>{
 if(name==='getUsersStats')return {data:{totalUsers:1,totalSuperAdmins:1}};
 if(name==='listUsersDirectory')return {data:{items:[{...user,metrics:{drafts:drafts.length}}]}};
 if(name==='getUserDirectoryDetail'){window.adminDraftFixture.details++;return {data:{user:{...user,metrics:{drafts:drafts.length}},metrics:{drafts:drafts.length},drafts,publications:[]}};}
 throw new Error('Unexpected callable '+name);
};}
export function useDashboardHomeTemplates(){return {templates:[{id:'magnolia-synthetic',nombre:'Magnolia',portada:image},{id:'lumiere-synthetic',nombre:'Lumière',portada:image}],loading:false,error:''};}
export const buildDraftSlug=()=> 'new-synthetic-draft';
export async function createDraftFromTemplate(input){
 window.adminDraftFixture.copies.push(input);
 if(window.adminDraftFixture.failNext){window.adminDraftFixture.failNext=false;throw new Error('No se pudo confirmar la creación. Reintentá.');}
 drafts=[{slug:input.requestedSlug,nombre:'Nueva invitación',canOpenCanvas:true,lastUpdatedAt:'2026-10-25T15:00:00Z'}];
 return {slug:input.requestedSlug};
}
`);
  const aliases = {};
  for (const request of ["@/firebase", "firebase/functions", "@/hooks/useDashboardHomeTemplates", "@/domain/templates/service"]) {
    aliases[`${request}$`] = fixture;
  }
  aliases["@"] = path.join(root, "src");
  const entry = write("entry.jsx", `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import UsersDirectoryManager from '@/components/admin/UsersDirectoryManager';
import AdminDraftEditingControls from '@/components/admin/AdminDraftEditingControls';
function App(){const [editing,setEditing]=useState(false);const [error,setError]=useState('');return <>
 <UsersDirectoryManager/>
 <section data-controls><AdminDraftEditingControls editing={editing} error={error} onToggle={()=>setEditing(!editing)} onReload={()=>{setEditing(false);setError('');}}/>
 <button data-conflict onClick={()=>setError('El propietario guardó cambios recientes. Recargá el borrador.')}>Simular conflicto</button></section>
</>;}
createRoot(document.getElementById('root')).render(<App/>);`);
  const loader = write("loader.cjs", `const ts=require(${JSON.stringify(path.join(root, "functions/node_modules/typescript"))});
module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "production", target: "web", entry, output: { path: output, filename: "bundle.js" },
      cache: false, devtool: false, optimization: { minimize: false }, resolve: { extensions: [".js", ".jsx"], alias: aliases },
      module: { rules: [{ test: /\.jsx?$/, exclude: /node_modules/, use: [loader] }] } });
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  });
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const css = await postcss([tailwind({ content: [
    path.join(root, "src/components/admin/UsersDirectoryManager.jsx"),
    path.join(root, "src/components/admin/CreateUserDraftModal.jsx"),
    path.join(root, "src/components/admin/AdminDraftEditingControls.jsx"),
    path.join(root, "src/components/templates/TemplateCardShell.jsx"),
    path.join(root, "src/components/dashboard/dashboardStyleClasses.js"),
  ] })]).process("@tailwind base;@tailwind components;@tailwind utilities;body{font-family:Arial,sans-serif;background:#f8fafc}", { from: undefined });
  write("fixture.css", css.css);
}

async function clickText(page, text, scope = "body") {
  const handle = await page.evaluateHandle((label, selector) => [...document.querySelectorAll(`${selector} button`)]
    .find(button => button.textContent.trim() === label), text, scope);
  assert.ok(handle.asElement(), `Missing button ${text}`);
  await handle.asElement().click();
  await handle.dispose();
}

test("administrative draft creation and mode controls work at desktop and mobile sizes", { timeout: 120000 }, async () => {
  const output = mkdtempSync(path.join(root, ".local-isolation/admin-drafts-ui-"));
  console.log(`Compiling offline administrative UI: ${output}`);
  await compileFixture(output);
  const revisions = require("puppeteer-core/lib/cjs/puppeteer/revisions.js").PUPPETEER_REVISIONS;
  const browsers = require(require.resolve("@puppeteer/browsers", { paths: [path.join(root, "node_modules/puppeteer")] }));
  const executablePath = process.env.ADMIN_DRAFT_UI_BROWSER_PATH || browsers.computeExecutablePath({ cacheDir: path.join(root, ".local-isolation/tool-cache/browser"), browser: browsers.Browser.CHROME, buildId: revisions.chrome });
  const browser = await puppeteer.launch({ headless: true, executablePath, pipe: true, protocolTimeout: 15000,
    userDataDir: path.join(output, "browser"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  const errors = [], blockedRequests = [], scenarios = [];
  console.log("Offline Chromium started");
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844, isMobile: true }]) {
      const [page] = await browser.pages();
      console.log(`Checking ${viewport.width}px: using isolated profile's initial page`);
      console.log("Fixture page created");
      await page.setViewport(viewport);
      await page.setRequestInterception(true);
      page.on("pageerror", error => { errors.push(error.message); console.log(error.message); });
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.protocol === "data:") return request.continue();
        if (url.origin !== origin) { blockedRequests.push(url.href); return request.abort(); }
        if (url.pathname.endsWith(".js")) return request.respond({ status: 200, contentType: "application/javascript", body: readFileSync(path.join(output, path.basename(url.pathname)), "utf8") });
        if (url.pathname === "/fixture.css") return request.respond({ status: 200, contentType: "text/css", body: readFileSync(path.join(output, "fixture.css"), "utf8") });
        return request.respond({ status: 200, contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/bundle.js"></script>' });
      });
      await page.goto(origin, { waitUntil: "load" });
      console.log("Fixture page loaded");
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Ver detalle"));
      await clickText(page, "Ver detalle");
      await page.waitForFunction(() => document.body.textContent.includes("No hay borradores para mostrar."));
      await clickText(page, "Crear borrador");
      console.log("Template selector opened");
      await page.waitForSelector("dialog[open]", { visible: true });
      assert.equal(await page.$eval("dialog", dialog => dialog.matches(":modal")), true);
      await page.click('dialog button[aria-label="Abrir plantilla Magnolia"]');
      assert.equal(await page.$eval("dialog", dialog => dialog.scrollWidth <= dialog.clientWidth), true);
      await page.screenshot({ path: path.join(output, `${viewport.width}-template-selection.png`) });
      await clickText(page, "Crear borrador", "dialog");
      await page.waitForSelector('dialog [role="alert"]');
      await clickText(page, "Crear borrador", "dialog");
      await page.waitForFunction(() => !document.querySelector("dialog") && document.body.textContent.includes("Nueva invitación"));
      const calls = await page.evaluate(() => window.adminDraftFixture.copies);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].ownerUid, "owner-synthetic");
      assert.deepEqual(calls[0], calls[1]);
      const links = await page.$$eval('a[href*="slug="]', items => items.map(link => link.href));
      assert.equal(links.length, 2);
      for (const href of links) {
        assert.equal(new URL(href).searchParams.get("adminView"), "1");
        assert.equal(new URL(href).searchParams.get("ownerUid"), "owner-synthetic");
      }
      await page.screenshot({ path: path.join(output, `${viewport.width}-draft-created.png`) });
      await clickText(page, "Editar borrador", "[data-controls]");
      await page.waitForFunction(() => document.querySelector("[data-controls]").textContent.includes("se conserva el propietario"));
      await page.click("[data-conflict]");
      await page.waitForSelector('[data-controls] [role="alert"]');
      await page.screenshot({ path: path.join(output, `${viewport.width}-editing-conflict.png`) });
      await clickText(page, "Recargar borrador", "[data-controls]");
      await page.waitForFunction(() => document.querySelector("[data-controls]").textContent.includes("solo lectura"));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      scenarios.push({ width: viewport.width, templateSelected: true, creationRetriedWithSameId: true, listRefreshed: true, defaultReadOnlyLinks: true, editAndReload: true, horizontalOverflow: false });
      page.removeAllListeners("request");
      page.removeAllListeners("pageerror");
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ scenarios, errors, blockedRequests, externalRequestsDelivered: 0 }, null, 2));
    console.log(`Offline administrative draft UI evidence: ${output}`);
  } finally { await browser.close(); }
});
