import test from "node:test";
import assert from "node:assert/strict";
import { canAccessDesignerAi } from "./designerAiAccess.js";

const allowed = {
  userUid: "user-1",
  editorReadOnly: false,
  editorSession: { kind: "draft", id: "draft-1" },
  modoSelector: false,
};

test("Tu asistente is available to every authenticated role, independently of admin lookup", () => {
  assert.equal(canAccessDesignerAi(allowed), true);
  for (const role of [
    { isSuperAdmin: false, canManageSite: false, loadingAdminAccess: false },
    { isSuperAdmin: false, canManageSite: true, loadingAdminAccess: false },
    { isSuperAdmin: true, canManageSite: true, loadingAdminAccess: false },
    { loadingAdminAccess: true },
  ]) assert.equal(canAccessDesignerAi({ ...allowed, ...role }), true);
});

test("Tu asistente still requires a session and a writable draft outside the selector", () => {
  assert.equal(canAccessDesignerAi(), false);
  for (const patch of [
    { userUid: "" },
    { userUid: null },
    { userUid: "  " },
    { editorReadOnly: true },
    { editorSession: { kind: "template" } },
    { editorSession: null },
    { editorSession: { kind: "draft", id: "third-party", adminEdit: { ownerUid: "other" } } },
    { modoSelector: true },
  ]) {
    assert.equal(canAccessDesignerAi({ ...allowed, ...patch }), false);
  }
});
