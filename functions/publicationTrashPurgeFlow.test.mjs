import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  isPublicationDueForTrashPurgeFlow,
  purgeTrashedPublicationFlow,
} = requireBuiltModule("lib/payments/publicationTrashPurgeFlow.js");

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

function createPublicationSnapshot({
  data = {},
  createTime = "2025-05-01T10:00:00.000Z",
  ref = { id: "publication-ref" },
} = {}) {
  return {
    createTime: createTime ? createTimestampLike(createTime) : undefined,
    ref,
    data() {
      return clone(data) ?? undefined;
    },
  };
}

test("isPublicationDueForTrashPurgeFlow returns false when backend state is not papelera", () => {
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "publicada_activa",
      vigenteHasta: "2025-01-01T00:00:00.000Z",
    },
  });

  const result = isPublicationDueForTrashPurgeFlow({
    publicationData: snapshot.data(),
    publicationSnap: snapshot,
    now: new Date("2025-03-01T00:00:00.000Z"),
  });

  assert.equal(result, false);
});

test("isPublicationDueForTrashPurgeFlow returns false when papelera purge date is still in the future", () => {
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "papelera",
      vigenteHasta: "2025-03-01T00:00:00.000Z",
    },
  });

  const result = isPublicationDueForTrashPurgeFlow({
    publicationData: snapshot.data(),
    publicationSnap: snapshot,
    now: new Date("2025-03-15T00:00:00.000Z"),
  });

  assert.equal(result, false);
});

test("isPublicationDueForTrashPurgeFlow returns true when papelera purge date is due", () => {
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "papelera",
      vigenteHasta: "2025-01-01T00:00:00.000Z",
    },
  });

  const result = isPublicationDueForTrashPurgeFlow({
    publicationData: snapshot.data(),
    publicationSnap: snapshot,
    now: new Date("2025-02-15T00:00:00.000Z"),
  });

  assert.equal(result, true);
});

test("isPublicationDueForTrashPurgeFlow preserves fallback derivation through publication-date inputs", () => {
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "papelera",
    },
    createTime: "2024-01-01T00:00:00.000Z",
  });

  const result = isPublicationDueForTrashPurgeFlow({
    publicationData: snapshot.data(),
    publicationSnap: snapshot,
    now: new Date("2025-03-05T00:00:00.000Z"),
  });

  assert.equal(result, true);
});

test("purgeTrashedPublicationFlow de-dupes draft candidates and preserves current executor wiring", async () => {
  const calls = [];
  const publicationRef = { id: "publication-ref" };
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "papelera",
      borradorSlug: "draft-1",
      borradorId: "draft-2",
      slugOriginal: "draft-1",
    },
    ref: publicationRef,
  });

  await purgeTrashedPublicationFlow({
    slug: "mi-slug",
    publicationSnap: snapshot,
    extractInitialDraftSlugs(publicationData) {
      calls.push({
        type: "extract-initial",
        publicationData: clone(publicationData),
      });
      return ["draft-1", "", "draft-2", "draft-1"];
    },
    async queryLinkedDraftsByPublicSlug(slug) {
      calls.push({ type: "query-linked", slug });
      return {
        docs: [{ id: "draft-2" }, { id: "draft-3" }],
      };
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request: clone(request) });
      return true;
    },
    async deleteStoragePrefix(prefix) {
      calls.push({ type: "delete-storage", prefix });
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    async deleteReservation(slug) {
      calls.push({ type: "delete-reservation", slug });
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context: clone(context) });
    },
  });

  assert.deepEqual(calls, [
    {
      type: "extract-initial",
      publicationData: {
        estado: "papelera",
        borradorSlug: "draft-1",
        borradorId: "draft-2",
        slugOriginal: "draft-1",
      },
    },
    { type: "query-linked", slug: "mi-slug" },
    { type: "delete-storage", prefix: "publicadas/mi-slug/" },
    { type: "recursive-delete", ref: publicationRef },
    { type: "reset-draft", request: { draftSlug: "draft-1" } },
    { type: "reset-draft", request: { draftSlug: "draft-2" } },
    { type: "reset-draft", request: { draftSlug: "draft-3" } },
    { type: "delete-reservation", slug: "mi-slug" },
  ]);
});

test("purgeTrashedPublicationFlow keeps working when there are no draft candidates", async () => {
  const calls = [];
  const publicationRef = { id: "publication-ref" };
  const snapshot = createPublicationSnapshot({
    data: {
      estado: "papelera",
    },
    ref: publicationRef,
  });

  await purgeTrashedPublicationFlow({
    slug: "mi-slug",
    publicationSnap: snapshot,
    extractInitialDraftSlugs() {
      calls.push({ type: "extract-initial" });
      return [];
    },
    async queryLinkedDraftsByPublicSlug(slug) {
      calls.push({ type: "query-linked", slug });
      return { docs: [] };
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request: clone(request) });
      return false;
    },
    async deleteStoragePrefix(prefix) {
      calls.push({ type: "delete-storage", prefix });
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    async deleteReservation(slug) {
      calls.push({ type: "delete-reservation", slug });
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context: clone(context) });
    },
  });

  assert.deepEqual(calls, [
    { type: "extract-initial" },
    { type: "query-linked", slug: "mi-slug" },
    { type: "delete-storage", prefix: "publicadas/mi-slug/" },
    { type: "recursive-delete", ref: publicationRef },
    { type: "delete-reservation", slug: "mi-slug" },
  ]);
});
