import test from "node:test";
import assert from "node:assert/strict";
import { canAccessAssistant } from "./assistantAccess.js";
import { resolveAssistantGuidedTourRestoreMenuItemState } from "./assistantGuidedTour.js";

test("Asistente and tour restoration require resolved administrative access", () => {
  // useAdminAccess exposes canManageSite for both admin and superadmin.
  for (const [role, canManageSite] of [["user", false], ["admin", true], ["superadmin", true]]) {
    for (const loadingAdminAccess of [true, false]) {
      const allowed = canAccessAssistant({ canManageSite, loadingAdminAccess });
      assert.equal(allowed, canManageSite && !loadingAdminAccess, role);
      const restore = resolveAssistantGuidedTourRestoreMenuItemState({ canUseAssistant: allowed, preferencesLoaded: true });
      assert.equal(restore.visible, allowed, role);
      assert.equal(restore.canRestore, allowed, role);
    }
  }
  assert.equal(canAccessAssistant(), false);
  assert.equal(canAccessAssistant({ canManageSite: "true", loadingAdminAccess: false }), false);
});
