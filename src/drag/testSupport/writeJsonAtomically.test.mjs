import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./writeJsonAtomically.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryRoot = path.join(root, ".local-isolation", "drag-phase3b", "validation", "testtmp");

function fixture(t) {
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "atomic-json-"));
  const destination = path.join(directory, "results.json");
  const previous = '{"previous":"complete evidence"}\n';
  fs.writeFileSync(destination, previous, "utf8");
  t.after(() => {
    const relative = path.relative(temporaryRoot, directory);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  });
  return { directory, destination, previous };
}

test("replaces an existing artifact with the exact complete JSON using a sibling temp", (t) => {
  const { directory, destination } = fixture(t);
  const value = { completed: true, trials: [{ x: 100, label: "texto rotado" }] };
  let temporary;
  writeJsonAtomically(destination, value, { fs: { ...fs,
    renameSync(source, target) {
      temporary = source;
      assert.equal(path.dirname(source), path.dirname(target));
      assert.equal(fs.readFileSync(source, "utf8"), JSON.stringify(value, null, 2));
      return fs.renameSync(source, target);
    },
  } });
  assert.equal(fs.readFileSync(destination, "utf8"), JSON.stringify(value, null, 2));
  assert.equal(fs.existsSync(temporary), false);
  assert.deepEqual(fs.readdirSync(directory), ["results.json"]);
});

test("partial ENOSPC write preserves old bytes and removes only its own temp", (t) => {
  const { directory, destination, previous } = fixture(t);
  const foreign = path.join(directory, ".results.json.foreign.tmp");
  fs.writeFileSync(foreign, "unrelated evidence");
  const failure = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  let renamed = false;
  assert.throws(() => writeJsonAtomically(destination, { completed: true }, { fs: { ...fs,
    writeFileSync(descriptor, text) {
      fs.writeSync(descriptor, text.slice(0, 5));
      throw failure;
    },
    renameSync() { renamed = true; },
  } }), (error) => error === failure);
  assert.equal(renamed, false);
  assert.equal(fs.readFileSync(destination, "utf8"), previous);
  assert.equal(fs.readFileSync(foreign, "utf8"), "unrelated evidence");
  assert.deepEqual(fs.readdirSync(directory).sort(), [path.basename(foreign), "results.json"].sort());
});

test("Windows-style rename failure preserves the destination and cleans the complete temp", (t) => {
  const { directory, destination, previous } = fixture(t);
  const failure = Object.assign(new Error("destination locked"), { code: "EPERM" });
  assert.throws(() => writeJsonAtomically(destination, { completed: true }, { fs: { ...fs,
    renameSync() { throw failure; },
  } }), (error) => error === failure);
  assert.equal(fs.readFileSync(destination, "utf8"), previous);
  assert.deepEqual(fs.readdirSync(directory), ["results.json"]);
});

test("serialization failure leaves the existing evidence and directory untouched", (t) => {
  const { directory, destination, previous } = fixture(t);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => writeJsonAtomically(destination, cyclic), TypeError);
  assert.throws(() => writeJsonAtomically(destination, undefined), TypeError);
  assert.equal(fs.readFileSync(destination, "utf8"), previous);
  assert.deepEqual(fs.readdirSync(directory), ["results.json"]);
});
