import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { doc, setDoc, getDocFromServer, deleteDoc, terminate } from "firebase/firestore";
import { ref, uploadBytes, getBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { deleteApp } from "firebase/app";
import { auth, db, storage, functions, firebaseEnvironment } from "../../src/firebase.js";
const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const { ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");

test("synthetic identity, document, file and existing backend operation share the demo", { timeout: 90000 }, async (context) => {
  // Verify destination before creating any identity or fixture.
  assert.equal(firebaseEnvironment.config.projectId, contract.LOCAL_PROJECT);
  assert.equal(auth.emulatorConfig.host, "127.0.0.1");
  assert.equal(auth.emulatorConfig.port, 19099);
  assert.equal(storage.host, "127.0.0.1:19199");
  assert.equal(db._settings.host, "127.0.0.1:18080");
  assert.equal(functions.emulatorOrigin, "http://127.0.0.1:15001");
  const reloaded = await import(`../../src/firebase.js?reload=${Date.now()}`);
  assert.equal(reloaded.auth, auth);
  assert.equal(reloaded.storage, storage);
  const id = randomUUID();
  const email = `local-${id}@example.test`;
  const identity = await createUserWithEmailAndPassword(auth, email, `Synthetic-${id}!`);
  const uid = identity.user.uid;
  const draft = doc(db, "borradores", `local-${id}`);
  const profile = doc(db, "usuarios", uid);
  const filePath = `usuarios/${uid}/local-${id}.txt`;
  const file = ref(storage, filePath);
  const bytes = new TextEncoder().encode(`synthetic fixture ${id}`);
  const admin = ensureAdminApp();
  context.after(async () => {
    await deleteObject(file).catch((error) => { if (error.code !== "storage/object-not-found") throw error; });
    await deleteDoc(draft);
    await deleteDoc(profile);
    await deleteUser(identity.user);
    await terminate(db);
    await deleteApp(auth.app);
    await admin.delete();
  });

  await setDoc(draft, { userId: uid, nombre: "Invitación sintética 4A", isolationFixture: id });
  assert.equal((await getDocFromServer(draft)).data().isolationFixture, id);
  const observedDraft = await admin.firestore().doc(`borradores/local-${id}`).get();
  assert.equal(observedDraft.data().isolationFixture, id);
  assert.equal(admin.firestore()._settings.projectId, contract.LOCAL_PROJECT);

  await uploadBytes(file, bytes, { contentType: "text/plain" });
  const url = await getDownloadURL(file);
  contract.assertLocalUrl(url);
  assert.equal(new URL(url).host, "127.0.0.1:19199");
  assert.deepEqual(new Uint8Array(await getBytes(file)), bytes);
  const [storedBytes] = await admin.storage().bucket().file(filePath).download();
  assert.deepEqual(new Uint8Array(storedBytes), bytes);
  await deleteObject(file);
  await assert.rejects(() => getBytes(file), (error) => error.code === "storage/object-not-found");
  assert.equal((await admin.storage().bucket().file(filePath).exists())[0], false);

  const result = await httpsCallable(functions, "updateMyUiPreferences")({ assistantTourOptOut: true });
  assert.equal(result.data.assistantTourOptOut, true);
  assert.equal((await getDocFromServer(profile)).data().uiPreferences.assistantTourOptOut, true);
  const status = await httpsCallable(functions, "getMyProfileStatus")({});
  assert.equal(status.data.uid, uid);
  assert.equal(status.data.email, email);
  assert.equal((await admin.auth().getUser(uid)).email, email);

  for (const name of ["createPublicationPayment", "designerAiChat", "prepareDraftPreviewRender"]) {
    await assert.rejects(() => httpsCallable(functions, name)({}), (error) => error.code === "functions/failed-precondition" && /LOCAL_FLOW_DISABLED/.test(error.message));
  }
  const rsvp = await fetch(`${firebaseEnvironment.functionsBaseUrl}/publicRsvpSubmit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: `local-${id}` }) });
  assert.equal(rsvp.status, 412);
  assert.match(await rsvp.text(), /LOCAL_FLOW_DISABLED/);

  const evidence = { project: contract.LOCAL_PROJECT, bucket: contract.LOCAL_BUCKET, endpoints: {
    auth: `http://${auth.emulatorConfig.host}:${auth.emulatorConfig.port}`,
    firestore: db._settings.host, storage: new URL(url).origin, functions: firebaseEnvironment.functionsBaseUrl,
  }, observations: ["client Auth identity confirmed by local Admin", "client document confirmed by local Admin", "client Storage bytes confirmed by local Admin and deleted", "existing backend wrote preferences read by client", "payment, AI, preview and RSVP disabled before handler effects"], fixture: "random synthetic identity @example.test; removed by test cleanup", rulesAuthorizationClaim: false };
  await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "integration-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
});
