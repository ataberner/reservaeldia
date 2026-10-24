import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");

function assertIsolatedSession() {
  const session = process.env.RESERVA_LOCAL_SESSION;
  assert.ok(session, "Run through the isolated launcher; standalone Auth tests are disabled");
  const workspace = realpathSync(path.join(session, "workspace"));
  assert.equal(realpathSync(process.cwd()), workspace);
  assert.equal(realpathSync(fileURLToPath(new URL("../..", import.meta.url))), workspace);
  const marker = JSON.parse(readFileSync(path.join(session, "session.json"), "utf8"));
  assert.equal(marker.owner, "reservaeldia-local");
  assert.equal(marker.project, contract.LOCAL_PROJECT);
  assert.equal(marker.stopped, undefined);
  assert.equal(process.env.EMAIL_MODE, "disabled");
  assert.equal(process.env.RESERVA_FIREBASE_MODE, "emulators");
  assert.equal(process.env.GCLOUD_PROJECT, contract.LOCAL_PROJECT);
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS, "Personal ADC credentials must not be inherited");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, `${contract.HOST}:${contract.EMULATORS.auth}`);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, `${contract.HOST}:${contract.EMULATORS.firestore}`);
  const environment = contract.readClientEnvironment();
  assert.equal(environment.mode, "emulators");
  assert.equal(environment.config.projectId, contract.LOCAL_PROJECT);
  assert.equal(environment.config.storageBucket, contract.LOCAL_BUCKET);
  // Install the existing socket/fetch guard before importing any SDK or app.
  require("./networkGuard.cjs");
}

