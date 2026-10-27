import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import swc from "next/dist/build/swc/index.js";
import * as editorSession from "../domain/dashboard/editorSession.js";
import * as helpers from "../domain/dashboard/helpers.js";
import * as draftState from "../domain/drafts/state.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../functions/node_modules/jsdom");
const { code } = await swc.transform(readFileSync(new URL("./useDashboardEditorRoute.js", import.meta.url), "utf8"), {
  filename: "useDashboardEditorRoute.js", jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" },
});

async function fixture({ isSuperAdmin = true, snapshot } = {}) {
  const dom = new JSDOM("<main></main>", { url: "http://localhost/dashboard?slug=draft-synthetic&adminView=1&ownerUid=owner-synthetic" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = { snapshots: [], sdk: [], routes: [] };
  const dependencies = {
    "firebase/functions": { httpsCallable: (_functions, name) => async payload => {
      assert.equal(name, "getAdminDraftSnapshot");
      calls.snapshots.push(payload);
      return { data: snapshot ? await snapshot(payload, calls.snapshots.length) : {
        ...payload, status: "ok", draftName: "Borrador de prueba", revision: `revision-${calls.snapshots.length}`,
        draft: { userId: payload.ownerUid, objetos: [{ id: "text-1", tipo: "texto", texto: `Version ${calls.snapshots.length}` }], secciones: [] },
      } };
    } },
    "firebase/firestore": { doc: (...args) => args, getDoc: async value => { calls.sdk.push(value); throw new Error("Unexpected SDK access"); } },
    "@/firebase": { db: {}, functions: {} },
    "@/domain/dashboard/helpers": helpers,
    "@/domain/dashboard/startupRecovery": {
      runDashboardStartupOperation: async ({ task }) => ({ ok: true, value: await task() }),
      handleDashboardStartupError: () => {},
    },
    "@/domain/dashboard/editorSession": editorSession,
    "@/domain/drafts/state": draftState,
    "@/domain/templates/adminService": {},
    "@/domain/templates/draftPersonalizationDebug": {},
    "@/lib/monitoring/editorIssueReporter": { pushEditorBreadcrumb: () => {} },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(id =>
    Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), module, module.exports);
  let current;
  let props = {
    router: { isReady: true, asPath: "/dashboard?slug=draft-synthetic&adminView=1&ownerUid=owner-synthetic",
      query: { slug: "draft-synthetic", ownerUid: "owner-synthetic", adminView: "1", adminEdit: "1" },
      replace: async query => { calls.routes.push(query); return true; } },
    checkingAuth: false, loadingAdminAccess: false, usuarioUid: "actor-synthetic", isSuperAdmin, canManageSite: true,
  };
  function Harness() { current = module.exports.useDashboardEditorRoute(props); return null; }
  const root = createRoot(dom.window.document.querySelector("main"));
  await act(async () => root.render(React.createElement(Harness)));
  return {
    calls, get api() { return current; },
    async rerender(patch) { props = { ...props, ...patch }; await act(async () => root.render(React.createElement(Harness))); },
    async navigate(query) {
      props = { ...props, router: { ...props.router, query,
        asPath: `/dashboard?${new URLSearchParams(query)}` } };
      await act(async () => root.render(React.createElement(Harness)));
    },
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

test("administrative URLs always start read-only and editing uses a freshly authorized snapshot", async () => {
  const f = await fixture();
  try {
    assert.equal(f.api.isAdminReadOnlyView, true);
    assert.equal(f.api.isEditorReadOnly, true);
    assert.equal(f.api.editorSession.adminEdit, undefined);
    await act(async () => assert.equal(await f.api.setAdminDraftEditing(true), true));
    assert.equal(f.api.isEditorReadOnly, false);
    assert.equal(f.api.adminDraftView.editing, true);
    assert.equal(f.api.adminDraftView.draftData.objetos[0].texto, "Version 2");
    assert.deepEqual(f.api.editorSession.adminEdit, {
      ownerUid: "owner-synthetic", actorUid: "actor-synthetic", revision: "revision-2", closed: false,
    });
    assert.deepEqual(f.calls.snapshots, [
      { slug: "draft-synthetic", ownerUid: "owner-synthetic" },
      { slug: "draft-synthetic", ownerUid: "owner-synthetic" },
    ]);
    assert.deepEqual(f.calls.sdk, []);
  } finally { await f.close(); }
});

test("returning to read-only closes the editing context and reloads persisted data", async () => {
  const f = await fixture();
  try {
    await act(async () => f.api.setAdminDraftEditing(true));
    const editingContext = f.api.editorSession.adminEdit;
    await act(async () => f.api.setAdminDraftEditing(false));
    assert.equal(editingContext.closed, true);
    assert.equal(f.api.isEditorReadOnly, true);
    assert.equal(f.api.editorSession.adminEdit, undefined);
    assert.equal(f.api.adminDraftView.draftData.userId, "owner-synthetic");
    assert.equal(f.api.adminDraftView.draftData.objetos[0].texto, "Version 3");
  } finally { await f.close(); }
});

test("a regular user cannot request administrative snapshots or enter editing", async () => {
  const f = await fixture({ isSuperAdmin: false });
  try {
    assert.equal(await f.api.setAdminDraftEditing(true), false);
    assert.equal(f.api.adminDraftView.enabled, false);
    assert.equal(f.api.slugInvitacion, null);
    assert.deepEqual(f.calls.snapshots, []);
    assert.deepEqual(f.calls.sdk, []);
  } finally { await f.close(); }
});

test("navigating to another administrative draft closes the previous writer and starts read-only", async () => {
  const f = await fixture();
  try {
    await act(async () => f.api.setAdminDraftEditing(true));
    const editingContext = f.api.editorSession.adminEdit;
    await f.navigate({ slug: "another-draft", ownerUid: "another-owner", adminView: "1" });
    assert.equal(editingContext.closed, true);
    assert.equal(f.api.slugInvitacion, "another-draft");
    assert.equal(f.api.isEditorReadOnly, true);
    assert.equal(f.api.editorSession.adminEdit, undefined);
    assert.equal(f.api.adminDraftView.draftData.userId, "another-owner");
  } finally { await f.close(); }
});

test("failed authorization leaves the existing read-only snapshot intact", async () => {
  const f = await fixture({ snapshot: (payload, count) => {
    if (count > 1) throw new Error("Autorización revocada");
    return { ...payload, status: "ok", revision: "first", draft: { userId: payload.ownerUid, objetos: [], secciones: [] } };
  } });
  try {
    const first = f.api.adminDraftView;
    await act(async () => assert.rejects(f.api.setAdminDraftEditing(true), /Autorización revocada/));
    assert.equal(f.api.isEditorReadOnly, true);
    assert.equal(f.api.adminDraftView, first);
  } finally { await f.close(); }
});

test("a pending edit authorization cannot reactivate after the actor loses access", async () => {
  let finish;
  const f = await fixture({ snapshot: (payload, count) => count === 1
    ? { ...payload, status: "ok", revision: "first", draft: { userId: payload.ownerUid, objetos: [], secciones: [] } }
    : new Promise(resolve => { finish = () => resolve({ ...payload, status: "ok", revision: "second", draft: { userId: payload.ownerUid } }); }) });
  try {
    let pending;
    await act(async () => { pending = f.api.setAdminDraftEditing(true); });
    await f.rerender({ isSuperAdmin: false });
    await act(async () => { finish(); assert.equal(await pending, false); });
    assert.equal(f.api.adminDraftView.enabled, false);
    assert.equal(f.api.editorSession.adminEdit, undefined);
  } finally { await f.close(); }
});
