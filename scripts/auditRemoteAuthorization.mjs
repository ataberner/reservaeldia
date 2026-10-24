// Control-plane inventory only. No application handlers, content downloads or writes.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PROJECT = "reservaeldia-7a440";
const sha = value => createHash("sha256").update(value).digest("hex");
const securityNames = ["copiarPlantilla", "copiarPlantillaHTML", "verInvitacion"];

// Firebase CLI 14.4.0 omits this label for the default codebase.
export const effectiveCodebase = label => label || "default";

export function safeRulesSource(source, knownSources) {
  const literal = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
  const known = new Set(knownSources.flatMap(text => text.match(literal) || []));
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "")
    .replace(literal, value => known.has(value) ? value : '"[REDACTED_LITERAL]"');
}

export function assertControlRead(raw, method = "GET", body) {
  const url = new URL(raw), p = url.pathname;
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) throw new Error("invalid_target");
  const project = `projects/${PROJECT}`;
  const read = method === "GET" && body === undefined;
  const allowed = read && (
    (url.hostname === "cloudfunctions.googleapis.com" && new RegExp(`^/v[12]/${project}/locations/[-a-z0-9]+/functions(?:/[A-Za-z][A-Za-z0-9_]*(?::getIamPolicy)?)?$`).test(p)) ||
    (url.hostname === "firebaserules.googleapis.com" && new RegExp(`^/v1/${project}/(?:releases(?:/[a-zA-Z0-9._/-]+)?|rulesets/[a-zA-Z0-9-]+)$`).test(p)) ||
    (url.hostname === "run.googleapis.com" && new RegExp(`^/v2/${project}/locations/us-central1/services/[a-z0-9-]+(?::getIamPolicy|/revisions)?$`).test(p)) ||
    (url.hostname === "cloudresourcemanager.googleapis.com" && new RegExp(`^/v3/(?:${project}|folders/[0-9]+|organizations/[0-9]+)$`).test(p))
  );
  const policy = url.hostname === "cloudresourcemanager.googleapis.com" && method === "POST" &&
    new RegExp(`^/v3/(?:${project}|folders/[0-9]+|organizations/[0-9]+):getIamPolicy$`).test(p) &&
    JSON.stringify(body) === JSON.stringify({ options: { requestedPolicyVersion: 3 } });
  if (!allowed && !policy) throw new Error("request_not_read_only");
  if ([...url.searchParams.keys()].some(key => !["fields", "pageSize", "pageToken", "options.requestedPolicyVersion"].includes(key))) throw new Error("invalid_query");
  if (/environmentVariables|secretEnvironmentVariables|secretVolumes/i.test(url.searchParams.get("fields") || "")) throw new Error("sensitive_projection");
}

export function summarizePolicy(policy) {
  return {
    version: policy.version || 1, etag: policy.etag || null,
    bindings: (policy.bindings || []).map(binding => ({ role: binding.role,
      publicMembers: (binding.members || []).filter(m => ["allUsers", "allAuthenticatedUsers"].includes(m)),
      otherMemberCount: (binding.members || []).filter(m => !["allUsers", "allAuthenticatedUsers"].includes(m)).length,
      conditional: Boolean(binding.condition), conditionSha256: binding.condition ? sha(JSON.stringify(binding.condition)) : null,
    })),
  };
}

