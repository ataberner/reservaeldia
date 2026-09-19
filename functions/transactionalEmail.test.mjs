import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
// Fail before opening a socket, including SDK regressions or imported effects.
let networkAttempts = 0;
const rejectNetwork = () => {
  networkAttempts += 1;
  throw new Error("External network forbidden in email tests");
};
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const { createTransactionalEmailService, sendTransactionalEmail } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const { createSesTransport, createSesClient } = requireBuiltModule("lib/emails/sesClient.js");
const { createTestEmailHandler, testTransactionalEmail } = requireBuiltModule("lib/emails/testEmailFunction.js");
const config = requireBuiltModule("lib/emails/config.js");
const { SANDBOX_RECIPIENT, resolveEmailMode } = config;
const request = () => ({
  to: SANDBOX_RECIPIENT,
  template: "test",
  data: {},
  metadata: { correlationId: "email-test-12345678-1234-4123-8123-123456789012" },
});
const accepted = { ok: true, state: "accepted", messageId: "synthetic-message-id", errorCode: null, retryable: false };
const syntheticContent = { subject: "Prueba sintética", html: "<p>Hola</p>", text: "Hola" };

function serviceFor(mode = "sandbox", overrides = {}) {
  const sends = [], logs = [], renders = [];
  const send = createTransactionalEmailService({
    getMode: () => mode,
    render: async (input) => { renders.push(input); return syntheticContent; },
    transport: async (input) => { sends.push(input); return accepted; },
    log: (entry) => logs.push(entry),
    ...overrides,
  });
  return { send, sends, logs, renders };
}

test("React Email renders HTML, readable plain-text and Spanish Unicode", async () => {
  const content = await renderEmail({ template: "test", data: {} });
  assert.match(content.html, /<!DOCTYPE html/i);
  assert.match(content.html, /<html[^>]*lang="es"/i);
  assert.match(content.html, /<body[^>]*lang="es"/i);
  for (const output of [content.html, content.text]) {
    assert.ok(output.toLocaleLowerCase("es").includes("reserva el día"));
    for (const expected of ["María de Prueba", "sintéticos", "confirmación", "123"]) {
      assert.ok(output.includes(expected), expected);
    }
  }
  assert.match(content.subject, /Prueba sandbox — Reserva el Día/);
  assert.doesNotMatch(content.text, /<\/?(?:html|body|p|table)\b/i);
  assert.doesNotMatch(content.html, /<img|https?:\/\/(?!www\.w3\.org)/i);
});

test("renderer rejects unknown templates, missing data and variable injection", async () => {
  for (const input of [{ template: "welcome", data: {} }, { template: "test" },
    { template: "test", data: { name: "someone" } }, { template: "test", data: [] }]) {
    await assert.rejects(renderEmail(input));
  }
});

for (const [mode, code] of [[undefined, "EMAIL_DISABLED"], ["", "EMAIL_DISABLED"],
  ["disabled", "EMAIL_DISABLED"], ["production", "EMAIL_PRODUCTION_NOT_ENABLED"],
  ["SANDBOX", "EMAIL_INVALID_MODE"], [" sandbox ", "EMAIL_INVALID_MODE"]]) {
  test(`mode ${String(mode)} fails closed before render/SES`, async () => {
    const service = serviceFor(mode, { getMode: () => mode });
    const result = await service.send(request());
    assert.equal(result.ok, false);
    assert.equal(result.state, "blocked");
    assert.equal(result.errorCode, code);
    assert.equal(result.retryable, false);
    assert.equal(service.sends.length, 0);
    assert.equal(service.renders.length, 0);
  });
}

test("sandbox permits only its exact recipient and does not silently redirect", async () => {
  const service = serviceFor();
  assert.deepEqual(await service.send(request()), accepted);
  assert.equal(service.sends[0].to, SANDBOX_RECIPIENT);
  for (const to of ["someone@example.invalid", SANDBOX_RECIPIENT.toUpperCase()]) {
    const result = await service.send({ ...request(), to });
    assert.equal(result.errorCode, "EMAIL_RECIPIENT_NOT_ALLOWED");
    assert.equal(result.retryable, false);
  }
  assert.equal(service.sends.length, 1);
});

test("rejects multiple recipients, CR/LF, display names, client content and arbitrary headers", async () => {
  const service = serviceFor();
  const invalid = [null, {}, ...[
    [SANDBOX_RECIPIENT], `${SANDBOX_RECIPIENT},other@example.invalid`,
    `${SANDBOX_RECIPIENT};other@example.invalid`, `${SANDBOX_RECIPIENT}\r\nBcc: x@example.invalid`,
    `${SANDBOX_RECIPIENT}\n`, `Name <${SANDBOX_RECIPIENT}>`,
  ].map((to) => ({ ...request(), to })),
  ...["cc", "bcc", "headers", "subject", "html", "text", "from", "replyTo"].map((key) => ({ ...request(), [key]: "injected" })),
  { ...request(), data: { html: "injected" } }, { ...request(), metadata: { correlationId: "\r\nPII" } },
  { ...request(), metadata: { correlationId: request().metadata.correlationId + "\n" } },
  { ...request(), metadata: {} }, { ...request(), template: "welcome" }];
  for (const input of invalid) assert.equal((await service.send(input)).errorCode, "EMAIL_INVALID_REQUEST");
  assert.equal(service.sends.length, 0);
  assert.equal(service.renders.length, 0);
});

