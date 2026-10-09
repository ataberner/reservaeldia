import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_AI_REQUEST_LIMITS,
  containsForbiddenSnapshotData,
  inspectDesignerAiRequestData,
  inspectDesignerAiSnapshotShape,
  sanitizeCapabilitySnapshot,
} from "./designerAiCapabilityContract.js";
import { normalizeDesignerAiConversationState } from "./designerAiConversationLedger.js";

test("request budgets reject the former recursion and breadth attacks before projection", () => {
  const deep = JSON.parse('{"child":'.repeat(3000) + '{}' + '}'.repeat(3000));
  assert.equal(inspectDesignerAiRequestData(deep).reason, "depth");
  assert.equal(containsForbiddenSnapshotData(deep), true);
  const wide = { ledger: { guidedFlow: { leafIds: Array(14000).fill("story.text") } } };
  const result = inspectDesignerAiRequestData(wide);
  assert.equal(result.reason, "array");
  assert.ok(result.nodes < 10, "reject collection before visiting its members");
  assert.equal(inspectDesignerAiRequestData({ long: "x".repeat(4001) }).reason, "string");
  const manyNodes = Array.from({ length: 500 }, () => Array(40).fill(1));
  assert.equal(inspectDesignerAiRequestData(manyNodes).reason, "nodes");
  const largeText = Array(100).fill("😀".repeat(1000));
  assert.equal(inspectDesignerAiRequestData(largeText).reason, "bytes");
});

test("ordinary JSON only: reject prototype keys, SDK type coercions and accessors without invoking them", () => {
  for (const key of ["__proto__", "prototype", "constructor", "@type"]) {
    assert.equal(inspectDesignerAiRequestData(JSON.parse(`{"${key}":"PRIVATE_VALUE"}`)).ok, false, key);
    assert.equal(inspectDesignerAiRequestData({ id: key }).ok, true, "values are harmless");
  }
  let invoked = false;
  const accessor = Object.defineProperty({}, "message", { enumerable: true, get() { invoked = true; return "x"; } });
  assert.equal(inspectDesignerAiRequestData(accessor).reason, "accessor");
  assert.equal(invoked, false);
  for (const value of [undefined, NaN, Infinity, 2n, () => {}, new Date(), Object.create({ inherited: true }), Array(2)]) {
    assert.equal(inspectDesignerAiRequestData(value).ok, false);
  }
  const cycle = {}; cycle.loop = cycle;
  assert.equal(inspectDesignerAiRequestData(cycle).reason, "cycle");
});

test("known snapshot fields reject wrong types and preserve bounded unknown field projection", () => {
  const normal = sanitizeCapabilitySnapshot({ revision: "revision" });
  assert.equal(inspectDesignerAiSnapshotShape(normal).ok, true);
  for (const input of [
    { revision: 123 }, { values: { story: {} } }, { availability: { people: "true" } },
    { values: { galleries: Array.from({ length: 21 }, (_, index) => ({ id: String(index) })) } },
    { ledger: { leaves: [{ id: "story.text", fingerprint: { toString: "x" } }] } },
    { values: { galleries: [{ id: "g", slots: [{ index: -1 }] }] } },
  ]) assert.equal(inspectDesignerAiSnapshotShape(input).ok, false);
  const compatible = { ...normal, futureBoundedField: { unused: true } };
  assert.equal(inspectDesignerAiSnapshotShape(compatible).ok, true);
  assert.deepEqual(sanitizeCapabilitySnapshot(compatible), normal);
});

test("maximum canonical collection counts fit the envelope and snapshot shape", () => {
  const snapshot = sanitizeCapabilitySnapshot({
    revision: "r",
    values: {
      galleries: Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, slots: Array.from({ length: 24 }, (_, index) => ({ cellId: `c${index}`, index })) })),
      rsvp: { questions: Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, options: Array.from({ length: 20 }, (_, j) => ({ id: `o${j}`, label: "Sí" })) })) },
    },
    ledger: { leaves: Array.from({ length: 700 }, (_, i) => ({ id: `leaf${i}` })), guidedFlow: { leafIds: Array.from({ length: 700 }, (_, i) => `leaf${i}`) } },
  });
  assert.equal(inspectDesignerAiSnapshotShape(snapshot).ok, true);
  const envelope = { data: { contractVersion: "2.5.0", clientMessageId: "m", draftId: "d", requestCreatedAt: 1,
    entryMode: "continuation", message: "á".repeat(1200), recentTurns: Array.from({ length: 6 }, () => ({ role: "user", content: "\n".repeat(700) })), capabilitySnapshot: snapshot } };
  const result = inspectDesignerAiRequestData(envelope);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.nodes <= DESIGNER_AI_REQUEST_LIMITS.maxNodes);
});

test("guided IDs are bounded before processing and deduplicated in order", () => {
  let readOutsideBudget = false;
  const ids = Array(700).fill("story.text");
  Object.defineProperty(ids, 700, { get() { readOutsideBudget = true; return "document.name"; } });
  const safe = sanitizeCapabilitySnapshot({ ledger: {
    leaves: [{ id: "story.text" }, { id: "document.name" }], guidedFlow: { leafIds: ids },
  } });
  assert.deepEqual(safe.ledger.guidedFlow.leafIds, ["story.text"]);
  assert.equal(readOutsideBudget, false);
  const entries = Array.from({ length: 700 }, () => ({ leafId: "story.text" }));
  Object.defineProperty(entries, 700, { get() { readOutsideBudget = true; return { leafId: "story.text" }; } });
  normalizeDesignerAiConversationState({ baseline: entries, resolutions: entries });
  assert.equal(readOutsideBudget, false);
});
