import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  BORRADORES_COLLECTION,
  PUBLICADAS_COLLECTION,
  extractDraftSlugCandidatesFromPublicationData,
  ensureDraftOwnership,
  getPublicationRef,
  inferDraftSlugFromPublicationData,
  resolveExistingPublicSlug,
} = requireBuiltModule("lib/payments/publicationPaymentReads.js");

function createSnapshot(data) {
  return {
    exists: data != null,
    data() {
      return data == null ? undefined : JSON.parse(JSON.stringify(data));
    },
  };
}

function createDocRef(path, data) {
  return {
    path,
    async get() {
      return createSnapshot(data);
    },
  };
}

test("publication payment reads keep the current publication and draft slug precedence", () => {
  const fakeDb = {
    collection(name) {
      return {
        doc(id) {
          return { path: `${name}/${id}` };
        },
      };
    },
  };

  assert.equal(BORRADORES_COLLECTION, "borradores");
  assert.equal(PUBLICADAS_COLLECTION, "publicadas");
  assert.equal(getPublicationRef(fakeDb, "mi-slug").path, "publicadas/mi-slug");
  assert.equal(
    inferDraftSlugFromPublicationData("fallback-slug", {
      borradorSlug: "draft-preferred",
      borradorId: "draft-second",
      slugOriginal: "draft-third",
    }),
    "draft-preferred"
  );
  assert.deepEqual(
    extractDraftSlugCandidatesFromPublicationData({
      borradorSlug: "draft-1",
      borradorId: "draft-2",
      draftSlug: "draft-1",
      slugOriginal: "draft-3",
    }),
    ["draft-1", "draft-2", "draft-3"]
  );
});

test("ensureDraftOwnership keeps the current ownership success and error semantics", async () => {
  const ownedDb = {
    collection() {
      return {
        doc(id) {
          return createDocRef(`borradores/${id}`, {
            userId: "user-1",
            nombre: "Draft",
          });
        },
      };
    },
  };

  const result = await ensureDraftOwnership({
    db: ownedDb,
    uid: "user-1",
    draftSlug: "draft-1",
  });

  assert.equal(result.ref.path, "borradores/draft-1");
  assert.equal(result.data.nombre, "Draft");

  const missingDb = {
    collection() {
      return {
        doc(id) {
          return createDocRef(`borradores/${id}`, null);
        },
      };
    },
  };

  await assert.rejects(
    () =>
      ensureDraftOwnership({
        db: missingDb,
        uid: "user-1",
        draftSlug: "missing",
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "not-found");
      assert.equal(error.message, "No se encontro el borrador");
      return true;
    }
  );

  const foreignDb = {
    collection() {
      return {
        doc(id) {
          return createDocRef(`borradores/${id}`, {
            userId: "user-2",
          });
        },
      };
    },
  };

  await assert.rejects(
    () =>
      ensureDraftOwnership({
        db: foreignDb,
        uid: "user-1",
        draftSlug: "foreign",
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "permission-denied");
      assert.equal(error.message, "No tenes permisos sobre este borrador");
      return true;
    }
  );
});

test("resolveExistingPublicSlug keeps current fallback order and expired-publication cleanup behavior", async () => {
  let queryCalls = 0;
  const finalized = [];

  const fromDraft = await resolveExistingPublicSlug({
    draftSlug: "draft-1",
    async loadDraftData() {
      return {
        slugPublico: " MI-SLUG ",
      };
    },
    async loadPublicationBySlug(slug) {
      return createSnapshot({
        slug,
        estado: "publicada_activa",
      });
    },
    async queryPublicationsByOriginalDraftSlug() {
      queryCalls += 1;
      return { docs: [] };
    },
    async queryPublicationsByLinkedDraftSlug() {
      queryCalls += 1;
      return { docs: [] };
    },
    async finalizeExpiredPublication(slug) {
      finalized.push(slug);
    },
    isPublicationExpiredData() {
      return false;
    },
  });

  assert.equal(fromDraft, "mi-slug");
  assert.equal(queryCalls, 0);
  assert.deepEqual(finalized, []);

  const lookups = new Map([
    [
      "draft-2",
      createSnapshot({
        slug: "draft-2",
        estado: "publicada_activa",
        expired: true,
      }),
    ],
    [
      "linked-active",
      createSnapshot({
        slug: "linked-active",
        estado: "publicada_activa",
      }),
    ],
  ]);

  const resolved = await resolveExistingPublicSlug({
    draftSlug: "draft-2",
    async loadDraftData() {
      return {};
    },
    async loadPublicationBySlug(slug) {
      return lookups.get(slug) || createSnapshot(null);
    },
    async queryPublicationsByOriginalDraftSlug() {
      return {
        docs: [
          {
            id: "linked-active",
            exists: true,
            data() {
              return {
                slug: "linked-active",
              };
            },
          },
        ],
      };
    },
    async queryPublicationsByLinkedDraftSlug() {
      return { docs: [] };
    },
    async finalizeExpiredPublication(slug) {
      finalized.push(slug);
    },
    isPublicationExpiredData(data) {
      return data.expired === true;
    },
  });

  assert.equal(resolved, "linked-active");
  assert.deepEqual(finalized, ["draft-2"]);
});
