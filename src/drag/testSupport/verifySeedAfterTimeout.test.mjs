import test from "node:test";
import assert from "node:assert/strict";
import { verifySeedAfterTimeout } from "./verifySeedAfterTimeout.mjs";

const owner = "synthetic-fixture-owner";
const sessionCreatedAt = "2035-01-02T03:04:05.000Z";
const fields = () => ({
  dragPerfFixtureOwner: { stringValue: owner },
  dragPerfSessionCreatedAt: { stringValue: sessionCreatedAt },
  createdAt: { timestampValue: "2035-01-02T03:05:06.000Z" },
  updatedAt: { timestampValue: "2035-01-02T03:05:06.000Z" },
  objetos: { arrayValue: { values: [{ mapValue: { fields: {
    id: { stringValue: "active" }, x: { integerValue: "240" },
  } } }] } },
});
const timeout = (name = "TimeoutError") => Object.assign(new Error("original seed transport failure"), { name });
function setup(overrides = {}) {
  const expectedFields = fields();
  const document = { name: "synthetic-document", fields: structuredClone(expectedFields) };
  const error = timeout();
  const context = { error, expectedFields, owner, sessionCreatedAt, readDocument: async () => document, ...overrides };
  return { context, document, error: context.error };
}
async function rejected(context, reason) {
  const originalMessage = context.error.message;
  await assert.rejects(verifySeedAfterTimeout(context), error => error === context.error);
  assert.equal(context.error.message, originalMessage);
  assert.deepEqual(context.error.seedVerification, { verified: false, reason });
}

for (const name of ["TimeoutError", "AbortError"]) {
  test(`recognizes exact owned fields after ${name} with one read`, async () => {
    const { context, document } = setup({ error: timeout(name) });
    let reads = 0;
    context.readDocument = async () => { reads++; return document; };
    assert.deepEqual(await verifySeedAfterTimeout(context), { verified: true, reason: "applied-after-timeout" });
    assert.equal(reads, 1);
    assert.equal(context.error.seedVerification, undefined);
  });
}

test("non-timeout errors propagate unchanged without reading", async () => {
  const error = Object.assign(new Error("request failed"), { code: "ABORT_ERR" });
  let reads = 0;
  const { context } = setup({ error, readDocument: async () => { reads++; } });
  await assert.rejects(verifySeedAfterTimeout(context), actual => actual === error);
  assert.equal(reads, 0);
  assert.equal(error.seedVerification, undefined);
});

test("read failure preserves the original timeout and excludes read data from diagnostics", async () => {
  const { context } = setup({ readDocument: async () => { throw new Error("private response payload"); } });
  await rejected(context, "read-failed");
  assert.equal(JSON.stringify(context.error).includes("private response payload"), false);
});

test("a second timeout during verification does not replace the original timeout", async () => {
  const { context } = setup({ readDocument: async () => { throw timeout("AbortError"); } });
  await rejected(context, "read-failed");
});

test("missing or malformed document fields reject the original error", async () => {
  for (const document of [null, undefined, {}, { fields: null }, { fields: [] }, { fields: "invalid" }]) {
    const { context } = setup({ readDocument: async () => document });
    await rejected(context, "missing-document-fields");
  }
});

test("wrong or absent owner rejects even when all expected fields match", async () => {
  for (const actualOwner of [undefined, { stringValue: "another-owner" }, { integerValue: owner }]) {
    const { context, document } = setup();
    if (actualOwner === undefined) delete document.fields.dragPerfFixtureOwner;
    else document.fields.dragPerfFixtureOwner = actualOwner;
    context.expectedFields = structuredClone(document.fields);
    await rejected(context, "owner-mismatch");
  }
});

test("session equality is strict even when all expected fields match", async () => {
  for (const actualSession of [undefined, { stringValue: "2035-01-02T03:04:05Z" },
    { stringValue: "2035-01-02T03:04:06.000Z" }, { timestampValue: sessionCreatedAt }]) {
    const { context, document } = setup();
    if (actualSession === undefined) delete document.fields.dragPerfSessionCreatedAt;
    else document.fields.dragPerfSessionCreatedAt = actualSession;
    context.expectedFields = structuredClone(document.fields);
    await rejected(context, "session-mismatch");
  }
});

test("nested field mismatch is not accepted as applied", async () => {
  const { context, document } = setup();
  document.fields.objetos.arrayValue.values[0].mapValue.fields.x.integerValue = "241";
  await rejected(context, "fields-mismatch");
});

test("extra and missing fields are rejected", async () => {
  for (const change of [document => { document.fields.unexpected = { stringValue: "private extra value" }; },
    document => { delete document.fields.objetos; }]) {
    const { context, document } = setup();
    change(document);
    await rejected(context, "fields-mismatch");
    assert.equal(JSON.stringify(context.error).includes("private extra value"), false);
  }
});

test("all REST timestamps must match exactly without normalization", async () => {
  for (const key of ["createdAt", "updatedAt"]) {
    for (const timestampValue of ["2035-01-02T03:05:06Z", "2035-01-02T03:05:06.001Z"]) {
      const { context, document } = setup();
      document.fields[key].timestampValue = timestampValue;
      await rejected(context, "fields-mismatch");
    }
  }
});

test("REST scalar types are compared deeply without coercion", async () => {
  const { context, document } = setup();
  document.fields.objetos.arrayValue.values[0].mapValue.fields.x = { doubleValue: 240 };
  await rejected(context, "fields-mismatch");
});

test("invalid verification context never reads and preserves the original error", async () => {
  for (const overrides of [{ owner: undefined }, { owner: "" }, { sessionCreatedAt: undefined },
    { sessionCreatedAt: "" }, { expectedFields: null }, { expectedFields: [] }, { readDocument: null }]) {
    let reads = 0;
    const { context } = setup({ readDocument: async () => { reads++; }, ...overrides });
    await rejected(context, "invalid-verification-context");
    assert.equal(reads, 0);
  }
});

test("an immutable original error is preserved even when diagnostics cannot attach", async () => {
  const error = Object.freeze(timeout());
  const { context } = setup({ error, readDocument: async () => null });
  await assert.rejects(verifySeedAfterTimeout(context), actual => actual === error);
  assert.equal(error.seedVerification, undefined);
});
