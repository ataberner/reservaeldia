import publicationPublishValidationModule from "../functions/lib/payments/publicationPublishValidation.js";
import functionalCtaContractModule from "../functions/lib/utils/functionalCtaContract.js";
import publishImageCropModule from "../functions/lib/utils/publishImageCrop.js";
import sectionBackgroundModule from "../functions/lib/utils/sectionBackground.js";
import storageAssetValueModule from "../functions/lib/utils/storageAssetValue.js";
import { buildDashboardPreviewRenderPayload } from "../src/domain/dashboard/previewSession.js";
import {
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
  resolveSectionDecorationAssetUrl,
} from "./renderAssetContract.js";

const { preparePublicationRenderState } = publicationPublishValidationModule;
const { resolveFunctionalCtaContract } = functionalCtaContractModule;
const { resolvePublishImageCropState } = publishImageCropModule;
const { normalizeSectionBackgroundModel } = sectionBackgroundModule;
const {
  normalizeStoragePathCandidate,
  parseBucketAndPathFromStorageValue,
} = storageAssetValueModule;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortSections(secciones) {
  return [...(Array.isArray(secciones) ? secciones : [])].sort((left, right) => {
    const leftOrder = Number(left?.orden ?? 0);
    const rightOrder = Number(right?.orden ?? 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return normalizeText(left?.id).localeCompare(normalizeText(right?.id));
  });
}

function stableJson(value) {
  return JSON.stringify(value);
}

function toComparableSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  return JSON.parse(JSON.stringify(value));
}

function pickCtaBranchSnapshot(branch, extraKeys = []) {
  return {
    buttonPresent: branch?.buttonPresent === true,
    rootPresent: branch?.rootPresent === true,
    enabled:
      typeof branch?.enabled === "boolean" ? branch.enabled : branch?.enabled ?? null,
    ready: branch?.ready === true,
    unavailable: branch?.unavailable === true,
    reason: normalizeText(branch?.reason) || "no-button",
    ...Object.fromEntries(
      extraKeys.map((key) => [
        key,
        typeof branch?.[key] === "boolean" ? branch[key] : branch?.[key] ?? null,
      ])
    ),
  };
}

function buildFunctionalCtaSnapshot(contract) {
  return {
    rsvp: pickCtaBranchSnapshot(contract?.rsvp),
    gifts: pickCtaBranchSnapshot(contract?.gifts, ["hasUsableMethods"]),
  };
}

function canonicalizeAssetIdentity(value, storagePath = "", defaultBucketName = "") {
  const directStoragePath = normalizeStoragePathCandidate(normalizeText(storagePath));
  if (directStoragePath && defaultBucketName) {
    return `${defaultBucketName}/${directStoragePath}`;
  }

  const rawValue = normalizeText(value);
  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const url = new URL(rawValue);
      if (url.hostname === "signed.example.test") {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length >= 2) {
          return `${decodeURIComponent(segments[0])}/${decodeURIComponent(
            segments.slice(1).join("/")
          )}`;
        }
      }
    } catch {
      // Fall through to the shared storage parser and raw-value fallback.
    }
  }

  const parsed = parseBucketAndPathFromStorageValue(
    rawValue,
    defaultBucketName
  );
  if (parsed?.bucketName && parsed?.path) {
    return `${parsed.bucketName}/${parsed.path}`;
  }

  return rawValue;
}

function buildSectionModeById(secciones) {
  return new Map(
    sortSections(secciones).map((section) => [
      normalizeText(section?.id),
      normalizeText(section?.altoModo),
    ])
  );
}

function buildSectionLayoutSnapshot(secciones) {
  return sortSections(secciones).map((section) => ({
    id: normalizeText(section?.id),
    orden: Number(section?.orden ?? 0),
    altoModo: normalizeText(section?.altoModo),
    altura: toFiniteNumberOrNull(section?.altura),
  }));
}

function buildSectionAssetSnapshot(secciones, defaultBucketName) {
  return sortSections(secciones).map((section) => {
    const backgroundModel = normalizeSectionBackgroundModel(section);
    return {
      id: normalizeText(section?.id),
      fondoImagen: canonicalizeAssetIdentity(
        backgroundModel.base.fondoImagen,
        "",
        defaultBucketName
      ),
      decoraciones: backgroundModel.decoraciones.map((decoration) => ({
        id: normalizeText(decoration?.id),
        src: canonicalizeAssetIdentity(
          resolveSectionDecorationAssetUrl(decoration),
          decoration?.storagePath,
          defaultBucketName
        ),
      })),
    };
  });
}

function buildObjectLayoutSnapshot(objetos, sectionModeById) {
  return (Array.isArray(objetos) ? objetos : []).map((object) => ({
    id: normalizeText(object?.id),
    tipo: normalizeText(object?.tipo),
    seccionId: normalizeText(object?.seccionId),
    altoModo: sectionModeById.get(normalizeText(object?.seccionId)) || "",
    anclaje: normalizeText(object?.anclaje),
    y: toFiniteNumberOrNull(object?.y),
    yNorm: toFiniteNumberOrNull(object?.yNorm),
  }));
}

