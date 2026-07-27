import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const seed = require("./providers/seedProviderCategories.cjs");
const { contract, manifest } = seed.loadCategoryManifest();

function categoryStateFromManifest({
  omit = [],
  mutate = null,
} = {}) {
  const omitted = new Set(omit);
  const state = new Map();
  for (const entry of manifest) {
    if (omitted.has(entry.documentId)) continue;
    const document = seed.buildCategoryDocument(
      entry,
      new Date("2026-07-27T12:00:00.000Z")
    );
    state.set(
      entry.documentId,
      mutate?.(entry, document) || document
    );
  }
  return state;
}

function createFakeFirestore({
  categories = new Map(),
  providers = [],
} = {}) {
  const categoryState = categories;
  const counters = {
    batchCreateCalls: 0,
    commitCalls: 0,
  };

  function categorySnapshot(reference) {
    return {
      id: reference.id,
      exists: categoryState.has(reference.id),
      data: () => categoryState.get(reference.id),
    };
  }

  const db = {
    collection(collectionName) {
      if (collectionName === "categorias_proveedores") {
        return {
          doc: (id) => ({
            id,
            collectionName,
          }),
        };
      }
      if (collectionName === "proveedores") {
        return {
          select: (...fields) => ({
            get: async () => ({
              size: providers.length,
              docs: providers.map((data, index) => ({
                id: `provider-${index}`,
                data: () =>
                  Object.fromEntries(
                    fields.map((field) => [field, data[field]])
                  ),
              })),
            }),
          }),
        };
      }
      throw new Error(`Unexpected collection ${collectionName}`);
    },
    getAll: async (...references) =>
      references.map(categorySnapshot),
    batch() {
      const creates = [];
      return {
        create(reference, document) {
          counters.batchCreateCalls += 1;
          creates.push({ reference, document });
        },
        async commit() {
          counters.commitCalls += 1;
          for (const { reference } of creates) {
            if (categoryState.has(reference.id)) {
              throw new Error(`Already exists: ${reference.id}`);
            }
          }
          for (const { reference, document } of creates) {
            categoryState.set(reference.id, document);
          }
        },
      };
    },
  };

  return {
    db,
    categoryState,
    counters,
  };
}

function manifestValidation() {
  return seed.validateManifest(manifest, contract);
}

test("provider category manifest contains 24 unique exact documents", () => {
  assert.equal(manifest.length, 24);
  assert.equal(
    new Set(manifest.map((entry) => entry.documentId)).size,
    24
  );
  assert.equal(
    new Set(manifest.map((entry) => entry.slug)).size,
    24
  );
  assert.equal(
    new Set(manifest.map((entry) => entry.orden)).size,
    24
  );
  for (const entry of manifest) {
    assert.equal(entry.slug, entry.documentId);
    assert.equal(entry.icono, null);
    assert.equal(entry.categoriaPadreId, null);
    assert.equal(entry.activa, true);
  }
  for (const excluded of seed.EXCLUDED_CATEGORY_IDS) {
    assert.equal(
      manifest.some((entry) => entry.documentId === excluded),
      false
    );
  }
  assert.deepEqual(manifestValidation(), {
    status: "passed",
    planned: 24,
    duplicateDocumentIds: [],
    duplicateSlugs: [],
    duplicateOrders: [],
    excludedCategoryIdsPresent: [],
  });
});

test("category runtime validation accepts native Date and rejects malformed data", () => {
  const valid = seed.buildCategoryDocument(
    manifest[0],
    new Date("2026-07-27T12:00:00.000Z")
  );
  assert.deepEqual(contract.validateCategoriaProveedor(valid), []);
  assert.doesNotThrow(() =>
    contract.assertValidCategoriaProveedor(valid)
  );

  const invalid = {
    ...valid,
    slug: "Slug Inválido",
    actualizadoEn: "2026-07-27",
  };
  assert.deepEqual(
    contract
      .validateCategoriaProveedor(invalid)
      .map((issue) => issue.path),
    ["slug", "actualizadoEn"]
  );
});

