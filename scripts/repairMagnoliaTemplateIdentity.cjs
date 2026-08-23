#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const { pathToFileURL } = require("url");

const TEMPLATE_ID = "eterno-fotografica-natural-1785377814714-template-1787237663252";
const TEMPLATE_NAME = "Magnolia · Botánica elegante";
const DETAILS_SECTION_ID = "seccion-1775407672285";

const OBJECT_PAIRS = [
  {
    sourceId: "texto-ms70lmrs-0-lek7",
    rightId: "texto-magnolia-party-title-repair-v1",
    leftText: "Ceremonia",
    rightText: "Celebración",
  },
  {
    sourceId: "texto-ms70lmrs-1-ylbw",
    rightId: "texto-magnolia-party-start-time-repair-v1",
    leftFieldKey: "event_ceremony_start_time",
    rightFieldKey: "event_party_start_time",
    leftOriginalText: "18.00 hs",
    rightOriginalText: "20.00 hs",
  },
  {
    sourceId: "texto-ms70lmrs-2-4i8p",
    rightId: "texto-magnolia-party-venue-name-repair-v1",
    leftFieldKey: "event_ceremony_venue_name",
    rightFieldKey: "event_party_venue_name",
    leftOriginalText: "Basilica Buenos Aires",
    rightOriginalText: "Salón Cid Campeador",
  },
  {
    sourceId: "texto-ms70lmrs-3-q01k",
    rightId: "texto-magnolia-party-venue-address-repair-v1",
    leftFieldKey: "event_ceremony_venue_address",
    rightFieldKey: "event_party_venue_address",
    leftOriginalText: "Av. Gaona 3434",
    rightOriginalText: "Av. San Martín 4534",
  },
];

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneArray(value) {
  return Array.isArray(value) ? value.map((entry) => ({ ...asObject(entry) })) : [];
}

function areEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function replaceTextTarget(fieldsSchema, fieldKey, targetId) {
  return cloneArray(fieldsSchema).map((field) => {
    if (normalizeText(field.key) !== fieldKey) return field;

    const nonTextTargets = (Array.isArray(field.applyTargets) ? field.applyTargets : [])
      .filter(
        (target) =>
          normalizeText(target?.scope).toLowerCase() !== "objeto" ||
          normalizeText(target?.path).toLowerCase() !== "texto"
      )
      .map((target) => ({ ...asObject(target) }));
    return {
      ...field,
      applyTargets: [
        ...nonTextTargets,
        {
          scope: "objeto",
          id: targetId,
          path: "texto",
          mode: "set",
        },
      ],
    };
  });
}

function resolvePair(objects, pair, defaults) {
  const candidates = objects
    .filter(
      (object) =>
        normalizeText(object?.seccionId) === DETAILS_SECTION_ID &&
        [pair.sourceId, pair.rightId].includes(normalizeText(object?.id))
    )
    .sort((left, right) => Number(left?.x) - Number(right?.x));

  if (candidates.length !== 2) {
    throw new Error(`El par '${pair.sourceId}' no coincide con la composición auditada.`);
  }

  const [left, right] = candidates;
  if (!(Number(left?.x) < 350 && Number(right?.x) > 400)) {
    throw new Error(`Las columnas de '${pair.sourceId}' no coinciden con la portada auditada.`);
  }
  if (normalizeText(left?.tipo).toLowerCase() !== "texto" || normalizeText(right?.tipo).toLowerCase() !== "texto") {
    throw new Error(`El par '${pair.sourceId}' dejó de ser textual.`);
  }

  const allowedLeftText = new Set(
    [pair.leftText, pair.leftOriginalText, defaults[pair.leftFieldKey]]
      .map(normalizeText)
      .filter(Boolean)
  );
  const allowedRightText = new Set(
    [pair.rightText, pair.rightOriginalText, defaults[pair.rightFieldKey]]
      .map(normalizeText)
      .filter(Boolean)
  );
  if (!allowedLeftText.has(normalizeText(left?.texto)) || !allowedRightText.has(normalizeText(right?.texto))) {
    throw new Error(`Los textos de '${pair.sourceId}' no coinciden con la evidencia auditada.`);
  }

  return { left, right };
}

