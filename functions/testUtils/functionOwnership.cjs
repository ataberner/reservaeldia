const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const registry = require("../functionOwnership.json");
const { endpointHash } = require("./paymentsManifest.cjs");

const namesFor = codebase => registry.endpoints.filter(e => e.codebase === codebase).map(e => e.name).sort();

function validateRegistry(value = registry) {
  assert.equal(value.schemaVersion, 1, "Unsupported ownership registry");
  assert.deepEqual(Object.keys(value.codebases).sort(), ["default", "email", "payments"]);
  const identities = new Set();
  for (const entry of value.endpoints) {
    assert.ok(entry.name && Object.hasOwn(value.domains, entry.domain), `Unassigned domain: ${entry.name}`);
    assert.equal(entry.codebase, value.domains[entry.domain], `Domain ownership: ${entry.name}`);
    const owner = value.codebases[entry.codebase];
    assert.ok(owner, `Unknown codebase: ${entry.name}`);
    assert.match(entry.manifestHash, /^[a-f0-9]{64}$/, `Missing metadata parity: ${entry.name}`);
    assert.ok(entry.regions.length > 0, `Missing region: ${entry.name}`);
    for (const region of entry.regions) {
      assert.equal(typeof region, "string");
      const id = `${entry.name}/${region}`;
      assert.ok(!identities.has(id), `Duplicate registry identity: ${id}`);
      identities.add(id);
    }
    assert.equal(new Set(entry.secrets).size, entry.secrets.length, `Duplicate secret binding: ${entry.name}`);
    for (const secret of entry.secrets) assert.ok(owner.allowedSecrets.includes(secret), `Secret outside owner allowlist: ${entry.name}/${secret}`);
    if (Object.hasOwn(entry, "deployBlocker")) {
      const blocker = entry.deployBlocker;
      assert.ok(blocker && typeof blocker === "object", `Invalid deploy blocker: ${entry.name}`);
      assert.equal(blocker.classification, "C", `Unresolved limit classification: ${entry.name}`);
      assert.ok(Number.isInteger(blocker.remoteMaxInstances) && blocker.remoteMaxInstances > 0, `Invalid observed limit: ${entry.name}`);
      assert.equal(typeof blocker.evidence, "string", `Missing blocker evidence: ${entry.name}`);
      assert.match(blocker.evidence, /^docs\/operations\/[A-Z0-9_]+\.md(?:#[a-z0-9-]+)?$/, `Invalid blocker evidence: ${entry.name}`);
    }
  }
}

function assertPartition(manifests, value = registry) {
  validateRegistry(value);
  assert.deepEqual(Object.keys(manifests).sort(), Object.keys(value.codebases).sort(), "Missing/unexpected codebase");
  const seen = new Set(), matched = new Set(), counts = {};
  for (const [codebase, manifest] of Object.entries(manifests)) {
    counts[codebase] = Object.keys(manifest.endpoints).length;
    for (const [name, endpoint] of Object.entries(manifest.endpoints)) {
      const regions = endpoint.region;
      assert.ok(Array.isArray(regions) && regions.length, `Missing discovered region: ${name}`);
      // Check identity before ownership so a cross-codebase duplicate cannot be
      // hidden by object spread or by a generation change.
      for (const region of regions) {
        const id = `${name}/${region}`;
        assert.ok(!seen.has(id), `Duplicate endpoint: ${id}`);
        seen.add(id);
      }
      const entry = value.endpoints.find(e => e.name === name && regions.some(r => e.regions.includes(r)));
      assert.ok(entry, `Unregistered endpoint: ${name}; assign ownership before exporting`);
      assert.equal(codebase, entry.codebase, `Wrong owner: ${name}; expected ${entry.codebase}`);
      assert.deepEqual([...regions].sort(), [...entry.regions].sort(), `Region drift: ${name}`);
      const secrets = (endpoint.secretEnvironmentVariables || []).map(s => s.key).sort();
      for (const secret of secrets) assert.ok(value.codebases[codebase].allowedSecrets.includes(secret), `Secret outside owner allowlist: ${name}/${secret}`);
      assert.deepEqual(secrets, [...entry.secrets].sort(), `Unexpected secret bindings: ${name}`);
      assert.equal(endpointHash(endpoint), entry.manifestHash, `Metadata drift: ${name}; review manifest options, do not blindly refresh the registry`);
      matched.add(entry);
    }
  }
  for (const entry of value.endpoints) assert.ok(matched.has(entry), `Missing registered endpoint: ${entry.name}/${entry.regions.join(",")}`);
  return { counts, total: matched.size, duplicates: 0, unknown: 0 };
}

function assertConfigurationNames(codebase, names, value = registry) {
  const owner = value.codebases[codebase];
  assert.ok(owner, "Unknown configuration owner");
  const secrets = new Set([...Object.values(value.codebases).flatMap(c => c.allowedSecrets), "MERCADO_PAGO_CLIENT_SECRET"]);
  const invalid = names.filter(name => secrets.has(name) || owner.forbiddenEnvironment?.includes(name) ||
    (owner.allowedEnvironment && !owner.allowedEnvironment.includes(name)));
  assert.deepEqual(invalid, [], `Configuration outside ${codebase} allowlist (names only)`);
}

// Inspect names before isolation removes personal dotenv files. Never load their
// values into process.env, copy them into a test workspace, or report contents.
function assertSourceConfigurationNames(root, codebases = Object.keys(registry.codebases)) {
  for (const codebase of codebases) {
    const owner = registry.codebases[codebase];
    assert.ok(owner, "Unknown configuration owner");
    const directory = path.join(root, owner.source);
    for (const file of fs.readdirSync(directory).filter(name => /^\.env(?:\.|$)/.test(name))) {
      const source = fs.readFileSync(path.join(directory, file), "utf8");
      const names = [...source.matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*(?:=|:\s)/gm)].map(match => match[1]);
      assertConfigurationNames(codebase, names);
    }
  }
}

// Observed remote values are evidence, never runtime configuration. Releasing a
// blocker requires a documented A/B decision and reviewed source/manifest parity.
function assertDeployReady(codebase, value = registry) {
  validateRegistry(value);
  assert.ok(Object.hasOwn(value.codebases, codebase), "Specify a registered codebase for predeploy");
  const blockers = value.endpoints.filter(e => e.codebase === codebase && e.deployBlocker);
  assert.equal(blockers.length, 0, blockers.map(e =>
    `DEPLOY BLOCKER ${codebase}/${e.name} (${e.regions.join(",")}): maxInstances remoto=${e.deployBlocker.remoteMaxInstances}, clase C; ${e.deployBlocker.evidence}`
  ).join("\n"));
}

module.exports = { registry, namesFor, validateRegistry, assertPartition, assertConfigurationNames, assertSourceConfigurationNames, assertDeployReady };
