import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DRAFT_STATES as FRONTEND_DRAFT_STATES,
  DRAFT_TRASH_RETENTION_DAYS as FRONTEND_DRAFT_TRASH_RETENTION_DAYS,
  resolveDraftState,
  isDraftTrashed,
  computeDraftTrashPurgeAt,
} from "../src/domain/drafts/state.js";
import {
  resolveDraftLinkedPublicSlug,
  resolveDraftPublicationLifecycleState,
} from "../src/domain/invitations/readResolution.js";
import {
  PUBLICATION_STATES as FRONTEND_PUBLICATION_STATES,
  TRASH_RETENTION_DAYS as FRONTEND_PUBLICATION_TRASH_RETENTION_DAYS,
  computeTrashPurgeAt as computeFrontendTrashPurgeAt,
  resolvePublicationState,
  getPublicationStatus,
  isPublicationExpired,
  isPublicSlugAvailableForVisitors,
} from "../src/domain/publications/state.js";
import {
  FIXED_NOW_MS,
  draftTrashParityFixtures,
  draftPublicationLinkageParityFixtures,
  publicationParityFixtures,
  publicationSemanticDriftFixtures,
} from "./lifecycleParityFixtures.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const functionsRequire = createRequire(
  join(__dirname, "../functions/package.json")
);
const admin = functionsRequire("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "lifecycle-parity-test",
    storageBucket: "lifecycle-parity-test.appspot.com",
  });
}

