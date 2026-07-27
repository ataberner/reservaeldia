import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const stateTools = require("./providers/providerEnrichmentState.cjs");
const bulkTools = require("./providers/providerEnrichmentBulk.cjs");
const runtimeTools = require("./providers/providerEnrichmentRuntime.cjs");
const imageTools = require("./providers/providerEnrichmentImages.cjs");

const IDS = [
  "pcar_000000000000000000000001",
  "pcar_000000000000000000000002",
  "pcar_000000000000000000000003",
  "pcar_000000000000000000000004",
];

function temporaryDirectory(context) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "provider-enrichment-state-test-")
  );
  context.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function scope(providerIds = IDS) {
  return stateTools.createInputScope({
    projectId: "demo-provider-enrichment",
    category: null,
    providerIds,
    force: false,
    completeGallery: true,
    maxGalleryImages: 100,
    contractSchemaVersion: 2,
    extractorSha256: "a".repeat(64),
  });
}

function createStore(context, providerIds = IDS) {
  const directory = temporaryDirectory(context);
  const statePath = path.join(directory, "state.json");
  const store = new stateTools.DurableEnrichmentStateStore(
    statePath
  );
  store.loadOrCreate({
    inputScope: scope(providerIds),
    candidateProviderIds: providerIds,
    runId: "run-test",
  });
  return { directory, statePath, store };
}

test("checkpoint is atomic, checksummed, and preserves the previous file as backup", async (context) => {
  const { statePath, store } = createStore(context);
  await store.update((state) => {
    state.providerStates[IDS[0]] = {
      status: "confirmed",
      confirmedAt: "2026-07-27T12:00:00.000Z",
    };
  }, "provider_confirmed");

  const paths = stateTools.statePaths(statePath);
  assert.equal(fs.existsSync(paths.main), true);
  assert.equal(fs.existsSync(paths.backup), true);
  assert.equal(fs.existsSync(paths.temporary), false);
  const parsed = stateTools.parseAndValidateState(paths.main);
  assert.equal(
    parsed.providerStates[IDS[0]].status,
    "confirmed"
  );
  assert.equal(parsed.completedCount, 1);
  assert.equal(parsed.lastCheckpoint.reason, "provider_confirmed");
});

test("a truncated primary state is recovered from a valid backup without starting over", async (context) => {
  const { statePath, store } = createStore(context);
  await store.update((state) => {
    state.providerStates[IDS[0]] = {
      status: "processing",
    };
  }, "processing");
  fs.writeFileSync(statePath, '{"version":1', "utf8");

  const loaded = stateTools.loadStateWithRecovery(statePath);
  assert.equal(loaded.recoveredFromBackup, true);
  assert.equal(loaded.state.status, "recovered");
  assert.equal(
    stateTools.parseAndValidateState(statePath).status,
    "recovered"
  );
  assert.match(
    path.basename(loaded.recovery.corruptArchive),
    /^state\.corrupt-/
  );
});

test("an invalid checksum is rejected and recovered only from a valid backup", async (context) => {
  const { statePath, store } = createStore(context);
  await store.checkpoint("second");
  const invalid = JSON.parse(
    fs.readFileSync(statePath, "utf8")
  );
  invalid.status = "tampered";
  fs.writeFileSync(
    statePath,
    JSON.stringify(invalid),
    "utf8"
  );

  const loaded = stateTools.loadStateWithRecovery(statePath);
  assert.equal(loaded.recoveredFromBackup, true);
  assert.equal(
    loaded.recovery.primaryErrorCode,
    "resume_state_checksum_invalid"
  );
});

test("invalid primary and backup abort instead of silently creating a new state", (context) => {
  const directory = temporaryDirectory(context);
  const statePath = path.join(directory, "state.json");
  const paths = stateTools.statePaths(statePath);
  fs.writeFileSync(paths.main, "{", "utf8");
  fs.writeFileSync(paths.backup, "{", "utf8");
  assert.throws(
    () => stateTools.loadStateWithRecovery(statePath),
    (error) =>
      error.code === "resume_state_unrecoverable"
  );
});

test("an incompatible project, candidate hash, or extractor version aborts resume", (context) => {
  const { store } = createStore(context);
  const incompatible = scope([...IDS, "pcar_000000000000000000000005"]);
  assert.throws(
    () =>
      stateTools.assertCompatibleState(
        store.snapshot(),
        incompatible
      ),
    (error) => error.code === "resume_state_incompatible"
  );
});

test("an incompatible durable-state schema version is rejected even with a valid checksum", (context) => {
  const { statePath, store } = createStore(context);
  const incompatible = stateTools.withChecksum({
    ...store.snapshot(),
    version: 999,
  });
  fs.writeFileSync(
    statePath,
    JSON.stringify(incompatible),
    "utf8"
  );
  assert.throws(
    () => stateTools.parseAndValidateState(statePath),
    (error) =>
      error.code === "resume_state_version_incompatible"
  );
});

