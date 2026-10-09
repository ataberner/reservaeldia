import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, collection, collectionGroup, query, where, orderBy, limit, startAfter, getDocFromServer,
  getDocsFromServer, setDoc, updateDoc, deleteDoc, deleteField, terminate } from "firebase/firestore";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, list, deleteObject } from "firebase/storage";
import { cases, identities, authorities } from "./rulesCases.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const { listAvailableMusicTracks } = require("../../shared/musicCatalog.cjs");
const runId = `rules-${randomUUID()}`;
const replacements = { A: `${runId}-a`, B: `${runId}-b`, ADMIN: `${runId}-admin`, SUPER: `${runId}-server-super` };
const expand = (value, id) => JSON.parse(JSON.stringify(value).replace(/\{(A|B|ADMIN|SUPER|ID)\}/g,
  (_, key) => key === "ID" ? `${runId}-${id}` : replacements[key]));
const clients = new Map();
const results = [];
const infrastructure = [];
let admin, adminDb, bucket, adminHelpers, manifest, session;

function hash(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function assertRulesCopy() {
  const config = JSON.parse(fs.readFileSync("firebase.local.json"));
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.equal(config.storage.rules, "storage.rules");
  for (const file of ["firestore.rules", "storage.rules"]) assert.equal(hash(file), manifest.rules[file], `${file}: working-tree copy changed`);
  for (const [name, port] of Object.entries(contract.EMULATORS)) {
    assert.equal(config.emulators[name].host, contract.HOST);
    assert.equal(config.emulators[name].port, port);
  }
}
function client(identity) {
  if (clients.has(identity)) return clients.get(identity);
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET,
    apiKey: "synthetic-emulator-only", authDomain: "localhost" }, `${runId}-${identity}`);
  const db = getFirestore(app), storage = getStorage(app);
  const claims = expand(identities[identity], "identity");
  const options = claims ? { mockUserToken: claims } : undefined;
  // Official emulator mock tokens are evaluated as request.auth, not Admin bypass.
  connectFirestoreEmulator(db, contract.HOST, contract.EMULATORS.firestore, options);
  connectStorageEmulator(storage, contract.HOST, contract.EMULATORS.storage, options);
  storage.maxOperationRetryTime = 3000;
  storage.maxUploadRetryTime = 3000;
  assert.equal(db._settings.host, process.env.FIRESTORE_EMULATOR_HOST);
  assert.equal(storage.host, process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  const result = { app, db, storage, claims };
  clients.set(identity, result);
  return result;
}

before(async () => {
  let preflightStep = "configuration";
  try {
    session = process.env.RESERVA_LOCAL_SESSION;
    assert.ok(session, "Run through npm run test:local:rules; no standalone/remote mode");
    assert.equal(path.resolve(process.cwd()), path.resolve(session, "workspace"));
    assert.equal(fs.readFileSync("functions/.env.local", "utf8"), "EMAIL_MODE=disabled\nWELCOME_EMAIL_ACTIVATION_AT=\n");
    const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
    assert.equal(marker.owner, "reservaeldia-local");
    assert.equal(marker.stopped, undefined);
    manifest = JSON.parse(fs.readFileSync(path.join(session, "rules-source.json")));
    assert.equal(manifest.project, contract.LOCAL_PROJECT);
    assert.equal(manifest.bucket, contract.LOCAL_BUCKET);
    assertRulesCopy();
    // The existing validator checks all destinations and the credential-free HOME.
    const { localBackendEnvironment, ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
    assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
    const hub = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(5000) })).json();
    for (const [name, port] of Object.entries(contract.EMULATORS)) assert.equal(hub[name].port, port);
    // Only disabled wrappers are probed; no business handler is invoked.
    for (const endpoint of ["getAdminAccess", "setAdminClaim", "publicRsvpSubmit",
      "listCountdownPresetsPublic", "saveCountdownPresetDraft", "publishCountdownPresetDraft", "listCountdownPresetVersionsAdmin"]) {
      preflightStep = `disabled-wrapper:${endpoint}`;
      const response = await fetch(`http://${process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST}/${contract.LOCAL_PROJECT}/${contract.REGION}/${endpoint}`, {
        // 5A clean installs can cold-start a Functions worker beyond 10s.
        // Same disabled-wrapper assertion, bounded wait, no automatic retry.
        method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":{}}', signal: AbortSignal.timeout(30000),
      });
      // Callable failed-precondition maps to HTTP 400; the HTTP wrapper uses 412.
      assert.equal(response.status, endpoint === "publicRsvpSubmit" ? 412 : 400, `${endpoint} must stay disabled`);
      const body = await response.json();
      if (endpoint !== "publicRsvpSubmit") assert.equal(body.error.status, "FAILED_PRECONDITION");
      assert.match(JSON.stringify(body), /LOCAL_FLOW_DISABLED/);
    }
    preflightStep = "admin-fixture-client";
    admin = ensureAdminApp();
    adminDb = admin.firestore();
    bucket = admin.storage().bucket();
    assert.equal(bucket.name, contract.LOCAL_BUCKET);
    adminHelpers = require("../../functions/lib/auth/adminAuth.js");
  } catch (error) {
    infrastructure.push({ stage: "preflight", step: preflightStep, code: error.code || error.name, name: error.name });
    throw error;
  }
});