test("render failure is normalized and cannot reach SES", async () => {
  const service = serviceFor("sandbox", { render: async () => { throw new Error("private body"); } });
  assert.equal((await service.send(request())).errorCode, "EMAIL_RENDER_FAILED");
  assert.equal(service.sends.length, 0);
  assert.ok(!JSON.stringify(service.logs).includes("private body"));
});

test("logs contain only safe fields, correlation and accepted SES MessageId", async () => {
  const service = serviceFor();
  assert.deepEqual(await service.send(request()), accepted);
  assert.deepEqual(Object.keys(service.logs[0]).sort(), [
    "correlationId", "durationMs", "errorCode", "messageId", "mode", "state", "template",
  ]);
  assert.equal(service.logs[0].messageId, accepted.messageId);
  assert.equal(service.logs[0].correlationId, request().metadata.correlationId);
  assert.equal(service.logs[0].state, "accepted");
  const serialized = JSON.stringify(service.logs);
  for (const forbidden of [SANDBOX_RECIPIENT, "<p>", "Prueba sintética", "credentials"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});

test("SES v2 command uses UTF-8, fixed sender, single To and both React Email bodies", async () => {
  let captured;
  const transport = createSesTransport(() => ({ send: async (command) => {
    captured = command;
    return { MessageId: "synthetic-message-id" };
  } }));
  assert.deepEqual(await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent }), accepted);
  assert.equal(captured.constructor.name, "SendEmailCommand");
  assert.deepEqual(captured.input, {
    FromEmailAddress: "=?UTF-8?B?UmVzZXJ2YSBlbCBEw61h?= <notificaciones@reservaeldia.com.ar>",
    Destination: { ToAddresses: [SANDBOX_RECIPIENT] },
    Content: { Simple: {
      Subject: { Data: syntheticContent.subject, Charset: "UTF-8" },
      Body: { Html: { Data: syntheticContent.html, Charset: "UTF-8" }, Text: { Data: syntheticContent.text, Charset: "UTF-8" } },
    } },
  });
});

for (const [name, code, state] of [
  ["AccessDeniedException", "SES_ACCESS_DENIED", "failed"],
  ["MessageRejected", "SES_REJECTED", "failed"],
  ["TooManyRequestsException", "SES_THROTTLED", "failed"],
  ["MailFromDomainNotVerifiedException", "SES_CONFIGURATION_ERROR", "failed"],
  ["EmailSecretsMissing", "EMAIL_SECRETS_MISSING", "blocked"],
  ["TimeoutError", "SES_TIMEOUT", "unknown"],
  ["InternalServerErrorException", "SES_UNKNOWN_OUTCOME", "unknown"],
]) {
  test(`normalizes ${name} without error details or retry`, async () => {
    let calls = 0;
    const transport = createSesTransport(() => ({ send: async () => {
      calls += 1;
      throw Object.assign(new Error("sensitive AWS payload"), { name });
    } }));
    assert.deepEqual(await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent }), {
      ok: false, state, errorCode: code, messageId: null, retryable: false,
    });
    assert.equal(calls, 1);
  });
}

test("deadline aborts a hanging call with unknown outcome and no resend", async () => {
  let calls = 0, signal;
  const transport = createSesTransport(() => ({ send: (_command, options) => {
    calls += 1;
    signal = options.abortSignal;
    return new Promise(() => {});
  } }), 15);
  const result = await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent });
  assert.equal(result.errorCode, "SES_TIMEOUT");
  assert.equal(result.state, "unknown");
  assert.equal(result.retryable, false);
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test("missing or malformed MessageId is never reported as successful delivery", async () => {
  for (const MessageId of [undefined, "", "unsafe\r\nvalue", "unsafe\n"]) {
    const transport = createSesTransport(() => ({ send: async () => ({ MessageId }) }));
    const result = await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent });
    assert.equal(result.errorCode, "SES_INVALID_RESPONSE");
    assert.equal(result.state, "unknown");
  }
});

test("transport rechecks recipient before constructing any client", async () => {
  const transport = createSesTransport(() => { assert.fail("client must not be constructed"); });
  assert.equal((await transport({ to: "someone@example.invalid", content: syntheticContent })).errorCode,
    "EMAIL_RECIPIENT_NOT_ALLOWED");
});

