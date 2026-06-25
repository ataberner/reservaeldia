import test from "node:test";
import assert from "node:assert/strict";

import {
  isSupportedEditorSessionKind,
  normalizeEditorSession,
} from "./session.js";

test("normalizeEditorSession preserves unsupported explicit kinds for fail-closed callers", () => {
  assert.deepEqual(normalizeEditorSession(null, "draft-1"), {
    kind: "draft",
    id: "draft-1",
    isSupported: true,
  });
  assert.deepEqual(normalizeEditorSession({ kind: "template", id: "tpl-1" }), {
    kind: "template",
    id: "tpl-1",
    isSupported: true,
  });
  assert.deepEqual(normalizeEditorSession({ kind: "preview", id: "prev-1" }), {
    kind: "preview",
    id: "prev-1",
    isSupported: false,
  });
  assert.equal(isSupportedEditorSessionKind("readonly"), false);
});
