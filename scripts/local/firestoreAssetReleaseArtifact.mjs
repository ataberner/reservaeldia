// Offline validation only: no SDK, credentials, remote evidence or deployment.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROJECT = "reservaeldia-7a440";
export const DATABASE = "(default)";
export const BASE_SHA256 = "700e0117fab33ccac394311907976fca5f0334b0b05d92adf709de7f0c12d1f0";
export const ARTIFACT = fileURLToPath(new URL("../../deployment/render-asset-firestore/", import.meta.url));
export const CANONICAL = fileURLToPath(new URL("../../firestore.rules", import.meta.url));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
function insist(value, code) { if (!value) throw new Error(code); }
// Compare bytes, removing only CR immediately before LF. Do not normalize
// whitespace, comments, lone CR, UTF-8, BOM or trailing newlines.
function normalizeLineEndings(bytes) {
  return Buffer.from(bytes.filter((byte, index) => byte !== 13 || bytes[index + 1] !== 10));
}

export function deriveCandidate(base) {
  insist(sha256(base) === BASE_SHA256, "canonical_base_drift");
  const section = base.indexOf(Buffer.from("    // Compatibility fallback for the rest of current app documents."));
  const start = base.indexOf(Buffer.from("      allow read, write: if isSignedIn() &&"), section);
  const endMarker = Buffer.from('collection != "categorias_proveedores";');
  const endOffset = base.indexOf(endMarker, start);
  insist(section >= 0 && start > section && endOffset > start, "canonical_structure_mismatch");
  const end = endOffset + endMarker.length;
  const original = base.subarray(start, end).toString("utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const marker = '        collection != "proveedores" &&';
  insist(original.split(marker).length === 2, "canonical_structure_mismatch");
  // Preserve the previous read predicate byte for byte. Only the independent
  // write predicate excludes the two catalogue namespaces and descendants.
  const read = original.replace("allow read, write:", "allow read:");
  const write = original.replace("allow read, write:", "allow write:").replace(marker,
    `        collection != "iconos" &&${newline}        collection != "decoraciones" &&${newline}${marker}`);
  return Buffer.concat([base.subarray(0, start), Buffer.from(read + newline + write), base.subarray(end)]);
}

export function validateFirestoreAssetArtifact(directory = ARTIFACT, canonical = CANONICAL) {
  const base = fs.readFileSync(path.join(directory, "base.rules"));
  const canonicalBytes = fs.readFileSync(canonical);
  const candidate = fs.readFileSync(path.join(directory, "firestore.rules"));
  const configBytes = fs.readFileSync(path.join(directory, "firebase.json"));
  const config = JSON.parse(configBytes);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
  insist(candidate.equals(deriveCandidate(base)), "candidate_scope_mismatch");
  insist(normalizeLineEndings(canonicalBytes).equals(normalizeLineEndings(base)), "canonical_base_drift");
  insist(JSON.stringify(config) === JSON.stringify({ firestore: [{ database: DATABASE, rules: "firestore.rules" }] }), "config_scope_mismatch");
  insist(manifest.schemaVersion === 1 && manifest.project === PROJECT && manifest.database === DATABASE &&
    manifest.base.file === "base.rules" && manifest.base.source === "exact local canonical snapshot; not deployed-state evidence" &&
    manifest.base.canonicalFile === "firestore.rules" && manifest.base.canonicalComparison === "bytes after CRLF-to-LF normalization only" &&
    manifest.base.sha256 === BASE_SHA256 && manifest.base.bytes === base.length, "manifest_base_mismatch");
  insist(manifest.candidate.file === "firestore.rules" && manifest.candidate.sha256 === sha256(candidate) &&
    manifest.candidate.bytes === candidate.length && manifest.config.file === "firebase.json" &&
    manifest.config.sha256 === sha256(configBytes), "manifest_artifact_mismatch");
  return { project: PROJECT, database: DATABASE, baseSha256: BASE_SHA256,
    candidateSha256: sha256(candidate), configSha256: sha256(configBytes),
    authority: "local candidate only; remote base, release authorization and compatibility remain unverified" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    insist(process.argv.length === 2, "no_arguments_allowed");
    console.log(JSON.stringify({ ...validateFirestoreAssetArtifact(), action: "offline validation only; no deployment performed or authorized" }, null, 2));
  } catch (error) {
    console.error(`Firestore asset artifact blocked: ${/^[a-z_]+$/.test(error.message) ? error.message : "invalid_local_input"}`);
    process.exitCode = 1;
  }
}
