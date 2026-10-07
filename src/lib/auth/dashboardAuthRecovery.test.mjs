import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardAuthRecovery, isTransientDashboardAuthError } from "./dashboardAuthRecovery.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
const failure = code => Object.assign(new Error(`Synthetic ${code}`), { code });

function surface(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type) { for (const callback of listeners.get(type) || []) callback(); },
    listenerCount() { return [...listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0); },
  };
}

test('only supported transport codes use automatic authentication recovery', () => {
  for (const code of ['auth/network-request-failed', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal']) {
    assert.equal(isTransientDashboardAuthError(failure(code)), true);
  }
  for (const code of ['auth/user-disabled', 'auth/user-token-expired', 'functions/permission-denied', 'functions/unauthenticated', 'unavailable', 'unknown']) {
    assert.equal(isTransientDashboardAuthError(failure(code)), false);
  }
});

test('successful first requests do not enter recovery and remove all listeners', async () => {
  const eventTarget = surface();
  const visibilityTarget = surface();
  const states = [];
  const recovery = createDashboardAuthRecovery({ task: async () => 'value', eventTarget, visibilityTarget, onStateChange: state => states.push(state) });
  assert.deepEqual(await recovery.promise, { status: 'success', value: 'value', recovered: false });
  assert.deepEqual(states, []);
  assert.equal(eventTarget.listenerCount() + visibilityTarget.listenerCount(), 0);
});

test('retry burst becomes spaced automatic probes and succeeds without overlapping calls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const states = [], delays = [];
  const recovery = createDashboardAuthRecovery({
    task: async () => { if (++attempts <= 4) throw failure('functions/unavailable'); return 'ready'; },
    onStateChange: state => states.push(state),
    onRetry: event => delays.push(event.delayMs),
  });
  await tick();
  for (const delay of [700, 1500, 3000]) {
    t.mock.timers.tick(delay - 1);
    await tick();
    const before = attempts;
    t.mock.timers.tick(1);
    await tick();
    assert.equal(attempts, before + 1);
  }
  assert.equal(attempts, 4);
  assert.deepEqual(states, ['retrying', 'waiting']);
  t.mock.timers.tick(15000);
  assert.deepEqual(await recovery.promise, { status: 'success', value: 'ready', recovered: true });
  assert.deepEqual(delays, [700, 1500, 3000, 15000]);
  assert.deepEqual(states, ['retrying', 'waiting', 'idle']);
});

test('hidden pages wait for recovery signals; multiple events never overlap requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const eventTarget = surface({ navigator: { onLine: false } });
  const visibilityTarget = surface({ visibilityState: 'hidden' });
  let attempts = 0, finishRequest;
  const states = [];
  const recovery = createDashboardAuthRecovery({
    eventTarget, visibilityTarget,
    onStateChange: state => states.push(state),
    task: async () => {
      attempts++;
      if (attempts === 1) throw failure('auth/network-request-failed');
      return new Promise(resolve => { finishRequest = resolve; });
    },
  });
  await tick();
  t.mock.timers.tick(60000);
  await tick();
  assert.equal(attempts, 1);
  visibilityTarget.visibilityState = 'hidden';
  eventTarget.navigator.onLine = true;
  eventTarget.emit('online');
  await tick();
  assert.equal(attempts, 1);
  visibilityTarget.visibilityState = 'visible';
  visibilityTarget.emit('visibilitychange');
  eventTarget.emit('pageshow');
  eventTarget.emit('focus');
  await tick();
  assert.equal(attempts, 2);
  eventTarget.emit('online');
  t.mock.timers.tick(60000);
  await tick();
  assert.equal(attempts, 2);
  finishRequest('ready');
  assert.equal((await recovery.promise).status, 'success');
  assert.ok(states.includes('waiting'));
  assert.equal(eventTarget.listenerCount() + visibilityTarget.listenerCount(), 0);
});

test('a stale offline signal cannot prevent slow visible probes or Safari pageshow recovery', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const trigger of ['timer', 'pageshow']) {
    const eventTarget = surface({ navigator: { onLine: false } });
    const visibilityTarget = surface({ visibilityState: 'visible' });
    let attempts = 0;
    const recovery = createDashboardAuthRecovery({
      eventTarget, visibilityTarget,
      task: async () => {
        if (++attempts === 1) throw failure('auth/network-request-failed');
        return 'ready';
      },
    });
    await tick();
    t.mock.timers.tick(14999);
    await tick();
    assert.equal(attempts, 1);
    if (trigger === 'timer') t.mock.timers.tick(1);
    else eventTarget.emit('pageshow');
    assert.equal((await recovery.promise).status, 'success');
    assert.equal(attempts, 2);
    assert.equal(eventTarget.navigator.onLine, false);
  }
});

test('cancellation during backoff clears timers and event listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const eventTarget = surface();
  const visibilityTarget = surface();
  let attempts = 0;
  const recovery = createDashboardAuthRecovery({
    eventTarget, visibilityTarget,
    task: async () => { attempts++; throw failure('functions/internal'); },
  });
  await tick();
  recovery.cancel();
  assert.deepEqual(await recovery.promise, { status: 'cancelled' });
  eventTarget.emit('online');
  t.mock.timers.tick(60000);
  await tick();
  assert.equal(attempts, 1);
  assert.equal(eventTarget.listenerCount() + visibilityTarget.listenerCount(), 0);
});

test('late results after cancellation or account invalidation cannot complete recovery', async () => {
  for (const invalidation of ['cancel', 'account']) {
    let current = true, finishRequest;
    const states = [];
    const recovery = createDashboardAuthRecovery({
      task: () => new Promise(resolve => { finishRequest = resolve; }),
      isCurrent: () => current,
      onStateChange: state => states.push(state),
    });
    if (invalidation === 'cancel') recovery.cancel();
    else current = false;
    finishRequest('stale');
    assert.deepEqual(await recovery.promise, { status: 'cancelled' });
    assert.deepEqual(states, []);
  }
});

test('permanent failures preserve the original error and clean up recovery listeners', async () => {
  const eventTarget = surface();
  const error = failure('functions/permission-denied');
  const recovery = createDashboardAuthRecovery({ task: async () => { throw error; }, eventTarget });
  await assert.rejects(recovery.promise, actual => actual === error);
  assert.equal(eventTarget.listenerCount(), 0);
});
