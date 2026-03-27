import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  preparePublicationStateTransitionFlow,
} = requireBuiltModule("lib/payments/publicationStateTransitionFlow.js");

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

function createPublicationSnapshot(createTime = "2025-05-01T10:00:00.000Z") {
  return {
    createTime: createTimestampLike(createTime),
  };
}

function createTransition(overrides = {}) {
  return preparePublicationStateTransitionFlow({
    slug: "mi-slug",
    action: "pause",
    publicationData: {
      estado: "publicada_activa",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
    },
    publicationSnap: createPublicationSnapshot(),
    linkedDraftSlug: "borrador-1",
    now: new Date("2026-03-27T09:00:00.000Z"),
    createActiveUpdatedAtValue() {
      return { sentinel: "active-updated" };
    },
    createDraftUpdatedAtValue() {
      return { sentinel: "draft-updated" };
    },
    ...overrides,
  });
}

test("preparePublicationStateTransitionFlow pauses an active publication", () => {
  const prepared = createTransition();

  assert.equal(prepared.linkedDraftSlug, "borrador-1");
  assert.equal(prepared.activePublicationWrite.estado, "publicada_pausada");
  assert.equal(
    prepared.result.publicadaAt,
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    prepared.result.venceAt,
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal(
    prepared.result.pausadaAt,
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(prepared.result.enPapeleraAt, null);
  assert.ok(prepared.draftWrite);
  assert.equal(prepared.draftWrite.slugPublico, "mi-slug");
});

test("preparePublicationStateTransitionFlow resumes a paused publication before expiration", () => {
  const prepared = createTransition({
    action: "resume",
    publicationData: {
      estado: "publicada_pausada",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      pausadaAt: "2026-03-20T09:00:00.000Z",
    },
  });

  assert.equal(prepared.activePublicationWrite.estado, "publicada_activa");
  assert.equal(prepared.result.estado, "publicada_activa");
  assert.equal(prepared.result.pausadaAt, null);
  assert.equal(prepared.result.enPapeleraAt, null);
});

test("preparePublicationStateTransitionFlow moves a paused publication to trash", () => {
  const prepared = createTransition({
    action: "move_to_trash",
    publicationData: {
      estado: "publicada_pausada",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      pausadaAt: "2026-03-20T09:00:00.000Z",
    },
  });

  assert.equal(prepared.activePublicationWrite.estado, "papelera");
  assert.equal(prepared.result.estado, "papelera");
  assert.equal(prepared.result.pausadaAt, "2026-03-27T09:00:00.000Z");
  assert.equal(prepared.result.enPapeleraAt, "2026-03-27T09:00:00.000Z");
});

test("preparePublicationStateTransitionFlow restores a trashed publication to paused", () => {
  const prepared = createTransition({
    action: "restore_from_trash",
    publicationData: {
      estado: "papelera",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      enPapeleraAt: "2026-03-20T09:00:00.000Z",
    },
  });

  assert.equal(prepared.activePublicationWrite.estado, "publicada_pausada");
  assert.equal(prepared.result.estado, "publicada_pausada");
  assert.equal(prepared.result.pausadaAt, "2026-03-27T09:00:00.000Z");
  assert.equal(prepared.result.enPapeleraAt, null);
});

test("preparePublicationStateTransitionFlow rejects finalized publications with the current message", () => {
  assert.throws(
    () =>
      createTransition({
        publicationData: {
          estado: "finalizada",
        },
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "failed-precondition");
      assert.equal(error.message, "La invitacion ya esta finalizada.");
      return true;
    }
  );
});

test("preparePublicationStateTransitionFlow rejects incompatible public states with the current message", () => {
  assert.throws(
    () =>
      createTransition({
        publicationData: {
          estado: "draft",
        },
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "failed-precondition");
      assert.equal(
        error.message,
        "La publicacion no tiene un estado compatible para esta accion."
      );
      return true;
    }
  );
});

test("preparePublicationStateTransitionFlow rejects resume when the invitation is already expired", () => {
  assert.throws(
    () =>
      createTransition({
        action: "resume",
        publicationData: {
          estado: "publicada_pausada",
          publicadaAt: "2025-05-01T10:00:00.000Z",
          vigenteHasta: "2026-03-27T09:00:00.000Z",
        },
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "failed-precondition");
      assert.equal(
        error.message,
        "La invitacion ya vencio y no puede reanudarse."
      );
      return true;
    }
  );
});

test("preparePublicationStateTransitionFlow uses publicationSnap.createTime as first-published fallback", () => {
  const prepared = createTransition({
    publicationData: {
      estado: "publicada_activa",
    },
    publicationSnap: createPublicationSnapshot("2024-12-01T15:30:00.000Z"),
  });

  assert.equal(prepared.result.publicadaAt, "2024-12-01T15:30:00.000Z");
  assert.equal(prepared.activePublicationWrite.estado, "publicada_pausada");
});

test("preparePublicationStateTransitionFlow keeps stored expiration precedence and ignores lifecycle expiration fallback", () => {
  const prepared = createTransition({
    action: "resume",
    publicationData: {
      estado: "publicada_pausada",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      publicationLifecycle: {
        expiresAt: createTimestampLike("2030-01-01T00:00:00.000Z"),
      },
    },
  });

  assert.equal(prepared.result.venceAt, "2026-05-01T10:00:00.000Z");
});

test("preparePublicationStateTransitionFlow keeps draftWrite null when linkedDraftSlug is empty", () => {
  const prepared = createTransition({
    linkedDraftSlug: "   ",
  });

  assert.equal(prepared.linkedDraftSlug, "");
  assert.equal(prepared.draftWrite, null);
});
