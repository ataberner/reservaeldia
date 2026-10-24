import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ARTIFACT, PROJECT, RELEASE, RULESET, BASE_SHA256, MAX_EVIDENCE_AGE_MS,
  deriveCandidate, validateArtifact, validateFreshBase } from "./storageReleaseArtifact.mjs";

const now = Date.parse("2026-10-23T23:00:00Z");
const observedAt = new Date(now - 1000).toISOString();
function evidence() {
  const release = { name: RELEASE, rulesetName: RULESET,
    files: [{ name: "storage.rules", bytes: 2325, sha256: BASE_SHA256 }] };
  return { project: PROJECT, startedAt: observedAt, finishedAt: observedAt, rules: [release],
    steps: { releases_page_0: { items: [release], nextPageToken: null, unreachable: [] },
      storage_rules_review: { rulesetName: RULESET, files: release.files } } };
}

test("exact base and deterministic candidate are bound to the minimal single-bucket config", () => {
  const result = validateArtifact();
  assert.equal(result.baseSha256, BASE_SHA256);
  assert.ok(fs.readFileSync(path.join(ARTIFACT, "storage.rules")).equals(deriveCandidate(fs.readFileSync(path.join(ARTIFACT, "base.rules")))));
});
test("reject any base byte change", () => assert.throws(() => deriveCandidate(Buffer.from("different")), /base_hash_mismatch/));
for (const [name, mutate, expected] of [
  ["project", e => { e.project = "demo-other"; }, "evidence_project_mismatch"],
  ["ruleset", e => { e.rules[0].rulesetName += "-changed"; }, "remote_release_drift"],
  ["source", e => { e.rules[0].files[0].sha256 = "0".repeat(64); }, "remote_source_drift"],
  ["missing source observation", e => { delete e.steps.storage_rules_review; }, "source_observation_missing"],
  ["incomplete release pagination", e => { e.steps.releases_page_0.nextPageToken = "synthetic"; }, "release_observation_missing"],
  ["stale report", e => { e.startedAt = new Date(now - MAX_EVIDENCE_AGE_MS - 1).toISOString(); }, "fresh_read_required"],
  ["cached observation with fresh finish", e => { e.stepObservedAt = { releases: new Date(now - MAX_EVIDENCE_AGE_MS - 1).toISOString() }; }, "fresh_read_required"],
  ["future report", e => { e.finishedAt = new Date(now + 1).toISOString(); }, "fresh_read_required"],
]) test(`offline guard blocks ${name}`, () => { const e = evidence(); mutate(e); assert.throws(() => validateFreshBase(e, { now }), new RegExp(expected)); });
test("matching fresh trusted-format evidence passes with explicit authenticity limitation", () => {
  const result = validateFreshBase(evidence(), { now });
  assert.equal(result.remoteBaseMatches, true);
  assert.match(result.evidenceAuthenticity, /cannot authenticate/);
});
for (const [name, file, mutate, expected] of [
  ["extra route", "storage.rules", b => Buffer.from(b.toString().replace('topLevel != "borradores";', 'topLevel != "borradores" && topLevel != "usuarios";')), "candidate_scope_mismatch"],
  ["extra Firebase service or hook", "firebase.json", b => Buffer.from(JSON.stringify({ ...JSON.parse(b), hosting: { public: "public" } })), "config_scope_mismatch"],
  ["other bucket", "firebase.json", b => Buffer.from(b.toString().replace("reservaeldia-7a440.firebasestorage.app", "other.appspot.com")), "config_scope_mismatch"],
]) test(`artifact guard blocks ${name}`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-artifact-test-"));
  try {
    for (const item of ["base.rules", "storage.rules", "manifest.json", "firebase.json"]) fs.copyFileSync(path.join(ARTIFACT, item), path.join(dir, item));
    fs.writeFileSync(path.join(dir, file), mutate(fs.readFileSync(path.join(dir, file))));
    assert.throws(() => validateArtifact(dir), new RegExp(expected));
  } finally { fs.rmSync(dir, { recursive: true }); }
});