test("manifest validation detects duplicate IDs, slugs, and orders", () => {
  const invalidManifest = manifest.map((entry) => ({ ...entry }));
  invalidManifest[1] = {
    ...invalidManifest[1],
    documentId: invalidManifest[0].documentId,
    slug: invalidManifest[0].slug,
    orden: invalidManifest[0].orden,
  };

  assert.throws(
    () => seed.validateManifest(invalidManifest, contract),
    (error) => {
      assert.deepEqual(
        error.manifestValidationFailure.duplicateDocumentIds,
        ["belleza-novias"]
      );
      assert.deepEqual(
        error.manifestValidationFailure.duplicateSlugs,
        ["belleza-novias"]
      );
      assert.deepEqual(
        error.manifestValidationFailure.duplicateOrders,
        [10]
      );
      assert.equal(
        error.manifestValidationFailure.batchCommitted,
        false
      );
      assert.equal(
        error.manifestValidationFailure.remoteWrites,
        0
      );
      return true;
    }
  );
});

test("dry-run is local-only and does not initialize Firebase", async () => {
  const { getApps } = require("firebase-admin/app");
  const initialApps = getApps().length;
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "provider-category-seed-")
  );
  const reportPath = path.join(temporaryDirectory, "dry-run.json");

  try {
    const report = await seed.run([
      "--dry-run",
      `--report=${reportPath}`,
      "--credentials=must-not-appear-in-report",
    ]);
    assert.equal(report.mode, "dry_run_local_only");
    assert.equal(report.planned.length, 24);
    assert.equal(report.firebaseInitialized, false);
    assert.equal(report.remoteReads, 0);
    assert.equal(report.remoteWrites, 0);
    assert.equal(report.batchCommitted, false);
    assert.equal(getApps().length, initialApps);
    const serialized = fs.readFileSync(reportPath, "utf8");
    assert.equal(
      serialized.includes("must-not-appear-in-report"),
      false
    );
  } finally {
    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("seed creates only missing categories and skips compatible existing documents", async () => {
  const missingId = "foto-video";
  const fake = createFakeFirestore({
    categories: categoryStateFromManifest({ omit: [missingId] }),
    providers: [
      {
        categoriaPrincipalId: "foto-video",
        categoriaIds: ["foto-video"],
      },
    ],
  });

  const report = await seed.executeSeedAgainstFirestore({
    db: fake.db,
    manifest,
    contract,
    projectId: "demo-category-seed",
    manifestValidation: manifestValidation(),
    commit: true,
    timestamp: new Date("2026-07-27T13:00:00.000Z"),
  });

  assert.deepEqual(report.missing, [missingId]);
  assert.equal(report.compatibleExisting.length, 23);
  assert.deepEqual(report.created, [missingId]);
  assert.equal(report.skipped.length, 23);
  assert.equal(report.remoteWrites, 1);
  assert.equal(report.batchCommitted, true);
  assert.equal(fake.counters.commitCalls, 1);
  assert.equal(fake.categoryState.size, 24);
  assert.ok(
    fake.categoryState.get(missingId).creadoEn instanceof Date
  );
});

test("a second seed execution is idempotent and performs no writes", async () => {
  const fake = createFakeFirestore();
  const options = {
    db: fake.db,
    manifest,
    contract,
    projectId: "demo-category-seed",
    manifestValidation: manifestValidation(),
    commit: true,
    timestamp: new Date("2026-07-27T13:00:00.000Z"),
  };

  const first = await seed.executeSeedAgainstFirestore(options);
  const second = await seed.executeSeedAgainstFirestore(options);

  assert.equal(first.created.length, 24);
  assert.equal(first.remoteWrites, 24);
  assert.equal(second.status, "completed_no_changes");
  assert.equal(second.missing.length, 0);
  assert.equal(second.compatibleExisting.length, 24);
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, 24);
  assert.equal(second.remoteWrites, 0);
  assert.equal(second.batchCommitted, false);
  assert.equal(fake.counters.commitCalls, 1);
});

