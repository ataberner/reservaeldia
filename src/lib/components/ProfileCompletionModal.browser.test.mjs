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
const origin = "https://profile-fixture.invalid";

async function compileFixture(output) {
  const write = (name, source) => {
    const filename = path.join(output, name);
    writeFileSync(filename, source);
    return filename;
  };
  const entry = write("entry.jsx", `
import React from 'react';
import {createRoot} from 'react-dom/client';
import ProfileCompletionModal from ${JSON.stringify(path.join(root, "src/lib/components/ProfileCompletionModal.js"))};
const initialValues={nombre:'Sofía',apellido:'Martínez',fechaNacimiento:'1996-06-15'};
window.submissions=[];
createRoot(document.getElementById('root')).render(<ProfileCompletionModal initialValues={initialValues}
 onSubmit={async payload=>{window.submissions.push(payload);if(window.rejectSubmit)throw Error('Error de prueba: intentá nuevamente.');}} />);
`);
  const jsLoader = write("js-loader.cjs", `const ts=require(${JSON.stringify(path.join(root, "functions/node_modules/typescript"))});
module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const cssLoader = write("css-loader.cjs", `module.exports=source=>{const names={};source.replace(/\\.([a-zA-Z_][\\w-]*)/g,(_,name)=>{names[name]='profile_'+name;});return 'export default '+JSON.stringify(names);};`);
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "production", target: "web", entry,
      output: { path: output, filename: "bundle.js" }, cache: false, devtool: false,
      optimization: { minimize: false }, resolve: { extensions: [".js", ".jsx", ".cjs"] },
      module: { rules: [
        { test: /\.jsx?$/, exclude: /node_modules/, use: [jsLoader] },
        { test: /\.module\.css$/, use: [cssLoader] },
      ] } });
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  });
  const profileCss = readFileSync(path.join(root, "src/lib/components/ProfileCompletionModal.module.css"), "utf8")
    .replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => ".profile_" + name);
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const globalCss = await postcss([tailwind({content: [path.join(root, "src/lib/components/ProfileCompletionModal.js")]})]).process(
    readFileSync(path.join(root, "styles/globals.css"), "utf8"), {from: undefined});
  write("fixture.css", globalCss.css + "\n" + readFileSync(path.join(root, "styles/styles.css"), "utf8") + "\n" + profileCss);
}

test("profile completion supports optional assistance, validation, retries and mobile layout", { timeout: 180000 }, async () => {
  const output = mkdtempSync(path.join(root, ".local-isolation/profile-ui-"));
  console.log("Offline UI evidence: " + output);
  await compileFixture(output);
  const revisions = require("puppeteer-core/lib/cjs/puppeteer/revisions.js").PUPPETEER_REVISIONS;
  const browsers = require(require.resolve("@puppeteer/browsers", { paths: [path.join(root, "node_modules/puppeteer")] }));
  const executablePath = browsers.computeExecutablePath({cacheDir: path.join(root, ".local-isolation/tool-cache/browser"),
    browser: browsers.Browser.CHROME, buildId: revisions.chrome});
  const browser = await puppeteer.launch({ headless: true, executablePath, pipe: true,
    userDataDir: path.join(output, "browser"), args: ["--disable-background-networking", "--disable-component-update",
      "--disable-sync", "--no-first-run", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  const errors = [], blocked = [];
  try {
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}, {width:320,height:640}]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      page.on("pageerror", error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.origin !== origin) { blocked.push(request.url()); return request.abort(); }
        if (url.pathname === "/") return request.respond({status:200,contentType:"text/html",
          body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:#fbf7f9"><div id="root"></div><script src="/bundle.js"></script></body></html>'});
        const file = {"/bundle.js":"bundle.js","/fixture.css":"fixture.css"}[url.pathname];
        if (!file) return request.respond({status:404,body:""});
        return request.respond({status:200,contentType:file.endsWith(".js")?"text/javascript":"text/css",body:readFileSync(path.join(output,file))});
      });
      await page.goto(origin, {waitUntil:"networkidle0"});
      await page.waitForSelector('[role="dialog"]');
      const text = await page.$eval('[role="dialog"]', element=>element.textContent);
      assert.match(text,/sin costo adicional/);
      assert.match(text,/tenés todas las herramientas disponibles en el editor/);
      assert.doesNotMatch(text,/Si no dejás tu número/);
      assert.equal(await page.$eval("#profile-assistance", element=>element.checked),false);
      assert.equal(await page.$("#profile-whatsapp"),null);
      await page.click('button[type="submit"]');
      await page.waitForFunction("window.submissions.length===1");
      assert.deepEqual(await page.evaluate(()=>window.submissions[0].designAssistance),{requested:false,whatsapp:null});
      await page.click("#profile-assistance");
      await page.waitForSelector("#profile-whatsapp");
      assert.equal(await page.$eval("#profile-whatsapp", element=>element.required),false);
      await page.screenshot({path:path.join(output,"modal-"+viewport.width+".png"),fullPage:true});
      const layout = await page.$eval('[role="dialog"]', element=>({
        width:element.clientWidth,scrollWidth:element.scrollWidth,
        left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,
      }));
      assert.ok(layout.scrollWidth<=layout.width+1,"dialog must not overflow horizontally");
      assert.ok(layout.left>=0 && layout.right<=viewport.width,"dialog must fit the viewport");
      await page.click('button[type="submit"]');
      await page.waitForFunction("window.submissions.length===2");
      assert.deepEqual(await page.evaluate(()=>window.submissions[1].designAssistance),{requested:true,whatsapp:null});
      await page.type("#profile-whatsapp","bad");
      await page.click('button[type="submit"]');
      await page.waitForSelector("#profile-whatsapp-error");
      assert.equal(await page.evaluate(()=>window.submissions.length),2);
      await page.click("#profile-whatsapp",{clickCount:3});
      await page.type("#profile-whatsapp","+54 9 11 1234 5678");
      await page.click('button[type="submit"]');
      await page.waitForFunction("window.submissions.length===3");
      assert.deepEqual(await page.evaluate(()=>window.submissions[2].designAssistance),{requested:true,whatsapp:"+5491112345678"});
      await page.click("#profile-assistance");
      await page.click('button[type="submit"]');
      await page.waitForFunction("window.submissions.length===4");
      assert.deepEqual(await page.evaluate(()=>window.submissions[3].designAssistance),{requested:false,whatsapp:null});
      await page.evaluate(()=>{window.rejectSubmit=true;});
      await page.click('button[type="submit"]');
      await page.waitForSelector('[role="alert"]');
      assert.equal(await page.$eval('button[type="submit"]', element=>element.disabled),false);
      assert.equal(await page.$eval("#profile-nombre", element=>element.value),"Sofía");
      await page.evaluate(()=>{window.rejectSubmit=false;});
      await page.click('button[type="submit"]');
      await page.waitForFunction("window.submissions.length===6");
      await page.focus('button[type="submit"]');
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(()=>document.activeElement.id),"profile-nombre");
      await page.keyboard.press("Escape");
      assert.ok(await page.$('[role="dialog"]'),"mandatory profile dialog remains open");
      await page.close();
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(blocked,[]);
  } finally { await browser.close(); }
});
