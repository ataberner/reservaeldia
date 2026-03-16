export const COUNTDOWN_PRESET_CATALOG_UPDATED_EVENT =
  "countdown-preset-catalog-updated";
export const COUNTDOWN_PRESET_CATALOG_UPDATED_STORAGE_KEY =
  "countdown-preset-catalog-updated-at";

export function notifyCountdownPresetCatalogChanged() {
  if (typeof window === "undefined") return;

  const timestamp = String(Date.now());

  try {
    window.localStorage?.setItem(
      COUNTDOWN_PRESET_CATALOG_UPDATED_STORAGE_KEY,
      timestamp
    );
  } catch {
    // Non-blocking.
  }

  try {
    window.dispatchEvent(
      new CustomEvent(COUNTDOWN_PRESET_CATALOG_UPDATED_EVENT, {
        detail: { timestamp },
      })
    );
  } catch {
    // Non-blocking.
  }
}
