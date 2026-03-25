import { normalizePublicSlug } from "../../lib/publicSlug.js";

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function decodeURIComponentSafe(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => toNonEmptyString(value))
        .filter(Boolean)
    )
  );
}

function normalizeReadRecord(rawRecord) {
  if (!rawRecord) {
    return { exists: false, id: "", data: {} };
  }

  if (typeof rawRecord.exists === "function") {
    if (!rawRecord.exists()) {
      return { exists: false, id: "", data: {} };
    }
    const data =
      rawRecord.data && typeof rawRecord.data === "function"
        ? asRecord(rawRecord.data())
        : {};
    return {
      exists: true,
      id: toNonEmptyString(rawRecord.id),
      data,
    };
  }

  if (rawRecord.exists === false) {
    return { exists: false, id: "", data: {} };
  }

  const data =
    rawRecord.data && typeof rawRecord.data === "function"
      ? asRecord(rawRecord.data())
      : asRecord(rawRecord.data);

  return {
    exists: true,
    id: toNonEmptyString(rawRecord.id),
    data,
  };
}

function buildPublicInvitationUrl(publicSlug, explicitUrl = "") {
  const safeUrl = toNonEmptyString(explicitUrl);
  if (safeUrl) return safeUrl;

  const safeSlug = normalizePublicSlug(publicSlug);
  return safeSlug ? `https://reservaeldia.com.ar/i/${safeSlug}` : "";
}

function buildPublicationReadResult(record, fallbackPublicSlug, source) {
  const publicationData = asRecord(record?.data);
  const normalizedPublicSlug =
    normalizePublicSlug(publicationData?.slug) ||
    normalizePublicSlug(record?.id) ||
    normalizePublicSlug(fallbackPublicSlug) ||
    normalizePublicSlug(publicationData?.urlPublica) ||
    "";

  return {
    publicSlug: normalizedPublicSlug || null,
    publicUrl: buildPublicInvitationUrl(
      normalizedPublicSlug,
      publicationData?.urlPublica
    ),
    publication: publicationData,
    source: toNonEmptyString(source) || null,
    matchedInactive: false,
  };
}

export function sanitizeDraftSlug(rawSlug) {
  if (typeof rawSlug !== "string") return null;
  const decoded = decodeURIComponentSafe(rawSlug).trim();
  if (!decoded) return null;
  const slug = decoded.split("?")[0].trim();
  return slug || null;
}

export function resolveDraftLinkedPublicSlugCandidates(draftData) {
  const lifecycle = asRecord(draftData?.publicationLifecycle);

  return uniqueStrings(
    [
      normalizePublicSlug(draftData?.slugPublico),
      normalizePublicSlug(lifecycle?.activePublicSlug),
      normalizePublicSlug(lifecycle?.publicSlug),
      normalizePublicSlug(lifecycle?.slug),
    ].filter(Boolean)
  );
}

export function resolveDraftLinkedPublicSlug(draftData) {
  return resolveDraftLinkedPublicSlugCandidates(draftData)[0] || "";
}

export function resolveDraftPublicationLifecycleState(draftData) {
  const explicitState = toNonEmptyString(
    draftData?.publicationLifecycle?.state
  ).toLowerCase();

  if (
    explicitState === "draft" ||
    explicitState === "published" ||
    explicitState === "finalized"
  ) {
    return explicitState;
  }

  return resolveDraftLinkedPublicSlug(draftData) ? "published" : "draft";
}

export function getPublicationEditableDraftCandidates(publicationData) {
  return uniqueStrings(
    [
      sanitizeDraftSlug(publicationData?.borradorSlug),
      sanitizeDraftSlug(publicationData?.borradorId),
      sanitizeDraftSlug(publicationData?.draftSlug),
      sanitizeDraftSlug(publicationData?.slugOriginal),
    ].filter(Boolean)
  );
}

export function resolvePublicationEditableDraftSlug(publicationData) {
  return getPublicationEditableDraftCandidates(publicationData)[0] || "";
}

export function resolvePublicationDraftLookupSlug(
  publicationData,
  fallbackSlug = ""
) {
  return (
    uniqueStrings(
      [
        resolvePublicationEditableDraftSlug(publicationData),
        sanitizeDraftSlug(publicationData?.slugOriginal),
        sanitizeDraftSlug(publicationData?.slug),
        sanitizeDraftSlug(fallbackSlug),
      ].filter(Boolean)
    )[0] || ""
  );
}

