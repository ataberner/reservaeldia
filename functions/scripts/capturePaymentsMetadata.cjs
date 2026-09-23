// Read-only control-plane metadata. Never requests environment values or Secret Manager.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { paymentNames } = require("../testUtils/paymentsManifest.cjs");

const project = "reservaeldia-7a440";
const serviceFields = ["availableMemory", "availableCpu", "timeoutSeconds", "maxInstanceRequestConcurrency", "serviceAccountEmail", "uri", "ingressSettings", "allTrafficOnLatestRevision"];
const fields = `name,environment,url,eventTrigger,labels,buildConfig(runtime,entryPoint),serviceConfig(${serviceFields.join(",")},secretEnvironmentVariables(key,projectId,secret,version))`;
const pick = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));

function sanitize(resource) {
  assert.equal(resource.environment, "GEN_2", "Unexpected generation: review migration before deployment");
  assert.ok(paymentNames.some(name => resource.name === `projects/${project}/locations/us-central1/functions/${name}`), "Unexpected Function identity");
  assert.equal(resource.eventTrigger, undefined, "Expected HTTPS Functions");
  assert.equal(resource.serviceConfig?.environmentVariables, undefined, "Server-side field selection was not respected");
  return {
    ...pick(resource, ["name", "environment", "url"]),
    trigger: resource.labels?.["deployment-callable"] === "true" ? "callable" : "https",
    labels: pick(resource.labels, ["firebase-functions-codebase", "deployment-callable", "deployment-tool"]),
    buildConfig: pick(resource.buildConfig, ["runtime", "entryPoint"]),
    serviceConfig: {
      ...pick(resource.serviceConfig, serviceFields),
      secretEnvironmentVariables: (resource.serviceConfig?.secretEnvironmentVariables || []).map(secret => pick(secret, ["key", "projectId", "secret", "version"])),
    },
  };
}

async function main() {
  const [cliArgument, outputArgument] = process.argv.slice(2);
  const root = path.resolve(__dirname, "../..");
  const output = path.resolve(outputArgument || path.join(root, ".local-isolation/payments-activation/remote-current.json"));
  assert.ok(output.startsWith(root + path.sep) && output.endsWith(".json"), "Output must be a JSON file inside this repository");
  assert.equal(fs.existsSync(output), false, "Refusing to overwrite an existing baseline");
  const cli = path.resolve(cliArgument || "");
  const logger = require(path.join(cli, "lib/logger.js")).logger;
  for (const method of ["info", "warn", "error", "debug"]) logger[method] = () => {};
  const auth = require(path.join(cli, "lib/auth.js"));
  const account = auth.getProjectDefaultAccount(root) || auth.getGlobalDefaultAccount();
  assert.ok(account?.tokens, "No existing Firebase CLI authentication available");
  let bearer = account.tokens.access_token;
  if (!bearer || account.tokens.expires_at <= Date.now() + 60_000) {
    // Refresh the existing Google OAuth session in memory; do not persist credentials.
    const api = require(path.join(cli, "lib/api.js"));
    const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
      method: "POST", signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.tokens.refresh_token, client_id: api.clientId(), client_secret: api.clientSecret() }),
    });
    assert.ok(response.ok, `Google OAuth authentication failed (HTTP ${response.status})`);
    bearer = (await response.json()).access_token;
    assert.equal(typeof bearer, "string", "Google OAuth did not return an access token");
  }
  const functions = [];
  for (const name of paymentNames) {
    const url = new URL(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions/${name}`);
    url.searchParams.set("fields", fields);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `Metadata read failed for ${name} (HTTP ${response.status})`);
    functions.push(sanitize(await response.json()));
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ capturedAt: new Date().toISOString(), project, method: "Cloud Functions v2 functions.get with server-side fields selection", fields, functions }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ok: true, baseline: path.relative(root, output), endpoints: functions.length }));
}

if (require.main === module) main().catch(error => {
  // Never print SDK responses, auth payloads, environment values or arbitrary errors.
  console.error(JSON.stringify({ ok: false, errorType: error.name, code: error.code || null, check: error.name === "AssertionError" ? error.message : "Metadata capture failed; no raw response logged" }));
  process.exitCode = 1;
});
module.exports = { fields, sanitize };
