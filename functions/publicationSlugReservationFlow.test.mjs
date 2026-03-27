import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  checkSlugAvailabilityFlow,
  markReservationStatusFlow,
  reserveSlugForSessionFlow,
  resolveExistingPublicSlugFlow,
} = requireBuiltModule("lib/payments/publicationSlugReservationFlow.js");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSnapshot(data, id = "") {
  return {
    id,
    exists: data != null,
    data() {
      return clone(data) ?? undefined;
    },
  };
}

function createDocRef(initialData, id = "") {
  const state = {
    data: clone(initialData),
    writes: [],
  };

  const ref = {
    id,
    async get() {
      return createSnapshot(state.data, id);
    },
    async set(payload, options) {
      state.data = {
        ...(state.data || {}),
        ...clone(payload),
      };
      state.writes.push({
        payload: clone(payload),
        options,
      });
    },
  };

  return {
    state,
    ref,
  };
}

function createReservationAvailabilityHarness({
  publicationData = null,
  reservationData = null,
  isPublicationExpiredData = (data) => data.expired === true,
  isExpiredAt = (value) => value === "expired",
} = {}) {
  const publicationSnap = createSnapshot(publicationData, "mi-slug");
  const reservation = createDocRef(reservationData, "mi-slug");
  const calls = {
    loadReservation: 0,
    finalized: 0,
  };

  return {
    calls,
    reservation,
    async run(params = {}) {
      return checkSlugAvailabilityFlow({
        slug: "mi-slug",
        uid: "user-1",
        draftSlug: "draft-1",
        loadPublication: async () => publicationSnap,
        loadReservation: async () => {
          calls.loadReservation += 1;
          return {
            ref: reservation.ref,
            snap: await reservation.ref.get(),
          };
        },
        finalizeExpiredPublication: async () => {
          calls.finalized += 1;
        },
        isPublicationExpiredData,
        isExpiredAt,
        createUpdatedAtValue: () => "updated-ts",
        ...params,
      });
    },
  };
}

function createReservationTransactionHarness({
  publicationData = null,
  reservationData = null,
} = {}) {
  const state = {
    publication: clone(publicationData),
    reservation: clone(reservationData),
    writes: [],
  };
  const publicationRef = { kind: "publication" };
  const reservationRef = { kind: "reservation" };

  return {
    state,
    publicationRef,
    reservationRef,
    async runTransaction(updateFn) {
      const tx = {
        async get(ref) {
          if (ref === publicationRef) {
            return createSnapshot(state.publication, "mi-slug");
          }
          if (ref === reservationRef) {
            return createSnapshot(state.reservation, "mi-slug");
          }
          throw new Error("Unexpected transaction ref");
        },
        set(ref, payload, options) {
          if (ref !== reservationRef) {
            throw new Error("Unexpected reservation write ref");
          }

          state.reservation = {
            ...(state.reservation || {}),
            ...clone(payload),
          };
          state.writes.push({
            payload: clone(payload),
            options,
          });
        },
      };

      return updateFn(tx);
    },
  };
}

test("checkSlugAvailabilityFlow blocks active publications before touching reservations", async () => {
  const harness = createReservationAvailabilityHarness({
    publicationData: {
      estado: "publicada_activa",
    },
  });

  const result = await harness.run();

  assert.deepEqual(result, {
    isAvailable: false,
    reason: "already-published",
  });
  assert.equal(harness.calls.finalized, 0);
  assert.equal(harness.calls.loadReservation, 0);
  assert.equal(harness.reservation.state.writes.length, 0);
});

test("checkSlugAvailabilityFlow finalizes expired publications and then treats the slug as available", async () => {
  const harness = createReservationAvailabilityHarness({
    publicationData: {
      expired: true,
    },
  });

  const result = await harness.run();

  assert.deepEqual(result, {
    isAvailable: true,
    reason: "ok",
  });
  assert.equal(harness.calls.finalized, 1);
  assert.equal(harness.calls.loadReservation, 0);
});

test("checkSlugAvailabilityFlow expires active reservations and then treats the slug as available", async () => {
  const harness = createReservationAvailabilityHarness({
    reservationData: {
      status: "active",
      uid: "user-2",
      draftSlug: "draft-2",
      expiresAt: "expired",
    },
  });

  const result = await harness.run();

  assert.deepEqual(result, {
    isAvailable: true,
    reason: "ok",
  });
  assert.equal(harness.reservation.state.writes.length, 1);
  assert.deepEqual(harness.reservation.state.writes[0], {
    payload: {
      status: "expired",
      updatedAt: "updated-ts",
    },
    options: { merge: true },
  });
});

