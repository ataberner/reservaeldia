import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const puppeteer = require("puppeteer");
const webpackPackage = require("next/dist/compiled/webpack/webpack");
webpackPackage.init();
const { webpack } = webpackPackage;
const origin = "https://landing-template-transition.invalid";

// Executes the actual dashboard page, pending-selection storage, startup hook,
// home loader/CSS and profile form. Auth, data, editor and routing I/O are doubles;
// every browser request is fulfilled locally or blocked. No Firebase is loaded.
// Requires the pinned Chromium cache prepared by npm run local:prepare.
async function compileFixture(output) {
  const write = (name, source) => {
    const filename = path.join(output, name);
    writeFileSync(filename, source);
    return filename;
  };
  const fixture = write("fixture.jsx", `
import React, {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import EditorStartupLoader from '@/components/editor/EditorStartupLoader';
const scenario = new URLSearchParams(location.search).get('scenario');
let state = {admin: true, profile: scenario === 'profile', slug: null, editorReady: false};
const subscribers = new Set();
const change = patch => {state = {...state, ...patch}; subscribers.forEach(callback => callback());};
const subscribe = callback => {subscribers.add(callback); return () => subscribers.delete(callback);};
const snapshot = () => state;
const useFixture = () => useSyncExternalStore(subscribe, snapshot);
let finishOpening;
window.transitionFixture = {calls: [], homeReady: false, change,
  finish: successful => {if(successful) change({slug: 'synthetic-draft'}); finishOpening?.(successful ? 'synthetic-draft' : null);}};
const noop = () => {};
const router = {isReady: true, query: {}, replace: async () => true};
const user = {uid: 'synthetic-user', email: 'synthetic@example.test', emailVerified: true};
export const useRouter = () => router;
export function useDashboardAuthGate() {const current = useFixture(); return {usuario:user, checkingAuth:false,
  showProfileCompletion:current.profile, profileInitialValues:{nombre:'Persona',apellido:'Local',fechaNacimiento:'1990-01-01'},
  handleCompleteProfile:async () => change({profile:false}), authRecoveryState:'idle', startupRecoveryGeneration:0};}
export function useAdminAccess() {return {loadingAdminAccess:useFixture().admin,isSuperAdmin:false,canManageSite:false,adminRecoveryState:'idle'};}
export function useDashboardEditorRoute() {const current=useFixture(); return {slugInvitacion:current.slug,
  setSlugInvitacion:noop,modoEditor:'konva',setModoEditor:noop,vista:'home',setVista:noop,setLegacyDraftNotice:noop,
  hasSyncedEditorRoute:true,isResolvingEditorRoute:false,requestedRouteSlug:null,abrirBorradorEnEditor:noop};}
export function useDashboardTemplateModal() {
  const openTemplateEditorFromTemplateId=useCallback(id=>{window.transitionFixture.calls.push(id);return new Promise(resolve=>{finishOpening=resolve;});},[]);
  return {openTemplateModal:noop,openTemplateEditorFromTemplateId,templatePreviewModalProps:{visible:false}};
}
export const useDashboardEditorIssues = () => ({});
export const useDashboardPreviewController = () => ({});
export const useUserUiPreferences = () => ({loaded:true,preferences:{}});
export const useDashboardEditorCanvasLayout = () => ({sidebarInsetLeft:0,sidebarPaddingRight:0,sidebarTransitionMs:0});
export const pushEditorBreadcrumb = noop;
export const applyDefaultEditorConsoleDebugFlags = noop;
export const GOOGLE_FONTS = [];
export const fontManager = {loadFonts:async () => ({loaded:[],failed:[]})};
export const readEditorSessionDocument = async () => ({exists:true,data:{objetos:[],secciones:[]}});
export const handleDashboardStartupError = () => ({});
export function DashboardHomeView({onReadyChange}) {
  useEffect(()=>{const frame=requestAnimationFrame(()=>{onReadyChange(true);window.transitionFixture.homeReady=true;});return()=>cancelAnimationFrame(frame);},[onReadyChange]);
  return <button data-home-action onClick={()=>{window.transitionFixture.homeClicks=(window.transitionFixture.homeClicks||0)+1;}}>Crear invitación</button>;
}
export function DashboardLayout({children,showEditorStartupLoader,shouldRenderEditorStartupLoader,editorPreloadState,editorRuntimeState}) {
  return <div data-dashboard-layout>{(showEditorStartupLoader||shouldRenderEditorStartupLoader)&&<div data-editor-loader><EditorStartupLoader preloadState={editorPreloadState} runtimeState={editorRuntimeState}/></div>}{children}</div>;
}
export function Canvas({slug,onStartupStatusChange}) {
  const current=useFixture();
  useEffect(()=>{if(current.editorReady)onStartupStatusChange({slug,status:'ready'});},[current.editorReady,slug,onStartupStatusChange]);
  return <div data-canvas>Editor del borrador</div>;
}
export const Empty = () => null;
export const Boundary = ({children}) => children;
export const dynamic = () => Canvas;
`);
  const aliases = {};
  const namedModules = [
    "next/router", "@/hooks/useAdminAccess", "@/hooks/useDashboardAuthGate",
    "@/hooks/useDashboardEditorIssues", "@/hooks/useDashboardEditorRoute",
    "@/hooks/useDashboardPreviewController", "@/hooks/useDashboardTemplateModal",
    "@/hooks/useUserUiPreferences", "@/lib/monitoring/editorIssueReporter",
    "@/lib/monitoring/editorConsoleDebugFlags", "@/config/fonts", "@/utils/fontManager",
    "@/components/editor/persistence/editorSessionPersistence", "@/domain/dashboard/startupRecovery",
  ];
  for (const request of namedModules) aliases[`${request}$`] = fixture;
  const defaults = {
    "next/dynamic": "dynamic",
    "../components/DashboardLayout": "DashboardLayout",
    "@/components/dashboard/home/DashboardHomeView": "DashboardHomeView",
    "@/hooks/useDashboardEditorCanvasLayout": "useDashboardEditorCanvasLayout",
    "@/components/ChunkErrorBoundary": "Boundary",
    "@/components/editor/diagnostics/EditorIssueBanner": "Empty",
    "@/components/dashboard/BrowserStorageRecoveryBanner": "Empty",
    "@/components/CanvasEditor": "Empty",
    "@/components/DashboardTrashSection": "Empty",
    "@/components/PublicadasGrid": "Empty",
    "@/components/admin/SiteManagementBoard": "Empty",
    "@/components/ModalVistaPrevia": "Empty",
    "@/components/TemplatePreviewModal": "Empty",
    "@/components/payments/PublicationCheckoutModal": "Empty",
  };
  for (const [request, symbol] of Object.entries(defaults)) {
    aliases[`${request}$`] = write(`default-${symbol}-${Object.keys(aliases).length}.js`, `export {${symbol} as default} from './fixture.jsx';`);
  }
  aliases["@"] = path.join(root, "src");
  const loader = write("loader.cjs", `const ts=require(${JSON.stringify(path.join(root, "functions/node_modules/typescript"))});
module.exports=function(source){
 if(this.resourcePath.endsWith('.css')){
  const names=[...source.matchAll(/\\.([A-Za-z][\\w-]*)/g)].map(match=>match[1]);
  return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);export default '+JSON.stringify(Object.fromEntries(names.map(name=>[name,name])))+';';
 }
 return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
};`);
  const entry = write("entry.jsx", `import React from 'react';import {createRoot} from 'react-dom/client';
import Dashboard from '@/pages/dashboard';
import {savePendingLandingTemplateSelection} from '@/domain/templates/pendingLandingTemplateSelection';
import ${JSON.stringify(path.join(root, "styles/styles.css"))};
if(new URLSearchParams(location.search).get('scenario')!=='none')savePendingLandingTemplateSelection('synthetic-template');
createRoot(document.getElementById('root')).render(<Dashboard/>);`);
  await new Promise((resolve, reject) => {
    const compiler = webpack({mode:"production",target:"web",entry,output:{path:output,filename:"bundle.js"},
      cache:false,devtool:false,optimization:{minimize:false},resolve:{extensions:[".js",".jsx"],alias:aliases},
      module:{rules:[{test:/\.(jsx?|css)$/,exclude:/node_modules/,use:[loader]}]}});
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({all:false,errors:true})));
      else resolve();
    }));
  });
}