async function withEnvironment(changes, action) {
  const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("default service blocks absent EMAIL_MODE and real SDK creation is forbidden in tests", async () => {
  await withEnvironment({ EMAIL_MODE: undefined }, async () => {
    assert.equal(resolveEmailMode(config.emailMode.value()), "disabled");
    assert.equal((await sendTransactionalEmail(request())).errorCode, "EMAIL_DISABLED");
  });
  assert.throws(createSesClient, /disabled in tests/);
  const transport = createSesTransport();
  assert.equal((await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent })).errorCode,
    "EMAIL_EXTERNAL_EFFECT_BLOCKED");
});

test("SDK is lazy, region pinned, one attempt; secrets are runtime-only and required", async () => {
  // Construction only: network is trapped above and send() is never invoked.
  await withEnvironment({ NODE_ENV: "production", NODE_TEST_CONTEXT: undefined }, async () => {
    let secretReads = 0;
    const keyMock = mock.method(config.awsSesAccessKeyId, "value", () => { secretReads += 1; return ""; });
    const secretMock = mock.method(config.awsSesSecretAccessKey, "value", () => "");
    const client = createSesClient();
    try {
      assert.equal(secretReads, 0);
      assert.equal(await client.config.region(), "us-east-1");
      assert.equal(await client.config.maxAttempts(), 1);
      await assert.rejects(client.config.credentials(), { name: "EmailSecretsMissing" });
    } finally {
      client.destroy();
      keyMock.mock.restore();
      secretMock.mock.restore();
    }
  });
});

test("emulators and partial emulator state block transport before any client", async () => {
  for (const changes of [{ FUNCTIONS_EMULATOR: "true" }, { RESERVA_FIREBASE_MODE: "emulators" },
    { FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080" }]) {
    await withEnvironment(changes, async () => {
      const transport = createSesTransport(() => { assert.fail("emulator must not construct SES"); });
      assert.equal((await transport({ to: SANDBOX_RECIPIENT, content: syntheticContent })).errorCode,
        "EMAIL_EXTERNAL_EFFECT_BLOCKED");
    });
  }
});

function response() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("private function declares IAM, isolated identity and small operational bounds", () => {
  const endpoint = testTransactionalEmail.__endpoint;
  assert.deepEqual(endpoint.httpsTrigger.invoker, ["private"]);
  assert.deepEqual(endpoint.region, ["us-central1"]);
  assert.equal(endpoint.serviceAccountEmail, "email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com");
  assert.equal(endpoint.maxInstances, 1);
  assert.equal(endpoint.concurrency, 1);
  assert.equal(endpoint.timeoutSeconds, 20);
  assert.deepEqual(endpoint.secretEnvironmentVariables.map((secret) => secret.key).sort(),
    ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]);
});

test("test handler sends only server-fixed values and enforces cooldown and instance cap", async () => {
  const sent = [];
  let now = 1;
  const handler = createTestEmailHandler(async (input) => { sent.push(input); return accepted; }, () => now);
  const invoke = async () => {
    const res = response();
    await handler({ method: "POST", body: {}, query: {} }, res);
    return res;
  };
  assert.equal((await invoke()).statusCode, 200);
  assert.equal((await invoke()).statusCode, 429);
  now += 60_000;
  assert.equal((await invoke()).statusCode, 200);
  now += 60_000;
  assert.equal((await invoke()).statusCode, 200);
  now += 60_000;
  assert.equal((await invoke()).statusCode, 429);
  assert.equal(sent.length, 3);
  assert.equal(new Set(sent.map((input) => input.metadata.correlationId)).size, 3);
  for (const input of sent) {
    assert.equal(input.to, SANDBOX_RECIPIENT);
    assert.equal(input.template, "test");
    assert.deepEqual(input.data, {});
    assert.match(input.metadata.correlationId, /^email-test-[0-9a-f-]+$/);
  }
});

test("test handler refuses client payload, query parameters and GET", async () => {
  const handler = createTestEmailHandler(async () => assert.fail("must not send"));
  for (const [input, expected] of [
    [{ method: "GET", body: {}, query: {} }, 405],
    [{ method: "POST", body: { to: SANDBOX_RECIPIENT }, query: {} }, 400],
    [{ method: "POST", body: { subject: "test", html: "test" }, query: {} }, 400],
    [{ method: "POST", body: {}, query: { to: SANDBOX_RECIPIENT } }, 400],
  ]) {
    const res = response();
    await handler(input, res);
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
});

test("vertical path: private handler -> service -> React Email -> fake SES v2 -> accepted", async () => {
  const commands = [];
  const transport = createSesTransport(() => ({ send: async (command) => {
    commands.push(command.input);
    return { MessageId: accepted.messageId };
  } }));
  const service = serviceFor("sandbox", { render: renderEmail, transport });
  const handler = createTestEmailHandler(service.send);
  const res = response();
  await handler({ method: "POST", body: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "accepted");
  assert.equal(res.body.messageId, accepted.messageId);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].Destination, { ToAddresses: [SANDBOX_RECIPIENT] });
  assert.match(commands[0].Content.Simple.Body.Html.Data, /María de Prueba/);
  assert.match(commands[0].Content.Simple.Body.Text.Data, /sintéticos/);
  assert.equal(service.logs[0].correlationId, res.body.correlationId);
});

test("handler maps blocked, failed and ambiguous outcomes without retries", async () => {
  for (const [state, errorCode, status] of [["blocked", "EMAIL_DISABLED", 412],
    ["failed", "SES_REJECTED", 502], ["unknown", "SES_TIMEOUT", 504]]) {
    let calls = 0;
    const handler = createTestEmailHandler(async () => {
      calls += 1;
      return { ok: false, state, errorCode, messageId: null, retryable: false };
    });
    const res = response();
    await handler({ method: "POST", body: {}, query: {} }, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.body.errorCode, errorCode);
    assert.equal(calls, 1);
  }
});

test("local launcher blocks the new exported HTTP function without executing it", async () => {
  const sandbox = { exports: {}, process: { env: {} }, require(name) {
    if (name === "./sessionEnvironment.json") return {};
    if (name === "./networkGuard.cjs") return {};
    if (name.endsWith("/firebaseAdmin.js")) return { localBackendEnvironment: () => ({}) };
    if (name.endsWith("/index.js")) return { testTransactionalEmail };
    if (name === "firebase-functions/v2/https") return { onRequest: (_options, handler) => handler };
    throw new Error(`Unexpected import: ${name}`);
  } };
  runInNewContext(readFileSync(new URL("../scripts/local/functionsEntry.cjs", import.meta.url), "utf8"), sandbox);
  const res = response();
  await sandbox.exports.testTransactionalEmail({}, res);
  assert.equal(res.statusCode, 412);
  assert.match(res.body.error, /LOCAL_FLOW_DISABLED: testTransactionalEmail/);
});

test("only the private email adapter imports the AWS email SDK", () => {
  const source = new URL("./src/", import.meta.url);
  const imports = readdirSync(source, { recursive: true })
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => /@aws-sdk\/client-ses/.test(readFileSync(new URL(path.replaceAll("\\", "/"), source), "utf8")));
  assert.deepEqual(imports.map((path) => path.replaceAll("\\", "/")), ["emails/sesClient.ts"]);
});

