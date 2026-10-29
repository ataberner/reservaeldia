"use strict";

// Read-only remotely. Compose a provider-page-only Hosting artifact from the
// current release so unrelated, already-published UI remains byte-identical.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { gzipSync } = require("node:zlib");
const { readLocalRelease } = require("./verifyNextStaticRelease.cjs");

const SITE = "reservaeldia-7a440";
const ORIGIN = "https://reservaeldia.com.ar";
const API = "https://firebasehosting.googleapis.com/v1beta1/";
const PANEL = "admin/proveedores/index.html";
const DASHBOARD = "dashboard/index.html";
const REPORT = ".local-isolation/provider-panel-hosting.json";
const LIMITS = Object.freeze({ files: 1000, bytes: 150 * 1024 * 1024, timeoutMs: 30000, concurrency: 6, pageSize: 100 });
const hash = value => createHash("sha256").update(value).digest("hex");
const hostingHash = bytes => hash(gzipSync(bytes, { level: 9 }));
const gzipOsCode = gzipSync(Buffer.alloc(0), { level: 9 })[9];
function matchHostingHash(bytes, expected) {
  const compressed = gzipSync(bytes, { level: 9 });
  // Existing releases were uploaded from Linux and Windows. Node's gzip output
  // differs in the OS header byte only; never accept different payload/deflate bytes.
  for (const os of new Set([compressed[9], 3, 10])) {
    const candidate = Buffer.from(compressed); candidate[9] = os;
    if (hash(candidate) === expected) return os;
  }
  throw new Error("Published content hash mismatch");
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const jsonHash = value => hash(JSON.stringify(stable(value)));
const reserved = name => ["__/firebase/init.js", "__/firebase/init.json"].includes(name);

function safePath(value) {
  assert.equal(typeof value, "string", "File path must be a string");
  const name = value.startsWith("/") ? value.slice(1) : value;
  assert.ok(name && name.length <= 1024 && !/[\\%?#:\u0000-\u001f\u007f]/.test(name), "Unsafe file path");
  assert.ok(name.split("/").every(part => part && part !== "." && part !== ".." && !part.startsWith(".") && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)), "Unsafe file path segment");
  assert.ok(!name.startsWith("__/") || reserved(name), "Reserved Hosting path");
  return name;
}

function validateFileSet(names, limits = LIMITS) {
  assert.ok(names.length <= limits.files, "Hosting file-count limit exceeded");
  const folded = new Set();
  for (const raw of names) {
    const name = safePath(raw).toLowerCase();
    assert.ok(!folded.has(name), "Duplicate or case-colliding file path"); folded.add(name);
  }
  for (const name of folded) {
    const parts = name.split("/");
    for (let index = 1; index < parts.length; index++) assert.ok(!folded.has(parts.slice(0, index).join("/")), "File/directory path collision");
  }
}

function normalizeHosting(hosting) {
  assert.ok(hosting && !Array.isArray(hosting), "A single Hosting configuration is required");
  assert.deepEqual(Object.keys(hosting).sort(), ["headers", "ignore", "public", "rewrites"], "Unsupported Hosting configuration field");
  assert.equal(hosting.public, "out", "Hosting public directory must remain out");
  assert.deepEqual(hosting.ignore, ["firebase.json", "**/.*", "**/node_modules/**"], "Hosting ignore rules changed");
  return {
    headers: hosting.headers.map(rule => {
      assert.deepEqual(Object.keys(rule).sort(), ["headers", "source"]);
      const headers = {};
      for (const entry of rule.headers) {
        assert.deepEqual(Object.keys(entry).sort(), ["key", "value"]);
        assert.ok(!Object.keys(headers).some(key => key.toLowerCase() === entry.key.toLowerCase()), "Duplicate header");
        headers[entry.key] = entry.value;
      }
      return { glob: rule.source, headers };
    }),
    rewrites: hosting.rewrites.map(rule => {
      assert.deepEqual(Object.keys(rule).sort(), rule.destination ? ["destination", "source"] : ["function", "source"]);
      assert.equal(typeof (rule.destination || rule.function), "string");
      return { glob: rule.source, ...(rule.destination ? { path: rule.destination } : { run: { serviceId: rule.function.toLowerCase(), region: "us-central1" } }) };
    }),
  };
}

function releaseIdentity(release) {
  assert.match(release?.name || "", new RegExp(`^sites/${SITE}/releases/[A-Za-z0-9_-]+$`), "Unexpected Hosting release");
  assert.match(release?.version?.name || "", new RegExp(`^sites/${SITE}/versions/[A-Za-z0-9_-]+$`), "Unexpected Hosting version");
  assert.equal(release.version.status, "FINALIZED", "Hosting version must be FINALIZED");
  return { name: release.name, version: release.version.name };
}
function assertSameRelease(expected, actual) {
  assert.deepEqual(releaseIdentity(actual), releaseIdentity(expected), "Concurrent Hosting release changed; reconcile before deployment");
}

function buildId(bytes) {
  const matches = [...bytes.toString("utf8").matchAll(/"buildId":"([A-Za-z0-9_-]+)"/g)];
  assert.equal(matches.length, 1, "Expected one Next.js buildId in page HTML");
  return matches[0][1];
}
function manifest(files) {
  return [...files].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: hash(bytes), hostingHash: hostingHash(bytes) }));
}
function validateBytes(files, limits = LIMITS) {
  validateFileSet([...files.keys()], limits);
  let total = 0;
  for (const bytes of files.values()) { assert.ok(Buffer.isBuffer(bytes), "File content must be bytes"); total += bytes.length; }
  assert.ok(total <= limits.bytes, "Hosting byte limit exceeded");
  return total;
}
function compose(base, candidate, providerBuildId, limits = LIMITS) {
  validateBytes(base, limits); validateBytes(candidate, limits);
  assert.ok(base.has(PANEL) && base.has(DASHBOARD), "Current release must include provider and dashboard HTML");
  assert.ok(candidate.has(PANEL), "Built provider HTML is missing");
  assert.equal(buildId(candidate.get(PANEL)), providerBuildId, "Provider HTML does not match the new build");
  const output = new Map(base), added = [];
  for (const [name, bytes] of candidate) {
    assert.ok(name === PANEL || name.startsWith("_next/static/"), "Candidate exceeds provider/static scope");
    if (name !== PANEL && output.has(name)) assert.ok(output.get(name).equals(bytes), `Immutable asset collision: ${name}`);
    else { output.set(name, bytes); if (name !== PANEL) added.push(name); }
  }
  const dashboardBuildId = buildId(base.get(DASHBOARD));
  for (const id of [providerBuildId, dashboardBuildId]) assert.ok(output.has(`_next/static/${id}/_buildManifest.js`), "Required build manifest is missing");
  const totalBytes = validateBytes(output, limits);
  for (const [name, bytes] of base) if (name !== PANEL) assert.ok(output.get(name).equals(bytes), "Unrelated published bytes changed");
  return { files: output, added: added.sort(), totalBytes, dashboardBuildId, providerBuildId };
}

