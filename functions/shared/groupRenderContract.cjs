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

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    next[key] = deepClone(nestedValue);
  });
  return next;
}

function toFiniteNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAnchor(value) {
  return normalizeLowerText(value) === "fullbleed" ? "fullbleed" : "content";
}

function normalizeSectionMode(value) {
  return normalizeLowerText(value) === "pantalla" ? "pantalla" : "fijo";
}

function createContractIssue({
  severity = "blocking",
  code,
  message,
  objectId = null,
  sectionId = null,
  fieldPath = null,
}) {
  return {
    severity,
    code,
    message,
    objectId,
    sectionId,
    fieldPath,
  };
}

function buildSectionLookup(secciones) {
  const lookup = new Map();
  (Array.isArray(secciones) ? secciones : []).forEach((section) => {
    const safeSection = asObject(section);
    const sectionId = normalizeText(safeSection.id);
    if (!sectionId || lookup.has(sectionId)) return;
    lookup.set(sectionId, safeSection);
  });
  return lookup;
}

function createPreparedSectionRecord(section) {
  const safeSection = asObject(section);
  return {
    id: normalizeText(safeSection.id),
    orden: toFiniteNumberOrNull(safeSection.orden),
    sectionMode: normalizeSectionMode(safeSection.altoModo),
    payload: deepClone(safeSection),
  };
}

function createPreparedFlatObjectUnit(object, sectionLookup) {
  const safeObject = asObject(object);
  const sectionId = normalizeText(safeObject.seccionId);
  const section = sectionLookup.get(sectionId) || null;

  return {
    kind: "object",
    id: normalizeText(safeObject.id),
    tipo: normalizeText(safeObject.tipo),
    seccionId: sectionId,
    sectionMode: normalizeSectionMode(section?.altoModo),
    anchor: normalizeAnchor(safeObject.anclaje),
    payload: deepClone(safeObject),
  };
}

function createPreparedGroupUnit(group, sectionLookup) {
  const safeGroup = asObject(group);
  const sectionId = normalizeText(safeGroup.seccionId);
  const section = sectionLookup.get(sectionId) || null;
  const children = Array.isArray(safeGroup.children) ? safeGroup.children : [];

  return {
    kind: "group",
    id: normalizeText(safeGroup.id),
    tipo: "grupo",
    seccionId: sectionId,
    sectionMode: normalizeSectionMode(section?.altoModo),
    anchor: normalizeAnchor(safeGroup.anclaje),
    frame: {
      x: toFiniteNumberOrNull(safeGroup.x),
      y: toFiniteNumberOrNull(safeGroup.y),
      yNorm: toFiniteNumberOrNull(safeGroup.yNorm),
      width: toFiniteNumberOrNull(safeGroup.width),
      height: toFiniteNumberOrNull(safeGroup.height),
    },
    payload: deepClone(safeGroup),
    children: children.map((child) => {
      const safeChild = asObject(child);
      return {
        id: normalizeText(safeChild.id),
        tipo: normalizeText(safeChild.tipo),
        x: toFiniteNumberOrNull(safeChild.x),
        y: toFiniteNumberOrNull(safeChild.y),
        payload: deepClone(safeChild),
      };
    }),
  };
}