function assertExpectedTemplateShape(template) {
  if (normalizeText(template.nombre) !== TEMPLATE_NAME) {
    throw new Error("El documento no corresponde a Magnolia.");
  }
  if (normalizeText(template?.eventDetails?.mode) !== "ceremony_party") {
    throw new Error("Magnolia ya no usa el modo Ceremonia + Fiesta auditado.");
  }

  const objects = Array.isArray(template.objetos) ? template.objetos : [];
  const defaults = asObject(template.templateAuthoringDraft?.defaults);
  const resolvedPairs = OBJECT_PAIRS.map((pair) => ({
    pair,
    ...resolvePair(objects, pair, defaults),
  }));

  const fieldsByKey = new Map(
    cloneArray(template.fieldsSchema).map((field) => [normalizeText(field?.key), field])
  );
  OBJECT_PAIRS.flatMap((pair) => [pair.leftFieldKey, pair.rightFieldKey])
    .filter(Boolean)
    .forEach((fieldKey) => {
      const field = fieldsByKey.get(fieldKey);
      if (!field || !normalizeText(field.eventDetailsRole)) {
        throw new Error(`Falta el campo dinámico explícito '${fieldKey}'.`);
      }
    });

  return { defaults, resolvedPairs };
}

function applyFieldValue({
  fieldsSchema,
  fieldKey,
  defaults,
  objetos,
  secciones,
  buildTemplateAuthoringTargetPatches,
  updateRenderObjectById,
}) {
  const field = fieldsSchema.find((entry) => normalizeText(entry?.key) === fieldKey);
  if (!field) throw new Error(`No existe el campo '${fieldKey}'.`);

  let nextObjects = objetos;
  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: defaults[fieldKey],
    objetos: nextObjects,
    secciones,
  });
  patches.forEach(({ objectId, patch }) => {
    const mutation = updateRenderObjectById(nextObjects, objectId, (object) => ({
      ...object,
      ...patch,
    }));
    if (!mutation.changed) {
      throw new Error(`No se pudo aplicar el target '${fieldKey}' a '${objectId}'.`);
    }
    nextObjects = mutation.objetos;
  });
  return nextObjects;
}

function buildMagnoliaRepairPlan(
  template,
  {
    validateAuthoringState,
    buildTemplateAuthoringTargetPatches,
    updateRenderObjectById,
    collectDuplicateRenderObjectIds,
  } = {}
) {
  if (
    typeof validateAuthoringState !== "function" ||
    typeof buildTemplateAuthoringTargetPatches !== "function" ||
    typeof updateRenderObjectById !== "function" ||
    typeof collectDuplicateRenderObjectIds !== "function"
  ) {
    throw new Error("Faltan autoridades canónicas para planificar la reparación.");
  }

  const source = asObject(template);
  const expected = assertExpectedTemplateShape(source);
  const rightIdentityByObject = new Map(
    expected.resolvedPairs.map(({ pair, right }) => [right, pair.rightId])
  );

  let objetos = (Array.isArray(source.objetos) ? source.objetos : []).map((object) => {
    const rightId = rightIdentityByObject.get(object);
    return rightId && normalizeText(object?.id) !== rightId
      ? { ...object, id: rightId }
      : object;
  });

  let fieldsSchema = cloneArray(source.fieldsSchema);
  expected.resolvedPairs.forEach(({ pair, left }) => {
    if (!pair.leftFieldKey) return;
    fieldsSchema = replaceTextTarget(fieldsSchema, pair.leftFieldKey, normalizeText(left.id));
    fieldsSchema = replaceTextTarget(fieldsSchema, pair.rightFieldKey, pair.rightId);
  });

  const linkedFieldKeys = OBJECT_PAIRS.flatMap((pair) => [
    pair.leftFieldKey,
    pair.rightFieldKey,
  ]).filter(Boolean);
  linkedFieldKeys.forEach((fieldKey) => {
    objetos = applyFieldValue({
      fieldsSchema,
      fieldKey,
      defaults: expected.defaults,
      objetos,
      secciones: source.secciones,
      buildTemplateAuthoringTargetPatches,
      updateRenderObjectById,
    });
  });

  const duplicateIds = Array.from(collectDuplicateRenderObjectIds(objetos));
  if (duplicateIds.length > 0) {
    throw new Error(`La reparación conserva ids duplicados: ${duplicateIds.join(", ")}`);
  }

  const status = validateAuthoringState({
    fieldsSchema,
    defaults: expected.defaults,
    objetos,
  });
  if (!status.isReady) {
    throw new Error(`La reparación no valida: ${status.issues.join(" | ")}`);
  }

  const templateAuthoringDraft = {
    ...asObject(source.templateAuthoringDraft),
    fieldsSchema,
    defaults: expected.defaults,
    status,
  };
  const changed =
    !areEqual(objetos, source.objetos) ||
    !areEqual(fieldsSchema, source.fieldsSchema) ||
    !areEqual(templateAuthoringDraft, source.templateAuthoringDraft);

  return {
    changed,
    objetos,
    fieldsSchema,
    templateAuthoringDraft,
    summary: {
      templateId: TEMPLATE_ID,
      repairedIdentityPairs: OBJECT_PAIRS.length,
      linkedFieldKeys,
      duplicateIdsAfter: duplicateIds,
      authoringReady: status.isReady,
      issues: status.issues,
    },
  };
}

