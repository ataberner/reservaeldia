import { normalizeGiftConfig, sanitizeGiftImageUrl, sanitizeGiftLinkUrl } from "../../../domain/gifts/config.js";
import { removeGiftLink, updateGiftLink } from "./giftEditorDraft.js";

const METADATA_FIELDS = ["title", "imageUrl"];
const withoutKey = (record, key) => Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));

export function createGiftMetadataState(config) {
  return { draft: normalizeGiftConfig(config, { forceEnabled: false }), requests: {}, fieldVersions: {}, automaticValues: {} };
}

function normalizeMetadata(result) {
  if (result?.status !== "found") return { title: "", imageUrl: "", status: result?.status === "empty" ? "empty" : "unavailable" };
  const title = typeof result.title === "string" ? result.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const imageUrl = sanitizeGiftImageUrl(result.imageUrl);
  return { title, imageUrl, status: title || imageUrl ? "found" : "empty" };
}

// This reducer is the modal's temporary draft owner. Request bookkeeping never persists.
export function giftLinkMetadataReducer(state, action) {
  if (action.type === "draft-update") {
    return { ...state, draft: typeof action.update === "function" ? action.update(state.draft) : action.update };
  }
  if (action.type === "remove-link") {
    return { ...state, draft: removeGiftLink(state.draft, action.id), requests: withoutKey(state.requests, action.id), fieldVersions: withoutKey(state.fieldVersions, action.id), automaticValues: withoutKey(state.automaticValues, action.id) };
  }
  const link = state.draft.giftLinks.find((item) => item.id === action.id);
  if (action.type === "edit-link") {
    if (action.id === "legacy") return { ...state, draft: updateGiftLink(state.draft, action.id, action.changes) };
    if (!link) return state;
    const changes = { ...action.changes };
    const urlChanged = Object.hasOwn(changes, "url") && changes.url !== link.url;
    if (urlChanged) {
      // Metadata for the old destination can be cleared; user-authored values stay intact.
      for (const field of METADATA_FIELDS) {
        if (!Object.hasOwn(changes, field) && state.automaticValues[action.id]?.[field] === link[field]) changes[field] = "";
      }
    }
    const versions = { ...state.fieldVersions[action.id] };
    const automatic = { ...state.automaticValues[action.id] };
    for (const field of METADATA_FIELDS) {
      if (Object.hasOwn(action.changes, field)) {
        versions[field] = (versions[field] || 0) + 1;
        delete automatic[field];
      }
    }
    return {
      ...state,
      draft: updateGiftLink(state.draft, action.id, changes),
      requests: urlChanged ? withoutKey(state.requests, action.id) : state.requests,
      fieldVersions: { ...state.fieldVersions, [action.id]: versions },
      automaticValues: urlChanged ? withoutKey(state.automaticValues, action.id) : { ...state.automaticValues, [action.id]: automatic },
    };
  }
  if (!link) return state;
  if (action.type === "metadata-start") {
    if (!action.url || sanitizeGiftLinkUrl(link.url) !== action.url) return state;
    return { ...state, requests: { ...state.requests, [action.id]: {
      token: action.token, url: action.url, status: "loading",
      values: { title: link.title, imageUrl: link.imageUrl },
      versions: { ...state.fieldVersions[action.id] },
    } } };
  }
  if (action.type === "metadata-complete") {
    const request = state.requests[action.id];
    if (!request || request.token !== action.token || request.url !== sanitizeGiftLinkUrl(link.url)) return state;
    const result = normalizeMetadata(action.result);
    const changes = {};
    if (result.status === "found") {
      for (const field of METADATA_FIELDS) {
        const untouched = (state.fieldVersions[action.id]?.[field] || 0) === (request.versions[field] || 0);
        const sameValue = link[field] === request.values[field];
        const canComplete = !link[field].trim() || state.automaticValues[action.id]?.[field] === link[field];
        if (result[field] && untouched && sameValue && canComplete) changes[field] = result[field];
      }
    }
    return {
      ...state,
      draft: updateGiftLink(state.draft, action.id, changes),
      requests: { ...state.requests, [action.id]: { ...request, status: result.status } },
      automaticValues: { ...state.automaticValues, [action.id]: { ...state.automaticValues[action.id], ...changes } },
    };
  }
  return state;
}
