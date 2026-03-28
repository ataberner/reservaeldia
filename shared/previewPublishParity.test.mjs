import test from "node:test";
import assert from "node:assert/strict";

import publicationPublishValidationModule from "../functions/lib/payments/publicationPublishValidation.js";
import { installFirebaseStorageMock } from "../functions/testUtils/firebaseStorageMock.mjs";
import {
  createPublishValidationImageDownloadBuffer,
} from "./publicationPublishValidationFixtures.mjs";
import {
  FIXTURE_PATHS,
} from "./renderAssetContractFixtures.mjs";
import {
  characterizePreviewPublishParity,
} from "./previewPublishParity.mjs";
import {
  PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
  previewPublishExplicitDriftFixtures,
  previewPublishSharedParityFixtures,
  previewPublishWarningParityFixtures,
} from "./previewPublishParityFixtures.mjs";

const { validatePreparedPublicationRenderState } = publicationPublishValidationModule;

function createRepresentativeStorageFiles() {
  return {
    [FIXTURE_PATHS.heroImage]: {
      downloadBuffer: createPublishValidationImageDownloadBuffer(),
    },
    [FIXTURE_PATHS.rasterIcon]: {},
    [FIXTURE_PATHS.galleryOne]: {},
    [FIXTURE_PATHS.galleryTwo]: {},
    [FIXTURE_PATHS.galleryThree]: {},
    [FIXTURE_PATHS.sectionBackground]: {},
    [FIXTURE_PATHS.decorTop]: {},
    [FIXTURE_PATHS.decorBottom]: {},
    [FIXTURE_PATHS.countdownFrame]: {},
  };
}

function collectIssueCodes(issues) {
  return [...issues].map((issue) => issue.code).sort();
}

function validatePreparedSnapshot(prepared) {
  return validatePreparedPublicationRenderState({
    rawObjetos: prepared.draftRenderState.objetos,
    rawSecciones: prepared.draftRenderState.secciones,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    rawRsvp: prepared.draftRenderState.rsvp,
    rawGifts: prepared.draftRenderState.gifts,
    functionalCtaContract: prepared.functionalCtaContract,
  });
}

test("preview/publish shared parity fixtures stay logically aligned across the prepared boundary", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  for (const fixture of previewPublishSharedParityFixtures) {
    await t.test(fixture.id, async () => {
      const parity = await characterizePreviewPublishParity(
        fixture.previewDraft,
        fixture.publishDraft,
        {
          defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
        }
      );

      assert.deepEqual(parity.mismatchCodes, fixture.expectedMismatchCodes);
    });
  }
});

test("preview/publish explicit drift fixtures stay visible until a future parity refactor changes them on purpose", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  for (const fixture of previewPublishExplicitDriftFixtures) {
    await t.test(fixture.id, async () => {
      const parity = await characterizePreviewPublishParity(
        fixture.previewDraft,
        fixture.publishDraft,
        {
          defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
        }
      );

      assert.deepEqual(parity.mismatchCodes, fixture.expectedMismatchCodes);
    });
  }
});

test("warning-only preview/publish parity fixtures keep warning-sensitive branches out of hard parity mismatches", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  for (const fixture of previewPublishWarningParityFixtures) {
    await t.test(fixture.id, async () => {
      const parity = await characterizePreviewPublishParity(
        fixture.previewDraft,
        fixture.publishDraft,
        {
          defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
        }
      );
      const validation = validatePreparedSnapshot(parity.publishSnapshot.prepared);
      const warningCodes = collectIssueCodes(validation.warnings);

      assert.deepEqual(parity.mismatchCodes, fixture.expectedMismatchCodes);
      fixture.expectedValidationWarningCodes.forEach((code) => {
        assert.equal(
          warningCodes.includes(code),
          true,
          `Expected publish warning code '${code}' to stay active`
        );
      });
      assert.equal(validation.blockers.length, 0);
    });
  }
});