function prepareGroupAwareRenderState(value) {
  const safeValue = asObject(value);
  const safeSecciones = Array.isArray(safeValue.secciones)
    ? safeValue.secciones.map((section) => deepClone(section))
    : [];
  const safeObjetos = Array.isArray(safeValue.objetos)
    ? safeValue.objetos.map((object) => deepClone(object))
    : [];
  const sectionLookup = buildSectionLookup(safeSecciones);
  const issueKeys = new Set();
  const contractIssues = [];

  const pushIssue = (issue) => {
    const issueKey = [
      issue.severity,
      issue.code,
      issue.objectId || "",
      issue.sectionId || "",
      issue.fieldPath || "",
      issue.message,
    ].join("|");

    if (issueKeys.has(issueKey)) return;
    issueKeys.add(issueKey);
    contractIssues.push(issue);
  };

  const objetos = safeObjetos.map((object) => {
    const safeObject = asObject(object);
    if (normalizeLowerText(safeObject.tipo) !== "grupo") {
      return safeObject;
    }

    const groupId = normalizeText(safeObject.id) || null;
    const sectionId = normalizeText(safeObject.seccionId) || null;
    const children = Array.isArray(safeObject.children) ? safeObject.children : [];
    const normalizedGroup = {
      ...safeObject,
      anclaje: normalizeAnchor(safeObject.anclaje),
      children: children.map((child) => deepClone(child)),
    };

    if (!sectionId || !sectionLookup.has(sectionId)) {
      pushIssue(
        createContractIssue({
          code: "group-section-reference-missing",
          message: `El grupo "${groupId || "sin-id"}" no tiene una seccion valida para el contrato compartido.`,
          objectId: groupId,
          sectionId,
          fieldPath: "seccionId",
        })
      );
    }

    if (!children.length) {
      pushIssue(
        createContractIssue({
          code: "group-children-missing",
          message: `El grupo "${groupId || "sin-id"}" necesita children[] para preservar la composicion.`,
          objectId: groupId,
          sectionId,
          fieldPath: "children",
        })
      );
    }

    children.forEach((child, childIndex) => {
      const safeChild = asObject(child);
      const childPath = `children[${childIndex}]`;

      if (normalizeLowerText(safeChild.tipo) === "grupo") {
        pushIssue(
          createContractIssue({
            code: "group-nested-unsupported",
            message: `El grupo "${groupId || "sin-id"}" contiene un grupo anidado, y los grupos anidados no estan soportados en v1.`,
            objectId: groupId,
            sectionId,
            fieldPath: childPath,
          })
        );
      }

      if (Object.prototype.hasOwnProperty.call(safeChild, "anclaje")) {
        pushIssue(
          createContractIssue({
            code: "group-child-anchor-forbidden",
            message: `El grupo "${groupId || "sin-id"}" tiene un child con anclaje propio. El anclaje pertenece solo al grupo.`,
            objectId: groupId,
            sectionId,
            fieldPath: `${childPath}.anclaje`,
          })
        );
      }

      if (Object.prototype.hasOwnProperty.call(safeChild, "seccionId")) {
        pushIssue(
          createContractIssue({
            code: "group-child-section-forbidden",
            message: `El grupo "${groupId || "sin-id"}" tiene un child con seccionId propio. La seccion pertenece solo al grupo.`,
            objectId: groupId,
            sectionId,
            fieldPath: `${childPath}.seccionId`,
          })
        );
      }

      if (Object.prototype.hasOwnProperty.call(safeChild, "yNorm")) {
        pushIssue(
          createContractIssue({
            code: "group-child-ynorm-forbidden",
            message: `El grupo "${groupId || "sin-id"}" tiene un child con yNorm propio. yNorm pertenece solo al grupo en secciones pantalla.`,
            objectId: groupId,
            sectionId,
            fieldPath: `${childPath}.yNorm`,
          })
        );
      }
    });

    return normalizedGroup;
  });

  const preparedRenderContract = {
    contractVersion: 1,
    secciones: safeSecciones.map((section) => createPreparedSectionRecord(section)),
    objectUnits: objetos.map((object) => {
      const safeObject = asObject(object);
      if (normalizeLowerText(safeObject.tipo) === "grupo") {
        return createPreparedGroupUnit(safeObject, sectionLookup);
      }

      return createPreparedFlatObjectUnit(safeObject, sectionLookup);
    }),
  };

  const hasGroups = preparedRenderContract.objectUnits.some(
    (unit) => unit.kind === "group"
  );
  const reasonCodes = [];

  if (hasGroups) {
    reasonCodes.push("group-render-runtime-deferred");
  }

  contractIssues.forEach((issue) => {
    if (!reasonCodes.includes(issue.code)) {
      reasonCodes.push(issue.code);
    }
  });

  return {
    objetos,
    secciones: safeSecciones,
    preparedRenderContract,
    contractIssues,
    runtimeSupport: {
      canRenderCurrentHtmlRuntime: !hasGroups,
      reasonCodes,
    },
  };
}

module.exports = {
  createContractIssue,
  prepareGroupAwareRenderState,
};