export async function createControlReader({ getToken, fetchImpl = fetch, now = Date.now }) {
  const usage = { requests: 0, bytes: 0 }, started = now();
  return { usage, async request(url, { method = "GET", body } = {}) {
    assertControlRead(url, method, body);
    if (usage.requests >= 150 || usage.bytes >= 16 * 1024 * 1024 || now() - started > 300000) throw new Error("bounded_read_limit");
    usage.requests++;
    const token = await getToken();
    const response = await fetchImpl(url, { method, redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`http_${response.status}`); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body || []) {
      length += chunk.length; usage.bytes += chunk.length;
      if (length > 4 * 1024 * 1024 || usage.bytes > 16 * 1024 * 1024) { await response.body?.cancel().catch(() => {}); throw new Error("response_limit"); }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } };
}

function api(host, pathname, query = {}) {
  const url = new URL(`https://${host}/${pathname}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}

export async function auditControlPlane(reader, directory, root = process.cwd()) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "control-plane.json");
  const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) :
    { schemaVersion: 1, project: PROJECT, startedAt: new Date().toISOString(), steps: {}, errors: {}, observations: [] };
  if (report.project !== PROJECT || report.schemaVersion !== 1) throw new Error("checkpoint_mismatch");
  report.runs ||= report.finishedAt ? [{ startedAt: report.startedAt, finishedAt: report.finishedAt, usage: report.usage }] : [];
  const resumedAt = new Date().toISOString();
  report.stepObservedAt ||= {};
  const save = () => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(report, null, 2)); fs.renameSync(tmp, file); };
  async function step(key, action) {
    if (Object.hasOwn(report.steps, key)) return report.steps[key];
    try { const value = await action(); report.steps[key] = value; report.stepObservedAt[key] = new Date().toISOString(); delete report.errors[key]; save(); return value; }
    catch (error) { report.errors[key] = /^http_\d+$|^[a-z_]+$/.test(error.message) ? error.message : "read_failed"; save(); return null; }
  }
  async function pages(key, host, pathname, property, fields, transform) {
    const items = []; let pageToken, index = 0, unreachable = [];
    do {
      const page = await step(`${key}_page_${index++}`, async () => {
        const value = await reader.request(api(host, pathname, { fields, pageSize: 100, pageToken }));
        return { items: (value[property] || []).map(transform), nextPageToken: value.nextPageToken || null, unreachable: value.unreachable || [] };
      });
      if (!page) return { complete: false, items };
      items.push(...page.items); unreachable.push(...page.unreachable); pageToken = page.nextPageToken;
      if (index > 30) throw new Error("page_limit");
    } while (pageToken);
    return { complete: unreachable.length === 0, items, unreachable };
  }
  const v2 = await pages("functions_v2", "cloudfunctions.googleapis.com", `v2/projects/${PROJECT}/locations/-/functions`, "functions",
    "functions(name,environment,state,updateTime,labels,buildConfig(runtime,entryPoint),serviceConfig(service,timeoutSeconds,ingressSettings,allTrafficOnLatestRevision)),nextPageToken,unreachable",
    f => ({ name: f.name, generation: f.environment, state: f.state, updatedAt: f.updateTime,
      runtime: f.buildConfig?.runtime, entryPoint: f.buildConfig?.entryPoint, codebase: f.labels?.["firebase-functions-codebase"] || null,
      service: f.serviceConfig?.service || null, timeoutSeconds: f.serviceConfig?.timeoutSeconds,
      ingress: f.serviceConfig?.ingressSettings, allTrafficOnLatestRevision: f.serviceConfig?.allTrafficOnLatestRevision }));
  report.functions = v2;
  const v1 = await pages("functions_v1", "cloudfunctions.googleapis.com", `v1/projects/${PROJECT}/locations/-/functions`, "functions",
    "functions(name,status,updateTime,runtime,entryPoint,labels,timeout,ingressSettings),nextPageToken,unreachable",
    f => ({ name: f.name, generation: "GEN_1", state: f.status, updatedAt: f.updateTime, runtime: f.runtime,
      entryPoint: f.entryPoint, codebase: f.labels?.["firebase-functions-codebase"] || null, timeout: f.timeout, ingress: f.ingressSettings }));
  report.functionsV1 = v1;
  const identities = new Map(v2.items.map(f => [f.name, f]));
  for (const f of v1.items) if (!identities.has(f.name)) identities.set(f.name, f);
  const expected = JSON.parse(fs.readFileSync(path.join(root, "docs/testing/DRAFT_PROVIDER_RUNTIME_TARGETS.json")));
  const targets = [...expected.securityTargets, ...expected.runtimeOnlyTargets];
  const expectedNames = new Set(targets.map(t => `projects/${PROJECT}/locations/${t.region}/functions/${t.name}`));
  report.comparison = { expected: targets.length, observed: identities.size,
    missing: [...expectedNames].filter(n => !identities.has(n)), extra: [...identities.keys()].filter(n => !expectedNames.has(n)),
    codebaseDifferences: targets.filter(t => identities.has(`projects/${PROJECT}/locations/${t.region}/functions/${t.name}`) &&
      effectiveCodebase(identities.get(`projects/${PROJECT}/locations/${t.region}/functions/${t.name}`).codebase) !== t.codebase).map(t => t.name),
    absentDefaultCodebaseLabels: [...identities.values()].filter(f => !f.codebase).length,
    codebases: {}, runtimes: {}, generations: {} };
  for (const f of identities.values()) {
    const codebase = effectiveCodebase(f.codebase);
    report.comparison.codebases[codebase] = (report.comparison.codebases[codebase] || 0) + 1;
  }
  for (const f of identities.values()) for (const [field, key] of [["runtime", "runtimes"], ["generation", "generations"]]) {
    const value = f[field] || "unknown"; report.comparison[key][value] = (report.comparison[key][value] || 0) + 1;
  }
  for (const name of securityNames) {
    const f = identities.get(`projects/${PROJECT}/locations/us-central1/functions/${name}`);
    if (!f) continue;
    await step(`function_iam_${name}`, async () => summarizePolicy(await reader.request(api("cloudfunctions.googleapis.com", `${f.generation === "GEN_1" ? "v1" : "v2"}/${f.name}:getIamPolicy`, { "options.requestedPolicyVersion": 3 }))));
    if (f.service) {
      if (!new RegExp(`^projects/${PROJECT}/locations/us-central1/services/[a-z0-9-]+$`).test(f.service)) { report.errors[`service_${name}`] = "unexpected_resource"; continue; }
      await step(`run_service_${name}`, async () => reader.request(api("run.googleapis.com", `v2/${f.service}`, {
        fields: "name,generation,observedGeneration,ingress,invokerIamDisabled,latestReadyRevision,latestCreatedRevision,traffic,trafficStatuses,reconciling,terminalCondition(type,state,reason),template(timeout,maxInstanceRequestConcurrency,scaling)" })));
      await step(`run_iam_${name}`, async () => summarizePolicy(await reader.request(api("run.googleapis.com", `v2/${f.service}:getIamPolicy`, { "options.requestedPolicyVersion": 3 }))));
    }
  }
  let resource = `projects/${PROJECT}`, depth = 0;
  report.ancestry = [];
  while (resource && depth++ < 10) {
    const label = depth === 1 ? "project" : `ancestor_${depth}`;
    const metadata = await step(`${label}_metadata`, async () => reader.request(api("cloudresourcemanager.googleapis.com", `v3/${resource}`, { fields: "name,parent,state" })));
    await step(`${label}_iam`, async () => summarizePolicy(await reader.request(api("cloudresourcemanager.googleapis.com", `v3/${resource}:getIamPolicy`), { method: "POST", body: { options: { requestedPolicyVersion: 3 } } })));
    report.ancestry.push({ resource, metadataObserved: Boolean(metadata), parent: metadata?.parent || null });
    if (!metadata) break;
    resource = metadata.parent;
  }
  const releases = await pages("releases", "firebaserules.googleapis.com", `v1/projects/${PROJECT}/releases`, "releases",
    "releases(name,rulesetName,createTime,updateTime),nextPageToken", x => x);
  report.rules = [];
  for (const release of releases.items.filter(r => r.name.endsWith("/cloud.firestore") || r.name.endsWith("/firebase.storage/reservaeldia-7a440.firebasestorage.app"))) {
    const local = release.name.includes("cloud.firestore") ? "firestore.rules" : "storage.rules";
    const rules = await step(`rules_${local}`, async () => {
      const data = await reader.request(api("firebaserules.googleapis.com", `v1/${release.rulesetName}`, { fields: "name,createTime,source(files(name,content))" }));
      const localText = fs.readFileSync(path.join(root, local), "utf8");
      const head = spawnSync("git", ["show", `HEAD:${local}`], { cwd: root, encoding: "utf8", windowsHide: true });
      const normalize = text => text.replace(/\r\n/g, "\n").trim();
      return { ...release, files: (data.source?.files || []).map(f => ({ name: f.name, bytes: Buffer.byteLength(f.content), sha256: sha(f.content),
        localCandidateEqual: normalize(f.content) === normalize(localText),
        headEqual: head.status === 0 && normalize(f.content) === normalize(head.stdout),
        containsDraftCreation: f.content.includes("draftCreation"),
        containsProviderPublicPredicate: /isProveedorPublicVisible/.test(f.content),
      })) };
    });
    if (rules) report.rules.push(rules);
    if (local === "storage.rules") {
      await step("storage_rules_review", async () => {
        const data = await reader.request(api("firebaserules.googleapis.com", `v1/${release.rulesetName}`, { fields: "name,source(files(name,content))" }));
        const localText = fs.readFileSync(path.join(root, local), "utf8");
        const head = spawnSync("git", ["show", `HEAD:${local}`], { cwd: root, encoding: "utf8", windowsHide: true });
        return { rulesetName: release.rulesetName, files: (data.source?.files || []).map(f => ({
          name: f.name, sha256: sha(f.content), sanitizedSource: safeRulesSource(f.content, [localText, head.status === 0 ? head.stdout : ""]),
        })) };
      });
    }
  }
  report.finishedAt = new Date().toISOString(); report.usage = reader.usage;
  report.runs.push({ startedAt: resumedAt, finishedAt: report.finishedAt, usage: reader.usage });
  report.limitations = ["Control-plane metadata only; no handler calls, private content, payments or communications.",
    "IAM bindings summarized without non-public principals; IAM conditions and deny/PAB policies are not evaluated.",
    "No proof of request draining, production canaries, access logs or old signed URL validity.",
    "Checkpoint is a sequence of dated reads, not an atomic cloud snapshot."];
  save(); return report;
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--execute-read-only") throw new Error("explicit_read_only_mode_required");
  const root = process.cwd(), directory = path.resolve(process.argv[3]);
  const allowed = path.join(root, ".local-isolation") + path.sep;
  if (!directory.startsWith(allowed) || !fs.existsSync(path.join(root, ".node-version"))) throw new Error("invalid_output_directory");
  const credentialPath = path.join(process.env.APPDATA || "", "gcloud", "application_default_credentials.json");
  if (!fs.existsSync(credentialPath)) throw new Error("explicit_existing_adc_missing");
  const credentials = JSON.parse(fs.readFileSync(credentialPath));
  if (credentials.type !== "authorized_user" && credentials.type !== "service_account") throw new Error("unsupported_adc_type");
  const require = createRequire(path.join(root, "functions/package.json"));
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"] });
  const client = await auth.getClient();
  const reader = await createControlReader({ getToken: async () => (await client.getAccessToken()).token });
  const report = await auditControlPlane(reader, directory, root);
  console.log(JSON.stringify({ comparison: report.comparison, errors: report.errors, rules: report.rules, usage: report.usage }));
  if (Object.keys(report.errors).length) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(/^[a-z_]+$/.test(error.message) ? error.message : "control_read_failed"); process.exitCode = 2; });
}