test("registration, verification, login, password recovery and legacy profiles use only the demo", { timeout: 120000 }, async context => {
  assertIsolatedSession();
  const { localBackendEnvironment, ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
  assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
  const authSdk = await import("firebase/auth");
  const firestoreSdk = await import("firebase/firestore");
  const { httpsCallable } = await import("firebase/functions");
  const { deleteApp } = await import("firebase/app");
  // The launcher runs integration files sequentially in separate Node workers;
  // use the actual application initialization and its default app in this worker.
  const { auth, db, functions, firebaseEnvironment } = await import("../../src/firebase.js");
  assert.equal(auth.emulatorConfig.host, contract.HOST);
  assert.equal(auth.emulatorConfig.port, contract.EMULATORS.auth);
  assert.equal(db._settings.host, `${contract.HOST}:${contract.EMULATORS.firestore}`);
  assert.equal(functions.emulatorOrigin, `http://${contract.HOST}:${contract.EMULATORS.functions}`);
  assert.equal(firebaseEnvironment.mode, "emulators");
  const admin = ensureAdminApp();
  const adminDb = admin.firestore();
  assert.equal(admin.options.projectId, contract.LOCAL_PROJECT);
  const createdUids = new Set();
  const draftPaths = new Set();
  const status = httpsCallable(functions, "getMyProfileStatus");
  const upsert = httpsCallable(functions, "upsertUserProfile");
  const oobUrl = `http://${contract.HOST}:${contract.EMULATORS.auth}/emulator/v1/projects/${contract.LOCAL_PROJECT}/oobCodes`;
  contract.assertLocalUrl(oobUrl);

  async function ownOobCode(email, requestType) {
    assert.match(email, /^auth-flows-[a-f0-9-]+@example\.test$/);
    // This endpoint exists only in Auth Emulator. Never follow oobLink or print
    // the project-wide response: select just this fixture and use the real SDK.
    const response = await fetch(oobUrl, { redirect: "error", signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, "Auth Emulator OOB lookup must succeed");
    const payload = await response.json();
    const matches = (payload.oobCodes || []).filter(item => item.email === email && item.requestType === requestType);
    assert.equal(matches.length, 1, "Expected exactly one pending code for this synthetic operation");
    assert.ok(typeof matches[0].oobCode === "string" && matches[0].oobCode.length > 0);
    return matches[0].oobCode;
  }

  async function createAccount() {
    await authSdk.signOut(auth);
    const id = randomUUID();
    const email = `auth-flows-${id}@example.test`;
    const password = `Synthetic-${id}!`;
    const result = await authSdk.createUserWithEmailAndPassword(auth, email, password);
    createdUids.add(result.user.uid);
    // Let the asynchronous creation event settle before eventual fixture
    // deletion. The configured processors must skip both real email effects.
    const deadline = Date.now() + 30000;
    let deliveriesSettled = false;
    while (Date.now() < deadline) {
      const deliveries = await Promise.all(["welcomeEmailDeliveries", "newUserNotificationDeliveries"].map(
        collection => adminDb.doc(`${collection}/${result.user.uid}`).get()
      ));
      if (deliveries.every(snapshot => snapshot.exists)) {
        for (const snapshot of deliveries) {
          assert.equal(snapshot.data().status, "skipped");
          assert.equal(snapshot.data().skipReason, "EMAIL_DISABLED");
          assert.equal(snapshot.data().attempts, 0);
        }
        deliveriesSettled = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(deliveriesSettled, "Disabled registration effects did not settle for the synthetic account");
    return { id, email, password, uid: result.user.uid, user: result.user };
  }

  try {
    await context.test("email signup creates one profile; verification and password reset preserve UID, profile and own draft", async () => {
      const account = await createAccount();
      assert.equal(account.user.emailVerified, false);
      const profileRef = firestoreSdk.doc(db, "usuarios", account.uid);
      const missing = (await status({})).data;
      assert.equal(missing.uid, account.uid);
      assert.equal(missing.profileComplete, false);
      const profile = { nombre: "Persona", apellido: "Sintetica", fechaNacimiento: "1990-01-02", source: "email-register" };
      const saved = (await upsert(profile)).data;
      assert.equal(saved.success, true);
      assert.equal(saved.profile.uid, account.uid);
      assert.equal(saved.profile.email, account.email);
      const originalProfile = (await firestoreSdk.getDocFromServer(profileRef)).data();
      assert.ok(originalProfile.createdAt);
      await upsert(profile); // Interrupted clients may retry the same profile write.
      assert.ok((await firestoreSdk.getDocFromServer(profileRef)).data().createdAt.isEqual(originalProfile.createdAt));
      const savedProfile = (await firestoreSdk.getDocFromServer(profileRef)).data();

      const draftPath = `borradores/auth-flows-${account.id}`;
      draftPaths.add(draftPath);
      const draftRef = firestoreSdk.doc(db, draftPath);
      const draft = { userId: account.uid, nombre: "Invitacion sintetica conservada", isolationFixture: account.id };
      await firestoreSdk.setDoc(draftRef, draft);
      await authSdk.sendEmailVerification(account.user);
      const verificationCode = await ownOobCode(account.email, "VERIFY_EMAIL");
      await authSdk.signOut(auth);
      assert.equal(auth.currentUser, null);
      await assert.rejects(status({}), error => error.code === "functions/unauthenticated");
      await authSdk.applyActionCode(auth, verificationCode);
      const login = await authSdk.signInWithEmailAndPassword(auth, account.email, account.password);
      assert.equal(login.user.uid, account.uid);
      assert.equal(login.user.emailVerified, true);
      assert.equal(authSdk.getAdditionalUserInfo(login).isNewUser, false);
      const verified = (await status({})).data;
      assert.equal(verified.profileComplete, true);
      assert.equal(verified.emailVerified, true);
      assert.deepEqual((await firestoreSdk.getDocFromServer(draftRef)).data(), draft);
      await assert.rejects(
        authSdk.createUserWithEmailAndPassword(auth, account.email, account.password),
        error => error.code === "auth/email-already-in-use"
      );

      await authSdk.signOut(auth);
      await authSdk.sendPasswordResetEmail(auth, account.email);
      const resetCode = await ownOobCode(account.email, "PASSWORD_RESET");
      assert.equal(await authSdk.verifyPasswordResetCode(auth, resetCode), account.email);
      const replacementPassword = `Reset-${randomUUID()}!`;
      await authSdk.confirmPasswordReset(auth, resetCode, replacementPassword);
      await assert.rejects(
        authSdk.signInWithEmailAndPassword(auth, account.email, account.password),
        error => ["auth/wrong-password", "auth/invalid-credential"].includes(error.code)
      );
      assert.equal(auth.currentUser, null);
      const recovered = await authSdk.signInWithEmailAndPassword(auth, account.email, replacementPassword);
      assert.equal(recovered.user.uid, account.uid);
      assert.equal(recovered.user.emailVerified, true);
      assert.equal(authSdk.getAdditionalUserInfo(recovered).isNewUser, false);
      assert.deepEqual((await firestoreSdk.getDocFromServer(profileRef)).data(), savedProfile);
      assert.deepEqual((await firestoreSdk.getDocFromServer(draftRef)).data(), draft);
      assert.equal((await status({})).data.profileComplete, true);
      await assert.rejects(
        authSdk.confirmPasswordReset(auth, resetCode, `Unused-${randomUUID()}!`),
        error => error.code === "auth/invalid-action-code"
      );
    });

    await context.test("an existing Auth account with an absent or incomplete profile completes it without changing identity", async () => {
      const account = await createAccount();
      const profileRef = adminDb.doc(`usuarios/${account.uid}`);
      assert.equal((await profileRef.get()).exists, false);
      await authSdk.signOut(auth);
      const existing = await authSdk.signInWithEmailAndPassword(auth, account.email, account.password);
      assert.equal(existing.user.uid, account.uid);
      const missing = (await status({})).data;
      assert.equal(missing.profileComplete, false);
      assert.equal(missing.profile.fechaNacimiento, null);
      // Exact fixture only: model the older partial shape without using a client
      // permission as evidence that arbitrary profile writes are intended.
      await profileRef.set({ nombre: "Persona", uiPreferences: { assistantTourOptOut: true } });
      assert.equal((await status({})).data.profileComplete, false);
      await upsert({ nombre: "Persona", apellido: "Legada", fechaNacimiento: "1988-03-04", source: "profile-completion" });
      const completed = (await status({})).data;
      assert.equal(completed.uid, account.uid);
      assert.equal(completed.profileComplete, true);
      assert.equal(completed.profile.apellido, "Legada");
      const stored = (await profileRef.get()).data();
      assert.equal(stored.uid, account.uid);
      assert.equal(stored.email, account.email);
      assert.equal(stored.uiPreferences.assistantTourOptOut, true);
      assert.equal((await admin.auth().getUser(account.uid)).displayName, "Persona Legada");
    });
  } finally {
    // Never flush the emulator or delete a collection. Other integration cases
    // share the demo; only this test's random identities and exact paths qualify.
    const cleanups = [() => authSdk.signOut(auth)];
    for (const draftPath of draftPaths) cleanups.push(() => adminDb.doc(draftPath).delete());
    for (const uid of createdUids) {
      cleanups.push(() => admin.auth().deleteUser(uid));
      for (const collection of ["usuarios", "welcomeEmailDeliveries", "newUserNotificationDeliveries", "analyticsUsers"]) {
        cleanups.push(() => adminDb.doc(`${collection}/${uid}`).delete());
      }
      cleanups.push(() => adminDb.doc(`analyticsEvents/registro_usuario:${uid}`).delete());
    }
    // Analytics aggregates may contain other fixtures; they stay in this
    // disposable emulator session and are never reset by an Auth-flow test.
    const outcomes = await Promise.allSettled(cleanups.map(cleanup => cleanup()));
    const shutdown = await Promise.allSettled([firestoreSdk.terminate(db), deleteApp(auth.app), admin.delete()]);
    assert.ok([...outcomes, ...shutdown].every(outcome => outcome.status === "fulfilled"), "Synthetic Auth fixture cleanup failed");
  }
});
