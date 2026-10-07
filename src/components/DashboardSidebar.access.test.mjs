import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { loadComponent } from "./editor/designerAi/testSupport/panelHarness.mjs";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../functions/node_modules/jsdom");
const noop = () => {};
const coordinator = { activePanel: "left", openPanel: noop, closePanel: noop };
const sourceUrl = new URL("./DashboardSidebar.jsx", import.meta.url);
let requestLateTourActivation = false;
const dependencies = {
  "@/components/editor/assistantTour/AssistantGuidedTour": ({ onRequestAssistantMode, editorReady, preferencesLoaded }) => {
    React.useEffect(() => {
      if (requestLateTourActivation && editorReady && preferencesLoaded) onRequestAssistantMode();
    }, [onRequestAssistantMode, editorReady, preferencesLoaded]);
    return React.createElement("div", { "data-test-tour": true });
  },
  "@/components/editor/designerAi/DesignerAiPanel": () => React.createElement("div", { "data-test-ai": true }),
  "./MiniToolbar": ({ assistantMode, canUseMusic }) => React.createElement("div", { "data-test-toolbar": true, "data-assistant-mode": String(assistantMode), "data-music-access": String(canUseMusic) }),
  "./PanelDeFormas": () => null,
  "./ModalCrearSeccion": () => null,
  "@/hooks/useModalCrearSeccion": () => ({ visible: false, cerrar: noop, onConfirmar: noop }),
  "@/hooks/useMisImagenes": () => ({ imagenes: [], imagenesEnProceso: [], cargarImagenes: noop, subirImagen: noop, borrarImagen: noop }),
  "@/hooks/useUploaderDeImagen": () => ({ abrirSelector: noop, componenteInput: null, handleSeleccion: noop }),
  "@/hooks/useEditorDocumentOperation": () => () => ({ cancel: noop, isCurrent: () => true }),
  "@/components/editor/panels/EditorPanelCoordinatorContext": { useEditorPanelCoordinator: () => coordinator },
  "@/firebase": { functions: {} },
  "@/utils/editorHistoryControls": { triggerEditorUndo: noop, triggerEditorRedo: noop },
  "firebase/functions": { httpsCallable: () => { throw new Error("No remote calls allowed in sidebar access tests"); } },
  "react-icons/fa": await import("react-icons/fa"),
  "lucide-react": await import("lucide-react"),
};
for (const [, id] of readFileSync(sourceUrl, "utf8").matchAll(/from\s+["']([^"']+)["']/g)) {
  if (id === "react" || Object.hasOwn(dependencies, id)) continue;
  assert.ok(id.startsWith("@/domain/") || id.startsWith("@/lib/") || id.startsWith("@/utils/") || id.endsWith("assistantTourDebug"), `Unexpected dependency ${id}`);
  dependencies[id] = await import(new URL(`../${id.slice(2)}.js`, import.meta.url));
}
const Sidebar = loadComponent(sourceUrl, dependencies);

async function mountSidebar(patch = {}, width = 1280, strictEffects = false) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://local.test", pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
  window.innerWidth = width;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = noop;
  window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  const root = createRoot(document.getElementById("root"));
  let props = { userUid: "user-1", loadingAdminAccess: false, canManageSite: false,
    slugInvitacion: "draft-1", editorSession: { kind: "draft", id: "draft-1" }, ...patch };
  const render = async next => {
    props = { ...props, ...next };
    const sidebar = React.createElement(Sidebar, props);
    await act(async () => root.render(strictEffects ? React.createElement(React.StrictMode, null, sidebar) : sidebar));
  };
  await render({});
  return { render, buttons: label => [...document.querySelectorAll("button")].filter(button => button.textContent.trim() === label || button.getAttribute("aria-label") === label || button.title === label),
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
      for (const key of ["window", "document", "Node", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]) delete globalThis[key];
    } };
}

