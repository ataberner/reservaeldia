// Offline derivation/check only. No SDK, credentials, network or deployment.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const DIRECTORY = "deployment/administrative-drafts";
const PROJECT = "reservaeldia-7a440";
const BASE = "deployment/provider-beta/firestore.rules";
const BASE_SHA256 = "7033002a97a6a59c7097de2d28a3115987e457b68f759ce17634f2a92c10902a";
const CANDIDATE_SHA256 = "262582ee1e46e76d0bee0cb934a15f6b9451b4ae335714b64ae407d5d37682c5";
const hash = value => createHash("sha256").update(value).digest("hex");
function insist(value, code) { if (!value) throw new Error(code); }
function uniqueOffset(source, marker) {
  const offset = source.indexOf(marker);
  insist(offset >= 0 && source.indexOf(marker, offset + marker.length) < 0, "rules_structure_changed");
  return offset;
}
function draftSection(source) {
  const start = uniqueOffset(source, "    match /borradores/{draftId} {");
  const end = source.indexOf("    // A4:", start);
  insist(end > start, "draft_section_boundary_changed");
  return { start, end, text: source.slice(start, end) };
}
function deriveCandidate(base, canonical) {
  insist(hash(base) === BASE_SHA256, "historical_base_changed");
  const original = base.toString("utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const current = canonical.toString("utf8").replace(/\r\n/g, "\n").replace(/\n/g, eol);
  const helperStart = uniqueOffset(current, "    function acknowledgesAdministrativeDraftRevision()");
  const helperEnd = uniqueOffset(current, "    function isPublicationOwner(");
  insist(helperEnd > helperStart, "helper_boundary_changed");
  const helper = current.slice(helperStart, helperEnd);
  const before = draftSection(original), after = draftSection(current);
  const withDraft = original.slice(0, before.start) + after.text + original.slice(before.end);
  const position = uniqueOffset(withDraft, "    function isPublicationOwner(");
  const candidate = withDraft.slice(0, position) + helper + withDraft.slice(position);
  // Extracting the canonical fragment does not authorize adopting future edits:
  // the reviewed candidate is fixed, including comments and line endings.
  insist(hash(candidate) === CANDIDATE_SHA256, "administrative_delta_changed");
  insist(candidate.replace(helper, "").replace(after.text, before.text) === original, "unrelated_base_bytes_changed");
  return candidate;
}
function build(root = ROOT) {
  const base = fs.readFileSync(path.join(root, BASE));
  const candidate = deriveCandidate(base, fs.readFileSync(path.join(root, "firestore.rules")));
  const config = JSON.stringify({ firestore: [{ database: "(default)", rules: "firestore.rules" }] }, null, 2) + "\n";
  const manifest = {
    schemaVersion: 1, project: PROJECT, database: "(default)",
    status: "Prepared locally. Fresh exact remote-base readback required; this artifact performs no deployment.",
    base: { file: "base.rules", source: BASE, sha256: BASE_SHA256, bytes: base.length },
    candidate: { file: "firestore.rules", sha256: CANDIDATE_SHA256, bytes: Buffer.byteLength(candidate) },
    config: { file: "firebase.json", sha256: hash(config) },
    scope: [
      "Add the canonical AD1 administrative-revision acknowledgement helper.",
      "Reserve adminDraftRevision/adminAudit on draft create/update and enforce owner acknowledgement on content updates.",
      "Preserve every other base byte, including provider SDK denial, catalog fallback closure and existing owner/read/delete grants.",
    ],
  };
  return { "base.rules": base, "firestore.rules": candidate, "firebase.json": config,
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    ".gitattributes": "base.rules -text whitespace=cr-at-eol\nfirestore.rules -text whitespace=cr-at-eol\nmanifest.json -text\nfirebase.json -text\n" };
}
function check(root = ROOT) {
  const files = build(root);
  for (const [name, content] of Object.entries(files)) {
    insist(fs.readFileSync(path.join(root, DIRECTORY, name)).equals(Buffer.from(content)), "artifact_drift_" + name.replace(/[^a-z]/g, "_"));
  }
  return { project: PROJECT, database: "(default)", baseSha256: BASE_SHA256, candidateSha256: CANDIDATE_SHA256 };
}
function validateReadback(file, now = Date.now()) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const start = Date.parse(report.startedAt), end = Date.parse(report.finishedAt);
  const release = `projects/${PROJECT}/releases/cloud.firestore`;
  insist(report.project === PROJECT && report.database === "(default)" && report.status === "passed" && report.mutations === 0, "readback_scope_changed");
  insist(Number.isFinite(start) && Number.isFinite(end) && end >= start && end <= now && now - start <= 15 * 60000, "readback_expired_or_invalid_time");
  insist(report.release === release && new RegExp(`^projects/${PROJECT}/rulesets/[a-f0-9-]+$`).test(report.ruleset), "readback_identity_changed");
  insist(report.authOrigin === "firebase-cli-existing-account" || report.authOrigin === "existing-adc-authorized-user-matching-quota-project", "readback_auth_origin_changed");
  insist(report.actualSha256 === BASE_SHA256 && report.expectedSha256 === BASE_SHA256 && report.exactBaseMatch === true && report.sourceFile === "remote-firestore.rules", "readback_base_changed");
  insist(JSON.stringify(report.requests) === JSON.stringify([
    { method: "GET", resource: release }, { method: "GET", resource: report.ruleset }, { method: "GET", resource: release },
  ]), "readback_requests_changed");
  const source = fs.readFileSync(path.join(path.dirname(file), "remote-firestore.rules"));
  insist(hash(source) === BASE_SHA256 && source.length === report.bytes, "readback_bytes_changed");
  return { release: report.release, ruleset: report.ruleset, releaseUpdatedAt: report.releaseUpdatedAt, capturedAt: report.finishedAt };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  insist(args[0] === "--write" && args.length === 1 || args[0] === "--check" && (args.length === 1 || args.length === 3 && args[1] === "--evidence"), "use_write_or_check_optional_evidence");
  if (args[0] === "--write") {
    fs.mkdirSync(path.join(ROOT, DIRECTORY), { recursive: true });
    for (const [name, content] of Object.entries(build())) fs.writeFileSync(path.join(ROOT, DIRECTORY, name), content);
  }
  const result = check();
  if (args[1] === "--evidence") result.readback = validateReadback(path.resolve(args[2]));
  console.log(JSON.stringify({ ...result, action: "Local verification only; no deployment performed." }, null, 2));
}
module.exports = { ROOT, DIRECTORY, PROJECT, BASE, BASE_SHA256, CANDIDATE_SHA256, hash, draftSection, deriveCandidate, build, check, validateReadback };
