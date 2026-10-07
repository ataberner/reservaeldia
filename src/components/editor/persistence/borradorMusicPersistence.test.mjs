import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as session from "../../../domain/drafts/session.js";
import * as sourceOfTruth from "../../../domain/drafts/sourceOfTruth.js";
import * as renderState from "./borradorSyncRenderState.js";
import * as templateContract from "../../../../shared/templates/contract.js";
import { canAccessMusic } from "../../../domain/music/access.js";
const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");

function loadPersistence(writes) {
  const dependencies = {
    "../../../domain/drafts/session.js": session,
    "../../../domain/countdownAudit/runtime.js": { recordCountdownAuditSnapshot() {} },
    "../../../lib/monitoring/editorIssueReporter.js": { pushEditorBreadcrumb() {} },
    "./borradorSyncRenderState.js": renderState,
    "./editorSessionPersistence.js": { async persistEditorSessionSnapshot(request) { writes.push(request); } },
    "../../../domain/drafts/sourceOfTruth.js": sourceOfTruth,
    "../../../../shared/templates/contract.js": templateContract,
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL("./borradorSyncPersist.js", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected I/O ${id}`);
  }, module, module.exports);
  return module.exports.persistBorradorSyncState;
}
const music = { version: 1, enabled: true, track: { source: "catalog", id: "platform-demo" }, volume: 0.35, loop: true };

for (const [label, canEditMusic, savedMusic, expectedMusic] of [
  ["ordinary owner retains existing music without writing it", false, music, undefined],
  ["admin writes configured music atomically with the render snapshot", true, music, music],
  ["admin editing a legacy draft does not materialize music", true, undefined, undefined],
  ["verified music pilot persists music through the same editor snapshot", canAccessMusic({
    userUid: "pilot", userEmail: "jpeses@gmail.com", userEmailVerified: true,
    editorSession: { kind: "draft", id: "draft-test" },
  }), music, music],
]) {
  test(label, async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    try {
      const writes = [];
      const persist = loadPersistence(writes);
      const result = await persist({ immediate: true, state: { slug: "draft-test", cargado: true, objetos: [], secciones: [], music: savedMusic, canEditMusic } });
      assert.equal(result.ok, true);
      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0].patch.music, expectedMusic);
      assert.equal(Object.hasOwn(writes[0].patch, "music"), expectedMusic !== undefined);
      assert.ok(Array.isArray(writes[0].patch.objetos));
      assert.ok(Array.isArray(writes[0].patch.secciones));
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
}
