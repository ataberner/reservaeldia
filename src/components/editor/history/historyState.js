export const DYNAMIC_VISUAL_HISTORY_STATE_VERSION = 1;

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isObjectTarget(target) {
  return normalizeText(target?.scope).toLowerCase() === "objeto";
}

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map(cloneSerializable);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, cloneSerializable(entry)])
  );
}

function cloneTarget(target) {
  return cloneSerializable(target);
}

export function buildDynamicVisualHistoryState({
  fieldsSchema = [],
  detachedVisuals = null,
} = {}) {
  return {
    version: DYNAMIC_VISUAL_HISTORY_STATE_VERSION,
    fields: (Array.isArray(fieldsSchema) ? fieldsSchema : [])
      .map((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return null;
        return {
          fieldKey,
          hasApplyTargets: Object.prototype.hasOwnProperty.call(
            field || {},
            "applyTargets"
          ),
          targets: (Array.isArray(field?.applyTargets) ? field.applyTargets : [])
            .filter(isObjectTarget)
            .map(cloneTarget),
        };
      })
      .filter(Boolean),
    detachedVisuals: cloneSerializable(detachedVisuals),
  };
}

export function isSupportedDynamicVisualHistoryState(value) {
  const state = asRecord(value);
  return Boolean(
    state &&
      Number(state.version) === DYNAMIC_VISUAL_HISTORY_STATE_VERSION &&
      Array.isArray(state.fields)
  );
}

export function restoreDynamicVisualHistorySlice({
  historyState,
  fieldsSchema = [],
  detachedVisuals = null,
} = {}) {
  const currentFields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  if (!isSupportedDynamicVisualHistoryState(historyState)) {
    return {
      applied: false,
      fieldsSchema: currentFields,
      detachedVisuals,
    };
  }

  const records = new Map(
    historyState.fields
      .map((record) => [normalizeText(record?.fieldKey), asRecord(record)])
      .filter(([fieldKey, record]) => Boolean(fieldKey && record))
  );
  const nextFieldsSchema = currentFields.map((field) => {
    const fieldKey = normalizeText(field?.key);
    const record = records.get(fieldKey);
    const currentTargets = Array.isArray(field?.applyTargets)
      ? field.applyTargets
      : [];
    const nonObjectTargets = currentTargets
      .filter((target) => !isObjectTarget(target))
      .map(cloneTarget);

    // A versioned snapshot that predates this field has no visual mapping for it.
    // Keep the field/value contract, but restore it as an explicit data-only field.
    if (!record) {
      if (!currentTargets.some(isObjectTarget)) return field;
      return { ...field, applyTargets: nonObjectTargets };
    }

    const objectTargets = (Array.isArray(record.targets) ? record.targets : [])
      .filter(isObjectTarget)
      .map(cloneTarget);
    if (record.hasApplyTargets !== true && nonObjectTargets.length === 0) {
      const { applyTargets: _applyTargets, ...withoutTargets } = field;
      return withoutTargets;
    }
    return {
      ...field,
      applyTargets: [...nonObjectTargets, ...objectTargets],
    };
  });

  return {
    applied: true,
    fieldsSchema: nextFieldsSchema,
    detachedVisuals: cloneSerializable(historyState.detachedVisuals),
  };
}

function serializeComparable(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function hasDynamicVisualHistoryChange(beforeState, afterState) {
  const before = serializeComparable(beforeState);
  const after = serializeComparable(afterState);
  if (before === null || after === null) return true;
  return before !== after;
}

export function evaluateEditorHistoryCapture({
  cargado = false,
  authoringHydrated = true,
  suppressed = false,
  interactionActive = false,
  lastSignature = "",
  objetos = [],
  secciones = [],
  dynamicVisualState = null,
} = {}) {
  if (!cargado) {
    return {
      shouldCapture: false,
      consumeSuppression: false,
      nextBaselineSignature: "",
      reason: "not-loaded",
    };
  }
  if (authoringHydrated !== true) {
    return {
      shouldCapture: false,
      consumeSuppression: false,
      nextBaselineSignature: lastSignature,
      reason: "authoring-not-hydrated",
    };
  }

  const comparable = { objetos, secciones, dynamicVisualState };
  const signature = serializeComparable(comparable);
  if (signature === null) {
    return {
      shouldCapture: false,
      consumeSuppression: false,
      nextBaselineSignature: lastSignature,
      reason: "unserializable",
    };
  }
  if (suppressed) {
    return {
      shouldCapture: false,
      consumeSuppression: true,
      nextBaselineSignature: signature,
      reason: "suppressed",
    };
  }
  if (interactionActive) {
    return {
      shouldCapture: false,
      consumeSuppression: false,
      nextBaselineSignature: lastSignature,
      reason: "interaction-active",
    };
  }
  if (signature === lastSignature) {
    return {
      shouldCapture: false,
      consumeSuppression: false,
      nextBaselineSignature: signature,
      reason: "unchanged",
    };
  }
  return {
    shouldCapture: true,
    consumeSuppression: false,
    nextBaselineSignature: signature,
    comparable,
    reason: "changed",
  };
}

export function planUndoHistoryTransition({ history = [], future = [] } = {}) {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeFuture = Array.isArray(future) ? future : [];
  if (safeHistory.length <= 1) return null;

  const currentSnapshot = safeHistory[safeHistory.length - 1];
  const nextHistory = safeHistory.slice(0, -1);
  return {
    targetSnapshot: nextHistory[nextHistory.length - 1],
    history: nextHistory,
    future: [currentSnapshot, ...safeFuture.slice(0, 19)],
  };
}

export function planRedoHistoryTransition({ history = [], future = [] } = {}) {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeFuture = Array.isArray(future) ? future : [];
  if (safeFuture.length === 0) return null;

  const targetSnapshot = safeFuture[0];
  return {
    targetSnapshot,
    history: [...safeHistory, targetSnapshot],
    future: safeFuture.slice(1),
  };
}