test("an active lock prevents a second process from using the same state", (context) => {
  const directory = temporaryDirectory(context);
  const statePath = path.join(directory, "state.json");
  const first = stateTools.acquireStateLock({
    statePath,
    runId: "run-1",
    inputScopeHash: "scope",
    pid: 111,
    processAlive: () => true,
  });
  assert.throws(
    () =>
      stateTools.acquireStateLock({
        statePath,
        runId: "run-2",
        inputScopeHash: "scope",
        pid: 222,
        processAlive: () => true,
      }),
    (error) => error.code === "resume_lock_active"
  );
  first.release();
});

test("a stale lock requires an explicit PID confirmation before recovery", (context) => {
  const directory = temporaryDirectory(context);
  const statePath = path.join(directory, "state.json");
  const first = stateTools.acquireStateLock({
    statePath,
    runId: "run-old",
    inputScopeHash: "scope",
    pid: 333,
    processAlive: () => false,
  });
  assert.ok(first.lockPath);
  assert.throws(
    () =>
      stateTools.acquireStateLock({
        statePath,
        runId: "run-new",
        inputScopeHash: "scope",
        pid: 444,
        processAlive: () => false,
      }),
    (error) => error.code === "resume_lock_stale"
  );
  assert.throws(
    () =>
      stateTools.acquireStateLock({
        statePath,
        runId: "run-new",
        inputScopeHash: "scope",
        pid: 444,
        processAlive: () => false,
        recoverStaleLock: true,
        confirmStaleLock: "999",
      }),
    (error) => error.code === "resume_lock_stale"
  );
  const recovered = stateTools.acquireStateLock({
    statePath,
    runId: "run-new",
    inputScopeHash: "scope",
    pid: 444,
    processAlive: () => false,
    recoverStaleLock: true,
    confirmStaleLock: "333",
  });
  assert.equal(recovered.lock.pid, 444);
  recovered.release();
});

test("lock files redact credential paths from the recorded command", (context) => {
  const directory = temporaryDirectory(context);
  const statePath = path.join(directory, "state.json");
  const lock = stateTools.acquireStateLock({
    statePath,
    runId: "run",
    inputScopeHash: "scope",
    argv: [
      "--apply",
      "--credentials=C:\\private\\secret.json",
    ],
    pid: 555,
    processAlive: () => false,
  });
  const contents = fs.readFileSync(lock.lockPath, "utf8");
  assert.equal(contents.includes("secret.json"), false);
  assert.match(contents, /credentials=\[redactado\]/);
  lock.release();
});

test("limit selects new providers without repeating terminal providers and keeps retries", () => {
  const state = stateTools.createInitialState({
    inputScope: scope(),
    candidateProviderIds: IDS,
    runId: "run",
  });
  state.providerStates[IDS[0]] = {
    status: "confirmed",
  };
  state.providerStates[IDS[1]] = {
    status: "recoverable_error",
  };
  const queues = bulkTools.candidateQueues(
    state,
    IDS,
    1
  );
  assert.deepEqual(queues.retries, [IDS[1]]);
  assert.deepEqual(queues.fresh, [IDS[2]]);
  assert.deepEqual(queues.work, [IDS[1], IDS[2]]);
  assert.equal(queues.remainingFresh, 1);
});

test("a limit of 100 continues with the next 50 IDs instead of repeating the first block", () => {
  const providerIds = Array.from({ length: 150 }, (_, index) =>
    `pcar_${(index + 1).toString(16).padStart(24, "0")}`
  );
  const state = stateTools.createInitialState({
    inputScope: scope(providerIds),
    candidateProviderIds: providerIds,
    runId: "run",
  });
  const first = bulkTools.candidateQueues(
    state,
    providerIds,
    100
  );
  assert.equal(first.fresh.length, 100);
  for (const providerId of first.fresh) {
    state.providerStates[providerId] = {
      status: "confirmed",
    };
  }
  const second = bulkTools.candidateQueues(
    state,
    providerIds,
    100
  );
  assert.equal(second.fresh.length, 50);
  assert.deepEqual(second.fresh, providerIds.slice(100));
});

test("SIGINT, SIGTERM, uncaughtException and unhandledRejection request a controlled stop", () => {
  const target = new EventEmitter();
  const received = [];
  const remove = bulkTools.installTerminationHandlers({
    target,
    onStop(reason, error) {
      received.push([reason, error?.message || null]);
    },
  });
  target.emit("SIGINT");
  target.emit("SIGTERM");
  target.emit("uncaughtException", new Error("boom"));
  target.emit("unhandledRejection", new Error("rejected"));
  remove();
  assert.deepEqual(received, [
    ["SIGINT", null],
    ["SIGTERM", null],
    ["uncaughtException", "boom"],
    ["unhandledRejection", "rejected"],
  ]);
  assert.equal(target.listenerCount("SIGINT"), 0);
});