export function buildDraftPublicationReadPlan({ draftSlug, draftData }) {
  const safeDraftSlug = sanitizeDraftSlug(draftSlug) || "";
  return {
    draftSlug: safeDraftSlug,
    directPublicSlugs: uniqueStrings(
      [
        ...resolveDraftLinkedPublicSlugCandidates(draftData),
        normalizePublicSlug(safeDraftSlug),
      ].filter(Boolean)
    ),
    slugOriginalQuery: safeDraftSlug,
  };
}

export async function resolvePublicationLinkForDraftRead({
  draftSlug,
  draftData = null,
  readPublicationBySlug,
  queryPublicationBySlugOriginal,
  isPublicationReadable = () => true,
}) {
  const plan = buildDraftPublicationReadPlan({ draftSlug, draftData });
  let matchedInactive = false;

  if (typeof readPublicationBySlug === "function") {
    for (const publicSlug of plan.directPublicSlugs) {
      try {
        const record = normalizeReadRecord(await readPublicationBySlug(publicSlug));
        if (!record.exists) continue;

        if (isPublicationReadable(record.data, { source: "direct", publicSlug, record })) {
          return buildPublicationReadResult(record, publicSlug, "direct");
        }

        matchedInactive = true;
      } catch {
        // Compatibilidad: un fallo puntual no debe bloquear fallbacks de lectura.
      }
    }
  }

  if (
    plan.slugOriginalQuery &&
    typeof queryPublicationBySlugOriginal === "function"
  ) {
    try {
      const queriedRecord = await queryPublicationBySlugOriginal(plan.slugOriginalQuery);
      const firstRecord = Array.isArray(queriedRecord)
        ? queriedRecord[0]
        : queriedRecord;
      const record = normalizeReadRecord(firstRecord);

      if (record.exists) {
        if (
          isPublicationReadable(record.data, {
            source: "slugOriginal",
            draftSlug: plan.slugOriginalQuery,
            record,
          })
        ) {
          return buildPublicationReadResult(
            record,
            plan.slugOriginalQuery,
            "slugOriginal"
          );
        }

        matchedInactive = true;
      }
    } catch {
      // Compatibilidad: la query legacy por slugOriginal es optativa y no debe romper preview/home.
    }
  }

  return {
    publicSlug: null,
    publicUrl: "",
    publication: null,
    source: null,
    matchedInactive,
  };
}

function defaultPermissionDeniedMatcher(error) {
  const code = toNonEmptyString(error?.code).toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

export async function resolveOwnedDraftSlugForEditorRead({
  slug,
  uid,
  readDraftBySlug,
  readPublicationBySlug,
  isPermissionDeniedError = defaultPermissionDeniedMatcher,
  isDraftTrashed = () => false,
}) {
  const normalizedSlug = sanitizeDraftSlug(slug);
  if (!normalizedSlug || !uid) return normalizedSlug;
  if (
    typeof readDraftBySlug !== "function" ||
    typeof readPublicationBySlug !== "function"
  ) {
    return normalizedSlug;
  }

  let directDraftPermissionDenied = false;

  try {
    const directDraftRecord = normalizeReadRecord(
      await readDraftBySlug(normalizedSlug)
    );

    if (directDraftRecord.exists) {
      const ownerUid = toNonEmptyString(directDraftRecord.data?.userId);
      if (ownerUid !== uid) return null;
      return isDraftTrashed(directDraftRecord.data) ? null : normalizedSlug;
    }
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      directDraftPermissionDenied = true;
    } else {
      return normalizedSlug;
    }
  }

  try {
    const publicationRecord = normalizeReadRecord(
      await readPublicationBySlug(normalizedSlug)
    );

    if (!publicationRecord.exists) {
      return directDraftPermissionDenied ? null : normalizedSlug;
    }

    const publicationOwnerUid = toNonEmptyString(publicationRecord.data?.userId);
    if (!publicationOwnerUid || publicationOwnerUid !== uid) {
      return null;
    }

    const draftCandidates = getPublicationEditableDraftCandidates(
      publicationRecord.data
    );

    for (const candidateSlug of draftCandidates) {
      try {
        const candidateDraftRecord = normalizeReadRecord(
          await readDraftBySlug(candidateSlug)
        );
        if (!candidateDraftRecord.exists) continue;

        const candidateOwnerUid = toNonEmptyString(
          candidateDraftRecord.data?.userId
        );
        if (candidateOwnerUid !== uid) continue;
        if (isDraftTrashed(candidateDraftRecord.data)) continue;

        return candidateSlug;
      } catch (candidateError) {
        if (!isPermissionDeniedError(candidateError)) {
          return normalizedSlug;
        }
      }
    }

    return null;
  } catch (publicationError) {
    if (isPermissionDeniedError(publicationError)) {
      return null;
    }
    return normalizedSlug;
  }
}
