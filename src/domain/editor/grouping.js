import { prepareGroupAwareRenderState } from "../../../shared/groupRenderContract.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMetric(value, digits = 3) {
  const numeric = toFiniteNumber(value, null);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function clamp01(value) {
  const numeric = toFiniteNumber(value, null);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeAnchor(value) {
  return normalizeText(value).toLowerCase() === "fullbleed"
    ? "fullbleed"
    : "content";
}

function normalizeSectionMode(value) {
  return normalizeText(value).toLowerCase() === "pantalla"
    ? "pantalla"
    : "fijo";
}

function hasConfiguredLink(value) {
  if (typeof value === "string") {
    return normalizeText(value).length > 0;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return normalizeText(value.href).length > 0;
}

function deepClone(value) {
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fallback below keeps the helper usable in every runtime.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeSelectedIds(selectedIds) {
  const seen = new Set();
  return asArray(selectedIds).reduce((acc, value) => {
    const safeId = normalizeText(value);
    if (!safeId || seen.has(safeId)) return acc;
    seen.add(safeId);
    acc.push(safeId);
    return acc;
  }, []);
}

function buildSectionMetrics(secciones = []) {
  const orderedSections = [...asArray(secciones)].sort(
    (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
  );
  const metricsById = new Map();
  let top = 0;

  orderedSections.forEach((section) => {
    const sectionId = normalizeText(section?.id);
    if (!sectionId) return;

    const height = Math.max(
      0,
      toFiniteNumber(section?.altura, toFiniteNumber(section?.height, 400)) || 400
    );
    metricsById.set(sectionId, {
      section,
      top,
      height,
    });
    top += height;
  });

  return metricsById;
}

function isObjectSupportedForGrouping(object) {
  const tipo = normalizeText(object?.tipo).toLowerCase();
  if (!tipo) return false;

  return ![
    "grupo",
    "decoracion-fondo",
    "imagen-fondo-seccion",
  ].includes(tipo);
}

function resolveObjectLocalY(object, alturaPantalla) {
  const directY = toFiniteNumber(object?.y, null);
  if (Number.isFinite(directY)) return directY;

  const yNorm = clamp01(object?.yNorm);
  const safeHeight = Math.max(1, toFiniteNumber(alturaPantalla, 500) || 500);
  return Number.isFinite(yNorm) ? yNorm * safeHeight : 0;
}

function stripGroupChildRootFields(child) {
  const nextChild = { ...child };
  delete nextChild.seccionId;
  delete nextChild.anclaje;
  delete nextChild.yNorm;
  return nextChild;
}

function normalizeSelectionFrame(selectionFrame) {
  if (!selectionFrame || typeof selectionFrame !== "object") return null;

  const x = toFiniteNumber(selectionFrame.x, null);
  const y = toFiniteNumber(selectionFrame.y, null);
  const width = toFiniteNumber(selectionFrame.width, null);
  const height = toFiniteNumber(selectionFrame.height, null);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { x, y, width, height };
}

const BLOCKING_UNGROUP_CONTRACT_CODES = new Set([
  "group-section-reference-missing",
  "group-children-missing",
  "group-nested-unsupported",
  "group-child-anchor-forbidden",
  "group-child-section-forbidden",
  "group-child-ynorm-forbidden",
]);

export function createEditorGroupId(seed = Date.now()) {
  return `obj-${Math.round(toFiniteNumber(seed, Date.now())).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function resolveMultiSelectionMenuCandidate({
  objetos,
  selectedIds,
} = {}) {
  const safeObjetos = asArray(objetos);
  const safeSelectedIds = normalizeSelectedIds(selectedIds);

  if (safeSelectedIds.length < 2) {
    return {
      eligible: false,
      reason: "selection-size",
      selectedIds: safeSelectedIds,
      selectedObjects: [],
      selectedIndices: [],
    };
  }

  const selectedIdSet = new Set(safeSelectedIds);
  const orderedSelectedObjects = [];
  const orderedSelectedIndices = [];

  safeObjetos.forEach((object, index) => {
    const objectId = normalizeText(object?.id);
    if (!objectId || !selectedIdSet.has(objectId)) return;

    orderedSelectedObjects.push(object);
    orderedSelectedIndices.push(index);
  });

  if (orderedSelectedObjects.length !== safeSelectedIds.length) {
    return {
      eligible: false,
      reason: "selection-missing-root-object",
      selectedIds: safeSelectedIds,
      selectedObjects: orderedSelectedObjects,
      selectedIndices: orderedSelectedIndices,
    };
  }

  return {
    eligible: true,
    reason: "ready",
    selectedIds: safeSelectedIds,
    selectedObjects: orderedSelectedObjects,
    selectedIndices: orderedSelectedIndices,
  };
}

export function resolveGroupingSelectionCandidate({
  objetos,
  selectedIds,
} = {}) {
  const baseSelection = resolveMultiSelectionMenuCandidate({
    objetos,
    selectedIds,
  });

  if (!baseSelection.eligible) {
    return baseSelection;
  }

  const safeSelectedIds = baseSelection.selectedIds;
  const orderedSelectedObjects = baseSelection.selectedObjects;
  const orderedSelectedIndices = baseSelection.selectedIndices;

  if (!orderedSelectedObjects.every(isObjectSupportedForGrouping)) {
    return {
      eligible: false,
      reason: "unsupported-object-family",
      selectedIds: safeSelectedIds,
      selectedObjects: orderedSelectedObjects,
      selectedIndices: orderedSelectedIndices,
    };
  }

  const firstObject = orderedSelectedObjects[0] || null;
  const sectionId = normalizeText(firstObject?.seccionId);
  const anchor = normalizeAnchor(firstObject?.anclaje);

  if (!sectionId) {
    return {
      eligible: false,
      reason: "selection-section-missing",
      selectedIds: safeSelectedIds,
      selectedObjects: orderedSelectedObjects,
      selectedIndices: orderedSelectedIndices,
    };
  }

  const hasMixedSections = orderedSelectedObjects.some(
    (object) => normalizeText(object?.seccionId) !== sectionId
  );
  if (hasMixedSections) {
    return {
      eligible: false,
      reason: "selection-mixed-section",
      selectedIds: safeSelectedIds,
      selectedObjects: orderedSelectedObjects,
      selectedIndices: orderedSelectedIndices,
    };
  }

  const hasMixedAnchors = orderedSelectedObjects.some(
    (object) => normalizeAnchor(object?.anclaje) !== anchor
  );
  if (hasMixedAnchors) {
    return {
      eligible: false,
      reason: "selection-mixed-anchor",
      selectedIds: safeSelectedIds,
      selectedObjects: orderedSelectedObjects,
      selectedIndices: orderedSelectedIndices,
    };
  }

  return {
    eligible: true,
    reason: "ready",
    selectedIds: safeSelectedIds,
    selectedObjects: orderedSelectedObjects,
    selectedIndices: orderedSelectedIndices,
    firstIndex: orderedSelectedIndices[0],
    sectionId,
    anchor,
  };
}

export function buildGroupedSelectionState({
  objetos,
  secciones,
  selectedIds,
  selectionFrame,
  alturaPantalla = 500,
  groupId = createEditorGroupId(),
} = {}) {
  const selection = resolveGroupingSelectionCandidate({
    objetos,
    selectedIds,
  });
  if (!selection.eligible) {
    return {
      ok: false,
      reason: selection.reason,
      selection,
      contractIssues: [],
      nextObjetos: asArray(objetos),
    };
  }

  const safeFrame = normalizeSelectionFrame(selectionFrame);
  if (!safeFrame) {
    return {
      ok: false,
      reason: "selection-frame-missing",
      selection,
      contractIssues: [],
      nextObjetos: asArray(objetos),
    };
  }

  const sectionMetrics = buildSectionMetrics(secciones);
  const targetSection = sectionMetrics.get(selection.sectionId);
  if (!targetSection) {
    return {
      ok: false,
      reason: "selection-section-missing",
      selection,
      contractIssues: [],
      nextObjetos: asArray(objetos),
    };
  }

  const sectionMode = normalizeSectionMode(targetSection.section?.altoModo);
  const localY = safeFrame.y - targetSection.top;
  const nextGroup = {
    id: normalizeText(groupId) || createEditorGroupId(),
    tipo: "grupo",
    seccionId: selection.sectionId,
    anclaje: selection.anchor,
    x: roundMetric(safeFrame.x, 3),
    y: roundMetric(localY, 3),
    width: roundMetric(safeFrame.width, 3),
    height: roundMetric(safeFrame.height, 3),
    children: selection.selectedObjects.map((object) => {
      const clonedChild = stripGroupChildRootFields(deepClone(object));
      const childX = toFiniteNumber(object?.x, 0) - safeFrame.x;
      const childY =
        resolveObjectLocalY(object, alturaPantalla) - localY;

      return {
        ...clonedChild,
        x: roundMetric(childX, 3),
        y: roundMetric(childY, 3),
      };
    }),
  };

  if (sectionMode === "pantalla") {
    const yNorm = clamp01(localY / Math.max(1, toFiniteNumber(alturaPantalla, 500) || 500));
    if (Number.isFinite(yNorm)) {
      nextGroup.yNorm = roundMetric(yNorm, 6);
    }
  }

  const safeObjetos = asArray(objetos);
  const selectedRootIdSet = new Set(
    selection.selectedObjects
      .map((object) => normalizeText(object?.id))
      .filter(Boolean)
  );
  const rootObjectsWithoutSelection = safeObjetos.filter(
    (object) => !selectedRootIdSet.has(normalizeText(object?.id))
  );
  const insertionIndex = Math.max(
    0,
    Math.min(
      toFiniteNumber(selection.firstIndex, rootObjectsWithoutSelection.length) ||
        0,
      rootObjectsWithoutSelection.length
    )
  );
  const nextObjetos = [
    ...rootObjectsWithoutSelection.slice(0, insertionIndex),
    nextGroup,
    ...rootObjectsWithoutSelection.slice(insertionIndex),
  ];
  const preparedState = prepareGroupAwareRenderState({
    objetos: nextObjetos,
    secciones: asArray(secciones),
  });
  const groupContractIssues = asArray(preparedState?.contractIssues).filter(
    (issue) => normalizeText(issue?.objectId) === nextGroup.id
  );

  if (groupContractIssues.length > 0) {
    return {
      ok: false,
      reason: "group-contract-invalid",
      selection,
      contractIssues: groupContractIssues,
      nextObjetos: asArray(preparedState?.objetos),
      group: nextGroup,
    };
  }

  return {
    ok: true,
    reason: "ready",
    selection,
    contractIssues: [],
    group:
      asArray(preparedState?.objetos).find(
        (object) => normalizeText(object?.id) === nextGroup.id
      ) || nextGroup,
    nextObjetos: asArray(preparedState?.objetos),
    preparedRenderContract: preparedState?.preparedRenderContract || null,
    selectedIds: [nextGroup.id],
  };
}

export function resolveUngroupSelectionCandidate({
  objetos,
  secciones,
  selectedIds,
} = {}) {
  const safeObjetos = asArray(objetos);
  const safeSelectedIds = normalizeSelectedIds(selectedIds);

  if (safeSelectedIds.length !== 1) {
    return {
      eligible: false,
      reason: "selection-size",
      selectedIds: safeSelectedIds,
      group: null,
      groupIndex: -1,
      groupChildren: [],
    };
  }

  const selectedId = safeSelectedIds[0];
  const groupIndex = safeObjetos.findIndex(
    (object) => normalizeText(object?.id) === selectedId
  );
  const group = groupIndex >= 0 ? safeObjetos[groupIndex] : null;

  if (!group) {
    return {
      eligible: false,
      reason: "selection-missing-root-object",
      selectedIds: safeSelectedIds,
      group: null,
      groupIndex,
      groupChildren: [],
    };
  }

  if (normalizeText(group?.tipo).toLowerCase() !== "grupo") {
    return {
      eligible: false,
      reason: "selection-not-group",
      selectedIds: safeSelectedIds,
      group,
      groupIndex,
      groupChildren: [],
    };
  }

  const groupChildren = asArray(group.children).filter(
    (child) => child && typeof child === "object" && !Array.isArray(child)
  );
  if (groupChildren.length === 0) {
    return {
      eligible: false,
      reason: "group-children-missing",
      selectedIds: safeSelectedIds,
      group,
      groupIndex,
      groupChildren,
    };
  }

  if (hasConfiguredLink(group.enlace)) {
    return {
      eligible: false,
      reason: "group-root-link-unsupported",
      selectedIds: safeSelectedIds,
      group,
      groupIndex,
      groupChildren,
    };
  }

  const preparedState = prepareGroupAwareRenderState({
    objetos: safeObjetos,
    secciones: asArray(secciones),
  });
  const contractIssues = asArray(preparedState?.contractIssues).filter(
    (issue) =>
      normalizeText(issue?.objectId) === selectedId &&
      BLOCKING_UNGROUP_CONTRACT_CODES.has(normalizeText(issue?.code))
  );

  if (contractIssues.length > 0) {
    return {
      eligible: false,
      reason: "group-contract-invalid",
      selectedIds: safeSelectedIds,
      group,
      groupIndex,
      groupChildren,
      contractIssues,
    };
  }

  const sectionMetrics = buildSectionMetrics(secciones);
  const targetSection = sectionMetrics.get(normalizeText(group?.seccionId));

  if (!targetSection) {
    return {
      eligible: false,
      reason: "selection-section-missing",
      selectedIds: safeSelectedIds,
      group,
      groupIndex,
      groupChildren,
      contractIssues: [],
    };
  }

  return {
    eligible: true,
    reason: "ready",
    selectedIds: safeSelectedIds,
    group,
    groupIndex,
    groupChildren,
    sectionId: normalizeText(group?.seccionId),
    anchor: normalizeAnchor(group?.anclaje),
    sectionMode: normalizeSectionMode(targetSection.section?.altoModo),
    contractIssues: [],
  };
}

export function buildUngroupedSelectionState({
  objetos,
  secciones,
  selectedIds,
  alturaPantalla = 500,
} = {}) {
  const selection = resolveUngroupSelectionCandidate({
    objetos,
    secciones,
    selectedIds,
  });

  if (!selection.eligible) {
    return {
      ok: false,
      reason: selection.reason,
      selection,
      contractIssues: asArray(selection.contractIssues),
      nextObjetos: asArray(objetos),
    };
  }

  const safeObjetos = asArray(objetos);
  const group = selection.group || null;
  const safeHeight = Math.max(1, toFiniteNumber(alturaPantalla, 500) || 500);
  const groupX = toFiniteNumber(group?.x, 0) || 0;
  const groupLocalY = resolveObjectLocalY(group, safeHeight);

  const restoredChildren = selection.groupChildren.map((child) => {
    const nextChild = {
      ...stripGroupChildRootFields(deepClone(child)),
      seccionId: selection.sectionId,
      anclaje: selection.anchor,
      x: roundMetric(groupX + (toFiniteNumber(child?.x, 0) || 0), 3),
      y: roundMetric(groupLocalY + (toFiniteNumber(child?.y, 0) || 0), 3),
    };

    if (selection.sectionMode === "pantalla") {
      const yNorm = clamp01((toFiniteNumber(nextChild.y, 0) || 0) / safeHeight);
      if (Number.isFinite(yNorm)) {
        nextChild.yNorm = roundMetric(yNorm, 6);
      }
    } else {
      delete nextChild.yNorm;
    }

    return nextChild;
  });

  const nextObjetos = [
    ...safeObjetos.slice(0, selection.groupIndex),
    ...restoredChildren,
    ...safeObjetos.slice(selection.groupIndex + 1),
  ];

  return {
    ok: true,
    reason: "ready",
    selection,
    contractIssues: [],
    nextObjetos,
    restoredChildren,
    selectedIds: normalizeSelectedIds(restoredChildren.map((child) => child?.id)),
  };
}
