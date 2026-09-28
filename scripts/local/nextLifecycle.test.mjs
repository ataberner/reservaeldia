import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { isPortAvailable } = require("../runNextDev.cjs");
const { Processes } = require("./processes.cjs");
const { ROOT, cleanEnvironment, createSocketEnvironment, assertPortsFree } = require("./session.cjs");

test("Next port probe accepts a free loopback port and rejects a real listener", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  try { assert.equal(await isPortAvailable(port), false); }
  finally { await new Promise(resolve => server.close(resolve)); }
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(await isPortAvailable(port), true);
});

for (const browserFails of [false, true]) {
  test(`Next starts once; ${browserFails ? "failed" : "successful"} browser cleanup closes its process tree and port`, { timeout: 30000 }, async () => {
    await assertPortsFree([3100]);
    const session = fs.mkdtempSync(path.join(ROOT, ".local-isolation/next-lifecycle-"));
    const workspace = path.join(session, "workspace");
    const bin = path.join(workspace, "node_modules/next/dist/bin/next");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    const log = path.join(session, "next.log");
    const launches = path.join(session, "launches.jsonl");
    // Exercise the real launcher/owner with a listening grandchild. No Next
    // compilation or emulator is needed to distinguish duplicate starts/leaks.
    const serverCode = `require('node:http').createServer((req,res)=>res.end('synthetic Next')).listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('fixture-ready'));`;
    fs.writeFileSync(bin, `require('node:fs').appendFileSync(${JSON.stringify(launches)},JSON.stringify({pid:process.pid,args:process.argv.slice(2),port:process.env.PORT})+'\\n');
      const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(serverCode)}],{stdio:'inherit',env:process.env});
      process.once('SIGINT',()=>child.kill('SIGINT'));process.once('SIGTERM',()=>child.kill('SIGTERM'));
      child.on('exit',code=>process.exit(code??1));`);
    const env = { ...cleanEnvironment(session), NODE_OPTIONS: "", NODE_ENV: "development" };
    const browserEnvironment = createSocketEnvironment(env);
    const owner = new Processes();
    let stopped;
    try {
      const next = owner.start([path.join(ROOT, "scripts/runNextDev.cjs")], { cwd: workspace, env, log, name: "next" });
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(log) || !fs.readFileSync(log, "utf8").includes("fixture-ready")) {
        assert.ok(!next.done && Date.now() < deadline, "owned Next must become ready");
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await assert.rejects(owner.run([path.join(ROOT, "scripts/runNextDev.cjs")], {
        cwd: workspace, env, log: path.join(session, "duplicate.log"), name: "duplicate", timeoutMs: 5000,
      }), error => error.exitCode === 1);
      assert.match(fs.readFileSync(path.join(session, "duplicate.log"), "utf8"), /puerto 3100 ya esta en uso/);
      const records = fs.readFileSync(launches, "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert.equal(records.length, 1);
      assert.deepEqual(records[0].args, ["dev", "--hostname", "127.0.0.1", "-p", "3100"]);
      const browser = () => owner.run(["-e", `require('node:http').get('http://localhost:3100',res=>{res.resume();res.on('end',()=>process.exit(res.statusCode===200?${browserFails ? 1 : 0}:2));}).on('error',()=>process.exit(3));`], {
        cwd: workspace, env: browserEnvironment.env, log: path.join(session, "browser.log"), name: "browser", timeoutMs: 5000,
      });
      if (browserFails) await assert.rejects(browser(), error => error.exitCode === 1);
      else await browser();
      assert.equal(next.done, undefined, "browser completion must leave shutdown to the owner");
    } finally {
      stopped = await owner.stop();
      browserEnvironment.cleanup();
    }
    assert.ok(stopped.every(process => process.closed));
    await assertPortsFree([3100]);
    assert.equal(await isPortAvailable(3100), true);
    if (process.platform !== "win32") assert.equal(fs.existsSync(browserEnvironment.env.TMPDIR), false);
  });
}
