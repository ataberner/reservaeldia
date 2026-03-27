import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  finalizePublicationSnapshotFlow,
} = requireBuiltModule("lib/payments/publicationFinalizationFlow.js");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createTimestampLike(isoString) {
  const date = new Date(isoString);
  return {
    toDate() {
      return date;
    },
    toMillis() {
      return date.getTime();
    },
  };
}

function toIsoOrNull(value) {
  if (value === null) return null;
  if (!value || typeof value.toDate !== "function") return undefined;
  return value.toDate().toISOString();
}

function createMergeSetRef() {
  const state = {
    writes: [],
  };

  return {
    state,
    ref: {
      async set(payload, options) {
        state.writes.push({
          payload,
          options: clone(options),
        });
      },
    },
  };
}

function createPublicationSnapshot({
  data,
  createTime = "2025-05-01T10:00:00.000Z",
  rsvps = [],
} = {}) {
  const state = {
    rsvpReads: 0,
  };
  const ref = {
    path: "publicadas/mi-slug",
    collection(name) {
      assert.equal(name, "rsvps");
      return {
        async get() {
          state.rsvpReads += 1;
          return {
            docs: rsvps.map((row) => ({
              data() {
                return clone(row) ?? undefined;
              },
            })),
          };
        },
      };
    },
  };

  return {
    state,
    snap: {
      exists: data != null,
      createTime: createTime ? createTimestampLike(createTime) : undefined,
      ref,
      data() {
        return clone(data) ?? undefined;
      },
    },
  };
}

function createFlowHarness() {
  const historyRef = createMergeSetRef();
  const draftRef = createMergeSetRef();
  const reservationRef = createMergeSetRef();
  const calls = {
    historyIds: [],
    draftSlugs: [],
    deletedPrefixes: [],
    recursiveDeletes: [],
    warnings: [],
    info: [],
  };

  return {
    calls,
    refs: {
      historyRef,
      draftRef,
      reservationRef,
    },
    deps: {
      getHistoryRef(historyId) {
        calls.historyIds.push(historyId);
        return historyRef.ref;
      },
      getDraftRef(draftSlug) {
        calls.draftSlugs.push(draftSlug);
        return draftRef.ref;
      },
      reservationRef: reservationRef.ref,
      createHistoryCreatedAtValue() {
        return "history-created";
      },
      createHistoryUpdatedAtValue() {
        return "history-updated";
      },
      createDraftUpdatedAtValue() {
        return "draft-updated";
      },
      createReservationUpdatedAtValue() {
        return "reservation-updated";
      },
      async deleteStoragePrefix(prefix) {
        calls.deletedPrefixes.push(prefix);
      },
      async recursiveDelete(ref) {
        calls.recursiveDeletes.push(ref);
      },
      warn(message, context) {
        calls.warnings.push({
          message,
          context: clone(context),
        });
      },
      info(message, context) {
        calls.info.push({
          message,
          context: clone(context),
        });
      },
    },
  };
}

test("finalizePublicationSnapshotFlow short-circuits missing snapshots without planner or execution side effects", async () => {
  const harness = createFlowHarness();
  const snapshot = createPublicationSnapshot({ data: null });

  const result = await finalizePublicationSnapshotFlow({
    slug: "mi-slug",
    publicationSnap: snapshot.snap,
    reason: "scheduled-expiration",
    draftSlug: "",
    ...harness.deps,
  });

  assert.deepEqual(result, {
    slug: "mi-slug",
    historyId: null,
    draftSlug: null,
    finalized: false,
    alreadyMissing: true,
  });
  assert.equal(snapshot.state.rsvpReads, 0);
  assert.deepEqual(harness.calls.historyIds, []);
  assert.deepEqual(harness.calls.draftSlugs, []);
  assert.deepEqual(harness.calls.deletedPrefixes, []);
  assert.deepEqual(harness.calls.recursiveDeletes, []);
  assert.deepEqual(harness.refs.historyRef.state.writes, []);
  assert.deepEqual(harness.refs.draftRef.state.writes, []);
  assert.deepEqual(harness.refs.reservationRef.state.writes, []);
  assert.deepEqual(harness.calls.info, []);
});