function buildObjectAssetSnapshot(objetos, defaultBucketName) {
  return (Array.isArray(objetos) ? objetos : []).map((object) => ({
    id: normalizeText(object?.id),
    primaryAsset: canonicalizeAssetIdentity(
      resolveObjectPrimaryAssetUrl(object),
      object?.storagePath,
      defaultBucketName
    ),
    galleryCells: Array.isArray(object?.cells)
      ? object.cells.map((cell, index) => ({
          index,
          media: canonicalizeAssetIdentity(
            resolveGalleryCellMediaUrl(cell),
            cell?.storagePath,
            defaultBucketName
          ),
        }))
      : [],
    countdownFrame: canonicalizeAssetIdentity(
      normalizeText(object?.frameSvgUrl),
      "",
      defaultBucketName
    ),
  }));
}

function buildObjectCropSnapshot(objetos) {
  return (Array.isArray(objetos) ? objetos : []).map((object) => {
    const cropState = resolvePublishImageCropState(object);
    return {
      id: normalizeText(object?.id),
      hasMeaningfulCrop: cropState.hasMeaningfulCrop === true,
      canMaterializeCrop: cropState.canMaterializeCrop === true,
      materializationIssue: cropState.materializationIssue || null,
    };
  });
}

export function buildPreviewParitySnapshot(draftData, { defaultBucketName = "" } = {}) {
  const previewPayload = buildDashboardPreviewRenderPayload(draftData);
  const sectionModeById = buildSectionModeById(previewPayload.secciones);
  const functionalCtaContract = resolveFunctionalCtaContract({
    objetos: previewPayload.objetos,
    rsvpConfig: previewPayload.rawRsvp,
    giftsConfig: previewPayload.rawGifts,
  });

  return {
    sectionLayout: buildSectionLayoutSnapshot(previewPayload.secciones),
    sectionAssets: buildSectionAssetSnapshot(
      previewPayload.secciones,
      defaultBucketName
    ),
    objectLayout: buildObjectLayoutSnapshot(
      previewPayload.objetos,
      sectionModeById
    ),
    objectAssets: buildObjectAssetSnapshot(previewPayload.objetos, defaultBucketName),
    objectCrop: buildObjectCropSnapshot(previewPayload.objetos),
    functionalCta: buildFunctionalCtaSnapshot(functionalCtaContract),
    rsvpConfig: toComparableSnapshot(previewPayload.rsvpPreviewConfig),
    giftsConfig: toComparableSnapshot(previewPayload.giftPreviewConfig),
  };
}

export async function buildPublishParitySnapshot(
  draftData,
  { defaultBucketName = "" } = {}
) {
  const prepared = await preparePublicationRenderState(draftData);
  const sectionModeById = buildSectionModeById(prepared.seccionesFinales);

  return {
    prepared,
    sectionLayout: buildSectionLayoutSnapshot(prepared.seccionesFinales),
    sectionAssets: buildSectionAssetSnapshot(
      prepared.seccionesFinales,
      defaultBucketName
    ),
    objectLayout: buildObjectLayoutSnapshot(
      prepared.objetosFinales,
      sectionModeById
    ),
    objectAssets: buildObjectAssetSnapshot(
      prepared.objetosFinales,
      defaultBucketName
    ),
    objectCrop: buildObjectCropSnapshot(prepared.objetosFinales),
    functionalCta: buildFunctionalCtaSnapshot(prepared.functionalCtaContract),
    rsvpConfig: toComparableSnapshot(prepared.functionalCtaContract.rsvp.config),
    giftsConfig: toComparableSnapshot(prepared.functionalCtaContract.gifts.config),
  };
}

export async function characterizePreviewPublishParity(
  previewDraft,
  publishDraft,
  { defaultBucketName = "" } = {}
) {
  const previewSnapshot = buildPreviewParitySnapshot(previewDraft, {
    defaultBucketName,
  });
  const publishSnapshot = await buildPublishParitySnapshot(publishDraft, {
    defaultBucketName,
  });
  const mismatchCodes = [];

  if (stableJson(previewSnapshot.sectionLayout) !== stableJson(publishSnapshot.sectionLayout)) {
    mismatchCodes.push("section-layout-contract");
  }

  if (stableJson(previewSnapshot.sectionAssets) !== stableJson(publishSnapshot.sectionAssets)) {
    mismatchCodes.push("section-asset-identity");
  }

  if (stableJson(previewSnapshot.objectLayout) !== stableJson(publishSnapshot.objectLayout)) {
    mismatchCodes.push("object-layout-contract");
  }

  if (stableJson(previewSnapshot.objectAssets) !== stableJson(publishSnapshot.objectAssets)) {
    mismatchCodes.push("object-asset-identity");
  }

  if (stableJson(previewSnapshot.objectCrop) !== stableJson(publishSnapshot.objectCrop)) {
    mismatchCodes.push("image-crop-materialization");
  }

  if (stableJson(previewSnapshot.functionalCta) !== stableJson(publishSnapshot.functionalCta)) {
    mismatchCodes.push("functional-cta-contract");
  }

  if (stableJson(previewSnapshot.rsvpConfig) !== stableJson(publishSnapshot.rsvpConfig)) {
    mismatchCodes.push("rsvp-config-contract");
  }

  if (stableJson(previewSnapshot.giftsConfig) !== stableJson(publishSnapshot.giftsConfig)) {
    mismatchCodes.push("gifts-config-contract");
  }

  return {
    previewSnapshot,
    publishSnapshot,
    mismatchCodes,
  };
}
