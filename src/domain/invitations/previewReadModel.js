import { resolvePublicationDraftLookupSlug } from "./readResolution.js";

const DRAFT_PREVIEW_KEYS = Object.freeze([
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "thumbnailURL",
  "portada",
  "previewUrl",
  "previewurl",
  "preview_url",
  "previewURL",
]);

const PUBLICATION_PREVIEW_KEYS = Object.freeze([
  "portada",
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "thumbnailURL",
  "previewUrl",
  "previewurl",
  "preview_url",
  "previewURL",
]);

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isImageSrc(value) {
  if (!value) return false;
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /^blob:/i.test(value) ||
    value.startsWith("/")
  );
}

function collectPreviewCandidates(data, keys, options = {}) {
  const validateImageSrc = options?.validateImageSrc === true;
  const candidates = [];

  for (const key of keys) {
    const candidate = toNonEmptyString(data?.[key]);
    if (!candidate) continue;
    if (validateImageSrc && !isImageSrc(candidate)) continue;
    if (candidates.includes(candidate)) continue;
    candidates.push(candidate);
  }

  return candidates;
}

function mergePreviewCandidates(...candidateLists) {
  const merged = [];

  candidateLists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((candidate) => {
      const normalized = toNonEmptyString(candidate);
      if (!normalized) return;
      if (merged.includes(normalized)) return;
      merged.push(normalized);
    });
  });

  return merged;
}

function normalizeReadRecord(rawRecord) {
  if (!rawRecord) {
    return { exists: false, id: "", data: {} };
  }

  if (typeof rawRecord.exists === "function") {
    if (!rawRecord.exists()) {
      return { exists: false, id: "", data: {} };
    }

    return {
      exists: true,
      id: toNonEmptyString(rawRecord.id),
      data:
        rawRecord.data && typeof rawRecord.data === "function"
          ? rawRecord.data() || {}
          : {},
    };
  }

  if (rawRecord.exists === false) {
    return { exists: false, id: "", data: {} };
  }

  return {
    exists: true,
    id: toNonEmptyString(rawRecord.id),
    data:
      rawRecord.data && typeof rawRecord.data === "function"
        ? rawRecord.data() || {}
        : rawRecord.data && typeof rawRecord.data === "object"
          ? rawRecord.data
          : rawRecord && typeof rawRecord === "object"
            ? rawRecord
            : {},
  };
}

export function getDraftPreviewReadModel(
  draft,
  options = { includePlaceholder: true }
) {
  const includePlaceholder = options?.includePlaceholder !== false;
  const metadataCandidates = collectPreviewCandidates(draft, DRAFT_PREVIEW_KEYS, {
    validateImageSrc: true,
  });
  const candidates = [...metadataCandidates];

  if (includePlaceholder && !candidates.includes("/placeholder.jpg")) {
    candidates.push("/placeholder.jpg");
  }

  return {
    source: metadataCandidates[0]
      ? "draft_metadata"
      : includePlaceholder && candidates[0] === "/placeholder.jpg"
        ? "placeholder"
        : "none",
    primarySrc: candidates[0] || "",
    candidates,
  };
}

export function getDraftPreviewCandidates(
  draft,
  options = { includePlaceholder: true }
) {
  return getDraftPreviewReadModel(draft, options).candidates;
}

export function getPublicationPreviewReadModel(publication) {
  const candidates = collectPreviewCandidates(
    publication,
    PUBLICATION_PREVIEW_KEYS
  );

  return {
    source: candidates[0] ? "publication_metadata" : "none",
    primarySrc: candidates[0] || "",
    candidates,
  };
}

export function getPublicationPreviewCandidates(publication) {
  return getPublicationPreviewReadModel(publication).candidates;
}

export function getPublicationPreview(publication) {
  return getPublicationPreviewReadModel(publication).primarySrc;
}

export function getPublicationPreviewItemKey(source, id) {
  const safeSource =
    typeof source === "string" && source.trim() ? source.trim() : "active";
  const safeId =
    typeof id === "string" ? id.trim() : String(id || "").trim();
  return `${safeSource}:${safeId}`;
}

