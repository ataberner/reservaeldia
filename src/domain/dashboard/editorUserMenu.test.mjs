import assert from "node:assert/strict";
import test from "node:test";

import { resolveEditorUserMenuAccess } from "./editorUserMenu.js";

test("writable admin editor sessions retain every template menu action", () => {
  assert.deepEqual(
    resolveEditorUserMenuAccess({
      hasActiveEditor: true,
      canManageSite: true,
      editorReadOnly: false,
    }),
    {
      showAddSection: true,
      showCreateTemplate: true,
      showSaveTemplate: true,
    }
  );
});

test("administrative read-only draft sessions expose only template creation to superadmin", () => {
  assert.deepEqual(
    resolveEditorUserMenuAccess({
      hasActiveEditor: true,
      canManageSite: true,
      isSuperAdmin: true,
      editorReadOnly: true,
      isAdminReadOnlyView: true,
    }),
    {
      showAddSection: false,
      showCreateTemplate: true,
      showSaveTemplate: false,
    }
  );
});

test("read-only access never exposes template creation to admin or unresolved roles", () => {
  const baseState = {
    hasActiveEditor: true,
    canManageSite: true,
    editorReadOnly: true,
    isAdminReadOnlyView: true,
  };

  assert.equal(
    resolveEditorUserMenuAccess({
      ...baseState,
      isSuperAdmin: false,
    }).showCreateTemplate,
    false
  );
  assert.equal(
    resolveEditorUserMenuAccess({
      ...baseState,
      isSuperAdmin: true,
      loadingAdminAccess: true,
    }).showCreateTemplate,
    false
  );
});

test("generic read-only editor sessions do not inherit the administrative exception", () => {
  assert.equal(
    resolveEditorUserMenuAccess({
      hasActiveEditor: true,
      canManageSite: true,
      isSuperAdmin: true,
      editorReadOnly: true,
      isAdminReadOnlyView: false,
    }).showCreateTemplate,
    false
  );
});
