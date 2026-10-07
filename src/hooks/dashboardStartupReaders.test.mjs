import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createDashboardAuthRecovery } from "../lib/auth/dashboardAuthRecovery.js";
import { isTransientDashboardReadError } from "../domain/dashboard/readRecovery.js";

const requireFunctions = createRequire(new URL("../../functions/package.json", import.meta.url));
const ts = requireFunctions("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const transient = () => Object.assign(new Error("synthetic offline"), { code: "auth/network-request-failed" });

// Run production hooks/coordinator with offline SDK doubles, real effect
// cleanup/dependency transitions and explicit browser reconnection events.
function fixture(name, dependencies, initialArgs, timerApi = { setTimeout, clearTimeout }) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let args = initialArgs;
  const eventTarget = new EventTarget();
  eventTarget.navigator = { onLine: true };
  const visibilityTarget = new EventTarget();
  visibilityTarget.visibilityState = "visible";
  const equalDeps = (left, right) => left && right && left.length === right.length &&
    left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!equalDeps(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!equalDeps(slots[index]?.deps, deps)) {
        pendingEffects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect(), isEffect: true };
        });
      }
    },
  };
  const allowed = {
    react,
    "@/firebase": { functions: {}, db: {} },
    "@/lib/auth/dashboardAuthRecovery": {
      createDashboardAuthRecovery: options => createDashboardAuthRecovery({
        ...options, eventTarget, visibilityTarget,
      }),
    },
    "@/domain/dashboard/readRecovery": { isTransientDashboardReadError },
    ...dependencies,
  };
  const source = fs.readFileSync(new URL(`./${name}.js`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    ...timerApi,
    console: { error() {} },
    require(key) {
      assert.ok(key in allowed, `Unexpected dependency ${key}`);
      return allowed[key];
    },
  }, { filename: `${name}.js` });
  return {
    render(nextArgs = args) {
      args = nextArgs;
      cursor = 0;
      const value = exports[name](...args);
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach(effect => effect());
      return value;
    },
    reconnect() { eventTarget.dispatchEvent(new Event("online")); },
    stop() { slots.filter(slot => slot?.isEffect).forEach(slot => slot.cleanup?.()); },
  };
}

test("admin retries a transient read without declaring permissions denied or completing startup", async () => {
  let requests = 0;
  const f = fixture("useAdminAccess", {
    "firebase/functions": { httpsCallable: () => async () => {
      if (++requests === 1) throw transient();
      return { data: { isSuperAdmin: true } };
    } },
  }, [{ uid: "owner" }, 0]);
  try {
    assert.equal(f.render().loadingAdminAccess, true);
    await tick();
    const pending = f.render();
    assert.equal(pending.loadingAdminAccess, true);
    assert.equal(pending.canManageSite, false);
    assert.equal(pending.adminAccessError, null);
    assert.equal(pending.adminRecoveryState, "retrying");
    f.reconnect();
    await tick();
    assert.equal(f.render().canManageSite, true);
    assert.equal(f.render().loadingAdminAccess, false);
    const refresh = f.render([{ uid: "owner" }, 1]);
    assert.equal(refresh.loadingAdminAccess, true);
    assert.equal(refresh.canManageSite, false);
    await tick();
    assert.equal(requests, 3);
    assert.equal(f.render().canManageSite, true);
  } finally { f.stop(); }
});

test("late admin results cannot grant another account privileges", async () => {
  const reads = [];
  const f = fixture("useAdminAccess", {
    "firebase/functions": { httpsCallable: () => () => {
      const result = deferred(); reads.push(result); return result.promise;
    } },
  }, [{ uid: "first" }]);
  try {
    f.render();
    f.render([{ uid: "second" }]);
    reads[0].resolve({ data: { isSuperAdmin: true } });
    await tick();
    assert.equal(f.render().loadingAdminAccess, true);
    assert.equal(f.render().canManageSite, false);
    reads[1].resolve({ data: { isAdmin: false } });
    await tick();
    assert.equal(f.render().loadingAdminAccess, false);
    assert.equal(f.render().canManageSite, false);
  } finally { f.stop(); }
});

test("a permanent admin denial stays closed and is not retried", async () => {
  let requests = 0;
  const f = fixture("useAdminAccess", {
    "firebase/functions": { httpsCallable: () => async () => {
      requests++;
      throw Object.assign(new Error("denied"), { code: "functions/permission-denied" });
    } },
  }, [{ uid: "owner" }]);
  try {
    f.render(); await tick();
    assert.equal(f.render().canManageSite, false);
    assert.equal(f.render().loadingAdminAccess, false);
    assert.equal(f.render().adminAccessError, "denied");
    f.reconnect(); await tick();
    assert.equal(requests, 1);
  } finally { f.stop(); }
});

