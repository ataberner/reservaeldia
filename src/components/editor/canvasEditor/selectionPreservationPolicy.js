const PRESERVE_CANVAS_SELECTION_SELECTORS = [
  '[data-preserve-canvas-selection="true"]',
  '[data-dashboard-sidebar="true"]',
  "#sidebar-panel",
  '[data-option-button="true"]',
  '[data-inline-editor="true"]',
  ".menu-z-index",
  ".popup-fuente",
];

const PRESERVE_INLINE_EDIT_SELECTORS = [
  '[data-preserve-inline-edit="true"]',
];

export const PRESERVE_CANVAS_SELECTION_SELECTOR =
  PRESERVE_CANVAS_SELECTION_SELECTORS.join(", ");

export const PRESERVE_INLINE_EDIT_SELECTOR =
  PRESERVE_INLINE_EDIT_SELECTORS.join(", ");

function matchesClosestTarget(targetElement, selector) {
  return Boolean(
    targetElement &&
      typeof targetElement.closest === "function" &&
      selector &&
      targetElement.closest(selector)
  );
}

export function shouldPreserveCanvasSelectionTarget(
  targetElement,
  selector = PRESERVE_CANVAS_SELECTION_SELECTOR
) {
  return matchesClosestTarget(targetElement, selector);
}

export function shouldPreserveInlineEditTarget(
  targetElement,
  selector = PRESERVE_INLINE_EDIT_SELECTOR
) {
  return matchesClosestTarget(targetElement, selector);
}
