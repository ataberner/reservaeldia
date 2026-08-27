import test from "node:test";
import assert from "node:assert/strict";
import { canAccessDesignerAi } from "./designerAiAccess.js";

const allowed = {
  loadingAdminAccess: false,
  isSuperAdmin: true,
  editorReadOnly: false,
  editorSession: { kind: "draft", id: "draft-1" },
  modoSelector: false,
};

test("Designer AI is available only to a resolved superadmin in a writable draft", () => {
  assert.equal(canAccessDesignerAi(allowed), true);
  for (const patch of [
    { loadingAdminAccess: true },
    { isSuperAdmin: false },
    { editorReadOnly: true },
    { editorSession: { kind: "template" } },
    { editorSession: null },
    { modoSelector: true },
  ]) {
    assert.equal(canAccessDesignerAi({ ...allowed, ...patch }), false);
  }
});