test("preference outage cannot mark defaults loaded or start an opted-out tour", async () => {
  let requests = 0;
  const f = fixture("useUserUiPreferences", {
    "firebase/functions": { httpsCallable: (_functions, name) => async () => {
      assert.equal(name, "getMyUiPreferences");
      if (++requests === 1) throw transient();
      return { data: { uiPreferences: { assistantTourOptOut: true } } };
    } },
  }, ["owner", 0]);
  try {
    f.render(); await tick();
    assert.equal(f.render().loaded, false);
    assert.equal(f.render().error, null);
    f.reconnect(); await tick();
    assert.equal(f.render().loaded, true);
    assert.equal(f.render().preferences.assistantTourOptOut, true);
    assert.equal(f.render(["owner", 1]).loaded, false);
    await tick();
    assert.equal(f.render().loaded, true);
    assert.equal(requests, 3);
  } finally { f.stop(); }
});

test("a delayed preference write cannot replace the next account preference", async () => {
  const write = deferred();
  const f = fixture("useUserUiPreferences", {
    "firebase/functions": { httpsCallable: (_functions, name) =>
      name === "updateMyUiPreferences" ? () => write.promise : async () => ({
        data: { assistantTourOptOut: false },
      }) },
  }, ["first"]);
  try {
    f.render(); await tick();
    const pendingWrite = f.render().updatePreferences({ assistantTourOptOut: true });
    f.render(["second"]); await tick();
    write.resolve({ data: { assistantTourOptOut: true } });
    await pendingWrite;
    assert.equal(f.render().preferences.assistantTourOptOut, false);
    assert.equal(f.render().saving, false);
  } finally { f.stop(); }
});

const readerCases = [
  {
    name: "useDashboardHomeTemplates", args: generation => [{ tipo: "boda", startupRecoveryGeneration: generation }],
    dependencies: read => ({ "@/domain/templates/service": { listTemplates: options => {
      assert.equal(options.source, "server"); return read(options);
    } } }),
    value: [{ id: "template" }], field: "templates",
  },
  {
    name: "useDashboardHomeConfig", args: generation => [generation],
    dependencies: read => ({ "@/domain/dashboard/service": { getDashboardHomeConfig: read } }),
    value: { sections: [] }, field: "config",
  },
  {
    name: "useDashboardPublications", args: generation => [{ userUid: "owner", startupRecoveryGeneration: generation }],
    dependencies: read => ({
      "firebase/firestore": { doc() {}, getDoc() { throw new Error("unexpected read"); } },
      "@/domain/publications/dashboardList": {
        loadUserPublicationSourceRecords: options => {
          assert.equal(options.source, "server"); return read(options);
        },
        assembleDashboardPublicationItems: async records => records,
        applyDashboardPublicationTransition: (items, transition) => [...items, transition],
      },
    }),
    value: [{ id: "publication" }], field: "publications",
  },
];

for (const reader of readerCases) {
  test(`${reader.name} automatically recovers its own outage and refreshes after auth recovery`, async () => {
    let requests = 0;
    const f = fixture(reader.name, reader.dependencies(async () => {
      if (++requests === 1) throw Object.assign(new Error("offline"), { code: "unavailable" });
      return reader.value;
    }), reader.args(0));
    try {
      f.render(); await tick();
      assert.equal(f.render().loading, true);
      assert.equal(f.render().error, "");
      assert.equal(f.render().recoveryState, "retrying");
      f.reconnect(); await tick();
      assert.equal(f.render().loading, false);
      assert.deepEqual(f.render()[reader.field], reader.value);
      assert.equal(f.render(reader.args(1)).loading, true);
      await tick();
      assert.equal(f.render().loading, false);
      assert.equal(requests, 3);
    } finally { f.stop(); }
  });

  test(`${reader.name} suppresses a cancelled generation response`, async () => {
    const requests = [];
    const f = fixture(reader.name, reader.dependencies(() => {
      const result = deferred(); requests.push(result); return result.promise;
    }), reader.args(0));
    try {
      f.render(); f.render(reader.args(1));
      requests[0].resolve(reader.value); await tick();
      assert.equal(f.render().loading, true);
      requests[1].resolve(reader.value); await tick();
      assert.equal(f.render().loading, false);
    } finally { f.stop(); }
  });
}