test("finalizePublicationSnapshotFlow preserves current sequencing, fallback dates, and RSVP summary shaping", async () => {
  const harness = createFlowHarness();
  const firstPublishedAtIso = "2025-05-01T10:00:00.000Z";
  const snapshot = createPublicationSnapshot({
    createTime: firstPublishedAtIso,
    data: {
      userId: "user-1",
      nombre: "Fiesta de Lucia",
      tipo: "boda",
      portada: "https://cdn.example.test/cover.webp",
      plantillaId: "tpl-1",
      slugOriginal: "draft-1",
    },
    rsvps: [
      {
        metrics: {
          attendance: "yes",
          confirmedGuests: 3,
          menuTypeId: "vegetarian",
          childrenCount: 2,
          hasDietaryRestrictions: true,
          needsTransport: true,
        },
      },
      {
        confirma: false,
      },
      {
        answers: {
          attendance: "yes",
          party_size: 2,
          menu_type: "vegan",
          children_count: 1,
          dietary_notes: "Sin TACC",
          needs_transport: "si",
        },
      },
    ],
  });

  const result = await finalizePublicationSnapshotFlow({
    slug: "mi-slug",
    publicationSnap: snapshot.snap,
    reason: "scheduled-expiration",
    draftSlug: "draft-1",
    ...harness.deps,
  });

  const expectedHistoryId = `mi-slug__${Date.parse(firstPublishedAtIso)}`;

  assert.deepEqual(result, {
    slug: "mi-slug",
    historyId: expectedHistoryId,
    draftSlug: "draft-1",
    finalized: true,
    alreadyMissing: false,
  });
  assert.equal(snapshot.state.rsvpReads, 1);
  assert.deepEqual(harness.calls.historyIds, [expectedHistoryId]);
  assert.deepEqual(harness.calls.draftSlugs, ["draft-1"]);
  assert.deepEqual(harness.calls.deletedPrefixes, ["publicadas/mi-slug/"]);
  assert.deepEqual(harness.calls.recursiveDeletes, [snapshot.snap.ref]);
  assert.equal(harness.refs.historyRef.state.writes.length, 1);
  assert.equal(harness.refs.draftRef.state.writes.length, 1);
  assert.equal(harness.refs.reservationRef.state.writes.length, 1);
  assert.equal(harness.calls.info.length, 1);
  assert.equal(harness.calls.info[0].message, "Publicacion finalizada");
  assert.deepEqual(harness.calls.warnings, []);

  const historyWrite = harness.refs.historyRef.state.writes[0].payload;
  assert.equal(historyWrite.slug, "mi-slug");
  assert.equal(historyWrite.userId, "user-1");
  assert.equal(historyWrite.borradorSlug, "draft-1");
  assert.equal(historyWrite.slugOriginal, "draft-1");
  assert.equal(historyWrite.motivoFinalizacion, "scheduled-expiration");
  assert.equal(historyWrite.sourceCollection, "publicadas");
  assert.equal(toIsoOrNull(historyWrite.publicadaAt), firstPublishedAtIso);
  assert.equal(toIsoOrNull(historyWrite.vigenteHasta), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(historyWrite.ultimaPublicacionEn), firstPublishedAtIso);
  assert.equal(typeof toIsoOrNull(historyWrite.finalizadaEn), "string");
  assert.deepEqual(historyWrite.rsvpSummary, {
    totalResponses: 3,
    confirmedResponses: 2,
    declinedResponses: 1,
    confirmedGuests: 5,
    vegetarianCount: 1,
    veganCount: 1,
    childrenCount: 3,
    dietaryRestrictionsCount: 2,
    transportCount: 2,
  });
  assert.equal(historyWrite.totalRsvpsHistorico, 3);

  const draftWrite = harness.refs.draftRef.state.writes[0].payload;
  assert.equal(draftWrite.slugPublico, null);
  assert.equal(draftWrite.publicationFinalizationReason, "scheduled-expiration");
  assert.equal(draftWrite.updatedAt, "draft-updated");

  const reservationWrite = harness.refs.reservationRef.state.writes[0].payload;
  assert.deepEqual(reservationWrite, {
    status: "released",
    updatedAt: "reservation-updated",
    releaseReason: "scheduled-expiration",
  });
});

test("finalizePublicationSnapshotFlow keeps linked draft finalization optional", async () => {
  const harness = createFlowHarness();
  const snapshot = createPublicationSnapshot({
    data: {
      userId: "user-1",
      nombre: "Sin draft",
    },
  });

  await finalizePublicationSnapshotFlow({
    slug: "mi-slug",
    publicationSnap: snapshot.snap,
    reason: "scheduled-expiration",
    draftSlug: "",
    ...harness.deps,
  });

  assert.deepEqual(harness.calls.draftSlugs, []);
  assert.deepEqual(harness.refs.draftRef.state.writes, []);
  assert.equal(harness.refs.historyRef.state.writes.length, 1);
  assert.equal(harness.refs.reservationRef.state.writes.length, 1);
});