export async function resolvePublicationPreviewReadModel({
  publication,
  fallbackSlug = "",
  readDraftBySlug,
}) {
  const publicationPreview = getPublicationPreviewReadModel(publication);
  const linkedDraftSlug = resolvePublicationDraftLookupSlug(
    publication,
    fallbackSlug
  );
  if (!linkedDraftSlug || typeof readDraftBySlug !== "function") {
    return {
      source: publicationPreview.primarySrc ? "publication_metadata" : "none",
      primarySrc: publicationPreview.primarySrc || "",
      candidates: publicationPreview.candidates,
      publicationCandidates: publicationPreview.candidates,
      linkedDraftSlug,
      linkedDraftCandidates: [],
    };
  }

  try {
    const draftRecord = normalizeReadRecord(await readDraftBySlug(linkedDraftSlug));
    if (!draftRecord.exists) {
      return {
        source: "none",
        primarySrc: "",
        candidates: [],
        publicationCandidates: publicationPreview.candidates,
        linkedDraftSlug,
        linkedDraftCandidates: [],
      };
    }

    const linkedDraftPreview = getDraftPreviewReadModel(draftRecord.data, {
      includePlaceholder: false,
    });

    const mergedCandidates = mergePreviewCandidates(
      publicationPreview.candidates,
      linkedDraftPreview.candidates
    );

    if (publicationPreview.primarySrc || linkedDraftPreview.primarySrc) {
      return {
        source: publicationPreview.primarySrc
          ? "publication_metadata"
          : "linked_draft",
        primarySrc:
          publicationPreview.primarySrc || linkedDraftPreview.primarySrc || "",
        candidates: mergedCandidates,
        publicationCandidates: publicationPreview.candidates,
        linkedDraftSlug,
        linkedDraftCandidates: linkedDraftPreview.candidates,
      };
    }

      return {
        source: "none",
        primarySrc: "",
        candidates: mergedCandidates,
        publicationCandidates: publicationPreview.candidates,
        linkedDraftSlug,
        linkedDraftCandidates: linkedDraftPreview.candidates,
    };
  } catch {
    return {
      source: "none",
      primarySrc: "",
      candidates: [],
      publicationCandidates: publicationPreview.candidates,
      linkedDraftSlug,
      linkedDraftCandidates: [],
    };
  }
}

export async function resolvePublicationPreviewReadModelsByItemKey(
  items = [],
  options = {}
) {
  const getItemData =
    typeof options?.getItemData === "function"
      ? options.getItemData
      : (item) => item?.data || {};
  const getItemId =
    typeof options?.getItemId === "function"
      ? options.getItemId
      : (item) => item?.id;
  const getItemSource =
    typeof options?.getItemSource === "function"
      ? options.getItemSource
      : (item) => item?.source;
  const readDraftBySlug =
    typeof options?.readDraftBySlug === "function"
      ? options.readDraftBySlug
      : null;

  const itemKeyToDraftSlug = new Map();
  const itemKeyToPublication = new Map();
  const resolutionByItemKey = new Map();

  items.forEach((item) => {
    const itemId = getItemId(item);
    const itemSource = getItemSource(item);
    const itemKey = getPublicationPreviewItemKey(itemSource, itemId);
    const publication = getItemData(item);
    itemKeyToPublication.set(itemKey, publication);
    const publicationPreview = getPublicationPreviewReadModel(publication);

    const fallbackSlug =
      typeof itemId === "string" && itemId.trim() ? itemId.trim() : "";
    const linkedDraftSlug = resolvePublicationDraftLookupSlug(
      publication,
      fallbackSlug
    );
    if (!linkedDraftSlug || !readDraftBySlug) {
      resolutionByItemKey.set(itemKey, {
        source: publicationPreview.primarySrc ? "publication_metadata" : "none",
        primarySrc: publicationPreview.primarySrc || "",
        candidates: publicationPreview.candidates,
        publicationCandidates: publicationPreview.candidates,
        linkedDraftSlug,
        linkedDraftCandidates: [],
      });
      return;
    }

    itemKeyToDraftSlug.set(itemKey, linkedDraftSlug);
  });

  const uniqueDraftSlugs = [...new Set(itemKeyToDraftSlug.values())];
  const draftPreviewBySlug = new Map();

  await Promise.all(
    uniqueDraftSlugs.map(async (draftSlug) => {
      try {
        const draftRecord = normalizeReadRecord(await readDraftBySlug(draftSlug));
        if (!draftRecord.exists) return;

        draftPreviewBySlug.set(
          draftSlug,
          getDraftPreviewReadModel(draftRecord.data, {
            includePlaceholder: false,
          })
        );
      } catch {
        // Ignoramos fallos puntuales para no bloquear el read-model global.
      }
    })
  );

  itemKeyToDraftSlug.forEach((draftSlug, itemKey) => {
    const publication = itemKeyToPublication.get(itemKey) || {};
    const publicationPreview = getPublicationPreviewReadModel(publication);
    const linkedDraftPreview = draftPreviewBySlug.get(draftSlug);
    const mergedCandidates = mergePreviewCandidates(
      publicationPreview.candidates,
      linkedDraftPreview?.candidates || []
    );

    if (!linkedDraftPreview?.primarySrc) {
      resolutionByItemKey.set(itemKey, {
        source: publicationPreview.primarySrc ? "publication_metadata" : "none",
        primarySrc: publicationPreview.primarySrc || "",
        candidates: mergedCandidates,
        publicationCandidates: publicationPreview.candidates,
        linkedDraftSlug: draftSlug,
        linkedDraftCandidates: linkedDraftPreview?.candidates || [],
      });
      return;
    }

    resolutionByItemKey.set(itemKey, {
      source: publicationPreview.primarySrc
        ? "publication_metadata"
        : "linked_draft",
      primarySrc:
        publicationPreview.primarySrc || linkedDraftPreview.primarySrc,
      candidates: mergedCandidates,
      publicationCandidates: publicationPreview.candidates,
      linkedDraftSlug: draftSlug,
      linkedDraftCandidates: linkedDraftPreview.candidates,
    });
  });

  return resolutionByItemKey;
}
