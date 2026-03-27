import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  executeApprovedSessionOutcomeEffects,
  executePlannedLegacyPublicationCleanup,
  executePlannedDraftWriteIfExists,
  executePlannedPublicationFinalization,
  executePlannedPublicationWrites,
  executePlannedTrashedPublicationPurge,
} = requireBuiltModule("lib/payments/publicationOperationExecution.js");

function createMergeSetRef(name, calls) {
  return {
    async set(payload, options) {
      calls.push({
        type: "set",
        name,
        payload,
        options,
      });
    },
  };
}

test("executePlannedPublicationFinalization applies writes and deletes in current order", async () => {
  const calls = [];
  const plan = {
    historyId: "mi-slug__1",
    historyWrite: { kind: "history" },
    draftFinalizeWrite: { kind: "draft" },
    reservationReleaseWrite: { kind: "reservation" },
    storagePrefix: "publicadas/mi-slug/",
    result: {
      slug: "mi-slug",
      historyId: "mi-slug__1",
      draftSlug: "borrador-1",
      finalized: true,
      alreadyMissing: false,
    },
    logContext: {
      slug: "mi-slug",
      draftSlug: "borrador-1",
      historyId: "mi-slug__1",
      reason: "scheduled-expiration",
      totalResponses: 4,
    },
  };

  await executePlannedPublicationFinalization({
    plan,
    historyRef: createMergeSetRef("history", calls),
    publicationRef: { id: "publication-ref" },
    draftRef: createMergeSetRef("draft", calls),
    reservationRef: createMergeSetRef("reservation", calls),
    async deleteStoragePrefix(prefix) {
      calls.push({ type: "delete-storage", prefix });
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.type === "set" ? `set:${entry.name}` : entry.type),
    [
      "set:history",
      "delete-storage",
      "recursive-delete",
      "set:reservation",
      "set:draft",
    ]
  );
  assert.deepEqual(calls[0].options, { merge: true });
  assert.deepEqual(calls[3].options, { merge: true });
  assert.deepEqual(calls[4].options, { merge: true });
  assert.equal(calls[1].prefix, "publicadas/mi-slug/");
});

test("executePlannedPublicationFinalization keeps release and draft sync after delete failures", async () => {
  const calls = [];
  const plan = {
    historyId: "mi-slug__1",
    historyWrite: { kind: "history" },
    draftFinalizeWrite: { kind: "draft" },
    reservationReleaseWrite: { kind: "reservation" },
    storagePrefix: "publicadas/mi-slug/",
    result: {
      slug: "mi-slug",
      historyId: "mi-slug__1",
      draftSlug: "borrador-1",
      finalized: true,
      alreadyMissing: false,
    },
    logContext: {
      slug: "mi-slug",
      draftSlug: "borrador-1",
      historyId: "mi-slug__1",
      reason: "scheduled-expiration",
      totalResponses: 4,
    },
  };

  await executePlannedPublicationFinalization({
    plan,
    historyRef: createMergeSetRef("history", calls),
    publicationRef: { id: "publication-ref" },
    draftRef: createMergeSetRef("draft", calls),
    reservationRef: createMergeSetRef("reservation", calls),
    async deleteStoragePrefix() {
      calls.push({ type: "delete-storage" });
      throw new Error("storage failed");
    },
    async recursiveDelete() {
      calls.push({ type: "recursive-delete" });
      throw new Error("recursive failed");
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.type === "set" ? `set:${entry.name}` : entry.type),
    [
      "set:history",
      "delete-storage",
      "warn",
      "recursive-delete",
      "warn",
      "set:reservation",
      "set:draft",
    ]
  );
  assert.deepEqual(
    calls
      .filter((entry) => entry.type === "warn")
      .map((entry) => entry.message),
    [
      "No se pudieron borrar archivos publicados durante finalizacion",
      "No se pudo eliminar la publicacion activa durante finalizacion",
    ]
  );
  assert.deepEqual(calls[2].context, {
    slug: "mi-slug",
    reason: "scheduled-expiration",
    error: "storage failed",
  });
  assert.deepEqual(calls[4].context, {
    slug: "mi-slug",
    reason: "scheduled-expiration",
    error: "recursive failed",
  });
});

test("executePlannedPublicationWrites keeps active publication write before linked draft sync", async () => {
  const calls = [];

  await executePlannedPublicationWrites({
    publicationRef: createMergeSetRef("publication", calls),
    publicationWrite: { kind: "publication" },
    draftRef: createMergeSetRef("draft", calls),
    draftWrite: { kind: "draft" },
  });

  assert.deepEqual(
    calls.map((entry) => `set:${entry.name}`),
    ["set:publication", "set:draft"]
  );
  assert.deepEqual(calls[0].options, { merge: true });
  assert.deepEqual(calls[1].options, { merge: true });
});

test("executePlannedDraftWriteIfExists skips missing drafts and writes existing drafts with merge", async () => {
  const missingCalls = [];
  const missingDraftRef = {
    async get() {
      missingCalls.push("get");
      return { exists: false };
    },
    async set(payload, options) {
      missingCalls.push({ payload, options });
    },
  };

  const missingResult = await executePlannedDraftWriteIfExists({
    draftRef: missingDraftRef,
    draftWrite: { kind: "draft" },
  });

  assert.equal(missingResult, false);
  assert.deepEqual(missingCalls, ["get"]);

  const existingCalls = [];
  const existingDraftRef = {
    async get() {
      existingCalls.push("get");
      return { exists: true };
    },
    async set(payload, options) {
      existingCalls.push({ payload, options });
    },
  };

  const existingResult = await executePlannedDraftWriteIfExists({
    draftRef: existingDraftRef,
    draftWrite: { kind: "draft" },
  });

  assert.equal(existingResult, true);
  assert.deepEqual(existingCalls, [
    "get",
    { payload: { kind: "draft" }, options: { merge: true } },
  ]);
});

test("executeApprovedSessionOutcomeEffects writes session first and then applies reservation cleanup", async () => {
  const calls = [];
  const sessionRef = createMergeSetRef("session", calls);

  await executeApprovedSessionOutcomeEffects({
    sessionRef,
    sessionWrite: { kind: "session" },
    reservationUpdate: {
      slug: "mi-slug",
      sessionId: "session-1",
      nextStatus: "consumed",
    },
    async updateReservationStatus(update) {
      calls.push({ type: "reservation-update", update });
    },
  });

  assert.deepEqual(calls, [
    { type: "set", name: "session", payload: { kind: "session" }, options: { merge: true } },
    {
      type: "reservation-update",
      update: {
        slug: "mi-slug",
        sessionId: "session-1",
        nextStatus: "consumed",
      },
    },
  ]);
});

test("executeApprovedSessionOutcomeEffects skips reservation work when no update was planned", async () => {
  const calls = [];
  const sessionRef = createMergeSetRef("session", calls);

  await executeApprovedSessionOutcomeEffects({
    sessionRef,
    sessionWrite: { kind: "session" },
  });

  assert.deepEqual(calls, [
    { type: "set", name: "session", payload: { kind: "session" }, options: { merge: true } },
  ]);
});

test("executePlannedTrashedPublicationPurge keeps delete, reset, and reservation cleanup order", async () => {
  const calls = [];

  await executePlannedTrashedPublicationPurge({
    plan: {
      slug: "mi-slug",
      storagePrefix: "publicadas/mi-slug/",
      draftResetRequests: [
        { draftSlug: "borrador-1" },
        { draftSlug: "borrador-2" },
      ],
    },
    publicationRef: { id: "publication-ref" },
    async deleteStoragePrefix(prefix) {
      calls.push({ type: "delete-storage", prefix });
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request });
      return true;
    },
    async deleteReservation(slug) {
      calls.push({ type: "delete-reservation", slug });
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(calls, [
    { type: "delete-storage", prefix: "publicadas/mi-slug/" },
    { type: "recursive-delete", ref: { id: "publication-ref" } },
    { type: "reset-draft", request: { draftSlug: "borrador-1" } },
    { type: "reset-draft", request: { draftSlug: "borrador-2" } },
    { type: "delete-reservation", slug: "mi-slug" },
  ]);
});

test("executePlannedTrashedPublicationPurge keeps current warning-swallow behavior for storage and reservation deletes", async () => {
  const calls = [];

  await executePlannedTrashedPublicationPurge({
    plan: {
      slug: "mi-slug",
      storagePrefix: "publicadas/mi-slug/",
      draftResetRequests: [{ draftSlug: "borrador-1" }],
    },
    publicationRef: { id: "publication-ref" },
    async deleteStoragePrefix() {
      calls.push({ type: "delete-storage" });
      throw new Error("storage failed");
    },
    async recursiveDelete() {
      calls.push({ type: "recursive-delete" });
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request });
      return true;
    },
    async deleteReservation() {
      calls.push({ type: "delete-reservation" });
      throw new Error("reservation failed");
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.type),
    ["delete-storage", "warn", "recursive-delete", "reset-draft", "delete-reservation", "warn"]
  );
  assert.deepEqual(
    calls
      .filter((entry) => entry.type === "warn")
      .map((entry) => entry.message),
    [
      "No se pudieron borrar archivos publicados durante purga de papelera",
      "No se pudo borrar reserva de slug durante purga de papelera",
    ]
  );
});

test("executePlannedLegacyPublicationCleanup keeps storage, active delete, history delete, draft reset, and reservation order", async () => {
  const calls = [];

  const result = await executePlannedLegacyPublicationCleanup({
    plan: {
      slug: "mi-slug",
      uid: "user-1",
      storagePrefix: "publicadas/mi-slug/",
      draftResetRequests: [
        { draftSlug: "borrador-1", uid: "user-1" },
        { draftSlug: "borrador-2", uid: "user-1" },
      ],
      shouldDeleteActivePublication: true,
    },
    publicationRef: { id: "publication-ref" },
    async deleteStoragePrefix(prefix) {
      calls.push({ type: "delete-storage", prefix });
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    async deleteHistoryDocs() {
      calls.push({ type: "delete-history" });
      return 3;
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request });
      return request.draftSlug === "borrador-2";
    },
    async deleteReservationIfExists(slug) {
      calls.push({ type: "delete-reservation", slug });
      return true;
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(calls, [
    { type: "delete-storage", prefix: "publicadas/mi-slug/" },
    { type: "recursive-delete", ref: { id: "publication-ref" } },
    { type: "delete-history" },
    { type: "reset-draft", request: { draftSlug: "borrador-1", uid: "user-1" } },
    { type: "reset-draft", request: { draftSlug: "borrador-2", uid: "user-1" } },
    { type: "delete-reservation", slug: "mi-slug" },
  ]);
  assert.deepEqual(result, {
    deletedStoragePrefix: true,
    deletedActivePublication: true,
    deletedHistoryDocs: 3,
    cleanedDrafts: 1,
    removedReservation: true,
  });
});

test("executePlannedLegacyPublicationCleanup keeps hard-delete storage warning behavior and skips active delete when not planned", async () => {
  const calls = [];

  const result = await executePlannedLegacyPublicationCleanup({
    plan: {
      slug: "mi-slug",
      uid: "user-1",
      storagePrefix: "publicadas/mi-slug/",
      draftResetRequests: [],
      shouldDeleteActivePublication: false,
    },
    publicationRef: null,
    async deleteStoragePrefix() {
      calls.push({ type: "delete-storage" });
      throw new Error("storage failed");
    },
    async recursiveDelete(ref) {
      calls.push({ type: "recursive-delete", ref });
    },
    async deleteHistoryDocs() {
      calls.push({ type: "delete-history" });
      return 0;
    },
    async resetDraftLinks(request) {
      calls.push({ type: "reset-draft", request });
      return false;
    },
    async deleteReservationIfExists(slug) {
      calls.push({ type: "delete-reservation", slug });
      return false;
    },
    warn(message, context) {
      calls.push({ type: "warn", message, context });
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.type),
    ["delete-storage", "warn", "delete-history", "delete-reservation"]
  );
  assert.deepEqual(calls[1], {
    type: "warn",
    message: "No se pudieron borrar archivos publicados en hard-delete legacy",
    context: {
      slug: "mi-slug",
      uid: "user-1",
      error: "storage failed",
    },
  });
  assert.deepEqual(result, {
    deletedStoragePrefix: false,
    deletedActivePublication: false,
    deletedHistoryDocs: 0,
    cleanedDrafts: 0,
    removedReservation: false,
  });
});