test("discovery keeps email runtime lazy; the default handler loads the same service only on invocation", () => {
  const child = spawnSync(process.execPath, ["--require", "../scripts/local/networkGuard.cjs", "-e", `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const originalLoad = Module._load;
    let runtimeLoads = 0;
    const requests = [];
    const accepted = ${JSON.stringify(accepted)};
    Module._load = function(request, parent, isMain) {
      if (request === './sendTransactionalEmail') {
        runtimeLoads++;
        return {sendTransactionalEmail: async input => { requests.push(input); return accepted; }};
      }
      if (request === 'react-email' || request === '@aws-sdk/client-sesv2') {
        throw new Error('Heavy email dependency loaded during discovery');
      }
      return originalLoad.apply(this, arguments);
    };
    const config = require('./lib/emails/config.js');
    for (const param of [config.emailMode, config.awsSesAccessKeyId, config.awsSesSecretAccessKey]) {
      param.value = () => { throw new Error('Runtime parameter read during discovery'); };
    }
    const {createTestEmailHandler, testTransactionalEmail} = require('./lib/emails/testEmailFunction.js');
    assert.equal(runtimeLoads, 0);
    assert.deepEqual(testTransactionalEmail.__endpoint.httpsTrigger.invoker, ['private']);
    const response = {set() {return this;}, status(code) {this.code = code; return this;}, json(body) {this.body = body;}};
    (async () => {
      const handler = createTestEmailHandler();
      await handler({method:'POST',body:{to:'injected@example.invalid'},query:{}},response);
      assert.equal(response.code, 400);
      assert.equal(runtimeLoads, 0);
      await handler({method:'POST',body:{},query:{}},response);
      assert.equal(runtimeLoads, 1);
      assert.equal(response.code, 200);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].to, config.SANDBOX_RECIPIENT);
      assert.equal(requests[0].template, 'test');
      assert.deepEqual(requests[0].data, {});
      assert.deepEqual(require('../scripts/local/networkGuard.cjs').attempts, []);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: new URL("./", import.meta.url), encoding: "utf8", timeout: 10_000, windowsHide: true });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test.after(() => {
  assert.equal(networkAttempts, 0, "tests must never attempt an external request");
  mock.restoreAll();
});
