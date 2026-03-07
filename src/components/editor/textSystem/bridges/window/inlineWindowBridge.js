function hasWindow() {
  return typeof window !== "undefined";
}

export function getCurrentInlineEditingId() {
  if (!hasWindow()) return null;
  return window._currentEditingId ?? null;
}

export function setCurrentInlineEditingId(id) {
  if (!hasWindow()) return;
  window._currentEditingId = id || null;
}

export function clearCurrentInlineEditingIdIfMatches(id) {
  if (!hasWindow()) return;
  if (window._currentEditingId === id) {
    window._currentEditingId = null;
  }
}

export function getInlineEditingSnapshot() {
  if (!hasWindow()) return null;
  return window.editing ?? null;
}

export function setInlineEditingSnapshot(editing) {
  if (!hasWindow()) return;
  window.editing = editing;
}

export function clearInlineEditingSnapshotIfMatches(id) {
  if (!hasWindow()) return;
  if (window.editing && window.editing.id === id) {
    delete window.editing;
  }
}

export function getWindowElementRefs() {
  if (!hasWindow()) return null;
  return window._elementRefs || null;
}

export function getWindowObjectResolver() {
  if (!hasWindow()) return null;
  return typeof window.__getObjById === "function" ? window.__getObjById : null;
}

export function getInlineResizeData() {
  if (!hasWindow()) return null;
  return window._resizeData ?? null;
}

export function setInlineResizeData(payload) {
  if (!hasWindow()) return;
  window._resizeData = payload ?? null;
}

export function clearInlineResizeData() {
  if (!hasWindow()) return;
  window._resizeData = null;
}
