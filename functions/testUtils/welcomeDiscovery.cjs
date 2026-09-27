// Offline SDK/CLI discovery; no Firebase login, dotenv, Secrets or handlers.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "functions");
const guard = require(path.join(root, "scripts/local/networkGuard.cjs"));
const [mode, output, cliRoot = path.join(root, "scripts/local/tools/node_modules/firebase-tools")] = process.argv.slice(2);
const { SecretParam, StringParam } = require(path.join(source, "node_modules/firebase-functions/lib/params/types.js"));
SecretParam.prototype.value = StringParam.prototype.value = () => { throw new Error("Runtime parameter read during discovery"); };
// Resource identity only; network is blocked and no production SDK action runs.
process.env.GCLOUD_PROJECT = "reservaeldia-7a440";

if (mode === "serve") {
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (port, ...args) { return listen.call(this, port, "127.0.0.1", ...args); };
  process.chdir(source);
  process.argv = [process.execPath, "firebase-functions"];
  require(path.join(source, "node_modules/firebase-functions/lib/bin/firebase-functions.js"));
} else {
  (async () => {
    let result;
    if (mode === "sdk") {
      const start = performance.now();
      const endpoints = require(path.join(source, "lib/index.js"));
      const { loadStack } = require(path.join(source, "node_modules/firebase-functions/lib/runtime/loader.js"));
      const { stackToWire } = require(path.join(source, "node_modules/firebase-functions/lib/runtime/manifest.js"));
      const manifest = stackToWire(await loadStack(source));
      const loaded = Object.keys(require.cache).map(file => file.replaceAll("\\", "/"));
      const unexpected = loaded.filter(file => /\/lib\/emails\/(?:welcomeRegistration|welcomeDeliveryStore|sendTransactionalEmail)\.js$/.test(file) ||
        file.includes("/node_modules/react-email/") || file.includes("/node_modules/@react-email/") ||
        file.includes("/node_modules/@aws-sdk/"));
      if (unexpected.length) throw new Error("Eager email runtime detected");
      result = { ok: true, ms: performance.now() - start, exports: Object.keys(endpoints).sort(), manifest, unexpected };
    } else if (mode === "cli") {
      const { detectFromPort, getFunctionDiscoveryTimeout } = require(path.join(cliRoot, "lib/deploy/functions/runtimes/discovery/index.js"));
      if (getFunctionDiscoveryTimeout() !== 0) throw new Error("Discovery timeout override forbidden");
      const reserve = net.createServer();
      await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
      const port = reserve.address().port;
      await new Promise(resolve => reserve.close(resolve));
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key)));
      const start = performance.now();
      const child = spawn(process.execPath, [__filename, "serve"], { cwd: source, windowsHide: true, stdio: "ignore",
        env: { ...env, PORT: String(port), FUNCTIONS_CONTROL_API: "true" } });
      const closed = new Promise(resolve => child.once("close", resolve));
      try {
        const manifest = await detectFromPort(port, "reservaeldia-7a440", "nodejs20");
        result = { ok: true, ms: performance.now() - start, manifest };
      } finally { child.kill(); await closed; }
    } else throw new Error("Use sdk|cli <output.json> [local CLI root]");
    if (guard.attempts.length) throw new Error("Unexpected external network attempt");
    fs.writeFileSync(output, JSON.stringify({ ...result, node: process.version }, null, 2));
    console.log(JSON.stringify({ mode, ok: true, ms: result.ms }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