async function evaluate(c, cl) {
  if (c.store === "backend-helper") {
    // Pure authorization helper characterization, explicitly NOT a Rules test.
    const previous = process.env.SUPERADMINS_UIDS;
    const previousRuntime = process.env.CLOUD_RUNTIME_CONFIG;
    process.env.SUPERADMINS_UIDS = replacements.SUPER;
    delete process.env.CLOUD_RUNTIME_CONFIG;
    try {
      return adminHelpers[c.resource]({ auth: cl.claims ? { uid: cl.claims.sub, token: cl.claims } : undefined });
    } finally {
      if (previous === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = previous;
      if (previousRuntime === undefined) delete process.env.CLOUD_RUNTIME_CONFIG; else process.env.CLOUD_RUNTIME_CONFIG = previousRuntime;
    }
  }
  if (c.store === "storage") {
    const target = ref(cl.storage, c.resource);
    if (c.operation === "get") {
      const bytes = await getBytes(target);
      assert.equal(new Uint8Array(bytes).length, 8, "Must read seeded bytes, not an absent object");
      return;
    }
    if (c.operation === "list") {
      const result = await list(target);
      assert.ok(result.items.length + result.prefixes.length > 0, "Must observe a seeded listing");
      return;
    }
    if (c.operation === "delete") return deleteObject(target);
    return uploadBytes(target, new Uint8Array(c.byteLength || 8), { contentType: c.contentType || "image/png" });
  }
  if (c.operation === "list") {
    const source = c.queryType === "group" ? collectionGroup(cl.db, c.resource) : collection(cl.db, c.resource);
    const constraints = [...(c.filters || []).map(f => where(...f)), ...(c.order || []).map(f => orderBy(...f))];
    if (c.cursor) constraints.push(startAfter(...c.cursor));
    if (c.limit) constraints.push(limit(c.limit));
    const snapshot = await getDocsFromServer(query(source, ...constraints));
    assert.ok(snapshot.size > 0, "Must read a seeded query, not cache/empty success");
    if (c.expectedIds) assert.deepEqual(snapshot.docs.map(d => d.id), c.expectedIds, "Consumer query must return the intended page");
    return;
  }
  const target = doc(cl.db, c.resource);
  if (c.operation === "get") { assert.equal((await getDocFromServer(target)).exists(), true); return; }
  if (c.operation === "delete") return deleteDoc(target);
  if (c.operation === "removeOwner") return updateDoc(target, { userId: deleteField() });
  const data = c.payload || (c.operation === "create" ? c.data || { userId: replacements.A, marker: "synthetic-4b1" } : { marker: "synthetic-update" });
  return ["create", "replace"].includes(c.operation) ? setDoc(target, data) : updateDoc(target, data);
}

async function fixture(c) {
  const documents = new Set(), objects = new Set();
  async function cleanup() {
    // Exact paths only: never clearFirestore, bucket-wide deletion, or Auth reset.
    const settled = await Promise.allSettled([
      ...[...objects].map(p => bucket.file(p).delete({ ignoreNotFound: true })),
      ...[...documents].map(p => adminDb.doc(p).delete()),
    ]);
    const failures = settled.filter(r => r.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), "Synthetic fixture cleanup failed");
  }
  try {
    for (const f of c.fixtures || []) { documents.add(f.path); await adminDb.doc(f.path).set(f.data); }
    if (c.store === "firestore" && c.operation !== "list") {
      documents.add(c.resource);
      if (c.operation !== "create") await adminDb.doc(c.resource).set(c.data || { userId: replacements.A, marker: "synthetic-4b1" });
    }
    if (c.store === "storage") {
      const object = c.objectFixture || c.resource;
      objects.add(object);
      if (c.operation !== "create") await bucket.file(object).save(Buffer.alloc(8), { resumable: false, metadata: { contentType: "image/png" } });
    }
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}

for (const collection of ["welcomeEmailDeliveries", "newUserNotificationDeliveries"]) {
test(`${collection}: Admin SDK bypass and real atomic reservation across concurrent processors`, async () => {
  const { createRegistrationDeliveryStore } = require("../../functions/lib/emails/registrationDeliveryStore.js");
  const { createWelcomeRegistrationProcessor } = require("../../functions/lib/emails/welcomeRegistration.js");
  const { createNewUserNotificationProcessor } = require("../../functions/lib/emails/newUserNotification.js");
  const createProcessor = collection === "welcomeEmailDeliveries" ? createWelcomeRegistrationProcessor : createNewUserNotificationProcessor;
  const uid = `${runId}-welcome-backend`;
  const reference = adminDb.doc(`${collection}/${uid}`);
  let sends = 0;
  try {
    const makeProcessor = () => createProcessor({
      store: createRegistrationDeliveryStore(collection, () => adminDb), getMode: () => "production", isSuperAdmin: () => false,
      getActivationTime: () => "2026-01-01T00:00:00.000Z",
      send: async () => { sends++; return { ok: true, state: "accepted", messageId: "synthetic-welcome-id", errorCode: null, retryable: false }; },
    });
    const input = { user: { uid, email: "welcome@example.test", creationTime: "2026-09-25T00:00:00.000Z" }, sourceEventId: "synthetic-auth-created" };
    const outcomes = await Promise.all([makeProcessor()(input), makeProcessor()(input)]);
    assert.equal(outcomes.filter(result => result.outcome === "recorded").length, 1);
    assert.equal(outcomes.filter(result => result.outcome === "already_exists").length, 1);
    assert.equal(sends, 1);
    const data = (await reference.get()).data();
    assert.equal(data.status, "accepted");
    assert.equal(data.attempts, 1);
    assert.equal(data.messageId, "synthetic-welcome-id");
    assert.ok(data.startedAt.toDate() instanceof Date);
    assert.ok(data.acceptedAt.toDate() instanceof Date);
    assert.equal((await makeProcessor()(input)).outcome, "already_exists");
    assert.equal(sends, 1);
  } finally {
    await reference.delete(); // Exact synthetic fixture in the isolated emulator only.
  }
  assert.equal((await reference.get()).exists, false);
});
}

test("Designer AI: real Firestore transactions bound replay, concurrency and the shared budget", { timeout: 120000 }, async () => {
  const { createDesignerAiAdmissionStore } = require("../../functions/lib/designerAi/admissionStore.js");
  const { designerAiUsageKey, DESIGNER_AI_ADMISSION_CONFIG_PATH } = require("../../functions/lib/designerAi/admission.js");
  const { resolveDraftStateFromData, DRAFT_STATES } = require("../../functions/lib/drafts/draftTrashLifecycle.js");
  const nowMs = Date.UTC(2001, 0, 1);
  const globalPath = `designerAiUsage/global_${Math.floor(nowMs / 86400000)}`;
  const cleanupPaths = new Set();
  const createdConfig = {
    schemaVersion: 1, enabled: true, policyVersion: "synthetic-emulator-test", model: "synthetic-model",
    perUserMinuteLimit: 5, perUserDayLimit: 10, dailyBudgetMicrousd: 1080,
    inputMicrousdPerMillionTokens: 1_000_000, outputMicrousdPerMillionTokens: 2_000_000,
  };
  const makeStore = () => createDesignerAiAdmissionStore(adminDb, {
    now: () => nowMs,
    isDraftEditable: draft => resolveDraftStateFromData(draft) === DRAFT_STATES.ACTIVE,
  });
  const inputs = Array.from({ length: 9 }, (_, index) => ({
    uid: `${runId}-ai-user-${index}`, draftId: `${runId}-ai-draft-${index}`,
    clientMessageId: "synthetic-emulator-message", requestCreatedAt: nowMs,
    payloadDigest: "a".repeat(64), model: "synthetic-model", maxInputTokens: 300, maxOutputTokens: 120,
  }));
  try {
    // Never overwrite an existing policy/window, even in the isolated demo.
    assert.equal((await adminDb.doc(globalPath).get()).exists, false);
    await adminDb.doc(DESIGNER_AI_ADMISSION_CONFIG_PATH).create(createdConfig);
    cleanupPaths.add(DESIGNER_AI_ADMISSION_CONFIG_PATH);
    cleanupPaths.add(globalPath);
    for (const input of inputs) {
      const draftPath = `borradores/${input.draftId}`;
      await adminDb.doc(draftPath).create({ userId: input.uid, estadoBorrador: DRAFT_STATES.ACTIVE });
      cleanupPaths.add(draftPath);
      cleanupPaths.add(`designerAiUsage/user_${designerAiUsageKey(input.uid)}`);
      cleanupPaths.add(`designerAiUsage/request_${designerAiUsageKey(JSON.stringify([input.uid, input.clientMessageId]))}`);
    }
    const replayRace = await Promise.allSettled(Array.from({ length: 8 }, () => makeStore().reserve(inputs[0])));
    const admitted = replayRace.filter(result => result.status === "fulfilled");
    assert.equal(admitted.length, 1);
    assert.ok(replayRace.filter(result => result.status === "rejected").every(result => result.reason.reason === "duplicate_active"));
    await makeStore().markDispatching(admitted[0].value);
    await makeStore().settle(admitted[0].value, { outcome: "unknown" });
    await assert.rejects(makeStore().reserve(inputs[0]), error => error.reason === "duplicate_unknown");

    const globalRace = await Promise.allSettled(inputs.slice(1).map(input => makeStore().reserve(input)));
    const globalAdmitted = globalRace.filter(result => result.status === "fulfilled");
    assert.equal(globalAdmitted.length, 1, "Only the remaining 540 microusd may be reserved");
    assert.ok(globalRace.filter(result => result.status === "rejected").every(result => result.reason.reason === "global_budget"));
    assert.equal((await adminDb.doc(globalPath).get()).data().allocatedMicrousd, 1080);
    const acceptedInput = inputs[1 + globalRace.findIndex(result => result.status === "fulfilled")];
    await assert.rejects(makeStore().reserve({ ...acceptedInput, clientMessageId: "concurrent-new-id" }), error => error.reason === "concurrent_request");
    assert.equal((await adminDb.doc(`designerAiUsage/${admitted[0].value.requestKey}`).get()).data().outcome, "unknown");
  } finally {
    const cleanup = await Promise.allSettled([...cleanupPaths].map(document => adminDb.doc(document).delete()));
    const failures = cleanup.filter(result => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Designer AI synthetic cleanup failed");
  }
});

test("music callable: real Auth claims, owner transaction, SDK denial and ordinary preservation", { timeout: 120000 }, async () => {
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, apiKey: "synthetic-emulator-only" }, `music-callable-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${contract.HOST}:${contract.EMULATORS.auth}`, { disableWarnings: true });
  const functions = getFunctions(app, contract.REGION);
  connectFunctionsEmulator(functions, contract.HOST, contract.EMULATORS.functions);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, contract.HOST, contract.EMULATORS.firestore);
  const save = httpsCallable(functions, "saveDraftWithMusicV1");
  const draftId = `${runId}-music-callable`, foreignId = `${draftId}-foreign`;
  const ref = adminDb.doc(`borradores/${draftId}`), foreign = adminDb.doc(`borradores/${foreignId}`);
  const [catalogTrack] = listAvailableMusicTracks();
  assert.ok(catalogTrack, "music integration requires an available catalog track");
  const music = { version: 1, enabled: true, track: { source: "catalog", id: catalogTrack.id }, volume: 0.35, loop: true };
  let uid;
  try {
    const credential = await createUserWithEmailAndPassword(auth, `${draftId}@example.test`, `Synthetic-${randomUUID()}!`);
    uid = credential.user.uid;
    await ref.set({ userId: uid, objetos: [], secciones: [], gifts: { enabled: false, stale: true } });
    await foreign.set({ userId: `${uid}-foreign` });
    await assert.rejects(save({ draftId, patch: { music } }), { code: "functions/permission-denied" });
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    await getIdToken(credential.user, true);
    await assert.rejects(updateDoc(doc(db, "borradores", draftId), { music }), { code: "permission-denied" });
    await assert.rejects(save({ draftId: foreignId, patch: { music } }), { code: "functions/permission-denied" });
    await save({ draftId, patch: { music, gifts: { enabled: false }, nombre: "Music invitation", draftContentMeta: { lastReason: "integration-test" } } });
    const saved = (await ref.get()).data();
    assert.deepEqual(saved.music, music);
    assert.deepEqual(saved.gifts, { enabled: false }, "root map replacement must match existing updateDoc transport");
    assert.equal(saved.nombre, "Music invitation");
    assert.equal(saved.userId, uid);
    assert.ok(saved.ultimaEdicion.toDate() instanceof Date);
    await admin.auth().setCustomUserClaims(uid, {});
    await getIdToken(credential.user, true);
    await save({ draftId, patch: { music, nombre: "Ordinary owner edit" } });
    await assert.rejects(save({ draftId, patch: { music: { ...music, enabled: false } } }), { code: "functions/permission-denied" });
    assert.equal((await ref.get()).data().nombre, "Ordinary owner edit");
  } finally {
    await signOut(auth);
    await terminate(db);
    await deleteApp(app);
    await ref.delete();
    await foreign.delete();
    if (uid) {
      // Auth creates the disabled email fixture asynchronously; wait boundedly
      // for that exact UID before deleting the task-owned test records.
      const deadline = Date.now() + 15000;
      const welcome = adminDb.doc(`welcomeEmailDeliveries/${uid}`);
      while (!(await welcome.get()).exists && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      await admin.auth().deleteUser(uid);
      await welcome.delete();
      await adminDb.doc(`newUserNotificationDeliveries/${uid}`).delete();
    }
  }
});

