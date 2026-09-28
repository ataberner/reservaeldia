import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import * as contract from "../../../../../shared/designerAiCapabilityContract.js";
import * as ledger from "../../../../../shared/designerAiConversationLedger.js";
import * as capabilities from "../../../../domain/editor/designerAiCapabilities.js";
import * as history from "../../../../domain/editor/designerAiMessageHistory.js";
import * as executor from "../../../../domain/editor/designerAiActionExecutor.js";
import * as feedback from "../../../../domain/editor/designerAiExecutionFeedback.js";
import * as evidence from "../../../../domain/editor/designerAiActionEvidence.js";
import * as location from "../../../../domain/editor/designerAiLocationInteraction.js";
import * as features from "../../../../domain/eventDetails/features.js";
import * as locationAuthoring from "../../../../domain/eventDetails/locationAuthoring.js";
import * as nameBridge from "../../../../lib/dashboardDocumentNameBridge.js";
import useEditorDocumentOperation from "../../../../hooks/useEditorDocumentOperation.js";
import { readEditorRenderSnapshot, syncEditorSnapshotRenderState } from "../../../../lib/editorSnapshotAdapter.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../../functions/node_modules/typescript");
const { JSDOM } = require("../../../../../functions/node_modules/jsdom");
export { contract, ledger, capabilities };

