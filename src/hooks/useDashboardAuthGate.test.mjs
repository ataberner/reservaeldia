import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const requireFunctions = createRequire(new URL("../../functions/package.json", import.meta.url));
const ts = requireFunctions("typescript");

// Execute the current hook with offline SDK/router doubles, without importing
// Firebase initialization or sending monitoring/profile requests.
const source = fs.readFileSync(new URL("./useDashboardAuthGate.js", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const states = [];
  let cursor = 0, listener, listenerError, cleanup, effectStarted = false;
  const auth = { currentUser: null };
  const calls = { routes: [], profiles: 0, failures: [], unsubscribed: 0 };
  const dependencies = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = value; }];
      },
      useMemo: factory => factory(),
      useCallback: callback => callback,
      useEffect(effect) { if (!effectStarted) { effectStarted = true; cleanup = effect(); } },
    },
    'firebase/auth': {
      getAuth: () => auth,
      onAuthStateChanged(_auth, callback, onError) {
        listener = callback;
        listenerError = onError;
        return () => { calls.unsubscribed++; };
      },
      async signOut() {
        if (options.signOutFails) throw new Error('Synthetic sign-out failure');
        auth.currentUser = null;
        if (options.delayedNull) setImmediate(() => listener(null));
        else listener(null);
      },
    },
    'firebase/functions': {
      httpsCallable: (_functions, name) => async () => {
        assert.equal(name, 'getMyProfileStatus');
        calls.profiles++;
        if (options.profile) return options.profile();
        return { data: { profileComplete: true } };
      },
    },
    '@/firebase': { functions: {} },
    '@/domain/dashboard/helpers': {
      getErrorMessage: error => error.message,
      splitDisplayName: () => ({ nombre: '', apellido: '' }),
    },
    '@/domain/dashboard/startupRecovery': {
      handleDashboardStartupError(context) {
        calls.failures.push(context);
        return { isRecoverableStorageError: false };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, setTimeout,
    console: { error() {} },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename: 'useDashboardAuthGate.js' });
  const router = { replace(path) { calls.routes.push(path); return options.navigate?.() ?? Promise.resolve(true); } };
  const render = () => { cursor = 0; return exports.useDashboardAuthGate({ router }); };
  render();
  return { calls, render, stop: () => cleanup(), emit(user) { auth.currentUser = user; listener(user); }, emitError: error => listenerError(error) };
}

const verified = { uid: 'synthetic-user', providerData: [{ providerId: 'password' }], emailVerified: true, getIdToken: async () => 'synthetic-token' };

test('waits for Firebase, then redirects anonymous visitors with the loader active', async () => {
  const f = fixture({ navigate: () => new Promise(() => {}) });
  assert.deepEqual(f.calls.routes, []);
  f.emit(null);
  await tick();
  assert.deepEqual(f.calls.routes, ['/']);
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.render().usuario, null);
  assert.equal(f.calls.profiles, 0);
  f.stop();
});

test('a restored verified session stays on dashboard; session loss redirects', async () => {
  const f = fixture();
  f.emit(verified);
  await tick();
  assert.deepEqual(f.calls.routes, []);
  assert.equal(f.render().usuario, verified);
  assert.equal(f.render().checkingAuth, false);
  f.emit(null);
  await tick();
  assert.deepEqual(f.calls.routes, ['/']);
  assert.equal(f.render().usuario, null);
  assert.equal(f.render().checkingAuth, true);
  f.stop();
});

for (const delayedNull of [false, true]) {
  for (const reason of ['email-not-verified', 'profile-check-failed']) {
    test(`${reason} keeps its notice with ${delayedNull ? 'late' : 'immediate'} sign-out notification`, async () => {
      const f = fixture({ delayedNull });
      f.emit({ ...verified, emailVerified: reason !== 'email-not-verified', getIdToken: async () => { throw new Error('Synthetic profile failure'); } });
      await tick();
      await tick();
      assert.deepEqual(f.calls.routes, [`/?authNotice=${reason}`]);
      f.stop();
    });
  }
}

