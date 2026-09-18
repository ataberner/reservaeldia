import assert from "node:assert/strict";
import test from "node:test";
import { observeLandingAuth } from "./landingAuthSession.js";

const user = { uid: "local-user" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(options = {}) {
  const calls = { users: [], guests: 0, errors: [], redirects: 0, unsubscribed: 0 };
  const auth = { currentUser: options.user || null };
  let listener;
  const stop = observeLandingAuth({
    auth,
    expectRedirect: options.expectRedirect,
    redirectTimeoutMs: 8000,
    onAuthStateChanged: (_auth, callback) => {
      listener = callback;
      return () => { calls.unsubscribed += 1; };
    },
    getRedirectResult: () => {
      calls.redirects += 1;
      return options.getRedirectResult?.() ?? Promise.resolve(null);
    },
    onAuthenticated: (value) => calls.users.push(value),
    onGuest: () => { calls.guests += 1; },
    onError: (error) => calls.errors.push(error),
  });
  return { calls, stop, emit: (value) => { auth.currentUser = value; listener(value); } };
}

test("a resident session navigates once without resolving a Google redirect", () => {
  const f = fixture({ user });
  f.emit(user);
  assert.deepEqual(f.calls.users, [user]);
  assert.equal(f.calls.redirects, 0);
  assert.equal(f.calls.guests, 0);
  f.stop();
});

test("a restored session never releases the guest catalogue while auth is unresolved", () => {
  const f = fixture();
  assert.equal(f.calls.guests, 0);
  f.emit(user);
  assert.deepEqual(f.calls.users, [user]);
  assert.equal(f.calls.guests, 0);
  assert.equal(f.calls.redirects, 0);
  f.stop();
});

test("an anonymous visitor is released immediately and a later login still navigates", () => {
  const f = fixture();
  f.emit(null);
  assert.equal(f.calls.guests, 1);
  assert.equal(f.calls.redirects, 0);
  f.emit(user);
  f.emit(user);
  assert.deepEqual(f.calls.users, [user]);
  f.stop();
});

for (const first of ["observer", "redirect"]) {
  test(`Google return navigates once when ${first} resolves first`, async () => {
    const result = deferred();
    const f = fixture({ expectRedirect: true, getRedirectResult: () => result.promise });
    f.emit(null);
    assert.equal(f.calls.guests, 0);
    if (first === "observer") f.emit(user);
    result.resolve({ user });
    await tick();
    f.emit(user);
    assert.deepEqual(f.calls.users, [user]);
    assert.equal(f.calls.redirects, 1);
    assert.equal(f.calls.errors.length, 0);
    f.stop();
  });
}

test("a stale Google marker does not delay an existing session", () => {
  const f = fixture({ user, expectRedirect: true });
  assert.deepEqual(f.calls.users, [user]);
  assert.equal(f.calls.redirects, 0);
  f.stop();
});

test("Google retries once after the bounded wait, then reports no user", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture({ expectRedirect: true });
  await tick();
  t.mock.timers.tick(7999);
  assert.equal(f.calls.redirects, 1);
  assert.equal(f.calls.errors.length, 0);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(f.calls.redirects, 2);
  assert.equal(f.calls.errors[0]?.message, "google-redirect-no-user");
  f.emit(user);
  assert.deepEqual(f.calls.users, [user]);
  f.stop();
});

test("late auth cancels the pending Google retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture({ expectRedirect: true });
  await tick();
  f.emit(user);
  t.mock.timers.tick(8000);
  await tick();
  assert.equal(f.calls.redirects, 1);
  assert.equal(f.calls.errors.length, 0);
  f.stop();
});

test("Google failure is reported, but cannot overwrite a resolved session", async () => {
  for (const signedIn of [false, true]) {
    const result = deferred();
    const f = fixture({ expectRedirect: true, getRedirectResult: () => result.promise });
    if (signedIn) f.emit(user);
    result.reject(new Error("auth/network-request-failed"));
    await tick();
    assert.equal(f.calls.errors.length, signedIn ? 0 : 1);
    f.stop();
  }
});

test("unmount unsubscribes and ignores late async results", async () => {
  const result = deferred();
  const f = fixture({ expectRedirect: true, getRedirectResult: () => result.promise });
  f.stop();
  result.resolve({ user });
  f.emit(user);
  await tick();
  assert.equal(f.calls.unsubscribed, 1);
  assert.equal(f.calls.users.length, 0);
  assert.equal(f.calls.errors.length, 0);
});

test("unmount cancels the Google retry timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture({ expectRedirect: true });
  await tick();
  f.stop();
  t.mock.timers.tick(8000);
  await tick();
  assert.equal(f.calls.redirects, 1);
  assert.equal(f.calls.errors.length, 0);
});