async function loadCanonicalOwners() {
  const validationPath = path.resolve(
    __dirname,
    "../src/domain/templates/authoring/validation.js"
  );
  const targetApplicationPath = path.resolve(
    __dirname,
    "../src/domain/templates/authoring/targetApplication.js"
  );
  const renderTreePath = path.resolve(
    __dirname,
    "../src/domain/editor/renderObjectTree.js"
  );
  const [validation, targetApplication, renderTree] = await Promise.all([
    import(pathToFileURL(validationPath).href),
    import(pathToFileURL(targetApplicationPath).href),
    import(pathToFileURL(renderTreePath).href),
  ]);
  return {
    validateAuthoringState: validation.validateAuthoringState,
    buildTemplateAuthoringTargetPatches:
      targetApplication.buildTemplateAuthoringTargetPatches,
    updateRenderObjectById: renderTree.updateRenderObjectById,
    collectDuplicateRenderObjectIds: renderTree.collectDuplicateRenderObjectIds,
  };
}

async function initAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "reservaeldia-7a440",
  });
}

async function run() {
  const apply = process.argv.includes("--apply");
  await initAdmin();
  const canonicalOwners = await loadCanonicalOwners();
  const db = admin.firestore();
  const ref = db.collection("plantillas").doc(TEMPLATE_ID);

  if (!apply) {
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("No existe la plantilla Magnolia.");
    const plan = buildMagnoliaRepairPlan(snapshot.data(), canonicalOwners);
    console.log(JSON.stringify({ mode: "dry-run", changed: plan.changed, ...plan.summary }, null, 2));
    return;
  }

  let transactionSummary = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("No existe la plantilla Magnolia.");
    const plan = buildMagnoliaRepairPlan(snapshot.data(), canonicalOwners);
    transactionSummary = { mode: "apply", changed: plan.changed, ...plan.summary };
    if (!plan.changed) return;

    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(ref, {
      objetos: plan.objetos,
      fieldsSchema: plan.fieldsSchema,
      templateAuthoringDraft: {
        ...plan.templateAuthoringDraft,
        updatedAt: serverTimestamp,
      },
      updatedAt: serverTimestamp,
      actualizadoEn: serverTimestamp,
    });
  });

  console.log(JSON.stringify(transactionSummary, null, 2));
}

module.exports = {
  buildMagnoliaRepairPlan,
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Error reparando Magnolia:", error);
    process.exit(1);
  });
}
