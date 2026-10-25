const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build, candidate, BASES, DIRECTORY } = require("./providerBetaReleaseArtifact.cjs");
const root = path.resolve(__dirname, "../..");

test("private beta release artifacts match the bounded transformation exactly", () => {
  const files = build(root);
  for (const [name, content] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(root, DIRECTORY, name), "utf8"), content);
  assert.deepEqual(Object.keys(JSON.parse(files["firebase.json"])).sort(), ["firestore", "storage"]);
});

test("only provider grants change; all other rules bytes are preserved", () => {
  for (const [name, base] of Object.entries(BASES)) {
    const source = fs.readFileSync(path.join(root, base.path), "utf8");
    const changed = candidate(name, source);
    const start = source.indexOf("    match /proveedores/");
    const end = source.indexOf(name === "firestore" ? "    match /categorias_proveedores/" : "    // Stored draft artifacts", start);
    const tailStart = end >= 0 ? end : source.indexOf("    match /borradores/", start);
    assert.ok(tailStart > start);
    assert.equal(changed.slice(0, start), source.slice(0, start));
    assert.ok(changed.endsWith(source.slice(tailStart)));
    assert.match(changed.slice(start, changed.length - source.slice(tailStart).length), /allow read, write: if false;/);
    assert.match(changed, /(?:collection|topLevel) != "proveedores"/);
  }
});

test("unknown or repeated base grants fail before producing a candidate", () => {
  assert.throws(() => candidate("firestore", "not a rules source"));
  const source = fs.readFileSync(path.join(root, BASES.firestore.path), "utf8");
  assert.throws(() => candidate("firestore", source + source));
});
