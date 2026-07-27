import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const seed = require("./providers/seedProviderCategories.cjs");
const { deleteApp } = require("firebase-admin/app");
const { contract, manifest } = seed.loadCategoryManifest();

test("Firestore emulator accepts native Date values from the category seed batch", async (context) => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST must be set by the emulator runner"
  );

  const { app, db } = seed.initializeFirestoreForEmulator({
    projectId: "demo-reservaeldia-providers",
    appName: `provider-category-seed-emulator-${process.pid}`,
  });
  context.after(async () => {
    await deleteApp(app);
  });

  const entry = manifest.find(
    ({ documentId }) => documentId === "foto-video"
  );
  const prepared = seed.prepareCategoryBatch(
    db,
    [entry],
    contract,
    new Date("2026-07-27T15:00:00.000Z")
  );

  assert.equal(prepared.candidatesValidated, 1);
  assert.equal(prepared.batchPrepared, true);
  assert.ok(prepared.documents[0].document.creadoEn instanceof Date);
  assert.ok(
    prepared.documents[0].document.actualizadoEn instanceof Date
  );

  await prepared.batch.commit();

  const reference = db
    .collection("categorias_proveedores")
    .doc("foto-video");
  const snapshot = await reference.get();
  assert.equal(snapshot.exists, true);
  const stored = snapshot.data();
  assert.equal(stored.creadoEn.constructor.name, "Timestamp");
  assert.equal(stored.actualizadoEn.constructor.name, "Timestamp");
  assert.ok(stored.creadoEn.toDate() instanceof Date);
  assert.deepEqual(contract.validateCategoriaProveedor(stored), []);

  await reference.delete();
});
