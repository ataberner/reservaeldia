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

export function getFunctionalCtaDefaultText(value) {
  if (isRsvpButton(value)) return "Confirmar asistencia";
  if (isGiftButton(value)) return "Ver regalos";
  return "";
}

export function findFunctionalCtaButtonByType(objects, type) {
  if (!Array.isArray(objects)) return null;
  const normalizedType = normalizeType(type);
  if (!normalizedType) return null;
  return objects.find((item) => normalizeType(item?.tipo) === normalizedType) || null;
}

export function shouldSkipFunctionalCtaDuplicate(objects, candidate) {
  if (!isFunctionalCtaButton(candidate)) return false;
  return Boolean(findFunctionalCtaButtonByType(objects, candidate?.tipo));
}

export const FUNCTIONAL_CTA_TYPES = FUNCTIONAL_CTA_BUTTON_TYPES;
