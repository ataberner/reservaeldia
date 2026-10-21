import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const ts = createRequire(new URL("../../functions/package.json", import.meta.url))("typescript");
const source = readFileSync(new URL("./lugares.jsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

// Exercise the production route with offline Auth and role-reader doubles.
// Real useAdminAccess account/recovery behavior has its own startup-reader tests;
// these tests verify route behavior, not Next export or a remote authorization service.
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
    "next/dynamic": {
      default: (_loader, options) => {
        assert.equal(options.ssr, false);
        return () => React.createElement("div", {
          "data-venues": "mounted",
        }, "Venue design");
      },
      __esModule: true,
    },
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

function assertMetadata(html) {
  assert.match(html, /<title>Lugares \| Reserva el Día<\/title>/);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /name="googlebot" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /rel="canonical"|application\/ld\+json/);
}

function assertClosed(html) {
  assert.doesNotMatch(html, /data-venues|Venue design/);
  assertMetadata(html);
}

test("initial render and unresolved authentication contain metadata but no venue design", () => {
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
    const html = page.render();
    assertClosed(html);
    assert.equal(page.observedUser(), user);
    assert.match(html, user ? /href="\/dashboard\/"/ : /href="\/\?auth=login"/);
  }
  page.user(null);
  page.role({ isSuperAdmin: true });
  assertClosed(page.render());
  page.stop();
});

test("only an exact superadmin role after permission loading mounts the design", () => {
  const page = fixture();
  page.render();
  page.mount();
  page.user({ uid: "superadmin-fixture" });
  page.role({ isSuperAdmin: true, loadingAdminAccess: true });
  assertClosed(page.render());
  page.role({ loadingAdminAccess: false, isSuperAdmin: "true" });
  assertClosed(page.render());
  page.role({ isSuperAdmin: true });
  const html = page.render();
  assert.match(html, /data-venues="mounted"/);
  assertMetadata(html);
  page.stop();
});

test("the design closes while the next account permissions resolve and stays closed on denial", () => {
  const page = fixture();
  page.render();
  page.mount();
  page.user({ uid: "superadmin-fixture" });
  page.role({ isSuperAdmin: true });
  assert.match(page.render(), /data-venues="mounted"/);

  const nextUser = { uid: "next-account" };
  page.user(nextUser);
  page.role({ loadingAdminAccess: true });
  assertClosed(page.render());
  assert.equal(page.observedUser(), nextUser);
  page.role({ loadingAdminAccess: false, isSuperAdmin: false });
  assertClosed(page.render());
  page.stop();
});

test("sign-out, authentication failures and role failures remove the design with a local retry", () => {
  const page = fixture();
  page.render();
  page.mount();
  page.user({ uid: "superadmin-fixture" });
  page.role({ isSuperAdmin: true });
  assert.match(page.render(), /data-venues/);
  page.user(null);
  assertClosed(page.render());
  page.user({ uid: "superadmin-fixture" });
  page.role({ adminAccessError: "synthetic permission failure" });
  const failedHtml = page.render();
  assertClosed(failedHtml);
  assert.match(failedHtml, /No pudimos validar/);
  assert.match(failedHtml, /href="\/lugares\/"/);
  page.role({ adminAccessError: null });
  assert.match(page.render(), /data-venues/);
  page.authError();
  assertClosed(page.render());
  assert.match(page.render(), /href="\/lugares\/"/);
  page.stop();
});
