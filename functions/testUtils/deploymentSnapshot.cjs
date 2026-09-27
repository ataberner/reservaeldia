const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");

function snapshot(source) {
  const child = spawnSync(process.execPath, ["--require", path.join(root, "scripts/local/networkGuard.cjs"), "-e", `
    const assert = require('node:assert/strict'), path = require('node:path');
    const source = process.cwd();
    const { SecretParam } = require(path.join(source, 'node_modules/firebase-functions/lib/params/types.js'));
    SecretParam.prototype.value = () => { throw new Error('Secret reads forbidden during discovery'); };
    const api = require(source);
    const { loadStack } = require(path.join(source, 'node_modules/firebase-functions/lib/runtime/loader.js'));
    const { stackToWire } = require(path.join(source, 'node_modules/firebase-functions/lib/runtime/manifest.js'));
    (async () => {
      const manifest = stackToWire(await loadStack(source));
      assert.equal(require(${JSON.stringify(path.join(root, "scripts/local/networkGuard.cjs"))}).attempts.length, 0);
      const loaded = Object.keys(require.cache).map(file => path.relative(source, file).replaceAll('\\\\', '/'));
      console.log(JSON.stringify({ manifest, names: Object.keys(api).sort(), loaded }));
    })().catch(() => process.exit(1));
  `], { cwd: path.join(root, source), encoding: "utf8", timeout: 30_000, windowsHide: true,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key))),
      GCLOUD_PROJECT: "reservaeldia-7a440", EMAIL_MODE: "sandbox", WELCOME_EMAIL_ACTIVATION_AT: "" } });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, "Offline entrypoint snapshot failed");
  return JSON.parse(child.stdout);
}
module.exports = { snapshot };
