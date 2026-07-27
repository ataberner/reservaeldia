import { getProviderCategoryDecision } from "./config";
import {
  MOTIVOS_REVISION_PROVEEDOR,
  MotivoRevisionProveedor,
  RevisionManualProveedor,
} from "./types";

export type ProviderNameReviewCandidate = {
  sourceIndex: number;
  providerId: string;
  normalizedName: string;
};

export type ProviderNameReviewGroup = {
  normalizedName: string;
  providerIds: string[];
  sourceIndexes: number[];
};

export function mergeProviderReviewReasons(
  ...reasonGroups: ReadonlyArray<
    readonly (MotivoRevisionProveedor | null | undefined)[]
  >
): MotivoRevisionProveedor[] {
  const selected = new Set<MotivoRevisionProveedor>();
  for (const reasons of reasonGroups) {
    for (const reason of reasons) {
      if (reason && MOTIVOS_REVISION_PROVEEDOR.includes(reason)) {
        selected.add(reason);
      }
    }
  }
  return MOTIVOS_REVISION_PROVEEDOR.filter((reason) =>
    selected.has(reason)
  );
}

export function buildProviderManualReviewReasons({
  originalCategory,
  externalId,
  additionalReasons = [],
}: {
  originalCategory: string | null;
  externalId: string | null;
  additionalReasons?: readonly MotivoRevisionProveedor[];
}): MotivoRevisionProveedor[] {
  const categoryReason =
    getProviderCategoryDecision(originalCategory).manualReviewReason;
  return mergeProviderReviewReasons(
    categoryReason ? [categoryReason] : [],
    externalId ? [] : ["sin_id_externo"],
    additionalReasons
  );
}

export function buildProviderManualReview(
  reasons: readonly MotivoRevisionProveedor[]
): RevisionManualProveedor<Date> {
  const normalizedReasons = mergeProviderReviewReasons(reasons);
  return {
    requerida: normalizedReasons.length > 0,
    motivos: normalizedReasons,
    revisadaEn: null,
    revisadaPor: null,
    notas: null,
  };
}

export function findPossibleDuplicateProviderNameGroups(
  candidates: readonly ProviderNameReviewCandidate[]
): ProviderNameReviewGroup[] {
  const byNormalizedName = new Map<string, ProviderNameReviewCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.normalizedName || !candidate.providerId) continue;
    const group = byNormalizedName.get(candidate.normalizedName) || [];
    group.push(candidate);
    byNormalizedName.set(candidate.normalizedName, group);
  }

  return [...byNormalizedName.entries()]
    .filter(
      ([, entries]) =>
        new Set(entries.map((entry) => entry.providerId)).size > 1
    )
    .map(([normalizedName, entries]) => ({
      normalizedName,
      providerIds: [
        ...new Set(entries.map((entry) => entry.providerId)),
      ].sort(),
      sourceIndexes: [
        ...new Set(entries.map((entry) => entry.sourceIndex)),
      ].sort((left, right) => left - right),
    }))
    .sort(
      (left, right) =>
        right.providerIds.length - left.providerIds.length ||
        left.normalizedName.localeCompare(right.normalizedName)
    );
}