for (const width of [1280, 375]) {
  for (const [role, canManageSite] of [["user", false], ["admin", true], ["superadmin", true]]) {
    test(`${role} can open Tu asistente at ${width}px; legacy UI is administrative`, async () => {
      const run = await mountSidebar({ userUid: role, canManageSite }, width);
      try {
        const aiButtons = run.buttons("Abrir Tu asistente");
        assert.equal(aiButtons.length, 2);
        assert.equal(document.querySelectorAll('button[aria-label="Abrir el asistente"], button[aria-label="Volver al asistente"]').length, canManageSite ? 2 : 0);
        assert.equal(Boolean(document.querySelector("[data-test-tour]")), canManageSite && width >= 768);
        assert.equal(Boolean(document.querySelector('[data-assistant-mode="true"]')), canManageSite && width >= 768);
        assert.equal(Boolean(document.querySelector("[data-test-ai]")), width < 768);
        await act(async () => aiButtons[width < 768 ? 1 : 0].click());
        assert.ok(document.querySelector("[data-test-ai]"));
        assert.equal(document.querySelector("[data-test-tour]"), null);
        assert.equal(document.querySelector('[data-assistant-mode="true"]'), null);
      } finally { await run.close(); }
    });
  }
}

test("mobile initial opening is consumed once; close, tab navigation and access refresh do not reopen it", async () => {
  requestLateTourActivation = true;
  const run = await mountSidebar({ loadingAdminAccess: true, canManageSite: true }, 375);
  try {
    assert.ok(document.querySelector("[data-test-ai]"));
    await act(async () => document.querySelector('button[title="Cerrar panel"]').click());
    assert.equal(document.querySelector("[data-test-ai]"), null);
    await run.render({ loadingAdminAccess: false, assistantTourEditorReady: true, assistantTourPreferencesLoaded: true });
    assert.equal(document.querySelector("[data-test-ai]"), null);
    assert.equal(document.querySelector("[data-test-tour]"), null);
    await act(async () => run.buttons("Texto").at(-1).click());
    assert.ok(document.querySelector("[data-test-toolbar]"));
    await run.render({ editorSession: { kind: "draft", id: "draft-1" } });
    assert.equal(document.querySelector("[data-test-ai]"), null);
    await act(async () => run.buttons("Abrir Tu asistente")[1].click());
    assert.ok(document.querySelector("[data-test-ai]"));
    await act(async () => document.querySelector('button[title="Cerrar panel"]').click());
    for (const width of [1280, 375]) {
      await act(async () => { window.innerWidth = width; window.dispatchEvent(new window.Event("resize")); });
      assert.equal(document.querySelector("[data-test-ai]"), null);
      assert.equal(document.querySelector('[data-assistant-mode="true"]'), null);
    }
  } finally { requestLateTourActivation = false; await run.close(); }
});

test("explicit administrative tour restart can leave chat without giving late tour effects navigation authority", async () => {
  const run = await mountSidebar({ canManageSite: true }, 375);
  try {
    assert.ok(document.querySelector("[data-test-ai]"));
    await run.render({ assistantTourRestartKey: 1 });
    assert.equal(document.querySelector("[data-test-ai]"), null);
    assert.ok(document.querySelector('[data-assistant-mode="true"]'));
    assert.ok(document.querySelector("[data-test-tour]"));
    await act(async () => document.querySelector('button[title="Cerrar panel"]').click());
    await run.render({ assistantTourRestartKey: 1 });
    assert.equal(document.querySelector('[data-assistant-mode="true"]'), null);
  } finally { await run.close(); }
});

test("desktop entry keeps its initial behavior when resized to mobile", async () => {
  const run = await mountSidebar({}, 1280);
  try {
    assert.equal(document.querySelector("[data-test-ai]"), null);
    await act(async () => { window.innerWidth = 375; window.dispatchEvent(new window.Event("resize")); });
    assert.equal(document.querySelector("[data-test-ai]"), null);
    await act(async () => run.buttons("Abrir Tu asistente")[1].click());
    assert.ok(document.querySelector("[data-test-ai]"));
  } finally { await run.close(); }
});

