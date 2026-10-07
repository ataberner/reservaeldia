import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createDashboardAuthRecovery } from "../lib/auth/dashboardAuthRecovery.js";

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
  const calls = { routes: [], profiles: 0, failures: [], breadcrumbs: [], signOut: 0, unsubscribed: 0 };
  const dependencies = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
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
        calls.signOut++;
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
    '@/lib/auth/dashboardAuthRecovery': {
      createDashboardAuthRecovery: options => createDashboardAuthRecovery({
        ...options, eventTarget: null, visibilityTarget: null,
      }),
    },
    '@/lib/monitoring/editorIssueReporter': {
      pushEditorBreadcrumb: (event, detail) => calls.breadcrumbs.push({ event, detail }),
    },
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

test('permanent profile failure retains the existing sign-out path without retrying', async () => {
  const f = fixture({ profile: async () => { throw new Error('Synthetic profile failure'); } });
  f.emit(verified);
  await tick();
  assert.equal(f.calls.profiles, 1);
  assert.equal(f.render().checkingAuth, false);
  assert.equal(f.render().usuario, null);
  assert.deepEqual(f.calls.routes, ['/?authNotice=profile-check-failed']);
  f.stop();
});

const failure = code => Object.assign(new Error(`Synthetic ${code}`), { code });

test('a transient initial token failure preserves the session and recovers without an issue banner', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const tokenCalls = [];
  const user = { ...verified, getIdToken: async force => {
    tokenCalls.push(force);
    if (tokenCalls.length === 1) throw failure('auth/network-request-failed');
    return 'synthetic-token';
  } };
  const f = fixture();
  f.emit(user);
  await tick();
  assert.equal(f.render().usuario, user);
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.render().authRecoveryState, 'retrying');
  assert.equal(f.calls.profiles, 0);
  assert.equal(f.calls.signOut, 0);
  assert.deepEqual(f.calls.failures, []);
  t.mock.timers.tick(700);
  await tick();
  assert.deepEqual(tokenCalls, [undefined, undefined]);
  assert.equal(f.calls.profiles, 1);
  assert.equal(f.render().checkingAuth, false);
  assert.equal(f.render().authRecoveryState, 'idle');
  assert.equal(f.render().startupRecoveryGeneration, 1);
  assert.deepEqual(f.calls.routes, []);
  assert.equal(f.calls.breadcrumbs.at(-1).event, 'dashboard-auth-recovered');
  f.stop();
});

test('transient callable failures retry using the cached token and still enforce profile completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const tokenCalls = [];
  const f = fixture({ profile: async () => {
    attempts++;
    if (attempts === 1) throw failure('functions/unavailable');
    return { data: { profileComplete: false, profile: { nombre: 'Synthetic', apellido: 'User' } } };
  } });
  f.emit({ ...verified, getIdToken: async force => { tokenCalls.push(force); return 'synthetic-token'; } });
  await tick();
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.render().showProfileCompletion, false);
  t.mock.timers.tick(700);
  await tick();
  assert.deepEqual(tokenCalls, [undefined, undefined]);
  assert.equal(f.render().showProfileCompletion, true);
  assert.equal(f.render().profileInitialValues.nombre, 'Synthetic');
  assert.equal(f.render().startupRecoveryGeneration, 1);
  assert.equal(f.calls.signOut, 0);
  assert.deepEqual(f.calls.failures, []);
  f.stop();
});

test('an unauthenticated callable forces one successful token refresh', async () => {
  let attempts = 0;
  const tokenCalls = [];
  const f = fixture({ profile: async () => {
    if (++attempts === 1) throw failure('functions/unauthenticated');
    return { data: { profileComplete: true } };
  } });
  f.emit({ ...verified, getIdToken: async force => { tokenCalls.push(force); return 'synthetic-token'; } });
  await tick();
  assert.deepEqual(tokenCalls, [undefined, true]);
  assert.equal(f.calls.profiles, 2);
  assert.equal(f.render().checkingAuth, false);
  assert.equal(f.render().startupRecoveryGeneration, 1);
  assert.equal(f.calls.signOut, 0);
  f.stop();
});

test('a forced refresh interrupted by connectivity remains pending until automatic recovery', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const tokenCalls = [];
  const f = fixture({ profile: async () => {
    if (++attempts === 1) throw failure('functions/unauthenticated');
    return { data: { profileComplete: true } };
  } });
  f.emit({ ...verified, getIdToken: async force => {
    tokenCalls.push(force);
    if (tokenCalls.length === 2) throw failure('auth/network-request-failed');
    return 'synthetic-token';
  } });
  await tick();
  assert.equal(f.calls.profiles, 1);
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.calls.signOut, 0);
  t.mock.timers.tick(700);
  await tick();
  assert.deepEqual(tokenCalls, [undefined, true, true]);
  assert.equal(f.calls.profiles, 2);
  assert.equal(f.render().startupRecoveryGeneration, 1);
  assert.deepEqual(f.calls.failures, []);
  f.stop();
});

for (const code of ['functions/permission-denied', 'functions/unauthenticated']) {
  test(`${code} is not an endless recovery loop`, async () => {
    const f = fixture({ profile: async () => { throw failure(code); } });
    f.emit(verified);
    await tick();
    assert.equal(f.calls.profiles, code === 'functions/unauthenticated' ? 2 : 1);
    assert.equal(f.calls.signOut, 1);
    assert.equal(f.render().usuario, null);
    assert.deepEqual(f.calls.routes, ['/?authNotice=profile-check-failed']);
    f.stop();
  });
}

test('account change cancels the old recovery timer and cannot refresh the new account readers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let oldTokenCalls = 0;
  const f = fixture();
  f.emit({ ...verified, getIdToken: async () => { oldTokenCalls++; throw failure('auth/network-request-failed'); } });
  await tick();
  const nextUser = { ...verified, uid: 'next-synthetic-user' };
  f.emit(nextUser);
  await tick();
  t.mock.timers.tick(30000);
  await tick();
  assert.equal(oldTokenCalls, 1);
  assert.equal(f.render().usuario, nextUser);
  assert.equal(f.render().authRecoveryState, 'idle');
  assert.equal(f.render().startupRecoveryGeneration, 0);
  assert.equal(f.calls.profiles, 1);
  f.stop();
});

test('persistent connectivity waits automatically without releasing the profile gate; unmount stops probes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ profile: async () => { throw failure('functions/deadline-exceeded'); } });
  f.emit(verified);
  await tick();
  for (const delay of [700, 1500, 3000]) {
    t.mock.timers.tick(delay);
    await tick();
  }
  assert.equal(f.calls.profiles, 4);
  assert.equal(f.render().authRecoveryState, 'waiting');
  assert.equal(f.render().checkingAuth, true);
  assert.equal(f.render().usuario, verified);
  assert.equal(f.render().showProfileCompletion, false);
  assert.equal(f.render().startupRecoveryGeneration, 0);
  assert.equal(f.calls.signOut, 0);
  assert.deepEqual(f.calls.failures, []);
  f.stop();
  t.mock.timers.tick(60000);
  await tick();
  assert.equal(f.calls.profiles, 4);
  assert.deepEqual(f.calls.routes, []);
});
