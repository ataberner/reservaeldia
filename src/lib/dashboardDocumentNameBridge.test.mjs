import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_DOCUMENT_NAME_EVENTS,
  buildDashboardDocumentNameState,
  publishDashboardDocumentNameState,
  requestDashboardDocumentNameUpdate,
} from "./dashboardDocumentNameBridge.js";

class TestCustomEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail;
  }
}

function target() {
  const value = new EventTarget();
  value.CustomEvent = TestCustomEvent;
  value.Event = Event;
  return value;
}

test("document state carries only normalized Designer AI planning metadata", () => {
  const state = buildDashboardDocumentNameState({
    name: "Casamiento Ana y Luz",
    documentId: "draft-1",
    editable: true,
    hydrated: true,
    designerAiConversation: {
      namePolicy: { mode: "automatic", lastAutomaticName: "Casamiento Ana y Luz" },
      resolutions: [{ leafId: "document.name", status: "resolved_by_rule", provenance: "automatic_rule", rule: "automatic_event_name", fingerprint: "fp" }],
    },
    designerAiSourceContext: {
      templateDerived: true,
      changedKeys: ["event_primary_person_name"],
    },
  });
  assert.equal(state.designerAiConversation.namePolicy.mode, "automatic");
  assert.deepEqual(state.designerAiSourceContext.changedKeys, ["event_primary_person_name"]);
  assert.equal(JSON.stringify(state).includes("chat"), false);
});

test("metadata-only requests do not masquerade as document-name updates", () => {
  const windowLike = target();
  const events = [];
  windowLike.addEventListener(DASHBOARD_DOCUMENT_NAME_EVENTS.UPDATE_REQUEST, (event) => events.push(event.detail));
  const detail = requestDashboardDocumentNameUpdate({
    persist: true,
    source: "designer-ai-ledger",
    designerAiConversation: { namePolicy: { mode: "explicit" } },
  }, windowLike);
  assert.equal(detail.hasName, false);
  assert.equal(detail.designerAiConversation.namePolicy.mode, "explicit");
  assert.deepEqual(events, [detail]);
});

test("published state remains the shared source for Assistant and Designer AI", () => {
  const windowLike = target();
  const state = publishDashboardDocumentNameState({
    name: "Nuestra fiesta",
    documentId: "draft-1",
    editable: true,
    hydrated: true,
  }, windowLike);
  assert.equal(state.name, "Nuestra fiesta");
  assert.deepEqual(windowLike.__dashboardDocumentNameState, state);
});