export function loadComponent(path, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (id === "react") return React;
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unmocked dependency: ${id}`);
  }, module, module.exports);
  return module.exports.default;
}

// Real panel, validators, ledger, executor and receipts. Only editor I/O and
// provider transport are synthetic; no Firebase, Maps or OpenAI connection.
export async function mountPanel({ respond, initialConversation, savedDraft, failWrite = () => false, failMetadata = () => false, beforeWrite = async () => {}, fullFields = false } = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://local.test", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  let messages = [], visible = true, renderHost, calls = [], writes = [], metaWrites = 0, previews = 0;
  const journeyRef = { current: { initialized: false, editing: false } };
  const authoring = structuredClone(savedDraft?.authoring || { fieldsSchema: [], defaults: {} });
  if (fullFields && !savedDraft) {
    for (const role of ["primary_person_name", "secondary_person_name", "ceremony_date", "ceremony_start_time", "ceremony_end_time", "ceremony_venue_name", "ceremony_venue_address", "party_date", "party_start_time", "party_end_time", "party_venue_name", "party_venue_address", "dress_code"]) {
      authoring.fieldsSchema.push({ key: `event_${role}`, eventDetailsRole: role, type: role.endsWith("date") ? "date" : role.endsWith("time") ? "time" : "text", applyTargets: [] });
    }
    authoring.fieldsSchema.push({ key: "texto_historia", type: "textarea", applyTargets: [] });
  }
  const render = () => readEditorRenderSnapshot(window);
  const update = (patch) => syncEditorSnapshotRenderState({ ...render(), ...patch }, window);
  const initialRender = savedDraft?.render || { objetos: [], secciones: [], rsvp: { enabled: false }, gifts: { enabled: false }, eventDetails: { mode: "single" } };
  const persistedDraft = structuredClone({ authoring, render: initialRender,
    conversation: savedDraft?.conversation || initialConversation, name: savedDraft?.name || "" });
  window.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventPersonNames: async ({ primaryName, secondaryName }) => Object.assign(authoring.defaults, { event_primary_person_name: primaryName, event_secondary_person_name: secondaryName }),
    updateTemplateFieldValues: async (patch) => Object.assign(authoring.defaults, patch),
    updateTemplateAuthoringDefault: async (key, value, options) => {
      authoring.defaults[key] = value;
      if (options?.eventDetailsPatch) update({ eventDetails: { ...render().eventDetails, ...options.eventDetailsPatch } });
    },
    updateEventDetailsConfig: async (config) => update({ eventDetails: config }),
    updateTemplateAuthoringEventLocation: async (value, { feature }) => Object.assign(authoring.defaults, { [`event_${feature}_venue_name`]: value.venueName, [`event_${feature}_venue_address`]: value.address }),
    flushPersistenceNow: async () => {
      const state = structuredClone({ ...render(), templateAuthoringDraft: authoring, templateInput: { values: authoring.defaults } });
      writes.push(state);
      await beforeWrite();
      if (failWrite(writes.length)) throw new Error("Synthetic write failure");
      persistedDraft.render = structuredClone(render());
      persistedDraft.authoring = structuredClone(authoring);
      return { ok: true, documentId: "A", persistedState: state };
    },
  };
  nameBridge.publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true,
    name: persistedDraft.name, designerAiConversation: persistedDraft.conversation }, window);
  update(initialRender);
  window.addEventListener("dashboard-document-name-update-request", ({ detail }) => {
    detail.onAccepted();
    if (failMetadata(++metaWrites)) { detail.onPersistenceError?.(new Error("Synthetic metadata failure")); return; }
    const current = nameBridge.readDashboardDocumentNameState(window);
    const state = { ...current, name: detail.hasName ? detail.name : current.name,
      designerAiConversation: detail.designerAiConversation || current.designerAiConversation,
      documentId: "A", hydrated: true, editable: true };
    persistedDraft.conversation = structuredClone(state.designerAiConversation);
    persistedDraft.name = state.name;
    nameBridge.publishDashboardDocumentNameState(state, window);
    detail.onPersisted({ documentId: "A", name: detail.name, designerAiConversation: detail.designerAiConversation });
  });
  for (const [event, key] of [["rsvp-config-update", "rsvp"], ["gift-config-update", "gifts"]]) window.addEventListener(event, ({ detail }) => update({ [key]: detail.config }));
  window.addEventListener("insertar-elemento", ({ detail }) => update({ objetos: [...render().objetos, detail] }));
  window.addEventListener("actualizar-elemento", ({ detail }) => update({ objetos: render().objetos.map((o) => o.id === detail.id ? { ...o, ...detail.cambios } : o) }));
  const noop = () => null;
  const Panel = loadComponent(new URL("../DesignerAiPanel.jsx", import.meta.url), {
    "lucide-react": { Bot: noop, LoaderCircle: noop, MapPin: noop, Send: noop, X: noop },
    "firebase/functions": { httpsCallable: () => async (payload) => {
      calls.push(payload);
      const result = await respond(payload, calls.length);
      return { data: { contractVersion: contract.DESIGNER_AI_CONTRACT_VERSION, batchId: `batch-${calls.length}`, intent: "clarify", actions: [], resolutions: [], controlRequest: null, ...result } };
    } },
    "@/firebase": { functions: {} },
    "@/components/MiniToolbarTabImagen": noop,
    "@/components/editor/designerAi/DesignerAiLocationControl": noop,
    "../../../../shared/designerAiCapabilityContract.js": contract,
    "../../../../shared/designerAiConversationLedger.js": ledger,
    "@/domain/editor/designerAiCapabilities": capabilities,
    "@/domain/editor/designerAiMessageHistory": history,
    "@/domain/editor/designerAiActionExecutor": executor,
    "@/domain/editor/designerAiActionEvidence": evidence,
    "@/domain/editor/designerAiExecutionFeedback": feedback,
    "@/hooks/useEditorDocumentOperation": useEditorDocumentOperation,
    "@/domain/editor/designerAiLocationInteraction": location,
    "@/domain/eventDetails/features": features,
    "@/domain/eventDetails/locationAuthoring": locationAuthoring,
    "@/lib/dashboardDocumentNameBridge": nameBridge,
  });
  function Host() {
    const [items, setItems] = useState([]);
    const [, refresh] = useState(0);
    renderHost = () => refresh((v) => v + 1);
    messages = items;
    return visible ? React.createElement(Panel, { sessionKey: "draft:A", messageHistory: items, onMessageHistoryChange: setItems, journeyRef, onPreview: () => { previews++; } }) : null;
  }
  const until = async (predicate) => {
    for (let i = 0; i < 180 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    assert.ok(predicate(), document.body.textContent);
  };
  const click = async (label) => {
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === label);
    assert.ok(button, `Missing ${label}: ${document.body.textContent}`);
    await act(async () => button.click());
  };
  const send = async (text) => {
    const before = calls.length;
    const input = document.querySelector("textarea");
    // Invoke the real React change handler (ReactDOM is imported before JSDOM).
    const props = input[Object.keys(input).find((key) => key.startsWith("__reactProps"))];
    await act(async () => props.onChange({ target: { value: text } }));
    await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await until(() => calls.length > before && !document.querySelector("textarea")?.disabled);
  };
  await act(async () => root.render(React.createElement(Host)));
  return {
    calls, writes, authoring, render, update, journeyRef, until, click, send,
    messages: () => messages, previews: () => previews, metadataWrites: () => metaWrites,
    exportPersistedDraft: () => structuredClone(persistedDraft),
    snapshot: () => capabilities.readDesignerAiCapabilitySnapshot(window, { conversationState: nameBridge.readDashboardDocumentNameState(window).designerAiConversation }),
    toggle: async (value) => { visible = value; await act(async () => renderHost()); },
    close: async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; },
  };
}