test("an existing category conflict aborts before any write", async () => {
  const categories = categoryStateFromManifest({
    omit: ["foto-video"],
    mutate: (entry, document) =>
      entry.documentId === "tecnica-dj"
        ? { ...document, nombre: "Nombre diferente" }
        : document,
  });
  const fake = createFakeFirestore({ categories });

  const report = await seed.executeSeedAgainstFirestore({
    db: fake.db,
    manifest,
    contract,
    projectId: "demo-category-seed",
    manifestValidation: manifestValidation(),
    commit: true,
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.conflicts, [
    {
      documentId: "tecnica-dj",
      differingFields: ["nombre"],
    },
  ]);
  assert.deepEqual(report.missing, ["foto-video"]);
  assert.equal(report.created.length, 0);
  assert.equal(report.remoteWrites, 0);
  assert.equal(report.batchCommitted, false);
  assert.equal(fake.counters.batchCreateCalls, 0);
  assert.equal(fake.counters.commitCalls, 0);
  assert.equal(fake.categoryState.has("foto-video"), false);
});

test("project mismatch fails before Firebase initialization", () => {
  assert.throws(
    () =>
      seed.validateApplyConfiguration({
        apply: true,
        project: "project-a",
        confirmProject: "project-b",
        credentials: "credentials.json",
      }),
    /deben coincidir/
  );
  assert.throws(
    () =>
      seed.validateApplyConfiguration({
        apply: true,
        project: "project-a",
        confirmProject: "project-a",
        credentials: "",
      }),
    /--credentials/
  );
});

test("preflight prepares all creates without committing or mutating state", async () => {
  const fake = createFakeFirestore();
  const report = await seed.executeSeedAgainstFirestore({
    db: fake.db,
    manifest,
    contract,
    projectId: "demo-category-seed",
    manifestValidation: manifestValidation(),
    commit: false,
  });

  assert.equal(report.status, "preflight_passed_without_commit");
  assert.equal(report.preflight.status, "passed");
  assert.equal(report.preflight.candidatesValidated, 24);
  assert.equal(report.preflight.batchPrepared, true);
  assert.equal(report.remoteWrites, 0);
  assert.equal(report.batchCommitted, false);
  assert.equal(fake.counters.batchCreateCalls, 24);
  assert.equal(fake.counters.commitCalls, 0);
  assert.equal(fake.categoryState.size, 0);
});

test("provider reference verification reports manifest coverage without provider data", () => {
  const providerSnapshot = {
    docs: [
      {
        data: () => ({
          categoriaPrincipalId: "tecnica-dj",
          categoriaIds: ["tecnica-dj", "foto-video"],
        }),
      },
      {
        data: () => ({
          categoriaPrincipalId: "categoria-fuera-del-manifiesto",
          categoriaIds: [],
        }),
      },
    ],
  };

  const result = seed.verifyProviderCategoryReferences(
    manifest,
    providerSnapshot
  );
  assert.deepEqual(result.referencedExistingInManifest, [
    "foto-video",
    "tecnica-dj",
  ]);
  assert.deepEqual(result.referencedMissingFromManifest, [
    "categoria-fuera-del-manifiesto",
  ]);
  assert.equal(result.manifestWithoutProviders.length, 22);
  assert.equal(result.invalidReferenceValues, 0);
});

test("provider references outside the manifest block the seed before writes", async () => {
  const fake = createFakeFirestore({
    providers: [
      {
        categoriaPrincipalId: "categoria-fuera-del-manifiesto",
        categoriaIds: ["categoria-fuera-del-manifiesto"],
      },
    ],
  });
  const report = await seed.executeSeedAgainstFirestore({
    db: fake.db,
    manifest,
    contract,
    projectId: "demo-category-seed",
    manifestValidation: manifestValidation(),
    commit: true,
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(
    report.referenceVerification.referencedMissingFromManifest,
    ["categoria-fuera-del-manifiesto"]
  );
  assert.equal(report.remoteWrites, 0);
  assert.equal(report.batchCommitted, false);
  assert.equal(fake.counters.commitCalls, 0);
});