test("draft subscriptions restart on recovered auth and suppress old account snapshots", () => {
  const listeners = [];
  let unsubscribed = 0;
  const f = fixture("useDashboardDrafts", {
    "firebase/firestore": {
      collection() {}, query() {}, where() {},
      onSnapshot(_query, options, success, failure) {
        assert.equal(options.includeMetadataChanges, true);
        listeners.push({ success, failure }); return () => { unsubscribed++; };
      },
    },
    "@/domain/drafts/state": { isDraftTrashed: () => false },
    "@/domain/drafts/preview": { getDraftPreviewCandidates: () => [] },
    "@/domain/invitations/readResolution": { resolveDraftPublicationLifecycleState: () => "draft" },
  }, [{ userUid: "first", startupRecoveryGeneration: 0 }]);
  try {
    f.render();
    listeners[0].success({ docs: [], metadata: { fromCache: true } });
    assert.equal(f.render().loading, true);
    assert.equal(f.render().recoveryState, "idle");
    listeners[0].success({ docs: [] });
    assert.equal(f.render().loading, false);
    assert.equal(f.render([{ userUid: "second", startupRecoveryGeneration: 1 }]).loading, true);
    listeners[0].success({ docs: [{ id: "private-old-draft", data: () => ({}) }] });
    assert.equal(f.render().drafts.length, 0);
    assert.equal(f.render().loading, true);
    listeners[1].success({ docs: [] });
    assert.equal(f.render().loading, false);
    assert.equal(unsubscribed, 1);
  } finally { f.stop(); }
});

for (const prolonged of [false, true]) {
  test(`initial empty draft cache ${prolonged ? "shows recovery only after the short retry window" : "stays quiet during normal server startup"}`, () => {
    let onSnapshotValue;
    const timers = new Map();
    let timerId = 0;
    const f = fixture("useDashboardDrafts", {
      "firebase/firestore": {
        collection() {}, query() {}, where() {},
        onSnapshot(_query, _options, success) {
          onSnapshotValue = success;
          return () => {};
        },
      },
      "@/domain/drafts/state": { isDraftTrashed: () => false },
      "@/domain/drafts/preview": { getDraftPreviewCandidates: () => [] },
      "@/domain/invitations/readResolution": { resolveDraftPublicationLifecycleState: () => "draft" },
    }, [{ userUid: "owner" }], {
      setTimeout(callback, delayMs) {
        assert.equal(delayMs, 5200);
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    });
    try {
      f.render();
      onSnapshotValue({ docs: [], metadata: { fromCache: true } });
      onSnapshotValue({ docs: [], metadata: { fromCache: true } });
      assert.equal(timers.size, 1, "metadata events share one initial delay");
      assert.equal(f.render().loading, true);
      assert.equal(f.render().recoveryState, "idle");
      if (prolonged) {
        const callback = timers.values().next().value;
        timers.clear();
        callback();
        assert.equal(f.render().recoveryState, "waiting");
        assert.equal(f.render().loading, true);
      }
      onSnapshotValue({ docs: [], metadata: { fromCache: false } });
      assert.equal(timers.size, 0);
      assert.equal(f.render().loading, false);
      assert.equal(f.render().recoveryState, "idle");
      onSnapshotValue({ docs: [], metadata: { fromCache: true } });
      assert.equal(timers.size, 0, "confirmed scope does not restart initial recovery");
      assert.equal(f.render().loading, false);
      assert.equal(f.render().recoveryState, "idle");
    } finally { f.stop(); }
  });
}

function loadReadAdapter(relativePath, firestore) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const dependencies = {
    "firebase/firestore": {
      collection: (_db, name) => name,
      query: (...parts) => parts,
      where: (...parts) => parts,
      orderBy: (...parts) => parts,
      limit: value => value,
      ...firestore,
    },
    "@/firebase": { db: {} },
    "../../firebase.js": { db: {} },
    "@/domain/invitationTypes": { normalizeInvitationType: value => value },
    "../../../shared/templates/contract.js": { normalizeTemplateCatalogDocument: value => value },
    "./preview.js": {},
    "./state.js": {},
  };
  vm.runInNewContext(code, {
    exports,
    require(key) {
      assert.ok(key in dependencies, `Unexpected adapter dependency ${key}`);
      return dependencies[key];
    },
  });
  return exports;
}

for (const adapter of [
  { path: "../domain/templates/repository.js", name: "listTemplates", input: { tipo: "boda" }, serverReads: 1 },
  { path: "../domain/publications/dashboardList.js", name: "loadUserPublicationSourceRecords", input: { userUid: "owner" }, serverReads: 2 },
]) {
  test(`${adapter.name} server startup mode rejects an offline empty cache and preserves other consumers`, async () => {
    let cachedReads = 0;
    let serverReads = 0;
    let offline = true;
    const api = loadReadAdapter(adapter.path, {
      getDocs: async () => { cachedReads++; return { docs: [] }; },
      getDocsFromServer: async () => {
        serverReads++;
        if (offline) throw Object.assign(new Error("offline"), { code: "unavailable" });
        return { docs: [] };
      },
    });
    await assert.rejects(api[adapter.name]({ ...adapter.input, source: "server" }), { code: "unavailable" });
    assert.equal(cachedReads, 0);
    assert.equal(serverReads, adapter.serverReads);
    offline = false;
    assert.equal((await api[adapter.name]({ ...adapter.input, source: "server" })).length, 0);
    assert.equal(serverReads, adapter.serverReads * 2);
    assert.equal((await api[adapter.name](adapter.input)).length, 0);
    assert.equal(cachedReads, adapter.serverReads);
  });
}
