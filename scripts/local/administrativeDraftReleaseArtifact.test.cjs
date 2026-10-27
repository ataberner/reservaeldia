const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const artifact = require("./administrativeDraftReleaseArtifact.cjs");
const base = fs.readFileSync(path.join(artifact.ROOT, artifact.BASE));
const canonical = fs.readFileSync(path.join(artifact.ROOT, "firestore.rules"));

function fixture(run) {
  const parent = path.join(artifact.ROOT, ".local-isolation");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "ad1-artifact-test-"));
  try { return run(directory); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function copyInputs(root) {
  fs.mkdirSync(path.dirname(path.join(root, artifact.BASE)), { recursive: true });
  fs.writeFileSync(path.join(root, artifact.BASE), base);
  fs.writeFileSync(path.join(root, "firestore.rules"), canonical);
}

test("AD1 candidate is pinned and config selects only Firestore default", () => {
  const files = artifact.build();
  assert.equal(artifact.hash(files["base.rules"]), artifact.BASE_SHA256);
  assert.equal(artifact.hash(files["firestore.rules"]), artifact.CANDIDATE_SHA256);
  assert.deepEqual(JSON.parse(files["firebase.json"]), { firestore: [{ database: "(default)", rules: "firestore.rules" }] });
});

test("only AD1 helper and draft block change; every other base byte is retained", () => {
  const current = canonical.toString("utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const helper = current.slice(current.indexOf("    function acknowledgesAdministrativeDraftRevision()"), current.indexOf("    function isPublicationOwner("));
  const candidate = artifact.deriveCandidate(base, canonical);
  assert.equal(candidate.split(helper).length, 2);
  assert.equal(artifact.draftSection(candidate).text, artifact.draftSection(current).text);
  const reverted = candidate.replace(helper, "").replace(artifact.draftSection(current).text, artifact.draftSection(base.toString("utf8")).text);
  assert.equal(reverted, base.toString("utf8"));
  assert.match(candidate, /match \/proveedores\/\{document=\*\*\}/);
  assert.match(candidate, /collection != "iconos"/);
  assert.match(candidate, /collection != "decoraciones"/);
});

test("local LF checkout of canonical preserves exact CRLF release bytes", () => {
  assert.equal(artifact.hash(artifact.deriveCandidate(base, canonical.toString("utf8").replace(/\r\n/g, "\n"))), artifact.CANDIDATE_SHA256);
});

test("base byte drift and revised administrative logic require explicit review", () => {
  assert.throws(() => artifact.deriveCandidate(Buffer.concat([base, Buffer.from("\n")]), canonical), /historical_base_changed/);
  assert.throws(() => artifact.deriveCandidate(base, canonical.toString("utf8").replace('changed.hasAny(["draftContentMeta"])', 'true')), /administrative_delta_changed/);
  assert.throws(() => artifact.deriveCandidate(base, canonical.toString("utf8").replace("function acknowledgesAdministrativeDraftRevision()", "function otherRevision()")), /rules_structure_changed/);
});

test("unrelated canonical changes never enter the scoped release", () => {
  const changed = canonical.toString("utf8") + "\n// unrelated local delta\n";
  assert.equal(artifact.hash(artifact.deriveCandidate(base, changed)), artifact.CANDIDATE_SHA256);
});

test("artifact check rejects altered configuration and candidate content", () => fixture(root => {
  copyInputs(root);
  const files = artifact.build(root);
  const destination = path.join(root, artifact.DIRECTORY);
  fs.mkdirSync(destination, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(destination, name), content);
  assert.equal(artifact.check(root).candidateSha256, artifact.CANDIDATE_SHA256);
  fs.writeFileSync(path.join(destination, "firebase.json"), '{"hosting":{}}');
  assert.throws(() => artifact.check(root), /artifact_drift/);
  fs.writeFileSync(path.join(destination, "firebase.json"), files["firebase.json"]);
  fs.appendFileSync(path.join(destination, "firestore.rules"), "\n");
  assert.throws(() => artifact.check(root), /artifact_drift/);
}));

test("fresh readback binds project, exact bytes, release identity and GET-only scope", () => fixture(root => {
  const now = Date.now();
  const release = `projects/${artifact.PROJECT}/releases/cloud.firestore`;
  const ruleset = `projects/${artifact.PROJECT}/rulesets/7205800c-a0ae-4f85-af57-469699cf794c`;
  const report = { project: artifact.PROJECT, database: "(default)", status: "passed", mutations: 0,
    startedAt: new Date(now - 1000).toISOString(), finishedAt: new Date(now).toISOString(),
    release, ruleset, releaseUpdatedAt: "2026-10-25T18:22:45Z", authOrigin: "firebase-cli-existing-account",
    actualSha256: artifact.BASE_SHA256, expectedSha256: artifact.BASE_SHA256, exactBaseMatch: true,
    sourceFile: "remote-firestore.rules", bytes: base.length,
    requests: [{ method: "GET", resource: release }, { method: "GET", resource: ruleset }, { method: "GET", resource: release }],
  };
  const file = path.join(root, "report.json");
  const write = value => fs.writeFileSync(file, JSON.stringify(value));
  fs.writeFileSync(path.join(root, "remote-firestore.rules"), base);
  write(report);
  assert.equal(artifact.validateReadback(file, now).ruleset, ruleset);
  assert.throws(() => artifact.validateReadback(file, now + 16 * 60000), /expired/);
  write({ ...report, project: "other-project" });
  assert.throws(() => artifact.validateReadback(file, now), /scope_changed/);
  write({ ...report, requests: [...report.requests, { method: "PATCH", resource: release }] });
  assert.throws(() => artifact.validateReadback(file, now), /requests_changed/);
  write(report);
  fs.appendFileSync(path.join(root, "remote-firestore.rules"), "\n");
  assert.throws(() => artifact.validateReadback(file, now), /bytes_changed/);
}));
