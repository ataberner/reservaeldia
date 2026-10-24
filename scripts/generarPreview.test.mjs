import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("retired legacy preview command fails before any SDK import or side effect", () => {
  const script = fileURLToPath(new URL("./generarPreview.cjs", import.meta.url));
  // The test child inherits no credentials/configuration. The fake ADC path is
  // deliberately unusable; reaching an SDK import is already a test failure.
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => ["path", "systemroot", "windir", "comspec", "pathext"].includes(name.toLowerCase())));
  env.GOOGLE_APPLICATION_CREDENTIALS = "synthetic-unavailable-adc-do-not-read.json";
  const probe = `
    const Module = require('node:module');
    const load = Module._load;
    const target = process.argv[1];
    let imports = 0;
    Module._load = function(name, parent, isMain) {
      if (name === target) return load.call(this, name, parent, isMain);
      imports += 1;
      throw new Error('LEGACY_PREVIEW_IMPORT_ATTEMPT');
    };
    process.on('exit', () => process.stdout.write('imports=' + imports + '\\n'));
    require(target);
  `;
  const result = spawnSync(process.execPath, ["-e", probe, script, "borradores", "synthetic-private-draft"], {
    encoding: "utf8", env, timeout: 10000, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "imports=0\n");
  assert.match(result.stderr, /comando legacy fue retirado/);
  assert.match(result.stderr, /borradores son privadas/);
  assert.match(result.stderr, /dashboard\/editor actual/);
  assert.doesNotMatch(result.stderr, /LEGACY_PREVIEW_IMPORT_ATTEMPT|https?:\/\/|firebaseStorageDownloadTokens/);
});
