import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const rejectNetwork = () => { networkAttempts++; throw new Error("Network forbidden in welcome smoke tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const { createWelcomeEmailTestHandler, testWelcomeEmail } = requireBuiltModule("lib/emails/welcomeEmailTestFunction.js");
const { testTransactionalEmail } = requireBuiltModule("lib/emails/testEmailFunction.js");
const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const { createTransactionalEmailService } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const { createSesTransport } = requireBuiltModule("lib/emails/sesClient.js");
process.env.EMAIL_MODE = "sandbox"; // Offline fake SES path; never loads deployment dotenv.
const accepted = { ok: true, state: "accepted", messageId: "synthetic-welcome-id", errorCode: null, retryable: false };
const request = () => ({ method: "POST", body: {}, query: {} });
const sandboxMode = () => "sandbox";
function response() {
  return { headers: {}, statusCode: 200, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test("welcome smoke declares private IAM and the technical email's exact dedicated runtime options", () => {
  assert.deepEqual(testWelcomeEmail.__endpoint, testTransactionalEmail.__endpoint);
  const endpoint = testWelcomeEmail.__endpoint;
  assert.deepEqual(endpoint.httpsTrigger.invoker, ["private"]);
  assert.equal(endpoint.serviceAccountEmail, "email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com");
  assert.deepEqual(endpoint.secretEnvironmentVariables.map(secret => secret.key).sort(), ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]);
  assert.deepEqual(endpoint.region, ["us-central1"]);
  assert.equal(endpoint.maxInstances, 1);
  assert.equal(endpoint.concurrency, 1);
  assert.equal(endpoint.timeoutSeconds, 20);
});

test("welcome smoke fixes recipient, template, synthetic data and consumes a small per-instance quota", async () => {
  const sent = [];
  let now = 0;
  const handler = createWelcomeEmailTestHandler(async input => { sent.push(input); return accepted; }, () => now, sandboxMode);
  const invoke = async () => { const res = response(); await handler(request(), res); return res; };
  assert.equal((await invoke()).statusCode, 200);
  now = 59_999;
  assert.equal((await invoke()).statusCode, 429);
  now = 60_000;
  assert.equal((await invoke()).statusCode, 200);
  now = 120_000;
  assert.equal((await invoke()).statusCode, 200);
  now = 180_000;
  assert.equal((await invoke()).statusCode, 429);
  assert.equal(sent.length, 3);
  assert.equal(new Set(sent.map(input => input.metadata.correlationId)).size, 3);
  for (const input of sent) {
    assert.deepEqual(input, { to: "reservaeldia.invitaciones@gmail.com", template: "welcome",
      data: { name: "Agustín", dashboardUrl: "https://reservaeldia.com.ar/dashboard" },
      metadata: { correlationId: input.metadata.correlationId } });
    assert.match(input.metadata.correlationId, /^email-test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("welcome smoke rejects arbitrary body fields, every query and non-POST methods before any sender", async () => {
  let calls = 0;
  const handler = createWelcomeEmailTestHandler(async () => { calls++; return accepted; }, () => 0, sandboxMode);
  const invalid = [
    ...["GET", "PUT", "DELETE", "OPTIONS"].map(method => [{ ...request(), method }, 405]),
    ...["to", "subject", "html", "text", "template", "data", "name", "dashboardUrl", "cc", "bcc", "headers", "metadata", "from", "replyTo", "ReplyToAddresses"]
      .map(key => [{ ...request(), body: { [key]: "injected" } }, 400]),
    ...[null, [], "{}", "injected", 1, false].map(body => [{ ...request(), body }, 400]),
    ...["to", "template", "unknown"].map(key => [{ ...request(), query: { [key]: "" } }, 400]),
  ];
  for (const [input, status] of invalid) {
    const res = response(); await handler(input, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers["Cache-Control"], "no-store");
    if (status === 405) assert.equal(res.headers.Allow, "POST");
  }
  assert.equal(calls, 0);
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200, "invalid input does not consume an attempt");
});

test("welcome smoke accepts only the three empty-body representations", async () => {
  for (const body of [undefined, "", {}]) {
    const handler = createWelcomeEmailTestHandler(async () => accepted, () => 0, sandboxMode);
    const res = response(); await handler({ ...request(), body }, res);
    assert.equal(res.statusCode, 200);
  }
});

test("welcome smoke requires exact sandbox mode, independent of future service capabilities", async () => {
  let calls = 0, mode;
  const handler = createWelcomeEmailTestHandler(async () => { calls++; return accepted; }, () => 0, () => mode);
  for (mode of [undefined, "", "disabled", "production", "SANDBOX", " sandbox ", null, 1]) {
    const res = response(); await handler(request(), res);
    assert.equal(res.statusCode, 412);
    assert.deepEqual(res.body, { errorCode: "WELCOME_TEST_SANDBOX_REQUIRED" });
  }
  assert.equal(calls, 0);
  mode = "sandbox";
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1, "blocked modes do not consume an attempt");
});

test("welcome smoke traverses the existing service, React Email and SES v2 with a fake client only", async () => {
  const commands = [], logs = [];
  const transport = createSesTransport(() => ({ send: async command => {
    commands.push(command.input); return { MessageId: accepted.messageId };
  } }));
  const service = createTransactionalEmailService({ getMode: sandboxMode, render: renderEmail, transport, log: entry => logs.push(entry) });
  const handler = createWelcomeEmailTestHandler(service, () => 0, sandboxMode);
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "accepted");
  assert.equal(commands.length, 1);
  const command = commands[0];
  assert.equal(command.FromEmailAddress, "=?UTF-8?B?UmVzZXJ2YSBlbCBEw61h?= <notificaciones@reservaeldia.com.ar>");
  assert.deepEqual(command.ReplyToAddresses, ["=?UTF-8?B?QWd1cyBkZSBSZXNlcnZhIGVsIETDrWE=?= <hola@reservaeldia.com.ar>"]);
  assert.equal(command.Content.Simple.Headers, undefined);
  assert.equal(command.Content.Raw, undefined);
  assert.deepEqual(command.Destination, { ToAddresses: ["reservaeldia.invitaciones@gmail.com"] });
  assert.equal(command.Content.Simple.Subject.Data, "Bienvenido a Reserva el Día");
  for (const format of ["Html", "Text"]) {
    assert.equal(command.Content.Simple.Body[format].Charset, "UTF-8");
    assert.match(command.Content.Simple.Body[format].Data, /Agustín/);
    assert.match(command.Content.Simple.Body[format].Data, /https:\/\/reservaeldia\.com\.ar\/dashboard/);
  }
  assert.equal(logs[0].template, "welcome");
  assert.equal(logs[0].mode, "sandbox");
  assert.doesNotMatch(JSON.stringify(logs), /Agustín|@|https:|<html/);
});

test("welcome smoke maps blocked, failed and ambiguous outcomes without retries and counts failed attempts", async () => {
  for (const [state, errorCode, status] of [["blocked", "EMAIL_DISABLED", 412],
    ["failed", "SES_REJECTED", 502], ["unknown", "SES_TIMEOUT", 504]]) {
    let calls = 0;
    const handler = createWelcomeEmailTestHandler(async () => {
      calls++; return { ok: false, state, messageId: null, errorCode, retryable: false };
    }, () => 0, sandboxMode);
    const res = response(); await handler(request(), res);
    assert.equal(res.statusCode, status);
    assert.equal(res.body.retryable, false);
    assert.equal(res.body.errorCode, errorCode);
    assert.equal(calls, 1);
    const blocked = response(); await handler(request(), blocked);
    assert.equal(blocked.statusCode, 429);
    assert.equal(calls, 1);
  }
});

test("local emulator launcher blocks the new export without invoking it", async () => {
  const context = { exports: {}, process: { env: {} }, require(name) {
    if (name === "./sessionEnvironment.json") return { EMAIL_MODE: "disabled" };
    if (name === "./networkGuard.cjs") return {};
    if (name.endsWith("/firebaseAdmin.js")) return { localBackendEnvironment: () => ({}) };
    if (name.endsWith("/index.js")) return {};
    if (name.endsWith("/emails/entrypoint.js")) return { testWelcomeEmail, onUserCreatedWelcomeEmail: { run() {} } };
    if (name === "firebase-functions/v1") return { region: () => ({ auth: { user: () => ({ onCreate: handler => handler }) } }) };
    if (name === "firebase-functions/v2/https") return { onRequest: (_options, handler) => handler };
    throw new Error(`Unexpected import: ${name}`);
  } };
  runInNewContext(readFileSync(new URL("../scripts/local/functionsEntry.cjs", import.meta.url), "utf8"), context);
  const res = response(); await context.exports.testWelcomeEmail({}, res);
  assert.equal(res.statusCode, 412);
  assert.match(res.body.error, /LOCAL_FLOW_DISABLED: testWelcomeEmail/);
});

test("discovery is lazy, reads no parameters and the default handler delegates to the one sender", () => {
  const child = spawnSync(process.execPath, ["--require", "../scripts/local/networkGuard.cjs", "-e", `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    let senderLoads = 0;
    const sent = [];
    Module._load = function(id) {
      if (id === './sendTransactionalEmail') {
        senderLoads++;
        return {sendTransactionalEmail: async input => {sent.push(input); return ${JSON.stringify(accepted)};}};
      }
      if (id === 'react-email' || id.startsWith('@aws-sdk/')) throw new Error('Eager email runtime');
      return original.apply(this, arguments);
    };
    const config = require('./lib/emails/config.js');
    for (const param of [config.emailMode,config.awsSesAccessKeyId,config.awsSesSecretAccessKey]) {
      param.value = () => {throw new Error('Runtime parameter accessed during discovery');};
    }
    const {createWelcomeEmailTestHandler} = require('./lib/emails/welcomeEmailTestFunction.js');
    assert.equal(senderLoads, 0);
    config.emailMode.value = () => 'sandbox';
    const handler = createWelcomeEmailTestHandler();
    const res = {set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;}};
    (async () => {
      await handler({method:'POST',body:{to:'injected'},query:{}},res);
      assert.equal(res.code,400); assert.equal(senderLoads,0);
      await handler({method:'POST',body:{},query:{}},res);
      assert.equal(res.code,200); assert.equal(senderLoads,1);
      assert.equal(sent.length,1); assert.equal(sent[0].template,'welcome');
      assert.deepEqual(sent[0].data,{name:'Agustín',dashboardUrl:'https://reservaeldia.com.ar/dashboard'});
      assert.deepEqual(require('../scripts/local/networkGuard.cjs').attempts,[]);
    })().catch(error => {console.error(error);process.exitCode=1});
  `], { cwd: new URL("./", import.meta.url), encoding: "utf8", timeout: 20_000, windowsHide: true });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test.after(() => {
  assert.equal(networkAttempts, 0, "no external effects are permitted");
  mock.restoreAll();
});
