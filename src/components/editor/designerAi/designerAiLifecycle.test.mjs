import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as coverDomain from "../../../domain/editor/coverImage.js";
import * as protectedSections from "../../../domain/editor/protectedSections.js";
import { publishDashboardDocumentNameState } from "../../../lib/dashboardDocumentNameBridge.js";
import useEditorDocumentOperation from "../../../hooks/useEditorDocumentOperation.js";
import * as capabilityContract from "../../../../shared/designerAiCapabilityContract.js";
import * as ledger from "../../../../shared/designerAiConversationLedger.js";
import * as capabilities from "../../../domain/editor/designerAiCapabilities.js";
import * as history from "../../../domain/editor/designerAiMessageHistory.js";
import * as executor from "../../../domain/editor/designerAiActionExecutor.js";
import * as evidence from "../../../domain/editor/designerAiActionEvidence.js";
import * as location from "../../../domain/editor/designerAiLocationInteraction.js";
import * as features from "../../../domain/eventDetails/features.js";
import * as locationAuthoring from "../../../domain/eventDetails/locationAuthoring.js";
import * as nameBridge from "../../../lib/dashboardDocumentNameBridge.js";
import { readEditorRenderSnapshot, syncEditorSnapshotRenderState } from "../../../lib/editorSnapshotAdapter.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const { JSDOM } = require("../../../../functions/node_modules/jsdom");

