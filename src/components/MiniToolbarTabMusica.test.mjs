import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act, useEffect, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import * as config from "../../shared/musicConfig.js";
import * as catalog from "../../shared/musicCatalog.js";
import * as snapshot from "../lib/editorSnapshotAdapter.js";
import * as contracts from "../lib/editorBridgeContracts.js";
import * as previewController from "../domain/music/previewController.js";
import { canAccessMusic } from "../domain/music/access.js";
const require = createRequire(import.meta.url);
const ts = require("../../functions/node_modules/typescript");
const { JSDOM } = require("../../functions/node_modules/jsdom");

function loadModule(relative, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unmocked dependency ${id}`);
  }, module, module.exports);
  return module.exports.default;
}
const useMusicBridge = loadModule("./editor/canvasEditor/useCanvasEditorMusicBridge.js", {
  "../../../../shared/musicConfig.js": config,
  "@/lib/editorBridgeContracts": contracts,
});
const icon = () => null;
const MusicPanel = loadModule("./MiniToolbarTabMusica.jsx", {
  "lucide-react": { Check: icon, Music2: icon, Pause: icon, Play: icon },
  "../../shared/musicConfig.js": config,
  "../../shared/musicCatalog.js": catalog,
  "@/firebase": { firebaseEnvironment: { publicBaseUrl: "http://localhost:3100" } },
  "@/lib/editorSnapshotAdapter": snapshot,
  "@/lib/editorBridgeContracts": contracts,
  "@/domain/music/previewController": previewController,
  "./MiniToolbarTabRegalos.module.css": {},
});

async function mount({ canEdit = true } = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3100", pretendToBeVisual: true });
  const prior = Object.fromEntries(["window", "document", "CustomEvent", "Audio", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
  const audios = [];
  globalThis.Audio = class {
    constructor() { this.paused = true; this.plays = 0; audios.push(this); }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { delete this[name]; }
    load() {}
  };
  let currentConfig = null;
  let setActive;
  function Host() {
    const [music, setMusic] = useState(null);
    const [active, updateActive] = useState(true);
    setActive = updateActive;
    currentConfig = music;
    useMusicBridge({ musicConfig: music, setMusicConfig: setMusic, canEditMusic: canEdit });
    useEffect(() => { snapshot.syncEditorSnapshotRenderState({ objetos: [], secciones: [], music }); }, [music]);
    return React.createElement(MusicPanel, { active });
  }
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Host)));
  return {
    audios,
    config: () => currentConfig,
    click: async (selector) => { await act(async () => document.querySelector(selector).click()); },
    hide: async () => { await act(async () => setActive(false)); },
    event: async (name, detail) => { await act(async () => window.dispatchEvent(new CustomEvent(name, { detail }))); },
    async close() { await act(async () => root.unmount()); dom.window.close(); for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

test("real panel selects and persists IDs; OFF retains selection and opening preview stops its audio", async () => {
  const mounted = await mount();
  try {
    assert.equal(document.querySelector('[role="switch"]').getAttribute("aria-checked"), "false");
    assert.equal(mounted.audios.length, 0);
    await mounted.click('[role="radio"]');
    assert.equal(mounted.config().track.id, "perfect-ed-sheeran");
    await mounted.click('[role="switch"]');
    assert.equal(mounted.config().enabled, true);
    await mounted.click('button[aria-label^="Escuchar"]');
    assert.equal(mounted.audios.length, 1);
    assert.equal(mounted.audios[0].paused, false);
    await mounted.event(contracts.EDITOR_BRIDGE_EVENTS.PREVIEW_OPEN);
    assert.equal(mounted.audios[0].paused, true);
    assert.equal(mounted.audios[0].src, undefined);
    await mounted.click('[role="switch"]');
    assert.equal(mounted.config().enabled, false);
    assert.equal(mounted.config().track.id, "perfect-ed-sheeran");
    await mounted.click('button[aria-label^="Escuchar"]');
    await mounted.hide();
    assert.equal(mounted.audios[1].paused, true);
    assert.equal(mounted.audios[1].src, undefined);
  } finally { await mounted.close(); }
});

test("mutation authority ignores direct music events without permission", async () => {
  const mounted = await mount({ canEdit: false });
  try {
    await mounted.event(contracts.EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_UPDATE, { config: { enabled: true, track: { source: "catalog", id: "platform-demo" } } });
    assert.equal(mounted.config(), null);
  } finally { await mounted.close(); }
});

test("music pilot can select and enable catalog music through the editor bridge", async () => {
  const mounted = await mount({ canEdit: canAccessMusic({
    userUid: "pilot", userEmail: "jpeses@gmail.com", userEmailVerified: true,
    editorSession: { kind: "draft", id: "pilot-draft" },
  }) });
  try {
    await mounted.click('[role="radio"]');
    await mounted.click('[role="switch"]');
    assert.equal(mounted.config().enabled, true);
    assert.deepEqual(mounted.config().track, { source: "catalog", id: "perfect-ed-sheeran" });
  } finally { await mounted.close(); }
});

test("unmount releases audio and reopening the panel reads the draft rather than playback state", async () => {
  const mounted = await mount();
  await mounted.click('button[aria-label^="Escuchar"]');
  await mounted.close();
  assert.equal(mounted.audios[0].paused, true);
  assert.equal(mounted.audios[0].src, undefined);
  const reopened = await mount();
  try { assert.equal(reopened.audios.length, 0); }
  finally { await reopened.close(); }
});
