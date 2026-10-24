import test from "node:test";
import assert from "node:assert/strict";
import { assertControlRead, summarizePolicy, createControlReader, effectiveCodebase, safeRulesSource, PROJECT } from "./auditRemoteAuthorization.mjs";

test("an omitted codebase label is the CLI default, while named codebases remain explicit", () => {
  assert.equal(effectiveCodebase(null), "default");
  assert.equal(effectiveCodebase("payments"), "payments");
  assert.equal(effectiveCodebase("email"), "email");
});

test("rules review preserves known literals but excludes comments and unknown values", () => {
  const result = safeRulesSource('// private comment\nallow read: if role == "admin" || email == "private@example.test";', ['role == "admin"']);
  assert.equal(result.includes("private"), false);
  assert.match(result, /role == "admin"/);
  assert.match(result, /REDACTED_LITERAL/);
});

test("only the planned control-plane reads are accepted", () => {
  assert.doesNotThrow(() => assertControlRead(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/-/functions?fields=functions(name)`));
  assert.doesNotThrow(() => assertControlRead(`https://cloudresourcemanager.googleapis.com/v3/projects/${PROJECT}:getIamPolicy`, "POST", { options: { requestedPolicyVersion: 3 } }));
  for (const [url, method, body] of [
    [`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/us-central1/functions/verInvitacion:call`, "POST", {}],
    [`https://cloudresourcemanager.googleapis.com/v3/projects/${PROJECT}:setIamPolicy`, "POST", {}],
    [`https://run.googleapis.com/v2/projects/${PROJECT}/locations/us-central1/services/verinvitacion`, "PATCH", {}],
    [`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, "PATCH", {}],
    [`https://cloudfunctions.googleapis.com/v2/projects/other/locations/-/functions`, "GET"],
    [`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/key/versions/latest:access`, "GET"],
    [`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/-/functions?fields=functions(serviceConfig/environmentVariables)`, "GET"],
  ]) assert.throws(() => assertControlRead(url, method, body));
});

test("policy reports omit non-public identities and condition text", () => {
  const result = summarizePolicy({ etag: "etag", bindings: [{ role: "roles/run.invoker", members: ["allUsers", "user:private@example.test"], condition: { expression: "private-sensitive-value" } }] });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private"), false);
  assert.deepEqual(result.bindings[0].publicMembers, ["allUsers"]);
  assert.equal(result.bindings[0].otherMemberCount, 1);
  assert.equal(result.bindings[0].conditional, true);
});

test("blocked requests fail before token acquisition or network", async () => {
  let calls = 0;
  const reader = await createControlReader({ getToken: async () => { calls++; }, fetchImpl: async () => { calls++; } });
  await assert.rejects(() => reader.request("https://example.test/private"));
  assert.equal(calls, 0);
});
