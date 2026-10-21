import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const ts = createRequire(new URL("../../functions/package.json", import.meta.url))("typescript");
const source = readFileSync(new URL("./profesionales.jsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

// Exercise the production route with an offline Auth observer and role reader.
// React renders the resulting tree; no Firebase connection or real identity is used.
function fixture() {
  let session;
  let effect;
  let cleanup;
  let onUser;
  let onError;
  let observedUser;
  let unsubscribed = false;
  let role = { loadingAdminAccess: false, isSuperAdmin: false, adminAccessError: null };
  const auth = {};
  const dependencies = {
    react: {
      ...React,
      useState(initial) {
        session ??= initial;
        return [session, (next) => { session = next; }];
      },
      useEffect(callback) { effect = callback; },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/head": { default: ({ children }) => children, __esModule: true },
    "next/dynamic": { default: () => () => React.createElement("div", {
      "data-marketplace": "mounted",
    }, "Marketplace design"), __esModule: true },
    "@/firebase": { auth },
    "firebase/auth": {
      onAuthStateChanged(receivedAuth, next, error) {
        assert.equal(receivedAuth, auth);
        onUser = next;
        onError = error;
        return () => { unsubscribed = true; };
      },
    },
    "@/hooks/useAdminAccess": {
      useAdminAccess(user) { observedUser = user; return role; },
    },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    render() { return renderToStaticMarkup(exports.default()); },
    mount() { cleanup = effect(); },
    user(user) { onUser(user); },
    authError() { onError(new Error("synthetic authentication failure")); },
    role(next) { role = { ...role, ...next }; },
    observedUser: () => observedUser,
    stop() { cleanup(); assert.equal(unsubscribed, true); },
  };
}

function assertClosed(html) {
  assert.doesNotMatch(html, /data-marketplace|Marketplace design/);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /rel="canonical"|application\/ld\+json/);
}

test("initial render and unresolved authentication never render marketplace content", () => {
  const page = fixture();
  assertClosed(page.render());
  assert.match(page.render(), /Validando acceso/);
  page.role({ isSuperAdmin: true });
  assertClosed(page.render());
});

test("anonymous visitors, regular users and ordinary admins cannot open the design", () => {
  const page = fixture();
  page.render();
  page.mount();
  for (const user of [null, { uid: "regular" }, { uid: "admin" }]) {
    page.user(user);
    page.role({ isAdmin: true, canManageSite: true, isSuperAdmin: false });
    assertClosed(page.render());
    assert.equal(page.observedUser(), user);
  }
  page.user(null);
  page.role({ isSuperAdmin: true });
  assertClosed(page.render());
  page.stop();
});

test("only a resolved exact superadmin response mounts the design", () => {
  const page = fixture();
  page.render();
  page.mount();
  page.user({ uid: "superadmin-fixture" });
  page.role({ isSuperAdmin: true, loadingAdminAccess: true });
  assertClosed(page.render());
  page.role({ loadingAdminAccess: false, isSuperAdmin: "true" });
  assertClosed(page.render());
  page.role({ isSuperAdmin: true });
  assert.match(page.render(), /data-marketplace="mounted"/);
  assert.match(page.render(), /name="robots" content="noindex, nofollow, noarchive"/);
  page.stop();
});

test("sign-out, authentication failures and permission failures remove the design", () => {
  const page = fixture();
  page.render();
  page.mount();
  page.user({ uid: "superadmin-fixture" });
  page.role({ isSuperAdmin: true });
  assert.match(page.render(), /data-marketplace/);
  page.user(null);
  assertClosed(page.render());
  page.user({ uid: "superadmin-fixture" });
  page.role({ adminAccessError: "synthetic permission failure" });
  assertClosed(page.render());
  assert.match(page.render(), /No pudimos validar/);
  page.role({ adminAccessError: null });
  assert.match(page.render(), /data-marketplace/);
  page.authError();
  assertClosed(page.render());
  page.stop();
});
