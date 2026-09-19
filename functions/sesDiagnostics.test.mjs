import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const rejectNetwork = () => { networkAttempts++; throw new Error("Network forbidden in SES diagnostics tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const { createSesClient, createSesTransport } = requireBuiltModule("lib/emails/sesClient.js");
const { sanitizeAwsError } = requireBuiltModule("lib/emails/awsDiagnostics.js");
const config = requireBuiltModule("lib/emails/config.js");
const principalArn = "arn:aws:iam::123456789012:user/synthetic-email-sender";
const requestId = "12345678-1234-4234-8234-123456789abc";
const resourceArn = "arn:aws:ses:us-east-1:123456789012:identity/reservaeldia.com.ar";

test("SES resolves only explicit email secrets lazily with the fixed region and no retries", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT };
  const key = mock.method(config.awsSesAccessKeyId, "value", () => "synthetic-access-key");
  const secret = mock.method(config.awsSesSecretAccessKey, "value", () => "synthetic-secret");
  let client;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.NODE_TEST_CONTEXT;
    client = createSesClient();
    assert.equal(key.mock.callCount(), 0);
    assert.equal(secret.mock.callCount(), 0);
    assert.equal(await client.config.region(), "us-east-1");
    assert.equal(await client.config.maxAttempts(), 1);
    const credentials = await client.config.credentials();
    assert.equal(credentials.accessKeyId, "synthetic-access-key");
    assert.equal(credentials.secretAccessKey, "synthetic-secret");
    assert.equal(credentials.sessionToken, undefined);
    assert.equal(key.mock.callCount(), 1);
    assert.equal(secret.mock.callCount(), 1);
  } finally {
    client?.destroy();
    key.mock.restore(); secret.mock.restore();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
  assert.throws(createSesClient, /disabled in tests/);
});

test("AccessDenied extracts only principal, SES action, resource and a reason enum", () => {
  for (const [phrase, reason] of [["because no identity-based policy allows the ses:SendEmail action", "NO_ALLOW_IDENTITY_POLICY"],
    ["with an explicit deny in a permissions boundary", "EXPLICIT_DENY_BOUNDARY"],
    ["with an explicit deny in a service control policy", "EXPLICIT_DENY_SCP"]]) {
    const error = Object.assign(new Error(`User: ${principalArn} is not authorized to perform: ses:SendEmail on resource: ${resourceArn} ${phrase}: private-policy-details`), {
      name: "AccessDeniedException", $metadata: { httpStatusCode: 403, requestId },
      config: { credentials: "synthetic-secret" }, headers: { authorization: "synthetic-token" },
    });
    assert.deepEqual(sanitizeAwsError(error), { errorName: "AccessDeniedException", httpStatus: 403, requestId,
      principalArn, action: "ses:SendEmail", resourceArn, iamReason: reason });
  }
  const quoted = Object.assign(new Error(`User \`${principalArn}\` is not authorized to perform \`ses:SendEmail' on resource \`${resourceArn}'`), { name: "AccessDeniedException" });
  assert.equal(sanitizeAwsError(quoted).resourceArn, resourceArn);

  // The sandbox denial also named the verified recipient identity, not only the domain.
  const recipientArn = "arn:aws:ses:us-east-1:123456789012:identity/synthetic-recipient@example.invalid";
  const recipientError = Object.assign(new Error(`User: ${principalArn} is not authorized to perform: ses:SendEmail on resource: ${recipientArn} because no identity-based policy allows the ses:SendEmail action`), { name: "AccessDeniedException" });
  assert.equal(sanitizeAwsError(recipientError).resourceArn, recipientArn);
  assert.equal(sanitizeAwsError(recipientError).iamReason, "NO_ALLOW_IDENTITY_POLICY");
});

test("sanitization drops unknown prose, secrets, headers, CRLF and unsafe metadata", () => {
  for (const message of ["Authorization: synthetic-secret", "synthetic-secret\r\n" + principalArn,
    `User: ${principalArn} is not authorized to perform: iam:GetUser on resource: synthetic-secret`,
    "x".repeat(9000)]) {
    const error = Object.assign(new Error(message), { name: "AccessDeniedException",
      $metadata: { httpStatusCode: "403", requestId: "synthetic-secret" },
      toJSON() { assert.fail("must not serialize error"); },
    });
    assert.deepEqual(sanitizeAwsError(error), { errorName: "AccessDeniedException", httpStatus: null,
      requestId: null, principalArn: null, action: null, resourceArn: null, iamReason: "UNSPECIFIED" });
  }
  assert.equal(sanitizeAwsError({ name: "synthetic-secret" }).errorName, "UnknownAwsError");
  assert.equal(sanitizeAwsError({ get name() { throw new Error("must not invoke getter"); } }).errorName, "UnknownAwsError");
});

test("credential failures are distinguishable but their messages never escape SES", async () => {
  for (const name of ["UnrecognizedClientException", "InvalidSignatureException", "ForbiddenException", "AccessDeniedException"]) {
    const error = Object.assign(new Error("synthetic-secret-in-message"), { name, $metadata: { httpStatusCode: 403, requestId } });
    const details = [];
    const send = createSesTransport(() => ({ send: async () => { throw error; } }), 100, entry => details.push(entry));
    assert.deepEqual(await send({ to: config.SANDBOX_RECIPIENT, content: { subject: "synthetic", html: "synthetic", text: "synthetic" } }), {
      ok: false, state: "failed", messageId: null, errorCode: "SES_ACCESS_DENIED", retryable: false,
    });
    assert.equal(details[0].errorName, name);
    assert.equal(details[0].requestId, requestId);
    assert.ok(!JSON.stringify(details).includes("synthetic-secret"));
  }
});

test("a failing diagnostic logger never changes the SES result or sends again", async () => {
  let calls = 0;
  const transport = createSesTransport(() => ({ send: async () => {
    calls++;
    throw Object.assign(new Error("synthetic-private-message"), { name: "AccessDeniedException" });
  } }), 100, () => { throw new Error("synthetic-log-failure"); });
  const result = await transport({ to: config.SANDBOX_RECIPIENT, content: { subject: "synthetic", html: "synthetic", text: "synthetic" } });
  assert.equal(result.errorCode, "SES_ACCESS_DENIED");
  assert.equal(result.retryable, false);
  assert.equal(calls, 1);
});

test.after(() => {
  assert.equal(networkAttempts, 0);
  mock.restoreAll();
});
