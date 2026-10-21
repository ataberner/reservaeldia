import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as bridgeContract from "../../../lib/editorBridgeContracts.js";
import { readCanvasEditorMethod } from "../../../lib/editorRuntimeBridge.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const sidebarPath = new URL("../../MiniToolbarTabDetallesEvento.jsx", import.meta.url);

function sidebarFunctions(names, bindings) {
  const source = readFileSync(sidebarPath, "utf8");
  const tree = ts.createSourceFile(sidebarPath.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declarations = names.map(name => {
    const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, "Missing executable sidebar function " + name);
    return declaration.getText(tree);
  });
  const output = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(bindings), output + "\nreturn {" + names.join(",") + "};")(...Object.values(bindings));
}

test("sidebar reset calls the existing owner only when its availability allows it", async () => {
  let available = false, resets = 0;
  const targetWindow = { canvasEditor: {
    canResetEventLayout: () => available,
    resetEventLayout: () => { resets++; return { ok: true }; },
  } };
  const { readCanResetEventLayoutState, resetLinkedEventLayout } = sidebarFunctions(
    ["readCanResetEventLayoutState", "resetLinkedEventLayout"],
    { readCanvasEditorMethod: (name, target = targetWindow) => readCanvasEditorMethod(name, target), window: targetWindow }
  );
  assert.equal(readCanResetEventLayoutState(targetWindow), false);
  assert.equal(await resetLinkedEventLayout(), false);
  assert.equal(resets, 0);
  available = true;
  assert.equal(readCanResetEventLayoutState(targetWindow), true);
  assert.equal(await resetLinkedEventLayout(), true);
  assert.equal(resets, 1);
  targetWindow.canvasEditor.resetEventLayout = () => ({ ok: false });
  assert.equal(await resetLinkedEventLayout(), false);
});

test("sidebar reset reports rejected requests instead of silently succeeding", async () => {
  const failure = new Error("reset refused");
  const targetWindow = { canvasEditor: { canResetEventLayout: () => true, resetEventLayout: async () => { throw failure; } } };
  const { resetLinkedEventLayout } = sidebarFunctions(
    ["readCanResetEventLayoutState", "resetLinkedEventLayout"],
    { readCanvasEditorMethod: (name, target = targetWindow) => readCanvasEditorMethod(name, target), window: targetWindow }
  );
  await assert.rejects(resetLinkedEventLayout, failure);
});

test("reset control is explicit, disabled when unavailable, and reflects a pending or failed owner operation", async () => {
  const state = [];
  let cursor = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const { EventLayoutResetControl } = sidebarFunctions(["EventLayoutResetControl"], {
    React, useState: initial => {
      const index = cursor++; if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
  });
  const render = props => { cursor = 0; return EventLayoutResetControl(props); };
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.props?.children || []) { const match = find(child, predicate); if (match) return match; }
    return null;
  };
  const unavailable = render({ canReset: false, onReset: () => assert.fail("disabled action executed") });
  assert.equal(find(unavailable, n => n.type === "button").props.disabled, true);
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const props = { canReset: true, onReset: () => pending };
  const button = find(render(props), n => n.type === "button");
  assert.equal(button.props.disabled, false);
  assert.ok(button.props.children.join("").includes("Restablecer distribución de esta modalidad"));
  const operation = button.props.onClick();
  assert.equal(find(render(props), n => n.type === "button").props.disabled, true);
  resolve(false); await operation;
  assert.ok(find(render(props), n => n.props?.role === "alert"));
  assert.equal(find(render(props), n => n.type === "button").props.disabled, false);
});

test("window bridge exposes owner reset, updates availability through the existing event and cleans both keys", () => {
  const source = readFileSync(new URL("./useEditorWindowBridge.js", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let cursor = 0;
  const refs = [], effects = [], previousDeps = [], cleanup = [], events = [];
  const targetWindow = { dispatchEvent: event => { events.push(event); } };
  const imports = {
    react: {
      useRef(value) { const i = cursor++; return refs[i] ||= { current: value }; },
      useEffect(callback, deps) {
        const i = cursor++, previous = previousDeps[i];
        if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) effects.push(() => { cleanup[i]?.(); cleanup[i] = callback(); });
        previousDeps[i] = deps;
      },
    },
    "@/domain/countdownAudit/runtime": { registerCountdownAuditContext() {} },
    "@/domain/eventDetails/countdownEventDetails": {},
    "@/lib/editorBridgeContracts": bridgeContract,
    "@/lib/editorSnapshotAdapter": {
      ensureEditorSnapshotAdapter: () => ({}), syncEditorSnapshotResolvers() {}, clearEditorSnapshotResolvers() {},
    },
    "@/domain/templates/dynamicFieldTargets": {},
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", "CustomEvent", output)(
    name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports, targetWindow,
    class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  );
  const reset = () => ({ ok: true });
  const props = { objetos: [], secciones: [], seccionesOrdenadas: [], stageRef: { current: null },
    getTemplateAuthoringSnapshot: () => ({ fieldsSchema: [] }), resetEventLayout: reset, canResetEventLayout: false };
  const render = extra => { cursor = 0; module.exports.default({ ...props, ...extra }); while (effects.length) effects.shift()(); };
  render({});
  assert.equal(targetWindow.canvasEditor.resetEventLayout, reset);
  assert.equal(targetWindow.canvasEditor.canResetEventLayout(), false);
  events.length = 0;
  render({ canResetEventLayout: true });
  assert.equal(targetWindow.canvasEditor.canResetEventLayout(), true);
  assert.ok(events.some(event => event.type === bridgeContract.EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE));
  for (const dispose of cleanup) dispose?.();
  assert.equal(targetWindow.canvasEditor?.resetEventLayout, undefined);
  assert.equal(targetWindow.canvasEditor?.canResetEventLayout, undefined);
});