function inside(root, relative) {
  const absolute = path.resolve(root, safePath(relative));
  assert.ok(absolute.startsWith(path.resolve(root) + path.sep), "Path escapes artifact root");
  return absolute;
}
function assertNormalPath(file) {
  const absolute = path.resolve(file), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) assert.ok(!fs.lstatSync(current).isSymbolicLink(), "Artifact path contains a link");
  }
}
function readFiles(directory, limits = LIMITS) {
  assertNormalPath(directory); assert.ok(fs.statSync(directory).isDirectory(), "Artifact directory missing");
  const files = new Map(); let size = 0;
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "Artifact contains a link");
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else {
        assert.ok(entry.isFile(), "Unsupported artifact file type");
        const name = safePath(path.relative(directory, target).split(path.sep).join("/"));
        size += fs.statSync(target).size; assert.ok(size <= limits.bytes, "Hosting byte limit exceeded");
        assert.ok(files.size < limits.files, "Hosting file-count limit exceeded");
        files.set(name, fs.readFileSync(target));
      }
    }
  }
  visit(directory); validateBytes(files, limits); return files;
}

async function latestRelease(getJson) {
  const response = await getJson(`${API}sites/${SITE}/releases?pageSize=1&fields=releases(name,releaseTime,version(name,status))`);
  const release = response.releases?.[0]; releaseIdentity(release); return release;
}
async function checkConfiguration(getJson, release, normalized) {
  const version = await getJson(`${API}${releaseIdentity(release).version}?fields=name,status,config`);
  assert.equal(version.name, release.version.name); assert.equal(version.status, "FINALIZED");
  assert.deepEqual(version.config, normalized, "Hosting configuration drift");
}
async function listVersionFiles(getJson, release, limits = LIMITS) {
  const rows = [], tokens = new Set(); let token = "";
  do {
    const page = await getJson(`${API}${releaseIdentity(release).version}/files?pageSize=${limits.pageSize}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    assert.ok(Array.isArray(page.files), "Hosting inventory missing files");
    for (const file of page.files) {
      const name = safePath(file.path);
      assert.match(file.hash || "", /^[a-f0-9]{64}$/, "Unexpected Hosting inventory hash");
      assert.equal(file.status, "ACTIVE", "Hosting file must be ACTIVE");
      rows.push({ path: name, hash: file.hash });
    }
    assert.ok(rows.length <= limits.files, "Hosting file-count limit exceeded");
    token = page.nextPageToken || "";
    assert.ok(!token || (!tokens.has(token) && page.files.length), "Invalid inventory pagination");
    tokens.add(token);
  } while (token);
  validateFileSet(rows.map(row => row.path), limits);
  return { files: rows.filter(row => !reserved(row.path)), excluded: rows.filter(row => reserved(row.path)).map(row => row.path) };
}
function publicUrl(name, releaseName) {
  const file = safePath(name); assert.ok(!reserved(file), "Firebase init is not a downloadable artifact");
  const route = file === "index.html" ? "" : file.endsWith("/index.html") ? file.slice(0, -10) : file;
  return `${ORIGIN}/${route.split("/").map(encodeURIComponent).join("/")}?provider-panel-release=${encodeURIComponent(releaseName)}`;
}
async function downloadFiles(rows, release, fetchImpl = fetch, limits = LIMITS) {
  const files = new Map(), observedOsCodes = new Set(); let cursor = 0, total = 0;
  const controller = new AbortController();
  async function worker() {
    while (cursor < rows.length && !controller.signal.aborted) {
      const row = rows[cursor++];
      const response = await fetchImpl(publicUrl(row.path, release.name), { redirect: "error", cache: "no-store", headers: { "cache-control": "no-cache", "accept-encoding": "identity" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(limits.timeoutMs)]) });
      assert.equal(response.status, 200, `Published resource unavailable: ${row.path}`);
      const chunks = []; let fileBytes = 0;
      for await (const chunk of response.body) {
        total += chunk.length; fileBytes += chunk.length;
        assert.ok(total <= limits.bytes, "Hosting download byte limit exceeded"); chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks, fileBytes);
      try { observedOsCodes.add(matchHostingHash(bytes, row.hash)); }
      catch { throw new Error(`Published content hash mismatch: ${row.path}`); }
      files.set(row.path, bytes);
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(limits.concurrency, rows.length) }, () => worker().catch(error => { controller.abort(); throw error; })));
  const failure = results.find(result => result.status === "rejected"); if (failure) throw failure.reason;
  validateBytes(files, limits); files.gzipOsCodes = [...observedOsCodes].sort(); return files;
}

function createGetJson(environment = process.env) {
  let credentials;
  try { credentials = JSON.parse(environment.FIREBASE_SERVICE_ACCOUNT_JSON || ""); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain a service account in memory"); }
  assert.equal(credentials.type, "service_account", "Service-account credentials are required; no implicit ADC fallback");
  assert.equal(credentials.project_id, SITE, "Service account belongs to another project");
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/firebase"] });
  return async url => {
    assert.ok(url.startsWith(`${API}sites/${SITE}/`), "Unexpected control-plane destination");
    try {
      const client = await auth.getClient();
      const response = await client.request({ url, method: "GET", timeout: LIMITS.timeoutMs, retry: false, maxRedirects: 0 });
      return response.data;
    } catch (error) {
      // Never serialize Gaxios errors: they may contain authorization headers.
      throw new Error(`Hosting read failed (${Number(error.response?.status) || "authentication/network"})`);
    }
  };
}

function localConfiguration(root) {
  assertNormalPath(path.join(root, "firebase.json"));
  const bytes = fs.readFileSync(path.join(root, "firebase.json"));
  return { sha256: hash(bytes), normalized: normalizeHosting(JSON.parse(bytes).hosting) };
}
function assertLocalArtifact(root, report) {
  assert.equal(report.schemaVersion, 1); assert.equal(report.status, "prepared"); assert.equal(report.site, SITE); assert.equal(report.origin, ORIGIN);
  assert.equal(localConfiguration(root).sha256, report.firebaseJsonSha256, "Local Firebase configuration changed");
  const files = readFiles(path.join(root, "out"));
  assert.deepEqual(manifest(files), report.output, "Prepared Hosting artifact changed");
  assertNormalPath(path.join(root, ".next/BUILD_ID"));
  assert.equal(fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim(), report.dashboardBuildId);
  assert.equal(buildId(files.get(PANEL)), report.providerBuildId);
  readLocalRelease(root); return files;
}

async function run({ mode, root = process.cwd(), getJson, fetchImpl = fetch, limits = LIMITS }) {
  assert.ok(["prepare", "assert-current", "verify"].includes(mode), "Choose prepare, assert-current or verify");
  root = path.resolve(root); assertNormalPath(root);
  const reportFile = path.join(root, REPORT), config = localConfiguration(root);
  assertNormalPath(reportFile);
  const release = await latestRelease(getJson);
  await checkConfiguration(getJson, release, config.normalized);
  if (mode !== "prepare") {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    assertLocalArtifact(root, report);
    if (mode === "assert-current") {
      assertSameRelease(report.baseRelease, release); assertSameRelease(release, await latestRelease(getJson));
      return { status: "current", release: release.name, dashboardBuildId: report.dashboardBuildId, providerBuildId: report.providerBuildId };
    }
    assert.notEqual(release.name, report.baseRelease.name, "Expected a new Hosting release");
    assert.notEqual(release.version.name, report.baseRelease.version.name, "Expected a new Hosting version");
    const inventory = await listVersionFiles(getJson, release, limits);
    assert.deepEqual(inventory.files.map(row => [row.path, row.hash]).sort(), report.output.map(row => [row.path, row.hostingHash]).sort(), "Published inventory differs from prepared artifact");
    const selected = inventory.files.filter(row => [PANEL, DASHBOARD].includes(row.path));
    const publicFiles = await downloadFiles(selected, release, fetchImpl, limits);
    for (const [name, bytes] of publicFiles) assert.equal(hash(bytes), report.output.find(row => row.path === name).sha256);
    assertSameRelease(release, await latestRelease(getJson)); assertLocalArtifact(root, report);
    const evidence = { status: "verified", checkedAt: new Date().toISOString(), site: SITE, release, baseRelease: report.baseRelease, files: inventory.files.length, outputSha256: jsonHash(report.output), configurationSha256: jsonHash(config.normalized), publicChecks: [...publicFiles.keys()], dashboardBuildId: report.dashboardBuildId, providerBuildId: report.providerBuildId, remoteMutations: 0 };
    const verifiedFile = path.join(root, ".local-isolation/provider-panel-hosting-verified.json");
    assertNormalPath(verifiedFile);
    fs.writeFileSync(verifiedFile, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
    return evidence;
  }
  assert.ok(!fs.existsSync(reportFile), "Prepared report already exists; preserve it and reconcile before another preparation");
  assertNormalPath(path.join(root, ".next/BUILD_ID"));
  const originalBuildId = fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8");
  const providerBuildId = originalBuildId.trim(); assert.match(providerBuildId, /^[A-Za-z0-9_-]+$/);
  const built = readFiles(path.join(root, "out"), limits);
  const candidate = new Map([...built].filter(([name]) => name === PANEL || name.startsWith("_next/static/")));
  const inventory = await listVersionFiles(getJson, release, limits);
  const base = await downloadFiles(inventory.files, release, fetchImpl, limits);
  const composed = compose(base, candidate, providerBuildId, limits);
  assertSameRelease(release, await latestRelease(getJson));
  assert.equal(localConfiguration(root).sha256, config.sha256, "Local configuration changed during preparation");
  assert.deepEqual(manifest(readFiles(path.join(root, "out"), limits)), manifest(built), "Build artifact changed during preparation");
  const isolation = path.join(root, ".local-isolation"); assertNormalPath(isolation); fs.mkdirSync(isolation, { recursive: true });
  const job = fs.mkdtempSync(path.join(isolation, "provider-panel-hosting-"));
  const staging = path.join(job, "out"); fs.mkdirSync(staging);
  for (const [name, bytes] of composed.files) { const file = inside(staging, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: "wx" }); }
  fs.mkdirSync(path.join(job, ".next")); fs.writeFileSync(path.join(job, ".next/BUILD_ID"), composed.dashboardBuildId);
  readLocalRelease(job);
  const report = { schemaVersion: 1, status: "prepared", preparedAt: new Date().toISOString(), site: SITE, origin: ORIGIN, baseRelease: release, limits, gzipOsCode, sourceGzipOsCodes: base.gzipOsCodes, firebaseJsonSha256: config.sha256, configurationSha256: jsonHash(config.normalized), inventorySha256: jsonHash(inventory.files), excludedReservedFiles: inventory.excluded, dashboardBuildId: composed.dashboardBuildId, providerBuildId, replaced: [PANEL], addedStatic: composed.added, totalBytes: composed.totalBytes, output: manifest(composed.files), preservedExport: path.relative(root, path.join(job, "provider-build-out")).split(path.sep).join("/"), remoteMutations: 0 };
  const output = path.join(root, "out"), backup = path.join(job, "provider-build-out");
  assertNormalPath(output); assertNormalPath(backup);
  let movedOriginal = false, installed = false;
  try {
    fs.renameSync(output, backup); movedOriginal = true;
    fs.renameSync(staging, output); installed = true;
    fs.writeFileSync(path.join(root, ".next/BUILD_ID"), composed.dashboardBuildId + "\n");
    assertLocalArtifact(root, report);
    assertSameRelease(release, await latestRelease(getJson));
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (installed) fs.renameSync(output, path.join(job, "failed-composed-out"));
    if (movedOriginal) fs.renameSync(backup, output);
    fs.writeFileSync(path.join(root, ".next/BUILD_ID"), originalBuildId);
    throw error;
  }
  return report;
}

module.exports = { SITE, ORIGIN, API, PANEL, DASHBOARD, REPORT, LIMITS, hash, hostingHash, matchHostingHash, gzipOsCode, safePath, validateFileSet, normalizeHosting, releaseIdentity, assertSameRelease, buildId, manifest, validateBytes, compose, readFiles, listVersionFiles, publicUrl, downloadFiles, createGetJson, assertLocalArtifact, run };
if (require.main === module) {
  const mode = process.argv[2];
  Promise.resolve().then(() => { assert.equal(process.argv.length, 3, "Choose exactly one mode: prepare, assert-current, verify"); return run({ mode, getJson: createGetJson() }); })
    .then(result => console.log(JSON.stringify({ status: result.status, site: SITE, release: result.release?.name || result.baseRelease?.name || result.release, providerBuildId: result.providerBuildId, dashboardBuildId: result.dashboardBuildId, files: result.output?.length || result.files, remoteMutations: 0 })))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
