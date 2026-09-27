import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, signInWithCredential, GoogleAuthProvider, getAdditionalUserInfo } from "firebase/auth";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("real Auth emulator emits welcome creation events for password/Google, never for an existing login", { timeout: 120000 }, async () => {
  const session = process.env.RESERVA_LOCAL_SESSION;
  assert.ok(session, "Use the isolated Rules launcher, never a remote project");
  assert.equal(path.resolve(process.cwd()), path.resolve(session, "workspace"));
  assert.equal(process.env.GCLOUD_PROJECT, contract.LOCAL_PROJECT);
  assert.equal(process.env.EMAIL_MODE, "disabled");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(JSON.parse(readFileSync(path.join(session, "session.json"))).stopped, undefined);
  const { ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
  const admin = ensureAdminApp();
  const db = admin.firestore();
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, apiKey: "synthetic-emulator-key" }, `welcome-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });
  const created = new Set();
  // Bounded polling only for emulator event completion; no sender retry or name wait.
  async function delivery(uid, collection = "welcomeEmailDeliveries") {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const snapshot = await db.doc(`${collection}/${uid}`).get();
      if (snapshot.exists) {
        const data = snapshot.data();
        assert.equal(data.status, "skipped");
        assert.equal(data.skipReason, "EMAIL_DISABLED");
        assert.equal(data.attempts, 0);
        assert.ok(data.sourceEventId);
        assert.match(data.correlationId, collection === "welcomeEmailDeliveries" ? /^welcome-/ : /^new-user-notification-/);
        assert.equal(data.messageId, undefined);
        assert.equal(data.email, undefined);
        return data;
      }
      await pause(100);
    }
    assert.fail("Auth creation event did not reach the welcome processor");
  }
  const eventLogCount = uid => {
    // Observe existing sanitized processor logs; no additional collection/instrumentation.
    const source = readFileSync("firebase-debug.log", "utf8");
    return source.split("\n").filter(line => line.includes('"message":"welcome_registration"') && line.includes(`"userId":"${uid}"`)).length;
  };
  try {
    const id = randomUUID(), email = `welcome-${id}@example.test`, password = `Synthetic-${id}!`;
    const passwordAccount = await createUserWithEmailAndPassword(auth, email, password);
    const uid = passwordAccount.user.uid;
    created.add(uid);
    assert.equal(passwordAccount.user.displayName, null);
    const first = await delivery(uid);
    const internalFirst = await delivery(uid, "newUserNotificationDeliveries");
    const countBefore = eventLogCount(uid);
    assert.ok(countBefore > 0, "must observe the real event in processor logs");
    await signOut(auth);
    const login = await signInWithEmailAndPassword(auth, email, password);
    assert.equal(login.user.uid, uid);
    assert.equal(getAdditionalUserInfo(login).isNewUser, false);

    for (const modal of ["RegisterModal", "LoginModal"]) {
      await signOut(auth);
      const subject = `google-${randomUUID()}`;
      const payload = { iss: "https://accounts.google.com", aud: contract.LOCAL_PROJECT,
        sub: subject, email: `${subject}@example.test`, email_verified: true, name: "Agustín Prueba",
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
      // Auth emulator supports unsigned synthetic provider tokens; never contacts Google.
      const token = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.`;
      const credential = GoogleAuthProvider.credential(token);
      const google = await signInWithCredential(auth, credential);
      created.add(google.user.uid);
      assert.equal(getAdditionalUserInfo(google).isNewUser, true, modal);
      assert.equal(google.user.displayName, "Agustín Prueba");
      const googleFirst = await delivery(google.user.uid);
      const googleInternalFirst = await delivery(google.user.uid, "newUserNotificationDeliveries");
      const googleCount = eventLogCount(google.user.uid);
      assert.ok(googleCount > 0);
      await signOut(auth);
      const existing = await signInWithCredential(auth, credential);
      assert.equal(getAdditionalUserInfo(existing).isNewUser, false, modal);
      assert.equal(existing.user.uid, google.user.uid);
      await pause(750);
      assert.deepEqual(await delivery(google.user.uid), googleFirst);
      assert.deepEqual(await delivery(google.user.uid, "newUserNotificationDeliveries"), googleInternalFirst);
      assert.equal(eventLogCount(google.user.uid), googleCount, "existing Google login emitted no creation event");
    }
    assert.deepEqual(await delivery(uid), first);
    assert.deepEqual(await delivery(uid, "newUserNotificationDeliveries"), internalFirst);
    assert.equal(eventLogCount(uid), countBefore, "existing password login emitted no creation event");
    assert.equal((await db.doc(`usuarios/${uid}`).get()).exists, false, "welcome does not depend on or create a profile");
  } finally {
    await signOut(auth);
    for (const uid of created) {
      await admin.auth().deleteUser(uid);
      await db.doc(`welcomeEmailDeliveries/${uid}`).delete(); // Exact demo fixtures only.
      await db.doc(`newUserNotificationDeliveries/${uid}`).delete();
    }
    await deleteApp(app);
    await admin.delete();
  }
});
