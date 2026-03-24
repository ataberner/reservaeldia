function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

const RENDER_CONTRACT_STATUSES = Object.freeze({
  MODERN_SUPPORTED: "modern_supported",
  LEGACY_FROZEN_COMPAT: "legacy_frozen_compat",
});

const RENDER_CONTRACT_IDS = Object.freeze({
  COUNTDOWN_SCHEMA_V1: "countdown_schema_v1",
  COUNTDOWN_SCHEMA_V2: "countdown_schema_v2",
  ICONO_MODERN: "icono_modern",
  ICONO_SVG_LEGACY: "icono_svg_legacy",
});

const RENDER_CONTRACT_METADATA = Object.freeze({
  [RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V1]: Object.freeze({
    id: RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V1,
    status: RENDER_CONTRACT_STATUSES.LEGACY_FROZEN_COMPAT,
    allowedForNewAuthoring: false,
    reason:
      "Legacy countdown schema v1 remains supported for compatibility, but it is frozen for new product expansion.",
    replacementContractId: RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V2,
    notes:
      "Prefer countdown schema v2 for all new authoring, presets, and contract growth.",
  }),
  [RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V2]: Object.freeze({
    id: RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V2,
    status: RENDER_CONTRACT_STATUSES.MODERN_SUPPORTED,
    allowedForNewAuthoring: true,
    reason: "Countdown schema v2 is the modern supported contract.",
    replacementContractId: null,
    notes: "Use this contract for all new countdown authoring and expansion.",
  }),
  [RENDER_CONTRACT_IDS.ICONO_MODERN]: Object.freeze({
    id: RENDER_CONTRACT_IDS.ICONO_MODERN,
    status: RENDER_CONTRACT_STATUSES.MODERN_SUPPORTED,
    allowedForNewAuthoring: true,
    reason: "The modern icono contract is the supported path for new icon authoring.",
    replacementContractId: null,
    notes: "Use tipo='icono' for both raster and inline SVG icon authoring.",
  }),
  [RENDER_CONTRACT_IDS.ICONO_SVG_LEGACY]: Object.freeze({
    id: RENDER_CONTRACT_IDS.ICONO_SVG_LEGACY,
    status: RENDER_CONTRACT_STATUSES.LEGACY_FROZEN_COMPAT,
    allowedForNewAuthoring: false,
    reason:
      "Legacy tipo='icono-svg' remains supported for compatibility, but it is frozen for new product expansion.",
    replacementContractId: RENDER_CONTRACT_IDS.ICONO_MODERN,
    notes: "Use tipo='icono' for all new icon work.",
  }),
});

function getRenderContractMetadata(contractId) {
  return RENDER_CONTRACT_METADATA[normalizeText(contractId)] || null;
}

function buildContractClassification(params) {
  const metadata = getRenderContractMetadata(params.contractId);
  const status = metadata?.status || RENDER_CONTRACT_STATUSES.MODERN_SUPPORTED;

  return {
    type: params.type || "unknown",
    contractId: params.contractId || null,
    contractVersion: params.contractVersion || null,
    schemaVersion: params.schemaVersion ?? null,
    metadata,
    status,
    allowedForNewAuthoring:
      typeof metadata?.allowedForNewAuthoring === "boolean"
        ? metadata.allowedForNewAuthoring
        : true,
    replacementContractId: metadata?.replacementContractId || null,
    reason: metadata?.reason || "",
    notes: metadata?.notes || "",
    isLegacyFrozenCompat:
      status === RENDER_CONTRACT_STATUSES.LEGACY_FROZEN_COMPAT,
  };
}

function resolveCountdownTargetIso(value) {
  const safeValue = asObject(value);
  const fechaObjetivo = normalizeText(safeValue.fechaObjetivo);
  if (fechaObjetivo) {
    return {
      targetISO: fechaObjetivo,
      sourceField: "fechaObjetivo",
      usesCompatibilityAlias: false,
      hasTarget: true,
    };
  }

  const targetISO = normalizeText(safeValue.targetISO);
  if (targetISO) {
    return {
      targetISO,
      sourceField: "targetISO",
      usesCompatibilityAlias: true,
      hasTarget: true,
    };
  }

  const fechaISO = normalizeText(safeValue.fechaISO);
  if (fechaISO) {
    return {
      targetISO: fechaISO,
      sourceField: "fechaISO",
      usesCompatibilityAlias: true,
      hasTarget: true,
    };
  }

  return {
    targetISO: "",
    sourceField: "",
    usesCompatibilityAlias: false,
    hasTarget: false,
  };
}

function resolveCountdownContract(value) {
  const safeValue = asObject(value);
  const parsedSchemaVersion = Number(safeValue.countdownSchemaVersion);
  const isV2 = Number.isFinite(parsedSchemaVersion) && parsedSchemaVersion >= 2;

  return buildContractClassification({
    type: "countdown",
    contractId: isV2
      ? RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V2
      : RENDER_CONTRACT_IDS.COUNTDOWN_SCHEMA_V1,
    contractVersion: isV2 ? "v2" : "v1",
    schemaVersion: isV2 ? Math.max(2, Math.trunc(parsedSchemaVersion)) : 1,
  });
}

function classifyRenderObjectContract(value) {
  const safeValue = asObject(value);
  const tipo = normalizeLowerText(safeValue.tipo);

  if (tipo === "countdown") {
    return resolveCountdownContract(safeValue);
  }

  if (tipo === "icono-svg") {
    return buildContractClassification({
      type: "icon",
      contractId: RENDER_CONTRACT_IDS.ICONO_SVG_LEGACY,
      contractVersion: "legacy",
      schemaVersion: null,
    });
  }

  if (tipo === "icono") {
    return buildContractClassification({
      type: "icon",
      contractId: RENDER_CONTRACT_IDS.ICONO_MODERN,
      contractVersion:
        normalizeLowerText(safeValue.formato) === "svg" ? "svg" : "raster",
      schemaVersion: null,
    });
  }

  return buildContractClassification({
    type: tipo || "unknown",
    contractId: null,
    contractVersion: null,
    schemaVersion: null,
  });
}

function collectLegacyRenderContracts(renderState) {
  const safeRenderState = asObject(renderState);
  const objects = Array.isArray(safeRenderState.objetos)
    ? safeRenderState.objetos
    : [];
  const byContractId = new Map();

  objects.forEach((entry, index) => {
    const classification = classifyRenderObjectContract(entry);
    if (!classification.isLegacyFrozenCompat || !classification.contractId) return;

    const objectId = normalizeText(asObject(entry).id) || `index-${index}`;
    if (byContractId.has(classification.contractId)) {
      const current = byContractId.get(classification.contractId);
      current.count += 1;
      if (objectId && !current.objectIds.includes(objectId)) {
        current.objectIds.push(objectId);
      }
      return;
    }

    byContractId.set(classification.contractId, {
      contractId: classification.contractId,
      metadata: classification.metadata,
      status: classification.status,
      allowedForNewAuthoring: classification.allowedForNewAuthoring,
      replacementContractId: classification.replacementContractId,
      reason: classification.reason,
      notes: classification.notes,
      count: 1,
      objectIds: objectId ? [objectId] : [],
    });
  });

  return Array.from(byContractId.values());
}

module.exports = {
  RENDER_CONTRACT_STATUSES,
  RENDER_CONTRACT_IDS,
  getRenderContractMetadata,
  resolveCountdownTargetIso,
  resolveCountdownContract,
  classifyRenderObjectContract,
  collectLegacyRenderContracts,
};
