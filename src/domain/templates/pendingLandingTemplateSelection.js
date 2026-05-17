const PENDING_LANDING_TEMPLATE_SELECTION_KEY =
  "landing_template_selection_pending_v1";
const PENDING_LANDING_TEMPLATE_SELECTION_LOCAL_KEY =
  "landing_template_selection_pending_local_v1";
const PENDING_LANDING_TEMPLATE_SELECTION_MAX_AGE_MS = 30 * 60 * 1000;

function normalizeTemplateId(value) {
  return String(value || "").trim();
}

function resolveTemplateId(templateOrId) {
  if (templateOrId && typeof templateOrId === "object") {
    return normalizeTemplateId(templateOrId.id);
  }

  return normalizeTemplateId(templateOrId);
}

function getStorage(storageName) {
  if (typeof window === "undefined") return null;

  try {
    const storage = window?.[storageName];
    if (!storage) return null;
    const testKey = `${PENDING_LANDING_TEMPLATE_SELECTION_KEY}:test`;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

function parseSelection(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    const templateId = normalizeTemplateId(parsed?.templateId);
    const createdAt = Number(parsed?.createdAt);

    if (!templateId || !Number.isFinite(createdAt) || createdAt <= 0) {
      return null;
    }

    if (Date.now() - createdAt > PENDING_LANDING_TEMPLATE_SELECTION_MAX_AGE_MS) {
      return null;
    }

    return {
      templateId,
      createdAt,
    };
  } catch {
    return null;
  }
}

function writeSelection(storage, key, selection) {
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(selection));
  } catch {
    // noop
  }
}

function readSelection(storage, key) {
  if (!storage) return null;

  try {
    return parseSelection(storage.getItem(key));
  } catch {
    return null;
  }
}

function removeSelection(storage, key) {
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // noop
  }
}

export function clearPendingLandingTemplateSelection() {
  removeSelection(
    getStorage("sessionStorage"),
    PENDING_LANDING_TEMPLATE_SELECTION_KEY
  );
  removeSelection(
    getStorage("localStorage"),
    PENDING_LANDING_TEMPLATE_SELECTION_LOCAL_KEY
  );
}

export function savePendingLandingTemplateSelection(templateOrId) {
  const templateId = resolveTemplateId(templateOrId);
  if (!templateId) {
    clearPendingLandingTemplateSelection();
    return null;
  }

  const selection = {
    templateId,
    createdAt: Date.now(),
  };

  writeSelection(
    getStorage("sessionStorage"),
    PENDING_LANDING_TEMPLATE_SELECTION_KEY,
    selection
  );
  writeSelection(
    getStorage("localStorage"),
    PENDING_LANDING_TEMPLATE_SELECTION_LOCAL_KEY,
    selection
  );

  return selection;
}

export function consumePendingLandingTemplateSelection() {
  const sessionStorage = getStorage("sessionStorage");
  const localStorage = getStorage("localStorage");
  const selection =
    readSelection(sessionStorage, PENDING_LANDING_TEMPLATE_SELECTION_KEY) ||
    readSelection(localStorage, PENDING_LANDING_TEMPLATE_SELECTION_LOCAL_KEY);

  clearPendingLandingTemplateSelection();

  return selection;
}