async function assertLoading(page) {
  const actual = await page.evaluate(() => {
    const loader = document.querySelector('[role="status"]');
    const home = document.querySelector('[data-home-action]');
    const rect = loader?.getBoundingClientRect();
    return {message:loader?.textContent.trim(),opacity:loader && getComputedStyle(loader).opacity,
      covers:rect?.width >= innerWidth && rect?.height >= innerHeight,
      inert:Boolean(home?.closest('[inert]')),hidden:Boolean(home?.closest('[aria-hidden="true"]')),
      horizontalOverflow:document.documentElement.scrollWidth > innerWidth};
  });
  assert.equal(actual.message, "Preparando tu espacio...");
  assert.equal(actual.opacity, "1");
  assert.equal(actual.covers, true);
  assert.equal(actual.inert, true);
  assert.equal(actual.hidden, true);
  assert.equal(actual.horizontalOverflow, false);
}

test("landing template handoff keeps the existing loader until editor or recoverable outcome", {timeout:120000}, async () => {
  const output = mkdtempSync(path.join(root, ".local-isolation/landing-template-transition-"));
  console.log(`Compiling offline dashboard fixture: ${output}`);
  await compileFixture(output);
  const revisions = require("puppeteer-core/lib/cjs/puppeteer/revisions.js").PUPPETEER_REVISIONS;
  const browsers = require(require.resolve("@puppeteer/browsers", {paths:[path.join(root,"node_modules/puppeteer")]}));
  const executablePath = browsers.computeExecutablePath({cacheDir:path.join(root,".local-isolation/tool-cache/browser"),browser:browsers.Browser.CHROME,buildId:revisions.chrome});
  const browser = await puppeteer.launch({headless:true,executablePath,pipe:true,waitForInitialPage:false,protocolTimeout:15000,userDataDir:path.join(output,"browser"),
    args:["--disable-background-networking","--disable-component-update","--disable-sync","--no-first-run","--no-proxy-server","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"]});
  const errors = [], scenarios = [], blockedRequests = [];
  console.log("Offline Chromium started");
  try {
    for (const viewport of [{width:1280,height:800},{width:390,height:844,isMobile:true}]) {
      for (const scenario of ["success","error","none","profile"]) {
        console.log(`Checking ${viewport.width}px ${scenario}`);
        const context = await browser.createBrowserContext();
        console.log("Created isolated browser context");
        const page = await context.newPage();
        console.log("Created fixture page");
        await page.setViewport(viewport);
        await page.setRequestInterception(true);
        page.on("pageerror", error => {errors.push(error.message);console.log(`Browser exception: ${error.message}`);});
        page.on("request", request => {
          const url = new URL(request.url());
          if (url.origin !== origin) {blockedRequests.push(url.href);return request.abort();}
          if (url.pathname.endsWith(".js")) {
            const filename = path.basename(url.pathname);
            return request.respond({status:200,contentType:"application/javascript",body:readFileSync(path.join(output,filename),"utf8")});
          }
          return request.respond({status:200,contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>'});
        });
        await page.goto(`${origin}/?scenario=${scenario}`, {waitUntil:"load"});
        await page.waitForFunction(() => window.transitionFixture?.homeReady);
        if (scenario === "none") {
          await page.waitForFunction(() => !document.querySelector('[role="status"]'));
          await page.click('[data-home-action]');
          assert.equal(await page.evaluate(() => window.transitionFixture.homeClicks), 1);
          assert.deepEqual(await page.evaluate(() => window.transitionFixture.calls), []);
        } else if (scenario === "profile") {
          await page.waitForSelector("#profile-nombre", {visible:true});
          await page.click("#profile-nombre");
          assert.equal(await page.evaluate(() => document.activeElement.id), "profile-nombre");
          assert.equal(await page.$eval("#profile-nombre", node => Boolean(node.closest('[inert]'))), false);
          assert.deepEqual(await page.evaluate(() => window.transitionFixture.calls), []);
          await page.screenshot({path:path.join(output,`${viewport.width}-profile.png`)});
          await page.evaluate(() => window.transitionFixture.change({profile:false}));
          await page.waitForFunction(() => !document.querySelector("#profile-nombre"));
          await assertLoading(page);
        } else {
          await assertLoading(page);
          assert.deepEqual(await page.evaluate(() => window.transitionFixture.calls), []);
          await page.evaluate(() => window.transitionFixture.change({admin:false}));
          await page.waitForFunction(() => window.transitionFixture.calls.length === 1);
          await assertLoading(page);
          await page.screenshot({path:path.join(output,`${viewport.width}-${scenario}-opening.png`)});
          await page.evaluate(successful => window.transitionFixture.finish(successful), scenario === "success");
          if (scenario === "success") {
            await page.waitForSelector("[data-editor-loader]");
            assert.equal(await page.$('[role="status"]'), null);
            assert.equal(await page.$('[data-home-action]'), null);
            await page.evaluate(() => window.transitionFixture.change({editorReady:true}));
            await page.waitForFunction(() => !document.querySelector('[data-editor-loader]'));
            await page.waitForSelector("[data-canvas]", {visible:true});
          } else {
            await page.waitForFunction(() => !document.querySelector('[role="status"]'));
            await page.click('[data-home-action]');
            assert.equal(await page.evaluate(() => window.transitionFixture.homeClicks), 1);
          }
          assert.deepEqual(await page.evaluate(() => window.transitionFixture.calls), ["synthetic-template"]);
        }
        scenarios.push({width:viewport.width,scenario});
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output,"evidence.json"), JSON.stringify({scenarios,errors,blockedRequests,externalRequestsDelivered:0},null,2));
    console.log(`Offline handoff browser evidence: ${output}`);
  } finally {
    await browser.close();
  }
});
