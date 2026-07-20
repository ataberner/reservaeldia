import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { buildUserUiPreferencesMergePayload } = requireBuiltModule(
  "lib/userUiPreferencesPersistence.js"
);

test("assistant tour opt-out is written as a nested UI preference", () => {
  const updatedAtValue = { sentinel: "server-time" };
  const payload = buildUserUiPreferencesMergePayload({
    patch: { assistantTourOptOut: true },
    updatedAtValue,
  });

  assert.deepEqual(payload, {
    updatedAt: updatedAtValue,
    uiPreferences: {
      assistantTourOptOut: true,
      updatedAt: updatedAtValue,
    },
  });
  assert.equal("uiPreferences.assistantTourOptOut" in payload, false);
  assert.equal("uiPreferences.updatedAt" in payload, false);
});

test("restoring the assistant tour persists false in the same nested preference", () => {
  const payload = buildUserUiPreferencesMergePayload({
    patch: { assistantTourOptOut: false },
    updatedAtValue: "server-time",
  });

  assert.equal(payload.uiPreferences.assistantTourOptOut, false);
  assert.equal(payload.uiPreferences.updatedAt, "server-time");
});

test("the merge payload does not invent an opt-out when the patch omits it", () => {
  const payload = buildUserUiPreferencesMergePayload({
    patch: {},
    updatedAtValue: "server-time",
  });

  assert.deepEqual(payload.uiPreferences, {
    updatedAt: "server-time",
  });
});
