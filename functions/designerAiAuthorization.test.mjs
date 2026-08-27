import test from "node:test";
import assert from "node:assert/strict";
import adminAuthModule from "./lib/auth/adminAuth.js";

const { requireSuperAdmin } = adminAuthModule;

test("backend superadmin authorization rejects unauthenticated and ordinary admin sessions", () => {
  const previous = process.env.SUPERADMINS_UIDS;
  process.env.SUPERADMINS_UIDS = "super-1";
  try {
    assert.equal(requireSuperAdmin({ auth: { uid: "super-1", token: {} } }), "super-1");
    assert.throws(
      () => requireSuperAdmin({ auth: null }),
      (error) => error.code === "unauthenticated"
    );
    assert.throws(
      () => requireSuperAdmin({ auth: { uid: "admin-1", token: { admin: true } } }),
      (error) => error.code === "permission-denied"
    );
  } finally {
    if (typeof previous === "string") process.env.SUPERADMINS_UIDS = previous;
    else delete process.env.SUPERADMINS_UIDS;
  }
});