// Compile unchanged production hooks in memory. Only external I/O is substituted;
// React's effects, refs, setters and unmount behavior are real.
function loadHook(path, dependencies, exportName = "default") {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (id === "react") return React;
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unmocked external dependency: ${id}`);
  }, module, module.exports);
  return module.exports[exportName];
}

test("H3 integrated panel retry resumes the saved batch without another model request or duplicate option", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://local.test", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  let providerCalls = 0;
  let writes = 0;
  let messages = [];
  const noop = () => null;
  const actions = [
    { type: "rsvp.add_option", arguments: { questionId: "attendance", label: "Tal vez" } },
    { type: "rsvp.update_modal", arguments: { title: "Nos vemos", subtitle: null, submitLabel: null, primaryColor: null } },
    { type: "rsvp.set_enabled", arguments: { enabled: true } },
  ];
  const Panel = loadHook("./DesignerAiPanel.jsx", {
    "lucide-react": { Bot: noop, LoaderCircle: noop, MapPin: noop, Send: noop, X: noop },
    "firebase/functions": { httpsCallable: () => async () => {
      providerCalls++;
      return { data: { contractVersion: capabilityContract.DESIGNER_AI_CONTRACT_VERSION, batchId: "integrated-partial", intent: "apply", assistantMessage: "Cambios confirmados", actions, resolutions: [], controlRequest: null } };
    } },
    "@/firebase": { functions: {} },
    "@/components/MiniToolbarTabImagen": noop,
    "@/components/editor/designerAi/DesignerAiLocationControl": noop,
    "../../../../shared/designerAiCapabilityContract.js": capabilityContract,
    "../../../../shared/designerAiConversationLedger.js": ledger,
    "@/domain/editor/designerAiCapabilities": capabilities,
    "@/domain/editor/designerAiMessageHistory": history,
    "@/domain/editor/designerAiActionExecutor": executor,
    "@/domain/editor/designerAiActionEvidence": evidence,
    "@/hooks/useEditorDocumentOperation": useEditorDocumentOperation,
    "@/domain/editor/designerAiLocationInteraction": location,
    "@/domain/eventDetails/features": features,
    "@/domain/eventDetails/locationAuthoring": locationAuthoring,
    "@/lib/dashboardDocumentNameBridge": nameBridge,
  });
  window.canvasEditor = {
    getTemplateAuthoringSnapshot: () => ({ fieldsSchema: [], defaults: {} }),
    flushPersistenceNow: async () => {
      if (++writes === 2) throw new Error("Synthetic write failure");
      return { ok: true, documentId: "A", persistedState: structuredClone(readEditorRenderSnapshot(window)) };
    },
  };
  publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true }, window);
  syncEditorSnapshotRenderState({ objetos: [], secciones: [], rsvp: { enabled: false }, gifts: { enabled: false } }, window);
  window.addEventListener("dashboard-document-name-update-request", ({ detail }) => {
    detail.onAccepted();
    publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true, designerAiConversation: detail.designerAiConversation }, window);
    detail.onPersisted({ documentId: "A", designerAiConversation: detail.designerAiConversation });
  });
  window.addEventListener("rsvp-config-update", ({ detail }) => syncEditorSnapshotRenderState({ ...readEditorRenderSnapshot(window), rsvp: detail.config }, window));
  window.addEventListener("insertar-elemento", ({ detail }) => {
    const current = readEditorRenderSnapshot(window);
    syncEditorSnapshotRenderState({ ...current, objetos: [...current.objetos, detail] }, window);
  });
  function Host() {
    const [items, setItems] = useState([]);
    messages = items;
    return React.createElement(Panel, { sessionKey: "draft:A", messageHistory: items, onMessageHistoryChange: setItems });
  }
  const until = async (predicate) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assert.ok(predicate(), document.body.textContent);
  };
  try {
    await act(async () => { root.render(React.createElement(Host)); });
    await until(() => messages.some((m) => m.recoveryBatchId));
    assert.equal(messages.some((m) => m.content === "Cambios confirmados"), false);
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent === "Reintentar pendientes");
    assert.ok(button);
    await act(async () => { button.click(); });
    await until(() => messages.some((m) => m.content === "Cambios confirmados"));
    assert.equal(providerCalls, 1);
    assert.equal(writes, 4);
    const current = capabilities.readDesignerAiCapabilitySnapshot(window);
    assert.equal(current.values.rsvp.questions.find((q) => q.id === "attendance").options.filter((o) => o.label === "Tal vez").length, 1);
    assert.equal(current.values.rsvp.enabled, true);
    assert.equal([...document.querySelectorAll("button")].some((el) => el.textContent === "Reintentar pendientes"), false);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

for (const route of ["A", "A-B", "A-B-A"]) {
  test(`M2 integrated React cover lifecycle ${route}`, async () => {
    const dom = new JSDOM("<div id='root'></div>", { url: "https://local.test" });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.getElementById("root"));
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const writes = [];
    const commits = [];
    const lifetimes = [];
    let active;
    let sequence = 0;
    const noop = () => {};
    const empty = {};
    const useDraftMeta = loadHook("../canvasEditor/useCanvasEditorDraftMeta.js", {
      "@/domain/editor/coverImage": coverDomain,
      "@/domain/editor/protectedSections": protectedSections,
      "@/components/editor/persistence/editorSessionPersistence": { persistEditorSessionPatch: async (input) => {
        writes.push(input);
        await pending;
      } },
    });
    const useStartup = loadHook("../../../hooks/useDashboardStartupLoaders.js", {
      "@/config/fonts": { GOOGLE_FONTS: [] },
      "@/domain/dashboard/helpers": { getErrorMessage: (error) => error.message },
      "@/domain/dashboard/startupRecovery": { handleDashboardStartupError: (input) => { throw input.error; } },
      "@/lib/monitoring/editorIssueReporter": { pushEditorBreadcrumb: noop },
      "@/components/editor/persistence/editorSessionPersistence": { readEditorSessionDocument: async () => ({ exists: true, data: empty }) },
    }, "useDashboardStartupLoaders");
    function Editor({ slug, session }) {
      const [instance] = useState(() => ++sequence);
      const [draftMeta, setDraftMeta] = useState({});
      const [objetos, setObjetos] = useState([]);
      const [secciones, setSecciones] = useState([]);
      const owner = useDraftMeta({ slug, editorSession: session, draftMeta, setDraftMeta, objetos, setObjetos,
        secciones, setSecciones, setTemplateEditorialPanelOpen: noop, setSectionDecorationEdit: noop });
      const begin = useEditorDocumentOperation();
      useEffect(() => {
        lifetimes.push(["mount", slug, instance]);
        owner.handleDraftLoaded({ portada: `${slug}-initial` });
        return () => { lifetimes.push(["unmount", slug, instance]); };
      }, []);
      useLayoutEffect(() => {
        publishDashboardDocumentNameState({ documentId: slug, hydrated: true, editable: true }, window);
        active = { slug, instance, owner, begin };
        commits.push({ slug, instance, cover: draftMeta.portada });
      });
      return React.createElement("output", { "data-instance": instance }, `${slug}:${draftMeta.portada}`);
    }
    function Dashboard({ slug }) {
      const session = useMemo(() => ({ kind: "draft", id: slug }), [slug]);
      const startup = useStartup({ slugInvitacion: slug, editorSession: session, initialDraftData: empty, isHomeView: false });
      // dashboard.js uses this same hook's boolean, without a key on CanvasEditor.
      return startup.shouldMountCanvasEditor ? React.createElement(Editor, { slug, session }) : null;
    }
    const navigate = async (slug) => {
      await act(async () => { root.render(React.createElement(Dashboard, { slug })); });
    };
    try {
      await navigate("A");
      const original = active;
      const operation = original.begin();
      let completion;
      await act(async () => {
        completion = operation.run(() => original.owner.updateCoverImage("OLD_COVER_SYNTHETIC"));
        await Promise.resolve();
      });
      assert.equal(writes.length, 1);
      assert.equal(writes[0].slug, "A");
      assert.equal(writes[0].patch.portada, "OLD_COVER_SYNTHETIC");
      if (route !== "A") await navigate("B");
      if (route === "A-B-A") await navigate("A");
      const beforeRelease = commits.length;
      if (route !== "A") {
        assert.notEqual(active.instance, original.instance);
        assert.ok(lifetimes.some(([event, , instance]) => event === "unmount" && instance === original.instance));
        assert.equal(operation.isCurrent(), false);
      }
      await act(async () => { release(); await completion; });
      if (route === "A") assert.match(document.body.textContent, /A:OLD_COVER_SYNTHETIC/);
      else {
        assert.doesNotMatch(document.body.textContent, /OLD_COVER_SYNTHETIC/);
        assert.equal(commits.slice(beforeRelease).some((entry) => entry.cover === "OLD_COVER_SYNTHETIC"), false);
      }
      operation.cancel();
    } finally {
      release();
      await act(async () => { root.unmount(); });
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    }
  });
}
