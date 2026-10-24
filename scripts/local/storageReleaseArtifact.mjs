// Offline validation only. This module has no SDK, credentials or network calls.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROJECT = "reservaeldia-7a440";
export const BUCKET = "reservaeldia-7a440.firebasestorage.app";
export const RULESET = `projects/${PROJECT}/rulesets/cd354678-8198-4a0a-b651-0f8f8868e305`;
export const RELEASE = `projects/${PROJECT}/releases/firebase.storage/${BUCKET}`;
export const BASE_SHA256 = "bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a";
export const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
export const ARTIFACT = fileURLToPath(new URL("../../deployment/storage-draft-provider/", import.meta.url));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
function insist(value, code) { if (!value) throw new Error(code); }

export function deriveCandidate(base) {
  insist(sha256(base) === BASE_SHA256, "base_hash_mismatch");
  let candidate = base.toString("utf8");
  const start = candidate.indexOf("    function isPublicProvider(providerId) {");
  const end = candidate.indexOf("    function isAllowedProviderImage() {", start);
  insist(start >= 0 && end > start, "base_structure_mismatch");
  candidate = candidate.slice(0, start) + candidate.slice(end);
  candidate = candidate.replaceAll("allow read: if isAdmin() || isPublicProvider(proveedorId);", "allow read: if isAdmin();");
  candidate = candidate.replace("    // Compatibility fallback for existing app assets.",
    "    match /borradores/{allPaths=**} {\n      allow read, write: if false;\n    }\n\n    // Compatibility fallback for existing app assets.");
  candidate = candidate.replaceAll('topLevel != "proveedores";', 'topLevel != "proveedores" &&\n        topLevel != "borradores";');
  return Buffer.from(candidate);
}

export function validateArtifact(directory = ARTIFACT) {
  const base = fs.readFileSync(path.join(directory, "base.rules"));
  const candidate = fs.readFileSync(path.join(directory, "storage.rules"));
  const configBytes = fs.readFileSync(path.join(directory, "firebase.json"));
  const config = JSON.parse(configBytes);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
  insist(candidate.equals(deriveCandidate(base)), "candidate_scope_mismatch");
  insist(JSON.stringify(config) === JSON.stringify({ storage: [{ bucket: BUCKET, rules: "storage.rules" }] }), "config_scope_mismatch");
  insist(manifest.schemaVersion === 1 && manifest.project === PROJECT && manifest.bucket === BUCKET &&
    manifest.base.release === RELEASE && manifest.base.ruleset === RULESET && manifest.base.sha256 === BASE_SHA256 &&
    manifest.base.bytes === base.length, "manifest_base_mismatch");
  insist(manifest.candidate.sha256 === sha256(candidate) && manifest.candidate.bytes === candidate.length &&
    manifest.config.sha256 === sha256(configBytes), "manifest_artifact_mismatch");
  return { project: PROJECT, bucket: BUCKET, baseSha256: BASE_SHA256, candidateSha256: sha256(candidate), configSha256: sha256(configBytes) };
}

// A locally supplied report is not authenticated evidence of remote state.
// The operator must refresh it using the reviewed read-only collector during an
// authorized window. This gate only detects stale/inconsistent/drifted inputs.
// Deliberately use the oldest observation in a resumed report: changing just its
// finishedAt cannot make cached release/source reads fresh.
export function validateFreshBase(report, { now = Date.now() } = {}) {
  insist(report?.project === PROJECT, "evidence_project_mismatch");
  const timestamps = [report.startedAt, report.finishedAt, ...(report.runs || []).flatMap(r => [r.startedAt, r.finishedAt]),
    ...Object.values(report.stepObservedAt || {})];
  insist(timestamps.length >= 2 && timestamps.every(t => typeof t === "string" && Number.isFinite(Date.parse(t))), "evidence_time_missing");
  const times = timestamps.map(Date.parse);
  insist(times.every(t => t <= now && now - t <= MAX_EVIDENCE_AGE_MS) && Date.parse(report.finishedAt) >= Date.parse(report.startedAt), "fresh_read_required");
  const release = report.rules?.filter(r => r.name === RELEASE);
  insist(release?.length === 1 && release[0].rulesetName === RULESET, "remote_release_drift");
  const files = release[0].files;
  insist(files?.length === 1 && files[0].name === "storage.rules" && files[0].sha256 === BASE_SHA256 && files[0].bytes === 2325, "remote_source_drift");
  const listed = report.steps?.releases_page_0;
  insist(!listed?.nextPageToken && !listed?.unreachable?.length && listed?.items?.filter(r => r.name === RELEASE && r.rulesetName === RULESET).length === 1,
    "release_observation_missing");
  const reviewed = report.steps?.storage_rules_review;
  insist(reviewed?.rulesetName === RULESET && reviewed.files?.length === 1 && reviewed.files[0].sha256 === BASE_SHA256, "source_observation_missing");
  return { remoteBaseMatches: true, oldestObservedAt: new Date(Math.min(...times)).toISOString(), freshnessLimitMinutes: MAX_EVIDENCE_AGE_MS / 60000,
    evidenceAuthenticity: "operator must verify trusted collector provenance; offline gate cannot authenticate remote observations" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    insist(process.argv.length === 4 && process.argv[2] === "--evidence", "usage: node scripts/local/storageReleaseArtifact.mjs --evidence <fresh-control-plane.json>");
    const artifact = validateArtifact();
    const evidence = fs.readFileSync(path.resolve(process.argv[3]));
    console.log(JSON.stringify({ ...artifact, ...validateFreshBase(JSON.parse(evidence)), evidenceSha256: sha256(evidence),
      action: "offline preflight only; no deployment performed or authorized" }, null, 2));
  } catch (error) {
    console.error(`Storage artifact blocked: ${/^[a-z_ :<>.\/-]+$/.test(error.message) ? error.message : "invalid_local_input"}`);
    process.exitCode = 1;
  }
}
