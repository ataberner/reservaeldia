import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "./rsvp/buttonStyles.js";

const FUNCTIONAL_CTA_BUTTON_TYPES = Object.freeze(["rsvp-boton", "regalo-boton"]);

function normalizeType(value) {
  return String(value || "").trim().toLowerCase();
}

export function isFunctionalCtaType(value) {
  return FUNCTIONAL_CTA_BUTTON_TYPES.includes(normalizeType(value));
}

export function isRsvpButton(value) {
  return normalizeType(value?.tipo ?? value) === "rsvp-boton";
}

export function isGiftButton(value) {
  return normalizeType(value?.tipo ?? value) === "regalo-boton";
}

export function isFunctionalCtaButton(value) {
  return isFunctionalCtaType(value?.tipo ?? value);
}

export function isFunctionalCtaHidden(value) {
  return Boolean(isFunctionalCtaButton(value) && value?.hidden === true);
}

export function getFunctionalCtaDefaultText(value) {
  if (isRsvpButton(value)) return "Confirmar asistencia";
  if (isGiftButton(value)) return "Ver regalos";
  return "";
}

export function buildFunctionalCtaButtonPayload(
  type,
  { id = "", text = "", now = Date.now() } = {}
) {
  const normalizedType = normalizeType(type);
  if (!isFunctionalCtaType(normalizedType)) return null;
  const prefix = normalizedType === "rsvp-boton" ? "rsvp" : "gift";
  return {
    id: String(id || "").trim() || `${prefix}-${now}`,
    tipo: normalizedType,
    texto: String(text || "").trim() || getFunctionalCtaDefaultText(normalizedType),
    x: 300,
    y: 100,
    ancho: 220,
    alto: 50,
    fontSize: 18,
    fontFamily: "sans-serif",
    align: "center",
    ...createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID),
  };
}

export function buildFunctionalCtaVisibilityPatch(enabled) {
  return { hidden: enabled !== true };
}

function findFunctionalCtaButtonByTypeInEntry(entry, normalizedType, predicate = null) {
  if (!entry || typeof entry !== "object") return null;

  if (normalizeType(entry?.tipo) === normalizedType && (!predicate || predicate(entry))) {
    return entry;
  }

  if (normalizeType(entry?.tipo) !== "grupo" || !Array.isArray(entry.children)) {
    return null;
  }

  for (const child of entry.children) {
    const match = findFunctionalCtaButtonByTypeInEntry(child, normalizedType, predicate);
    if (match) return match;
  }

  return null;
}

export function findFunctionalCtaButtonByType(objects, type) {
  if (!Array.isArray(objects)) return null;
  const normalizedType = normalizeType(type);
  if (!normalizedType) return null;

  for (const item of objects) {
    const match = findFunctionalCtaButtonByTypeInEntry(item, normalizedType);
    if (match) return match;
  }

  return null;
}

export function findVisibleFunctionalCtaButtonByType(objects, type) {
  if (!Array.isArray(objects)) return null;
  const normalizedType = normalizeType(type);
  if (!normalizedType) return null;

  for (const item of objects) {
    const match = findFunctionalCtaButtonByTypeInEntry(
      item,
      normalizedType,
      (entry) => !isFunctionalCtaHidden(entry)
    );
    if (match) return match;
  }

  return null;
}

export function shouldSkipFunctionalCtaDuplicate(objects, candidate) {
  if (!isFunctionalCtaButton(candidate)) return false;
  return Boolean(findFunctionalCtaButtonByType(objects, candidate?.tipo));
}

export const FUNCTIONAL_CTA_TYPES = FUNCTIONAL_CTA_BUTTON_TYPES;