test("ETA, moving average, median, throughput, and error rate use completed timings", () => {
  const metrics = runtimeTools.calculateProgressMetrics({
    durationsMs: [1000, 2000, 3000],
    completed: 3,
    total: 6,
    startedAtMs: Date.now() - 6000,
    errorCount: 1,
  });
  assert.equal(metrics.averageMs, 2000);
  assert.equal(metrics.medianMs, 2000);
  assert.equal(metrics.movingAverageMs, 2000);
  assert.equal(metrics.etaMs, 6000);
  assert.ok(metrics.providersPerHour > 1700);
  assert.equal(metrics.errorPercentage, 25);
});

test("dashboard renders bounded progress, counters, ETA, bytes, and checkpoint", () => {
  const output = runtimeTools.renderDashboard({
    total: 100,
    progress: 25,
    completed: 20,
    partial: 2,
    errors: 1,
    skipped: 2,
    recovered: 1,
    currentProviderName: "Proveedor",
    currentProviderId: IDS[0],
    stage: "Descargando galería 18 / 29",
    lastConfirmedProviderId: IDS[1],
    currentProviderElapsedMs: 22500,
    providerDurationsMs: [18000, 20000],
    startedAtMs: Date.now() - 60000,
    bytesDownloaded: 1024,
    bytesUploaded: 512,
    firestoreWrites: 20,
    storageWrites: 42,
    checkpointPath: "C:\\private\\providers\\state.json",
    lastCheckpointAt: "16:32:41",
  });
  assert.match(output, /Progreso: 25 \/ 100/);
  assert.match(output, /25\.00 %/);
  assert.match(output, /Completados: 20/);
  assert.match(output, /Tiempo restante estimado:/);
  assert.match(output, /Firestore writes: 20/);
  assert.match(output, /state\.json/);
  assert.equal(output.split("\n").length < 40, true);
});

test("persistent logs redact contacts, credentials, addresses, buffers, and HTML", (context) => {
  const directory = temporaryDirectory(context);
  const logPath = path.join(directory, "runtime.jsonl");
  const logger = runtimeTools.createPersistentLogger(logPath);
  logger.log(
    "privacy",
    {
      email: "persona@example.com",
      telefono: "+5491112345678",
      direccion: "Calle Privada 123",
      credentials: "C:\\private\\secret.json",
      html: "<html>private</html>",
      buffer: Buffer.from("secret"),
      message:
        "contact persona@example.com or +5491112345678",
    },
    true
  );
  logger.close();
  const contents = fs.readFileSync(logPath, "utf8");
  assert.equal(contents.includes("persona@example.com"), false);
  assert.equal(contents.includes("12345678"), false);
  assert.equal(contents.includes("Calle Privada"), false);
  assert.equal(contents.includes("secret.json"), false);
  assert.equal(contents.includes("<html>"), false);
  assert.equal(contents.includes('"buffer"'), false);
});

test("remote requests retry 429 and 5xx with exponential backoff and Retry-After", async () => {
  const responses = [
    {
      ok: false,
      status: 429,
      headers: new Headers({
        "content-type": "text/html",
        "retry-after": "2",
      }),
    },
    new Response("<html>ok</html>", {
      status: 200,
      headers: {
        "content-type": "text/html",
      },
    }),
  ];
  const delays = [];
  const result = await imageTools.fetchProviderPage({
    url: "https://example.test/provider",
    fetchImpl: async () => responses.shift(),
    dnsLookup: async () => [
      {
        address: "203.0.113.10",
        family: 4,
      },
    ],
    maxRetries: 1,
    timeoutMs: 1000,
    pauseOn429: true,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.retries, 1);
  assert.deepEqual(delays, [2000]);
});

test("404 is definitive for one URL and is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    imageTools.fetchProviderPage({
      url: "https://example.test/missing",
      fetchImpl: async () => {
        calls += 1;
        return new Response("missing", {
          status: 404,
          headers: {
            "content-type": "text/html",
          },
        });
      },
      dnsLookup: async () => [
        {
          address: "203.0.113.10",
          family: 4,
        },
      ],
      maxRetries: 3,
      timeoutMs: 1000,
      sleep: async () => {},
    }),
    (error) => error.code === "page_not_found"
  );
  assert.equal(calls, 1);
});

test("the global request controller spaces concurrency and opens a circuit after repeated transient responses", async () => {
  let now = 0;
  const waits = [];
  const controller = new runtimeTools.SiteRequestController({
    requestDelayMs: 100,
    nowMs: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
  });
  await Promise.all([
    controller.beforeRequest({ url: "https://example.test/1" }),
    controller.beforeRequest({ url: "https://example.test/2" }),
    controller.beforeRequest({ url: "https://example.test/3" }),
  ]);
  assert.deepEqual(waits, [100, 100]);
  for (let index = 0; index < 5; index += 1) {
    controller.onResponse({
      status: 503,
      retryAfterMs: 0,
    });
  }
  await controller.beforeRequest({
    url: "https://example.test/after-circuit",
  });
  assert.equal(waits.at(-1), 60000);
});