test("repeated mount effects do not reopen a mobile panel after manual close", async () => {
  const run = await mountSidebar({}, 375, true);
  try {
    assert.ok(document.querySelector("[data-test-ai]"));
    await act(async () => document.querySelector('button[title="Cerrar panel"]').click());
    await run.render({ editorSession: { kind: "draft", id: "draft-1" }, assistantTourEditorReady: true });
    assert.equal(document.querySelector("[data-test-ai]"), null);
  } finally { await run.close(); }
});

test("mobile auth hydration and a new editor entry open the assistant, not selector or read-only sessions", async () => {
  const run = await mountSidebar({ userUid: "" }, 375);
  try {
    assert.equal(document.querySelector("[data-test-ai]"), null);
    await run.render({ userUid: "user-1" });
    assert.ok(document.querySelector("[data-test-ai]"));
    await act(async () => document.querySelector('button[title="Cerrar panel"]').click());
    await run.render({ slugInvitacion: "draft-2", editorSession: { kind: "draft", id: "draft-2" } });
    assert.ok(document.querySelector("[data-test-ai]"));
  } finally { await run.close(); }
  for (const props of [{ modoSelector: true }, { editorReadOnly: true }, { editorSession: { kind: "template", id: "template" } }]) {
    const excluded = await mountSidebar(props, 375);
    try { assert.equal(document.querySelector("[data-test-ai]"), null); }
    finally { await excluded.close(); }
  }
  // A fresh mount models refresh/reentry; it is a new initial editor experience.
  const refreshed = await mountSidebar({}, 375);
  try { assert.ok(document.querySelector("[data-test-ai]")); }
  finally { await refreshed.close(); }
});

test("admin loading never flashes legacy controls; resolving and revoking access updates the mounted sidebar", async () => {
  const run = await mountSidebar({ loadingAdminAccess: true, canManageSite: true });
  try {
    assert.equal(run.buttons("Asistente").length, 0);
    assert.equal(document.querySelector("[data-test-tour]"), null);
    assert.equal(run.buttons("Abrir Tu asistente").length, 2);
    await run.render({ loadingAdminAccess: false });
    assert.ok(document.querySelector('[data-assistant-mode="true"]'));
    await run.render({ canManageSite: false });
    assert.equal(run.buttons("Asistente").length, 0);
    assert.equal(document.querySelector("[data-test-tour]"), null);
    assert.equal(document.querySelector('[data-assistant-mode="true"]'), null);
    await act(async () => run.buttons("Abrir Tu asistente")[0].click());
    assert.ok(document.querySelector("[data-test-ai]"));
    await run.render({ userUid: "" });
    assert.equal(run.buttons("Abrir Tu asistente").length, 0);
    assert.equal(document.querySelector("[data-test-ai]"), null);
  } finally { await run.close(); }
});

for (const width of [1280, 375]) {
  test(`music pilot sees and opens Music at ${width}px without administrative tabs`, async () => {
    const run = await mountSidebar({ userEmail: "jpeses@gmail.com", userEmailVerified: true }, width);
    try {
      const buttons = run.buttons("Música");
      assert.equal(buttons.length, 2);
      assert.equal(run.buttons("Asistente").length, 0);
      await act(async () => buttons[width < 768 ? 1 : 0].click());
      assert.ok(document.querySelector('[data-music-access="true"]'));
      await run.render({ userEmail: "another@example.test" });
      assert.equal(run.buttons("Música").length, 0);
      assert.equal(document.querySelector('[data-music-access="true"]'), null);
      await run.render({ userEmail: "jpeses@gmail.com", userEmailVerified: false });
      assert.equal(run.buttons("Música").length, 0);
      await run.render({ userEmailVerified: true, editorReadOnly: true });
      assert.equal(run.buttons("Música").length, 0);
      await run.render({ editorReadOnly: false, editorSession: { kind: "template", id: "template-1" } });
      assert.equal(run.buttons("Música").length, 0);
    } finally { await run.close(); }
  });
}
