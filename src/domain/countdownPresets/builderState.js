function stableValue(value) {
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function buildSvgFingerprint(svgAsset) {
  if (!svgAsset) return null;
  if (svgAsset.isDirty) {
    return {
      isDirty: true,
      type: String(svgAsset.type || "svg"),
      mimeType: String(svgAsset.mimeType || ""),
      fileName: String(svgAsset.fileName || ""),
      colorMode: String(svgAsset.colorMode || "fixed"),
      assetBase64: String(svgAsset.assetBase64 || ""),
      svgBase64: String(svgAsset.svgBase64 || ""),
      svgText: String(svgAsset.svgText || ""),
      width: Number(svgAsset.width || 0) || null,
      height: Number(svgAsset.height || 0) || null,
      hasAlpha:
        typeof svgAsset.hasAlpha === "boolean" ? svgAsset.hasAlpha : null,
      hasTransparency:
        typeof svgAsset.hasTransparency === "boolean"
          ? svgAsset.hasTransparency
          : null,
    };
  }
  return {
    isDirty: false,
    type: String(svgAsset.type || "svg"),
    mimeType: String(svgAsset.mimeType || ""),
    fileName: String(svgAsset.fileName || ""),
    colorMode: String(svgAsset.colorMode || "fixed"),
    downloadUrl: String(svgAsset.downloadUrl || svgAsset.previewUrl || ""),
    width: Number(svgAsset.width || 0) || null,
    height: Number(svgAsset.height || 0) || null,
    hasAlpha:
      typeof svgAsset.hasAlpha === "boolean" ? svgAsset.hasAlpha : null,
    hasTransparency:
      typeof svgAsset.hasTransparency === "boolean"
        ? svgAsset.hasTransparency
        : null,
  };
}

export function createCountdownBuilderFingerprint(formState) {
  const safeState =
    formState && typeof formState === "object" ? formState : {};
  return JSON.stringify(
    stableValue({
      nombre: String(safeState.nombre || ""),
      categoria: safeState.categoria || null,
      config: safeState.config || null,
      svgAsset: buildSvgFingerprint(safeState.svgAsset),
    })
  );
}

export function isCountdownBuilderDirty(formState, baselineFingerprint) {
  if (!baselineFingerprint) return false;
  return createCountdownBuilderFingerprint(formState) !== baselineFingerprint;
}

export function createCountdownOperationId(kind, randomUuid) {
  const safeKind = String(kind || "operation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 24);
  const uuid =
    typeof randomUuid === "function"
      ? randomUuid()
      : typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  return `${safeKind}_${String(uuid).replace(/[^a-zA-Z0-9_-]+/g, "")}`.slice(
    0,
    128
  );
}

export function resolveCountdownPublishControls({
  presetId,
  draftVersion,
  dirty,
  saving,
  publishing,
} = {}) {
  const hasSavedDraft = Boolean(presetId && Number(draftVersion) > 0);
  const busy = saving === true || publishing === true;
  return {
    canPublishSaved: hasSavedDraft && !dirty && !busy,
    canSaveAndPublish: !busy,
    publishBlockedByDirty: hasSavedDraft && dirty === true,
  };
}

export const COUNTDOWN_PREVIEW_SCENARIOS = Object.freeze([
  Object.freeze({
    id: "days",
    label: "Faltan 10 días",
    offsetMs: 10 * 24 * 60 * 60 * 1000,
  }),
  Object.freeze({
    id: "hours",
    label: "Faltan 3 horas",
    offsetMs: 3 * 60 * 60 * 1000,
  }),
  Object.freeze({
    id: "seconds",
    label: "Faltan 10 segundos",
    offsetMs: 10 * 1000,
  }),
  Object.freeze({
    id: "expired",
    label: "Evento finalizado",
    offsetMs: -1000,
  }),
  Object.freeze({
    id: "custom",
    label: "Fecha personalizada",
    offsetMs: null,
  }),
]);

export function buildCountdownPreviewScenario(
  scenarioId,
  { nowMs = Date.now(), customTargetISO = "" } = {}
) {
  const scenario =
    COUNTDOWN_PREVIEW_SCENARIOS.find((entry) => entry.id === scenarioId) ||
    COUNTDOWN_PREVIEW_SCENARIOS[0];
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

  if (scenario.id === "custom") {
    const customMs = new Date(customTargetISO).getTime();
    return {
      scenario: "custom",
      nowISO: new Date(safeNowMs).toISOString(),
      targetISO: Number.isFinite(customMs)
        ? new Date(customMs).toISOString()
        : "",
      customTargetISO: String(customTargetISO || ""),
    };
  }

  return {
    scenario: scenario.id,
    nowISO: new Date(safeNowMs).toISOString(),
    targetISO: new Date(safeNowMs + scenario.offsetMs).toISOString(),
    customTargetISO: "",
  };
}

function getPresetName(item) {
  return String(item?.draft?.nombre || item?.nombre || item?.id || "");
}

function getPresetCategory(item) {
  return item?.draft?.categoria || item?.categoria || {};
}

function getUpdatedAtMs(item) {
  const raw = item?.metadata?.updatedAt || item?.metadata?.publishedAt;
  const parsed = new Date(raw || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isCountdownPresetLegacy(item) {
  if (item?.legacyPresetProps && typeof item.legacyPresetProps === "object") {
    return true;
  }
  return (
    String(item?.metadata?.migrationSource || "").toLowerCase() ===
    "legacy-config-v1"
  );
}

export function isCountdownPresetProtected(item) {
  return Boolean(
    Number(item?.activeVersion || 0) > 0 ||
      item?.metadata?.tombstonedAt ||
      item?.metadata?.tombstoneReason
  );
}

export function filterCountdownPresetItems(
  items,
  {
    query = "",
    status = "all",
    category = "all",
    sort = "updated-desc",
  } = {}
) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  const normalizedStatus = String(status || "all");
  const normalizedCategory = String(category || "all");
  const filtered = (Array.isArray(items) ? items : []).filter((item) => {
    const itemStatus = String(item?.estado || "draft");
    const itemCategory = getPresetCategory(item);
    const haystack = [
      getPresetName(item),
      item?.id,
      itemCategory?.label,
      itemCategory?.event,
      itemCategory?.style,
    ]
      .map((entry) => String(entry || "").toLocaleLowerCase("es"))
      .join(" ");

    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    if (normalizedStatus !== "all" && itemStatus !== normalizedStatus) {
      return false;
    }
    if (
      normalizedCategory !== "all" &&
      String(itemCategory?.event || "") !== normalizedCategory
    ) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    if (sort === "name-asc") {
      return getPresetName(left).localeCompare(getPresetName(right), "es", {
        sensitivity: "base",
      });
    }
    if (sort === "version-desc") {
      const versionDiff =
        Number(right?.activeVersion || 0) - Number(left?.activeVersion || 0);
      if (versionDiff !== 0) return versionDiff;
    }
    const updatedDiff = getUpdatedAtMs(right) - getUpdatedAtMs(left);
    if (updatedDiff !== 0) return updatedDiff;
    return getPresetName(left).localeCompare(getPresetName(right), "es", {
      sensitivity: "base",
    });
  });
}

export function getCountdownPresetCategoryOptions(items) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(getPresetCategory(item)?.event || "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "es"));
}

export function resolveCountdownCatalogSelection({
  currentSelectionId = null,
  selectionEpoch = 0,
  dirty = false,
  nextItems = [],
  preferredId = null,
  selectPreferred = false,
} = {}) {
  const items = Array.isArray(nextItems) ? nextItems : [];
  const preferredItem = preferredId
    ? items.find((item) => item?.id === preferredId) || null
    : null;
  if (selectPreferred && preferredItem) {
    return { shouldReplace: true, item: preferredItem };
  }
  const currentItem = currentSelectionId
    ? items.find((item) => item?.id === currentSelectionId) || null
    : null;
  if (currentItem) return { shouldReplace: false, item: currentItem };
  if (dirty || (!currentSelectionId && Number(selectionEpoch) > 0)) {
    return { shouldReplace: false, item: null };
  }
  return {
    shouldReplace: true,
    item: preferredItem || items[0] || null,
  };
}

export function createCountdownBuilderInitialState(emptyFormState) {
  const form = emptyFormState || {};
  const baselineFingerprint = createCountdownBuilderFingerprint(form);
  const preview = buildCountdownPreviewScenario("days");
  return {
    catalog: {
      items: [],
      loading: false,
      error: "",
      requestId: 0,
    },
    selection: {
      id: null,
      epoch: 0,
    },
    editor: {
      form,
      persistedForm: form,
      baselineFingerprint,
      presetId: null,
      draftVersion: null,
    },
    validation: {
      valid: true,
      errors: [],
      warnings: [],
      fieldErrors: {},
      sectionErrors: {},
      touchedFields: [],
      attempted: false,
      firstField: null,
    },
    operation: {
      active: null,
      lastCompleted: null,
      error: "",
    },
    notice: null,
    filters: {
      query: "",
      status: "all",
      category: "all",
      sort: "updated-desc",
    },
    preview: {
      viewport: "desktop",
      background: "light",
      zoom: 100,
      reducedMotion: false,
      mobileExpanded: false,
      ...preview,
    },
    history: {
      open: false,
      loading: false,
      error: "",
      items: [],
      activeVersion: 0,
      selectedVersion: null,
      requestId: 0,
      presetId: null,
    },
    confirmation: null,
  };
}

function withValidationTouch(validation, fieldId) {
  if (!fieldId) return validation;
  const touched = new Set(validation?.touchedFields || []);
  touched.add(fieldId);
  return { ...validation, touchedFields: [...touched] };
}

export function countdownBuilderReducer(state, action) {
  switch (action?.type) {
    case "catalog/load-started":
      return {
        ...state,
        catalog: {
          ...state.catalog,
          loading: true,
          error: "",
          requestId: action.requestId,
        },
      };
    case "catalog/load-succeeded":
      if (action.requestId !== state.catalog.requestId) return state;
      return {
        ...state,
        catalog: {
          ...state.catalog,
          items: Array.isArray(action.items) ? action.items : [],
          loading: false,
          error: "",
        },
      };
    case "catalog/load-failed":
      if (action.requestId !== state.catalog.requestId) return state;
      return {
        ...state,
        catalog: {
          ...state.catalog,
          items: state.catalog.items,
          loading: false,
          error: String(action.error || ""),
        },
      };
    case "selection/replaced": {
      const form = action.formState || {};
      return {
        ...state,
        selection: {
          id: action.presetId || null,
          epoch: state.selection.epoch + 1,
        },
        editor: {
          form,
          persistedForm: form,
          baselineFingerprint: createCountdownBuilderFingerprint(form),
          presetId: action.presetId || null,
          draftVersion: action.draftVersion ?? null,
        },
        validation: {
          ...(action.validation || state.validation),
          touchedFields: [],
          attempted: false,
        },
        operation: {
          active: null,
          lastCompleted: null,
          error: "",
        },
        notice: null,
        history: {
          ...state.history,
          open: false,
          loading: false,
          error: "",
          items: [],
          selectedVersion: null,
          presetId: action.presetId || null,
        },
      };
    }
    case "editor/changed":
      return {
        ...state,
        editor: {
          ...state.editor,
          form: action.formState || state.editor.form,
        },
        validation: withValidationTouch(
          {
            ...state.validation,
            ...(action.validation || {}),
            attempted: state.validation.attempted,
          },
          action.fieldId
        ),
        operation: {
          ...state.operation,
          error: "",
        },
      };
    case "editor/validation-attempted":
      return {
        ...state,
        validation: {
          ...state.validation,
          ...(action.validation || {}),
          attempted: true,
        },
      };
    case "editor/mark-saved": {
      if (action.selectionEpoch !== state.selection.epoch) return state;
      const savedForm = action.savedForm || state.editor.form;
      const currentFingerprint = createCountdownBuilderFingerprint(
        state.editor.form
      );
      const form =
        currentFingerprint === action.requestFingerprint
          ? savedForm
          : state.editor.form;
      return {
        ...state,
        selection: {
          ...state.selection,
          id: action.presetId || state.selection.id,
        },
        editor: {
          ...state.editor,
          form,
          persistedForm: savedForm,
          baselineFingerprint: createCountdownBuilderFingerprint(savedForm),
          presetId: action.presetId || state.editor.presetId,
          draftVersion: action.draftVersion ?? state.editor.draftVersion,
        },
        validation: {
          ...state.validation,
          ...(action.validation || {}),
          attempted: false,
        },
      };
    }
    case "editor/published":
      if (action.selectionEpoch !== state.selection.epoch) return state;
      return {
        ...state,
        editor: {
          ...state.editor,
          draftVersion: null,
          persistedForm: state.editor.form,
          baselineFingerprint: createCountdownBuilderFingerprint(
            state.editor.form
          ),
        },
        validation: {
          ...state.validation,
          touchedFields: [],
          attempted: false,
        },
      };
    case "editor/discarded":
      return {
        ...state,
        editor: {
          ...state.editor,
          form: state.editor.persistedForm,
        },
        validation: {
          ...state.validation,
          touchedFields: [],
          attempted: false,
          errors: [],
          fieldErrors: {},
          sectionErrors: {},
          firstField: null,
        },
        operation: {
          ...state.operation,
          error: "",
        },
      };
    case "operation/started":
      return {
        ...state,
        operation: {
          ...state.operation,
          active: {
            kind: action.kind,
            selectionEpoch: state.selection.epoch,
            startedAt: action.startedAt || new Date().toISOString(),
          },
          error: "",
        },
        notice: null,
      };
    case "operation/completed":
      return {
        ...state,
        operation: {
          active: null,
          error: "",
          lastCompleted: {
            kind: action.kind,
            completedAt: action.completedAt || new Date().toISOString(),
            message: String(action.message || ""),
          },
        },
        notice: action.message
          ? { type: "success", text: String(action.message) }
          : state.notice,
      };
    case "operation/failed":
      return {
        ...state,
        operation: {
          ...state.operation,
          active: null,
          error: String(action.error || ""),
        },
        notice: {
          type: "error",
          text: String(action.error || "La operación no pudo completarse."),
        },
      };
    case "notice/set":
      return { ...state, notice: action.notice || null };
    case "notice/clear":
      return { ...state, notice: null };
    case "filters/changed":
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.key]: action.value,
        },
      };
    case "preview/changed":
      return {
        ...state,
        preview: {
          ...state.preview,
          ...(action.patch || {}),
        },
      };
    case "history/opened":
      return {
        ...state,
        history: {
          ...state.history,
          open: true,
          presetId: action.presetId || state.selection.id,
        },
      };
    case "history/load-started":
      return {
        ...state,
        history: {
          ...state.history,
          open: true,
          loading: true,
          error: "",
          requestId: action.requestId,
          presetId: action.presetId,
        },
      };
    case "history/load-succeeded":
      if (
        action.requestId !== state.history.requestId ||
        action.presetId !== state.selection.id
      ) {
        return state;
      }
      return {
        ...state,
        history: {
          ...state.history,
          loading: false,
          error: "",
          items: Array.isArray(action.items) ? action.items : [],
          activeVersion: Number(action.activeVersion || 0),
          selectedVersion:
            action.selectedVersion ||
            action.items?.find(
              (entry) => Number(entry?.version) === Number(action.activeVersion)
            ) ||
            action.items?.[0] ||
            null,
        },
      };
    case "history/load-failed":
      if (
        action.requestId !== state.history.requestId ||
        action.presetId !== state.selection.id
      ) {
        return state;
      }
      return {
        ...state,
        history: {
          ...state.history,
          loading: false,
          error: String(action.error || ""),
          items: [],
          selectedVersion: null,
        },
      };
    case "history/version-selected":
      return {
        ...state,
        history: {
          ...state.history,
          selectedVersion: action.version || null,
        },
      };
    case "history/closed":
      return {
        ...state,
        history: {
          ...state.history,
          open: false,
        },
      };
    case "confirmation/opened":
      return {
        ...state,
        confirmation: action.confirmation || null,
      };
    case "confirmation/closed":
      return {
        ...state,
        confirmation: null,
      };
    default:
      return state;
  }
}

export function selectCountdownBuilderDirty(state) {
  return isCountdownBuilderDirty(
    state?.editor?.form,
    state?.editor?.baselineFingerprint
  );
}

export function selectCountdownBuilderSelectedItem(state) {
  const selectedId = state?.selection?.id;
  return (
    (state?.catalog?.items || []).find((item) => item?.id === selectedId) ||
    null
  );
}

export function selectFilteredCountdownPresetItems(state) {
  return filterCountdownPresetItems(state?.catalog?.items, state?.filters);
}

export function selectCountdownBuilderBusy(state, kind = null) {
  const activeKind = state?.operation?.active?.kind || null;
  return kind ? activeKind === kind : Boolean(activeKind);
}
