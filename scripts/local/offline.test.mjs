import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDocFromServer, terminate } from "firebase/firestore";
import { ref, getBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { deleteApp } from "firebase/app";
import { auth, db, functions, storage } from "../../src/firebase.js";

test("absent emulators fail without switching any service to production", { timeout: 30000 }, async () => {
  const attempts = [];
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (typeof options === "object" && options.port) attempts.push({ host: options.host, port: Number(options.port) });
    return connect.apply(this, args);
  };
  storage.maxOperationRetryTime = 300;
  const results = await Promise.allSettled([
    createUserWithEmailAndPassword(auth, "offline-synthetic@example.test", "Synthetic-offline-password!"),
    getDocFromServer(doc(db, "borradores", "offline-synthetic")),
    getBytes(ref(storage, "usuarios/offline/synthetic.txt")),
    httpsCallable(functions, "getMyUiPreferences", { timeout: 2000 })({}),
  ]);
  net.Socket.prototype.connect = connect;
  assert.equal(results.length, 4);
  for (const result of results) assert.equal(result.status, "rejected");
  assert.equal(auth.emulatorConfig.port, 19099);
  assert.equal(db._settings.host, "127.0.0.1:18080");
  assert.equal(storage.host, "127.0.0.1:19199");
  assert.equal(functions.emulatorOrigin, "http://127.0.0.1:15001");
  assert.ok(attempts.length >= 4);
  assert.ok(attempts.every(({ host, port }) => host === "127.0.0.1" && [19099, 18080, 19199, 15001].includes(port)));
  await terminate(db);
  await deleteApp(auth.app);
  const evidence = { requests: attempts, errors: results.map((result) => result.reason.code), fallback: false };
  await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "offline-evidence.json"), JSON.stringify(evidence, null, 2));
});