function requireBuiltModule(relativePath) {
  const absolutePath = join(__dirname, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing built module '${relativePath}'. Run 'npm run build' inside functions before running this test.`
    );
  }
  return functionsRequire(absolutePath);
}

const {
  DRAFT_STATES: BACKEND_DRAFT_STATES,
  DRAFT_TRASH_RETENTION_DAYS: BACKEND_DRAFT_TRASH_RETENTION_DAYS,
  resolveDraftStateFromData,
} = requireBuiltModule("../functions/lib/drafts/draftTrashLifecycle.js");

const {
  PUBLICATION_PUBLIC_STATES,
  PUBLICATION_TRASH_RETENTION_DAYS,
  resolveDraftLinkedPublicSlugFromData,
  resolveDraftPublicationLifecycleStateFromData,
  resolvePublicationLifecycleSnapshotFromData,
} = requireBuiltModule("../functions/lib/payments/publicationLifecycle.js");

function toIsoOrNull(value) {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readFrontendDraftTrashSnapshot(draft) {
  return {
    state: resolveDraftState(draft),
    isTrashed: isDraftTrashed(draft),
    purgeAtIso: toIsoOrNull(computeDraftTrashPurgeAt(draft)),
  };
}

function readBackendDraftTrashSnapshot(draft) {
  const state = resolveDraftStateFromData(draft);
  return {
    state,
    isTrashed: state === BACKEND_DRAFT_STATES.TRASH,
  };
}

function readFrontendDraftPublicationLinkageSnapshot(draft) {
  return {
    linkedPublicSlug: resolveDraftLinkedPublicSlug(draft),
    lifecycleState: resolveDraftPublicationLifecycleState(draft),
  };
}

function readBackendDraftPublicationLinkageSnapshot(draft) {
  return {
    linkedPublicSlug: resolveDraftLinkedPublicSlugFromData(draft),
    lifecycleState: resolveDraftPublicationLifecycleStateFromData(draft),
  };
}

function readFrontendPublicationSnapshot(publication) {
  const resolvedState = resolvePublicationState(publication);
  const status = getPublicationStatus(publication, FIXED_NOW_MS);
  const trashPurgeAtIso = status.isTrashed
    ? toIsoOrNull(computeFrontendTrashPurgeAt(publication))
    : null;

  return {
    rawPublicState:
      resolvedState === FRONTEND_PUBLICATION_STATES.FINALIZED ? null : resolvedState,
    effectiveState: status.state,
    isFinalized: status.isFinalized,
    isDateExpired: isPublicationExpired(publication, FIXED_NOW_MS),
    isVisitorAccessible: isPublicSlugAvailableForVisitors(publication, FIXED_NOW_MS),
    trashPurgeAtIso,
  };
}

function readBackendPublicationSnapshot(publication) {
  const lifecycleSnapshot = resolvePublicationLifecycleSnapshotFromData(publication, {
    now: new Date(FIXED_NOW_MS),
  });
  const isHistoryLinked = normalizeText(publication?.source) === "history";
  const isFinalized = isHistoryLinked || lifecycleSnapshot.isExpired;

  return {
    rawPublicState: lifecycleSnapshot.rawPublicState,
    effectiveState: isFinalized
      ? FRONTEND_PUBLICATION_STATES.FINALIZED
      : lifecycleSnapshot.rawPublicState,
    isFinalized,
    isDateExpired: lifecycleSnapshot.isDateExpired,
    isVisitorAccessible: lifecycleSnapshot.isPubliclyAccessibleByState && !isFinalized,
    trashPurgeAtIso: toIsoOrNull(lifecycleSnapshot.trashPurgeAt),
  };
}

test("draft lifecycle constants stay aligned across frontend and backend", () => {
  assert.equal(FRONTEND_DRAFT_STATES.ACTIVE, BACKEND_DRAFT_STATES.ACTIVE);
  assert.equal(FRONTEND_DRAFT_STATES.TRASH, BACKEND_DRAFT_STATES.TRASH);
  assert.equal(
    FRONTEND_DRAFT_TRASH_RETENTION_DAYS,
    BACKEND_DRAFT_TRASH_RETENTION_DAYS
  );
});

test("publication lifecycle overlapping constants stay aligned across frontend and backend", () => {
  assert.equal(
    FRONTEND_PUBLICATION_STATES.ACTIVE,
    PUBLICATION_PUBLIC_STATES.ACTIVE
  );
  assert.equal(
    FRONTEND_PUBLICATION_STATES.PAUSED,
    PUBLICATION_PUBLIC_STATES.PAUSED
  );
  assert.equal(
    FRONTEND_PUBLICATION_STATES.TRASH,
    PUBLICATION_PUBLIC_STATES.TRASH
  );
  assert.equal(
    FRONTEND_PUBLICATION_TRASH_RETENTION_DAYS,
    PUBLICATION_TRASH_RETENTION_DAYS
  );
});

test("draft trash lifecycle fixtures stay in frontend/backend parity", async (t) => {
  for (const fixture of draftTrashParityFixtures) {
    await t.test(fixture.id, () => {
      const frontend = readFrontendDraftTrashSnapshot(fixture.draft);
      const backend = readBackendDraftTrashSnapshot(fixture.draft);
      const expectedShared = {
        state: fixture.expected.state,
        isTrashed: fixture.expected.isTrashed,
      };

      assert.deepEqual(frontend, fixture.expected);
      assert.deepEqual(backend, expectedShared);
      assert.equal(frontend.state, backend.state);
      assert.equal(frontend.isTrashed, backend.isTrashed);
      assert.equal(frontend.purgeAtIso, fixture.expected.purgeAtIso);
    });
  }
});

test("draft publication linkage fixtures stay in frontend/backend parity", async (t) => {
  for (const fixture of draftPublicationLinkageParityFixtures) {
    await t.test(fixture.id, () => {
      const frontend = readFrontendDraftPublicationLinkageSnapshot(fixture.draft);
      const backend = readBackendDraftPublicationLinkageSnapshot(fixture.draft);

      assert.deepEqual(frontend, fixture.expected);
      assert.deepEqual(backend, fixture.expected);
    });
  }
});

test("publication lifecycle parity fixtures keep current shared semantics frozen", async (t) => {
  for (const fixture of publicationParityFixtures) {
    await t.test(fixture.id, () => {
      const frontend = readFrontendPublicationSnapshot(fixture.publication);
      const backend = readBackendPublicationSnapshot(fixture.publication);

      assert.deepEqual(frontend, fixture.expected);
      assert.deepEqual(backend, fixture.expected);
    });
  }
});

test("publication lifecycle drift fixtures stay explicit until refactor work begins", async (t) => {
  for (const fixture of publicationSemanticDriftFixtures) {
    await t.test(fixture.id, () => {
      const frontend = readFrontendPublicationSnapshot(fixture.publication);
      const backend = readBackendPublicationSnapshot(fixture.publication);

      assert.deepEqual(frontend, fixture.frontendExpected);
      assert.deepEqual(backend, fixture.backendExpected);
      assert.notDeepEqual(frontend, backend);
    });
  }
});
