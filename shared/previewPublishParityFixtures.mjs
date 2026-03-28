import {
  FIXTURE_BUCKET,
  createRepresentativePreviewPreparationStageState,
} from "./renderAssetContractFixtures.mjs";
import {
  createRepresentativeCompatibilityWarningDraftFixture,
  createRepresentativeGiftNoUsableMethodsDraftFixture,
  createRepresentativePublishReadyDraftFixture,
} from "./publicationPublishValidationFixtures.mjs";

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    next[key] = deepClone(nestedValue);
  });
  return next;
}

function pickAssetFields(source, keys) {
  const next = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
      next[key] = deepClone(source[key]);
    }
  });
  return next;
}

function mergePreviewAssetsIntoDraft(draft) {
  const baseDraft = deepClone(draft);
  const previewStageState = createRepresentativePreviewPreparationStageState();
  const previewObjectById = new Map(
    (previewStageState.objetos || []).map((entry) => [entry?.id, entry])
  );
  const previewSectionById = new Map(
    (previewStageState.secciones || []).map((entry) => [entry?.id, entry])
  );

  return {
    ...baseDraft,
    objetos: (baseDraft.objetos || []).map((entry) => {
      const previewObject = previewObjectById.get(entry?.id);
      if (!previewObject) return entry;

      const assetFields = pickAssetFields(previewObject, [
        "src",
        "url",
        "storagePath",
        "cells",
        "frameSvgUrl",
      ]);
      return {
        ...entry,
        ...assetFields,
      };
    }),
    secciones: (baseDraft.secciones || []).map((entry) => {
      const previewSection = previewSectionById.get(entry?.id);
      if (!previewSection) return entry;

      const assetFields = pickAssetFields(previewSection, [
        "fondoImagen",
        "decoracionesFondo",
      ]);
      return {
        ...entry,
        ...assetFields,
      };
    }),
  };
}

function removeHeroCrop(draft) {
  return {
    ...deepClone(draft),
    objetos: (draft?.objetos || []).map((entry) => {
      if (entry?.id !== "hero-image") return deepClone(entry);
      const next = { ...entry };
      delete next.cropX;
      delete next.cropY;
      delete next.cropWidth;
      delete next.cropHeight;
      return next;
    }),
  };
}

function clearPreviewHeroAsset(draft) {
  return {
    ...deepClone(draft),
    objetos: (draft?.objetos || []).map((entry) => {
      if (entry?.id !== "hero-image") return deepClone(entry);
      const next = { ...entry };
      delete next.src;
      delete next.url;
      delete next.storagePath;
      return next;
    }),
  };
}

function removeRootConfig(draft, rootKey) {
  const next = deepClone(draft);
  delete next[rootKey];
  return next;
}

function withRsvpModalTitle(draft, nextTitle) {
  const next = deepClone(draft);
  next.rsvp = {
    ...(next.rsvp || {}),
    modal: {
      ...((next.rsvp && next.rsvp.modal) || {}),
      title: nextTitle,
    },
  };
  return next;
}

function withGiftAlias(draft, nextAlias) {
  const next = deepClone(draft);
  next.gifts = {
    ...(next.gifts || {}),
    bank: {
      ...((next.gifts && next.gifts.bank) || {}),
      alias: nextAlias,
    },
  };
  return next;
}

const sharedParityBaseDraft = removeHeroCrop(createRepresentativePublishReadyDraftFixture());
const sharedParityHydratedPreviewDraft = mergePreviewAssetsIntoDraft(sharedParityBaseDraft);
const warningBaseDraft = removeHeroCrop(
  createRepresentativeCompatibilityWarningDraftFixture()
);
const missingRsvpRootBaseDraft = removeRootConfig(sharedParityBaseDraft, "rsvp");
const missingRsvpRootPreviewDraft = mergePreviewAssetsIntoDraft(missingRsvpRootBaseDraft);
const giftNoUsableMethodsBaseDraft = removeHeroCrop(
  createRepresentativeGiftNoUsableMethodsDraftFixture()
);
const giftNoUsableMethodsPreviewDraft = mergePreviewAssetsIntoDraft(
  giftNoUsableMethodsBaseDraft
);

export const PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET = FIXTURE_BUCKET;

export const previewPublishSharedParityFixtures = Object.freeze([
  {
    id: "preview-publish-hydrated-asset-parity",
    previewDraft: sharedParityHydratedPreviewDraft,
    publishDraft: sharedParityBaseDraft,
    expectedMismatchCodes: [],
  },
  {
    id: "preview-publish-storage-alias-parity",
    previewDraft: sharedParityBaseDraft,
    publishDraft: sharedParityBaseDraft,
    expectedMismatchCodes: [],
  },
]);

export const previewPublishExplicitDriftFixtures = Object.freeze([
  {
    id: "preview-publish-image-crop-materialization-drift",
    previewDraft: mergePreviewAssetsIntoDraft(createRepresentativePublishReadyDraftFixture()),
    publishDraft: createRepresentativePublishReadyDraftFixture(),
    expectedMismatchCodes: ["image-crop-materialization"],
  },
  {
    id: "preview-publish-preview-asset-unresolved-drift",
    previewDraft: clearPreviewHeroAsset(sharedParityBaseDraft),
    publishDraft: sharedParityBaseDraft,
    expectedMismatchCodes: ["object-asset-identity"],
  },
  {
    id: "preview-publish-rsvp-config-drift",
    previewDraft: withRsvpModalTitle(
      sharedParityHydratedPreviewDraft,
      "Confirmacion con copy alternativo"
    ),
    publishDraft: sharedParityBaseDraft,
    expectedMismatchCodes: ["rsvp-config-contract"],
  },
  {
    id: "preview-publish-gifts-config-drift",
    previewDraft: withGiftAlias(
      sharedParityHydratedPreviewDraft,
      "alias.preview.diferente"
    ),
    publishDraft: sharedParityBaseDraft,
    expectedMismatchCodes: ["gifts-config-contract"],
  },
]);

export const previewPublishWarningParityFixtures = Object.freeze([
  {
    id: "preview-publish-warning-only-parity",
    previewDraft: mergePreviewAssetsIntoDraft(warningBaseDraft),
    publishDraft: warningBaseDraft,
    expectedMismatchCodes: [],
    expectedValidationWarningCodes: [
      "pantalla-ynorm-missing",
      "pantalla-ynorm-drift",
      "fullbleed-editor-drift",
    ],
  },
  {
    id: "preview-publish-missing-rsvp-root-parity",
    previewDraft: missingRsvpRootPreviewDraft,
    publishDraft: missingRsvpRootBaseDraft,
    expectedMismatchCodes: [],
    expectedValidationWarningCodes: ["rsvp-missing-root-config"],
  },
  {
    id: "preview-publish-gift-no-usable-methods-parity",
    previewDraft: giftNoUsableMethodsPreviewDraft,
    publishDraft: giftNoUsableMethodsBaseDraft,
    expectedMismatchCodes: [],
    expectedValidationWarningCodes: ["gift-no-usable-methods"],
  },
]);