test("checkSlugAvailabilityFlow blocks active foreign reservations", async () => {
  const harness = createReservationAvailabilityHarness({
    reservationData: {
      status: "active",
      uid: "other-user",
      draftSlug: "other-draft",
      expiresAt: "future",
    },
  });

  const result = await harness.run();

  assert.deepEqual(result, {
    isAvailable: false,
    reason: "temporarily-reserved",
  });
  assert.equal(harness.reservation.state.writes.length, 0);
});

test("checkSlugAvailabilityFlow keeps same-user same-draft active reservations available", async () => {
  const harness = createReservationAvailabilityHarness({
    reservationData: {
      status: "active",
      uid: "user-1",
      draftSlug: "draft-1",
      expiresAt: "future",
    },
  });

  const result = await harness.run();

  assert.deepEqual(result, {
    isAvailable: true,
    reason: "ok",
  });
  assert.equal(harness.reservation.state.writes.length, 0);
});

test("reserveSlugForSessionFlow preserves current active-reservation write semantics", async () => {
  const harness = createReservationTransactionHarness();

  await reserveSlugForSessionFlow({
    slug: "mi-slug",
    uid: "user-1",
    draftSlug: "draft-1",
    sessionId: "session-1",
    expiresAt: "expires-at",
    publicationRef: harness.publicationRef,
    reservationRef: harness.reservationRef,
    runTransaction: (updateFn) => harness.runTransaction(updateFn),
    isExpiredAt: () => false,
    createCreatedAtValue: () => "created-ts",
    createUpdatedAtValue: () => "updated-ts",
  });

  assert.equal(harness.state.writes.length, 1);
  assert.deepEqual(harness.state.writes[0], {
    payload: {
      slug: "mi-slug",
      uid: "user-1",
      draftSlug: "draft-1",
      sessionId: "session-1",
      status: "active",
      expiresAt: "expires-at",
      createdAt: "created-ts",
      updatedAt: "updated-ts",
    },
    options: { merge: true },
  });
});

test("reserveSlugForSessionFlow keeps active foreign reservation conflicts unchanged", async () => {
  const harness = createReservationTransactionHarness({
    reservationData: {
      status: "active",
      uid: "other-user",
      draftSlug: "other-draft",
      expiresAt: "future",
    },
  });

  await assert.rejects(
    reserveSlugForSessionFlow({
      slug: "mi-slug",
      uid: "user-1",
      draftSlug: "draft-1",
      sessionId: "session-1",
      expiresAt: "expires-at",
      publicationRef: harness.publicationRef,
      reservationRef: harness.reservationRef,
      runTransaction: (updateFn) => harness.runTransaction(updateFn),
      isExpiredAt: () => false,
      createCreatedAtValue: () => "created-ts",
      createUpdatedAtValue: () => "updated-ts",
    }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "already-exists");
      assert.equal(error.message, "El enlace elegido esta reservado temporalmente.");
      return true;
    }
  );
  assert.equal(harness.state.writes.length, 0);
});

test("markReservationStatusFlow ignores mismatched session ids", async () => {
  const reservation = createDocRef({
    sessionId: "session-1",
    status: "active",
  });

  await markReservationStatusFlow({
    sessionId: "different-session",
    nextStatus: "released",
    reservationRef: reservation.ref,
    createUpdatedAtValue: () => "updated-ts",
  });

  assert.equal(reservation.state.writes.length, 0);
  assert.deepEqual(reservation.state.data, {
    sessionId: "session-1",
    status: "active",
  });
});

test("resolveExistingPublicSlugFlow skips trashed candidates and finalizes expired ones before returning null", async () => {
  const finalized = [];
  const publicationsBySlug = new Map([
    [
      "draft-public",
      {
        estado: "papelera",
      },
    ],
    [
      "draft-1",
      {
        expired: true,
      },
    ],
    [
      "query-expired",
      {
        expired: true,
      },
    ],
  ]);

  const result = await resolveExistingPublicSlugFlow({
    draftSlug: "draft-1",
    loadDraftData: async () => ({
      slugPublico: "draft-public",
    }),
    loadPublicationBySlug: async (slug) => createSnapshot(publicationsBySlug.get(slug) || null, slug),
    queryPublicationsByOriginalDraftSlug: async () => ({
      docs: [createSnapshot({}, "query-expired")],
    }),
    queryPublicationsByLinkedDraftSlug: async () => ({
      docs: [],
    }),
    finalizeExpiredPublication: async (slug) => {
      finalized.push(slug);
    },
    isPublicationExpiredData: (data) => data.expired === true,
  });

  assert.equal(result, null);
  assert.deepEqual(finalized, ["draft-1", "query-expired"]);
});
