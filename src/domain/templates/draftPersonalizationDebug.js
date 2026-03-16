const DEBUG_PREFIX = "[template-draft-debug]";
const DEBUG_ENABLED = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function ensureGlobalState() {
  if (!DEBUG_ENABLED) return null;
  if (!isBrowser()) return null;

  if (!window.__TEMPLATE_DRAFT_DEBUG_STATE) {
    window.__TEMPLATE_DRAFT_DEBUG_STATE = {
      session: null,
      renderedIds: {},
    };
  }

  return window.__TEMPLATE_DRAFT_DEBUG_STATE;
}

export function logTemplateDraftDebug(label, payload = null) {
  if (!DEBUG_ENABLED) return;
  if (payload === null || typeof payload === "undefined") {
    console.log(`${DEBUG_PREFIX} ${label}`);
    return;
  }

  console.log(`${DEBUG_PREFIX} ${label}`, payload);
}

export function groupTemplateDraftDebug(label, payloads = []) {
  if (!DEBUG_ENABLED) return;
  console.groupCollapsed(`${DEBUG_PREFIX} ${label}`);
  (Array.isArray(payloads) ? payloads : []).forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const [subLabel, payload] = entry;
    console.log(`${DEBUG_PREFIX} ${subLabel}`, payload);
  });
  console.groupEnd();
}

export function setTemplateDraftDebugSession(session) {
  if (!DEBUG_ENABLED) return;
  const state = ensureGlobalState();
  if (!state) return;

  state.session = session && typeof session === "object" ? session : null;
  state.renderedIds = {};

  if (!state.session) {
    logTemplateDraftDebug("session:cleared");
    return;
  }

  groupTemplateDraftDebug("session:set", [
    ["session:meta", {
      slug: state.session.slug || null,
      objectIds: Object.keys(state.session.objectsById || {}),
      createdAt: state.session.createdAt || null,
    }],
    ["session:objects", state.session.objectsById || {}],
  ]);
}

export function getTemplateDraftDebugSession() {
  if (!DEBUG_ENABLED) return null;
  const state = ensureGlobalState();
  return state?.session || null;
}

export function markTemplateDraftRenderLogged(slug, objectId) {
  if (!DEBUG_ENABLED) return false;
  const state = ensureGlobalState();
  if (!state || !slug || !objectId) return false;

  const safeSlug = String(slug);
  const safeObjectId = String(objectId);
  if (!state.renderedIds[safeSlug]) {
    state.renderedIds[safeSlug] = {};
  }
  if (state.renderedIds[safeSlug][safeObjectId]) {
    return false;
  }

  state.renderedIds[safeSlug][safeObjectId] = true;
  return true;
}