for (const entry of cases) test(`${entry.group}: ${entry.id}`, { timeout: 25000 }, async () => {
  const c = expand(entry, entry.id);
  const row = { ...entry, resource: c.resource, authority: authorities[entry.authority],
    syntheticIdentity: entry.identity === "anonymous" ? null : expand(identities[entry.identity], entry.id),
    observed: "not-executed", classification: "error de infraestructura" };
  // Do not retain seed/payload contents in the result; test source owns fixtures.
  for (const key of ["data", "fixtures", "payload", "objectFixture", "byteLength"]) delete row[key];
  results.push(row);
  let cleanup;
  try {
    cleanup = await fixture(c);
    const cl = client(entry.identity);
    let timer;
    try {
      await Promise.race([Promise.resolve().then(() => evaluate(c, cl)), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Operation timed out"), { code: "infra/timeout" })), 15000);
      })]);
      row.observed = "allow";
    } catch (error) {
      if (!["permission-denied", "storage/unauthorized"].includes(error.code)) throw error;
      row.observed = "deny";
      row.errorCode = error.code;
    } finally { clearTimeout(timer); }
    row.matchesExpected = row.observed === c.expected;
    row.classification = c.group === "acceptance" ? (row.matchesExpected ? "cumple" : "vulnera")
      : "pendiente de política";
    // Proposed policy has no normative assert yet; infrastructure must still fail.
    if (c.group !== "proposal") assert.equal(row.observed, c.expected, `${c.id}: ${row.authority}`);
  } catch (error) {
    if (row.observed === "not-executed") {
      row.observed = "infrastructure-error";
      row.errorCode = error.code || error.name;
    }
    throw error;
  } finally {
    if (cleanup) try { await cleanup(); } catch (error) {
      infrastructure.push({ stage: "cleanup", case: c.id, code: error.code || error.name });
      throw error;
    }
  }
});

