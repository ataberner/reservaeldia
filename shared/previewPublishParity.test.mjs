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
  buildDashboardPreviewRenderPayload,
} from "../src/domain/dashboard/previewSession.js";
import {
  PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
  previewPublishExplicitDriftFixtures,
  previewPublishSharedParityFixtures,
  previewPublishWarningParityFixtures,
} from "./previewPublishParityFixtures.mjs";
import generarHTMLDesdeSeccionesModule from "../functions/lib/utils/generarHTMLDesdeSecciones.js";

const { validatePreparedPublicationRenderState } = publicationPublishValidationModule;
const { generarHTMLDesdeSecciones } = generarHTMLDesdeSeccionesModule;

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

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, deepClone(entry)])
  );
}

function withGalleryPresetFields(draft, galleryId, presetFields) {
  const next = deepClone(draft);
  next.objetos = (next.objetos || []).map((objeto) => {
    if (objeto?.id !== galleryId) return objeto;
    return {
      ...objeto,
      ...presetFields,
    };
  });
  return next;
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

function readHtmlAttr(segment, attrName) {
  const match = String(segment || "").match(
    new RegExp(`${attrName}="([^"]*)"`)
  );
  return match ? match[1] : "";
}

function collectGalleryMarkerSnapshot(html) {
  return Array.from(
    String(html || "").matchAll(
      /<div class="galeria-celda galeria-celda--clickable"[\s\S]*?<\/div>/g
    )
  ).map((match) => {
    const segment = match[0];
    return {
      galleryId: readHtmlAttr(segment, "data-gallery-id"),
      cellIndex: readHtmlAttr(segment, "data-gallery-cell-index"),
      cellId: readHtmlAttr(segment, "data-gallery-cell-id"),
      mediaKey: readHtmlAttr(segment, "data-gallery-media-key"),
    };
  });
}

function stripGalleryMediaKeys(snapshot) {
  return snapshot.map(({ mediaKey: _mediaKey, ...entry }) => entry);
}

function renderPreviewHtml(draft) {
  const payload = buildDashboardPreviewRenderPayload(draft);
  return generarHTMLDesdeSecciones(
    payload.secciones,
    payload.objetos,
    payload.rsvpPreviewConfig,
    {
      gifts: payload.giftPreviewConfig,
      rsvpSource: payload.rawRsvp,
      giftsSource: payload.rawGifts,
      isPreview: true,
    }
  );
}

function renderPublishHtml(prepared) {
  return generarHTMLDesdeSecciones(
    prepared.seccionesFinales,
    prepared.objetosFinales,
    prepared.functionalCtaContract.rsvp.config,
    {
      gifts: prepared.functionalCtaContract.gifts.config,
      functionalCtaContract: prepared.functionalCtaContract,
    }
  );
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

test("preview/publish generated gallery markers stay aligned for the global viewer", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const fixture = previewPublishSharedParityFixtures[0];
  const parity = await characterizePreviewPublishParity(
    fixture.previewDraft,
    fixture.publishDraft,
    {
      defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    }
  );
  const previewHtml = renderPreviewHtml(fixture.previewDraft);
  const publishHtml = renderPublishHtml(parity.publishSnapshot.prepared);
  const previewMarkers = collectGalleryMarkerSnapshot(previewHtml);
  const publishMarkers = collectGalleryMarkerSnapshot(publishHtml);

  assert.deepEqual(
    stripGalleryMediaKeys(previewMarkers),
    stripGalleryMediaKeys(publishMarkers)
  );
  assert.ok(previewMarkers.length > 0, "Expected preview Gallery markers");
  assert.ok(publishMarkers.length > 0, "Expected publish Gallery markers");
  previewMarkers.forEach((marker) => {
    assert.notEqual(marker.mediaKey, "", "Preview marker must include media key");
  });
  publishMarkers.forEach((marker) => {
    assert.notEqual(marker.mediaKey, "", "Publish marker must include media key");
  });
  assert.match(previewHtml, /function collectGlobalGalleryItems\(\)/);
  assert.match(publishHtml, /function collectGlobalGalleryItems\(\)/);
});

test("preview/publish preset Gallery visibility stays aligned", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const fixture = previewPublishSharedParityFixtures[0];
  const presetFields = {
    rows: 2,
    cols: 2,
    allowedLayouts: ["banner", "squares"],
    defaultLayout: "squares",
    currentLayout: "banner",
  };
  const previewDraft = withGalleryPresetFields(
    fixture.previewDraft,
    "gallery-main",
    presetFields
  );
  const publishDraft = withGalleryPresetFields(
    fixture.publishDraft,
    "gallery-main",
    presetFields
  );
  const parity = await characterizePreviewPublishParity(previewDraft, publishDraft, {
    defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
  });
  const previewHtml = renderPreviewHtml(previewDraft);
  const publishHtml = renderPublishHtml(parity.publishSnapshot.prepared);
  const previewMarkers = collectGalleryMarkerSnapshot(previewHtml);
  const publishMarkers = collectGalleryMarkerSnapshot(publishHtml);

  assert.deepEqual(parity.mismatchCodes, []);
  assert.equal(previewMarkers.length, 1);
  assert.equal(publishMarkers.length, 1);
  assert.deepEqual(
    stripGalleryMediaKeys(previewMarkers),
    stripGalleryMediaKeys(publishMarkers)
  );
  assert.match(previewHtml, /grid-template-columns: repeat\(1, 1fr\)/);
  assert.match(publishHtml, /grid-template-columns: repeat\(1, 1fr\)/);
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