test('navigation failure is reported through the existing recovery handler', async () => {
  const f = fixture({ navigate: () => Promise.reject(new Error('Synthetic navigation failure')) });
  f.emit(null);
  await tick();
  assert.equal(f.calls.failures[0].phase, 'missing-session');
  assert.equal(f.render().usuario, null);
  assert.equal(f.render().checkingAuth, false);
  f.stop();
});

test('a callback delivered after unmount cannot navigate', async () => {
  const f = fixture();
  f.stop();
  f.emit(null);
  await tick();
  assert.deepEqual(f.calls.routes, []);
  assert.equal(f.calls.unsubscribed, 1);
});

test('authenticated data can start while profile validation still blocks entry', async () => {
  let resolveProfile;
  const f = fixture({ profile: () => new Promise(resolve => { resolveProfile = resolve; }) });
  f.emit(verified);
  await tick();
  assert.equal(f.render().usuario, verified);
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.calls.profiles, 1);
  resolveProfile({ data: { profileComplete: true } });
  await tick();
  assert.equal(f.render().checkingAuth, false);
  assert.deepEqual(f.calls.routes, []);
  f.stop();
});

test('late profile completion cannot restore a signed-out session', async () => {
  let resolveProfile;
  const f = fixture({ profile: () => new Promise(resolve => { resolveProfile = resolve; }) });
  f.emit(verified);
  await tick();
  f.emit(null);
  resolveProfile({ data: { profileComplete: false } });
  await tick();
  assert.equal(f.render().usuario, null);
  assert.equal(f.render().showProfileCompletion, false);
  assert.equal(f.render().checkingAuth, true);
  assert.deepEqual(f.calls.routes, ['/']);
  f.stop();
});

test('an older account response cannot finish the new account profile gate', async () => {
  const results = [];
  const f = fixture({ profile: () => new Promise(resolve => results.push(resolve)) });
  f.emit(verified);
  await tick();
  const nextUser = { ...verified, uid: 'second-synthetic-user' };
  f.emit(nextUser);
  await tick();
  results[0]({ data: { profileComplete: false } });
  await tick();
  assert.equal(f.render().usuario, nextUser);
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.render().showProfileCompletion, false);
  results[1]({ data: { profileComplete: true } });
  await tick();
  assert.equal(f.render().checkingAuth, false);
  f.stop();
});

test('unverified password sessions never start authenticated dashboard reads', async () => {
  const f = fixture();
  f.emit({ ...verified, emailVerified: false });
  assert.equal(f.render().usuario, null);
  await tick();
  assert.equal(f.render().usuario, null);
  assert.equal(f.calls.profiles, 0);
  assert.deepEqual(f.calls.routes, ['/?authNotice=email-not-verified']);
  f.stop();
});

test('auth observer failure clears preliminary reads and invalidates a pending profile', async () => {
  let resolveProfile;
  const f = fixture({ profile: () => new Promise(resolve => { resolveProfile = resolve; }) });
  f.emit(verified);
  await tick();
  f.emitError(new Error('Synthetic observer failure'));
  resolveProfile({ data: { profileComplete: true } });
  await tick();
  assert.equal(f.render().usuario, null);
  assert.equal(f.render().showProfileCompletion, false);
  assert.equal(f.calls.failures[0].operation, 'auth-state-listener');
  f.stop();
});

test('failed profile calls keep entry blocked through retry and clear the session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ profile: async () => { throw new Error('Synthetic profile failure'); } });
  f.emit(verified);
  await tick();
  assert.equal(f.calls.profiles, 1);
  assert.equal(f.render().checkingAuth, true);
  t.mock.timers.tick(700);
  await tick();
  assert.equal(f.calls.profiles, 2);
  assert.equal(f.render().usuario, null);
  assert.deepEqual(f.calls.routes, ['/?authNotice=profile-check-failed']);
  f.stop();
});
