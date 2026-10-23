import {
  normalizeGiftConfig,
  sanitizeGiftImageUrl,
  sanitizeGiftLinkUrl,
} from "../../../domain/gifts/config.js";

export const GIFT_BANK_FIELDS = Object.freeze([
  { key: "holder", label: "Titular", placeholder: "Nombre del titular", maxLength: 120 },
  { key: "bank", label: "Banco o billetera", placeholder: "Nombre del banco", maxLength: 120 },
  { key: "alias", label: "Alias", placeholder: "alias.de.la.cuenta", maxLength: 120 },
  { key: "cbu", label: "CBU / CVU", placeholder: "Número de CBU o CVU", maxLength: 120 },
  { key: "cuit", label: "CUIT", placeholder: "CUIT del titular", maxLength: 120 },
]);

export function accountKeys(accountId) {
  return accountId === "usd"
    ? { bankKey: "bankUsd", visibilityKey: "visibilityUsd" }
    : { bankKey: "bank", visibilityKey: "visibility" };
}

export function initialAutoVisibleFields(draft) {
  return ["ars", "usd"].flatMap((accountId) => {
    const { bankKey } = accountKeys(accountId);
    return GIFT_BANK_FIELDS.filter(({ key }) => !String(draft[bankKey][key] || "").trim()).map(({ key }) => `${accountId}.${key}`);
  });
}

export function updateAccountField(draft, accountId, fieldKey, value, { showNewField = false } = {}) {
  const { bankKey, visibilityKey } = accountKeys(accountId);
  const isNewValue = !String(draft[bankKey][fieldKey] || "").trim() && value.trim();
  return {
    ...draft,
    [bankKey]: { ...draft[bankKey], [fieldKey]: value },
    [visibilityKey]: {
      ...draft[visibilityKey],
      [fieldKey]: showNewField && isNewValue ? true : draft[visibilityKey][fieldKey],
    },
  };
}

export function setAccountVisibility(draft, accountId, visible) {
  const { bankKey, visibilityKey } = accountKeys(accountId);
  const flags = Object.fromEntries(GIFT_BANK_FIELDS.map(({ key }) => [
    key, visible && Boolean(String(draft[bankKey][key] || "").trim()),
  ]));
  return { ...draft, [visibilityKey]: { ...draft[visibilityKey], ...flags } };
}

export function getGiftLinkDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Enlace externo"; }
}

// Preserve raw edits until explicit save; normalization would hide invalid input.
export function getEditableGiftLinks(draft) {
  const legacy = draft.giftListUrl || draft.visibility.giftListLink ? [{
    id: "legacy", url: draft.giftListUrl, title: "Lista de regalos", imageUrl: "", visible: draft.visibility.giftListLink,
  }] : [];
  return [...legacy, ...(draft.giftLinks || [])];
}

export function validateGiftLink(draft, link) {
  const url = sanitizeGiftLinkUrl(link.url);
  if (!url && (link.visible || String(link.url || "").trim())) return "Ingresá un enlace válido que empiece con https:// o http://.";
  if (url && getEditableGiftLinks(draft).some((other) => other.id !== link.id && sanitizeGiftLinkUrl(other.url) === url)) {
    return "Este enlace ya está en tu lista de regalos.";
  }
  if (link.visible && link.id !== "legacy" && !String(link.title || "").trim()) return "Completá el nombre del regalo.";
  if (link.imageUrl && !sanitizeGiftImageUrl(link.imageUrl)) return "La imagen debe tener una URL válida que empiece con https://.";
  return "";
}

export function validateGiftEditorDraft(draft) {
  for (const link of getEditableGiftLinks(draft)) {
    const error = validateGiftLink(draft, link);
    if (error) return { error, linkId: link.id };
  }
  const normalized = normalizeGiftConfig(draft, { forceEnabled: false });
  // Empty fields cannot appear in the guest modal; avoid retaining default empty selections.
  for (const accountId of ["ars", "usd"]) {
    const { bankKey, visibilityKey } = accountKeys(accountId);
    for (const { key } of GIFT_BANK_FIELDS) {
      if (!normalized[bankKey][key]) normalized[visibilityKey][key] = false;
    }
  }
  return { error: "", config: normalized };
}

export function updateGiftLink(draft, linkId, changes) {
  if (linkId === "legacy") {
    return {
      ...draft,
      giftListUrl: changes.url ?? draft.giftListUrl,
      visibility: { ...draft.visibility, giftListLink: changes.visible ?? draft.visibility.giftListLink },
    };
  }
  return { ...draft, giftLinks: draft.giftLinks.map((link) => link.id === linkId ? { ...link, ...changes } : link) };
}

export function removeGiftLink(draft, linkId) {
  if (linkId === "legacy") return { ...draft, giftListUrl: "", visibility: { ...draft.visibility, giftListLink: false } };
  return { ...draft, giftLinks: draft.giftLinks.filter((link) => link.id !== linkId) };
}
