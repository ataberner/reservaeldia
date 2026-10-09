import test from "node:test";
import assert from "node:assert/strict";
import { initializeFirebaseAppCheck, FIREBASE_APP_CHECK_SITE_KEY } from "./initializeFirebaseAppCheck.js";

test("App Check never initializes in SSR or isolated emulators", () => {
  const sdk = new Proxy({}, { get() { throw new Error("Unexpected SDK access"); } });
  assert.equal(initializeFirebaseAppCheck(sdk, {}, { mode: "prod" }, { browser: false }), null);
  assert.equal(initializeFirebaseAppCheck(sdk, {}, { mode: "emulators" }, { browser: true }), null);
});

test("production browser uses Enterprise, token refresh and one instance across HMR", () => {
  const calls = [];
  const app = {};
  const instance = {};
  const sdk = {
    ReCaptchaEnterpriseProvider: class { constructor(key) { this.key = key; } },
    initializeAppCheck: (...args) => { calls.push(args); return instance; },
  };
  const result = initializeFirebaseAppCheck(sdk, app, { mode: "prod" }, { browser: true });
  assert.equal(result, instance);
  assert.equal(initializeFirebaseAppCheck(sdk, app, { mode: "prod" }, { browser: true }), instance);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], app);
  assert.equal(calls[0][1].provider.key, FIREBASE_APP_CHECK_SITE_KEY);
  assert.equal(calls[0][1].isTokenAutoRefreshEnabled, true);
});
