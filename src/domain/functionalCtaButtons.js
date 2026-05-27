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
