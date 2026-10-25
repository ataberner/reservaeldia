const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const DIRECTORY = "deployment/provider-beta";
const BASES = {
  firestore: { path: "deployment/render-asset-firestore/firestore.rules", sha256: "7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c" },
  storage: { path: "deployment/storage-draft-provider/storage.rules", sha256: "40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80" },
};
const hash = value => createHash("sha256").update(value).digest("hex");
function replaceOnce(source, expression, replacement) {
  const matches = source.match(new RegExp(expression.source, "g"));
  if (matches?.length !== 1) throw new Error("La base de Rules no coincide con el delta revisado.");
  return source.replace(expression, replacement);
}
function candidate(name, source) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  if (name === "firestore") return replaceOnce(source,
    /    match \/proveedores\/\{proveedorId\} \{[\s\S]*?\r?\n    \}/,
    ["    match /proveedores/{document=**} {", "      // Private beta: all access through authenticated backend gates.", "      allow read, write: if false;", "    }"].join(eol));
  return replaceOnce(source,
    /    match \/proveedores\/\{proveedorId\}\/portada\/\{fileName\} \{[\s\S]*?\r?\n    \}\r?\n\r?\n    match \/proveedores\/\{proveedorId\}\/galeria\/\{fileName\} \{[\s\S]*?\r?\n    \}/,
    ["    match /proveedores/{allPaths=**} {", "      // Private beta: no SDK access, including imported and new media.", "      allow read, write: if false;", "    }"].join(eol));
}
function build(root = ROOT) {
  const files = {};
  const manifest = { schemaVersion: 1, project: "reservaeldia-7a440", database: "(default)", bucket: "reservaeldia-7a440.firebasestorage.app",
    status: "Prepared locally only. Fresh remote base comparison and authorization required before applying.",
    scope: "Only remove provider SDK grants; preserve every other byte of the previous scoped release artifacts.", rules: {} };
  for (const [name, base] of Object.entries(BASES)) {
    const source = fs.readFileSync(path.join(root, base.path), "utf8");
    if (hash(source) !== base.sha256) throw new Error(`La base histórica ${name} cambió; requiere revisión explícita.`);
    const output = candidate(name, source);
    files[`${name}.rules`] = output;
    manifest.rules[name] = { base: base.path, baseSha256: base.sha256, candidate: `${name}.rules`, candidateSha256: hash(output), bytes: Buffer.byteLength(output) };
  }
  files["firebase.json"] = JSON.stringify({ firestore: [{ database: "(default)", rules: "firestore.rules" }], storage: [{ bucket: manifest.bucket, rules: "storage.rules" }] }, null, 2) + "\n";
  manifest.configSha256 = hash(files["firebase.json"]);
  files["manifest.json"] = JSON.stringify(manifest, null, 2) + "\n";
  return files;
}
if (require.main === module) {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode) || process.argv.length !== 3) throw new Error("Use --write (local files only) or --check; no remote operation exists.");
  const files = build();
  if (mode === "--write") fs.mkdirSync(path.join(ROOT, DIRECTORY), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(ROOT, DIRECTORY, name);
    if (mode === "--write") fs.writeFileSync(destination, content);
    else if (fs.readFileSync(destination, "utf8") !== content) throw new Error(`Artifact drift: ${name}`);
  }
  console.log(`Provider beta release artifacts: ${mode === "--write" ? "prepared locally" : "verified"}; no remote effects.`);
}
module.exports = { build, candidate, BASES, DIRECTORY };
