import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ARTIFACT, BASE_SHA256, sha256, deriveCandidate, validateFirestoreAssetArtifact } from "./firestoreAssetReleaseArtifact.mjs";

const snapshot = () => fs.readFileSync(path.join(ARTIFACT, "base.rules"));

test("candidate preserves the entire read predicate and only restricts fallback writes", () => {
  const base = snapshot();
  assert.equal(sha256(base), BASE_SHA256);
  const candidate = fs.readFileSync(path.join(ARTIFACT, "firestore.rules"));
  assert.ok(candidate.equals(deriveCandidate(base)));
  const section = "    // Compatibility fallback for the rest of current app documents.";
  const baseline = base.toString();
  const modified = candidate.toString();
  const fallback = baseline.slice(baseline.indexOf(section));
  const predicate = fallback.match(/allow read, write: if ([\s\S]+?);/)[1];
  const changedFallback = modified.slice(modified.indexOf(section));
  assert.equal(changedFallback.match(/allow read: if ([\s\S]+?);/)[1], predicate);
  assert.equal(changedFallback.match(/allow write: if ([\s\S]+?);/)[1]
    .replace('        collection != "iconos" &&\r\n        collection != "decoraciones" &&\r\n', ""), predicate);
  assert.equal(modified.slice(0, modified.indexOf(section)), baseline.slice(0, baseline.indexOf(section)));
  assert.equal(validateFirestoreAssetArtifact().candidateSha256, sha256(candidate));
});

test("changing any snapshot byte requires a new reviewed derivation", () => {
  assert.throws(() => deriveCandidate(Buffer.concat([snapshot(), Buffer.from("\n")])), /canonical_base_drift/);
});

for (const [name, mutate, accepted] of [
  ["original CRLF", bytes => bytes, true],
  ["LF checkout", bytes => Buffer.from(bytes.toString().replaceAll("\r\n", "\n")), true],
  ["mixed CRLF/LF checkout", bytes => Buffer.from(bytes.toString().replace("\r\n", "\n")), true],
  ["extra whitespace", bytes => Buffer.concat([bytes, Buffer.from(" ")]), false],
  ["extra trailing newline", bytes => Buffer.concat([bytes, Buffer.from("\n")]), false],
  ["changed grant", bytes => Buffer.from(bytes.toString().replace("allow read, write:", "allow read:")), false],
  ["lone CR", bytes => Buffer.from(bytes.toString().replace("\r\n", "\r")), false],
  ["UTF-8 BOM", bytes => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), false],
]) test(`canonical comparison ${accepted ? "accepts" : "rejects"} ${name}`, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firestore-canonical-test-"));
  try {
    const canonical = path.join(directory, "firestore.rules");
    fs.writeFileSync(canonical, mutate(snapshot()));
    if (accepted) assert.equal(validateFirestoreAssetArtifact(ARTIFACT, canonical).baseSha256, BASE_SHA256);
    else assert.throws(() => validateFirestoreAssetArtifact(ARTIFACT, canonical), /canonical_base_drift/);
  } finally { fs.rmSync(directory, { recursive: true }); }
});

for (const [name, file, mutate, expected] of [
  ["normalized snapshot", "base.rules", bytes => Buffer.from(bytes.toString().replaceAll("\r\n", "\n")), "canonical_base_drift"],
  ["extra Rules change", "firestore.rules", bytes => Buffer.from(bytes.toString().replace('collection != "iconos" &&', 'collection != "iconos_audit" &&')), "candidate_scope_mismatch"],
  ["missing exclusion", "firestore.rules", bytes => Buffer.from(bytes.toString().replace('        collection != "decoraciones" &&\r\n', "")), "candidate_scope_mismatch"],
  ["changed read predicate", "firestore.rules", bytes => Buffer.from(bytes.toString().replace('allow read: if isSignedIn() &&', 'allow read: if false &&')), "candidate_scope_mismatch"],
  ["named database", "firebase.json", bytes => Buffer.from(bytes.toString().replace("(default)", "other")), "config_scope_mismatch"],
  ["additional service", "firebase.json", bytes => Buffer.from(JSON.stringify({ ...JSON.parse(bytes), storage: { rules: "storage.rules" } })), "config_scope_mismatch"],
  ["additional hook", "firebase.json", bytes => Buffer.from(JSON.stringify({ ...JSON.parse(bytes), predeploy: ["anything"] })), "config_scope_mismatch"],
  ["manifest drift", "manifest.json", bytes => Buffer.from(bytes.toString().replace(BASE_SHA256, "0".repeat(64))), "manifest_base_mismatch"],
]) test(`offline artifact validation rejects ${name}`, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firestore-asset-artifact-"));
  try {
    for (const item of ["base.rules", "firestore.rules", "firebase.json", "manifest.json"]) fs.copyFileSync(path.join(ARTIFACT, item), path.join(directory, item));
    fs.writeFileSync(path.join(directory, file), mutate(fs.readFileSync(path.join(directory, file))));
    assert.throws(() => validateFirestoreAssetArtifact(directory), new RegExp(expected));
  } finally { fs.rmSync(directory, { recursive: true }); }
});
