import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  prepareLegacyPublicationCleanupFlow,
} = requireBuiltModule("lib/payments/publicationLegacyCleanupFlow.js");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSnapshot(data) {
  return {
    exists: data != null,
    data() {
      return clone(data) ?? undefined;
    },
  };
}

function createHistoryDoc(data) {
  return {
    data() {
      return clone(data) ?? undefined;
    },
  };
}

async function prepareCleanup(overrides = {}) {
  return prepareLegacyPublicationCleanupFlow({
    slug: "mi-slug",
    uid: "user-1",
    publicationSnap: createSnapshot(null),
    extractDraftSlugsFromPublicationData(publicationData) {
      return [
        publicationData.borradorSlug,
        publicationData.borradorId,
        publicationData.draftSlug,
        publicationData.slugOriginal,
      ].filter(Boolean);
    },
    async loadHistoryDocsForSlug() {
      return [];
    },
    async queryLinkedDraftsByPublicSlug() {
      return { docs: [] };
    },
    ...overrides,
  });
}

test("prepareLegacyPublicationCleanupFlow prepares cleanup from an owned active publication", async () => {
  const result = await prepareCleanup({
    publicationSnap: createSnapshot({
      userId: "user-1",
      borradorSlug: "borrador-1",
    }),
  });

  assert.deepEqual(result.historyDocs, []);
  assert.deepEqual(result.plan, {
    slug: "mi-slug",
    uid: "user-1",
    storagePrefix: "publicadas/mi-slug/",
    draftResetRequests: [{ draftSlug: "borrador-1", uid: "user-1" }],
    shouldDeleteActivePublication: true,
  });
});

test("prepareLegacyPublicationCleanupFlow rejects foreign active publications with the current message", async () => {
  await assert.rejects(
    () =>
      prepareCleanup({
        publicationSnap: createSnapshot({
          userId: "user-2",
          borradorSlug: "borrador-1",
        }),
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "permission-denied");
      assert.equal(error.message, "No tienes permisos sobre esta publicacion.");
      return true;
    }
  );
});

test("prepareLegacyPublicationCleanupFlow short-circuits before history and draft fallback discovery for foreign active publications", async () => {
  let historyCalls = 0;
  let linkedDraftCalls = 0;

  await assert.rejects(
    () =>
      prepareCleanup({
        publicationSnap: createSnapshot({
          userId: "user-2",
        }),
        async loadHistoryDocsForSlug() {
          historyCalls += 1;
          return [];
        },
        async queryLinkedDraftsByPublicSlug() {
          linkedDraftCalls += 1;
          return { docs: [] };
        },
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "permission-denied");
      assert.equal(error.message, "No tienes permisos sobre esta publicacion.");
      return true;
    }
  );

  assert.equal(historyCalls, 0);
  assert.equal(linkedDraftCalls, 0);
});

test("prepareLegacyPublicationCleanupFlow prepares cleanup from owned history docs when there is no active publication", async () => {
  const historyDocs = [
    createHistoryDoc({
      borradorId: "borrador-historial",
    }),
  ];

  const result = await prepareCleanup({
    loadHistoryDocsForSlug: async () => historyDocs,
  });

  assert.equal(result.historyDocs, historyDocs);
  assert.equal(result.plan.shouldDeleteActivePublication, false);
  assert.deepEqual(result.plan.draftResetRequests, [
    { draftSlug: "borrador-historial", uid: "user-1" },
  ]);
});

test("prepareLegacyPublicationCleanupFlow prepares cleanup from owned linked drafts when active and history are missing", async () => {
  const result = await prepareCleanup({
    async queryLinkedDraftsByPublicSlug() {
      return {
        docs: [{ id: "borrador-linkeado" }],
      };
    },
  });

  assert.equal(result.plan.shouldDeleteActivePublication, false);
  assert.deepEqual(result.plan.draftResetRequests, [
    { draftSlug: "borrador-linkeado", uid: "user-1" },
  ]);
});

test("prepareLegacyPublicationCleanupFlow de-dupes draft candidates across active publication, history, and linked drafts", async () => {
  const result = await prepareCleanup({
    publicationSnap: createSnapshot({
      userId: "user-1",
      borradorSlug: "borrador-1",
      draftSlug: "borrador-1",
    }),
    async loadHistoryDocsForSlug() {
      return [
        createHistoryDoc({
          borradorId: "borrador-2",
          slugOriginal: "borrador-1",
        }),
      ];
    },
    async queryLinkedDraftsByPublicSlug() {
      return {
        docs: [{ id: "borrador-2" }, { id: "borrador-3" }, { id: "  " }],
      };
    },
  });

  assert.deepEqual(result.plan.draftResetRequests, [
    { draftSlug: "borrador-1", uid: "user-1" },
    { draftSlug: "borrador-2", uid: "user-1" },
    { draftSlug: "borrador-3", uid: "user-1" },
  ]);
});

test("prepareLegacyPublicationCleanupFlow rejects when no ownership surface is found", async () => {
  await assert.rejects(
    () => prepareCleanup(),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "not-found");
      assert.equal(
        error.message,
        "No se encontro una publicacion legacy para eliminar."
      );
      return true;
    }
  );
});