after(async () => {
  try {
    if (manifest) assertRulesCopy();
    for (const cl of clients.values()) { await terminate(cl.db); await deleteApp(cl.app); }
    if (admin) await admin.delete();
  } catch (error) {
    infrastructure.push({ stage: "teardown", code: error.code || error.name });
    throw error;
  } finally {
    if (session) {
      const report = { schemaVersion: 1, runId, checkedAt: new Date().toISOString(), source: manifest,
        method: "Firebase client SDK mockUserToken; Admin uses exact synthetic fixtures and real emulator transactions for welcome and Designer AI reservations",
        planned: cases.length, executed: results.length, infrastructure,
        summary: Object.fromEntries(["acceptance", "characterization", "proposal"].map(group => {
          const rows = results.filter(r => r.group === group);
          return [group, { total: rows.length, matches: rows.filter(r => r.matchesExpected === true).length,
            differs: rows.filter(r => r.matchesExpected === false).length, infrastructureErrors: rows.filter(r => r.observed === "infrastructure-error").length }];
        })), results };
      fs.writeFileSync(path.join(session, "rules-evidence.json"), JSON.stringify(report, null, 2));
      console.log(`Rules evidence: ${path.join(session, "rules-evidence.json")}`);
      console.log(JSON.stringify(report.summary));
    }
  }
});
