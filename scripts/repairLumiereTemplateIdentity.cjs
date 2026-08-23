#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const { pathToFileURL } = require("url");

const TEMPLATE_ID = "milano-moderna-tipografica-1785710780763-template-1787252333359";
const TEMPLATE_NAME = "Lumière · Fotográfica elegante";
const DETAILS_SECTION_ID = "seccion-1786574530834";
const SHARED_ADDRESS_ID = "texto-msqoeg6v-2-4pd0";
const CEREMONY_TIME_ID = "texto-msqoeg6v-1-07e3";
const CEREMONY_TITLE_ID = "texto-lumiere-ceremony-title-1787411703";
const CEREMONY_ADDRESS_ID = "texto-lumiere-ceremony-address-1787411703";
const PARTY_TIME_ID = "texto-lumiere-party-start-time-1787411703";

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

function buildTimeObject({ id, texto, x, y }) {
  return {
    id,
    tipo: "texto",
    texto,
    x,
    y,
    seccionId: DETAILS_SECTION_ID,
    anclaje: "content",
    fontFamily: "Montserrat",
    fontSize: 17,
    fontWeight: "bold",
    fontStyle: "normal",
    textDecoration: "none",
    lineHeight: 1.2,
    letterSpacing: 0,
    color: "#111111",
    colorTexto: "#111111",
    fill: "#111111",
    align: "center",
    stroke: null,
    strokeWidth: 0,
    shadowColor: null,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    motionEffect: "none",
    causa: "drag-individual",
  };
}

function assertExpectedTemplateShape(template) {
  if (normalizeText(template.nombre) !== TEMPLATE_NAME) {
    throw new Error("El documento no corresponde a Lumière.");
  }

  const objects = Array.isArray(template.objetos) ? template.objetos : [];
  const fiesta = objects.find(
    (object) =>
      normalizeText(object?.seccionId) === DETAILS_SECTION_ID &&
      normalizeText(object?.texto).toLowerCase() === "fiesta"
  );
  const ceremony = objects.find(
    (object) =>
      normalizeText(object?.seccionId) === DETAILS_SECTION_ID &&
      normalizeText(object?.texto).toLowerCase() === "iglesia"
  );
  const addresses = objects.filter(
    (object) =>
      normalizeText(object?.seccionId) === DETAILS_SECTION_ID &&
      normalizeText(object?.texto) === "Salón Gran Bouvelard\nAv. Corrientes 2134"
  );

  if (!fiesta || !ceremony || addresses.length !== 2) {
    throw new Error("La composición Ceremonia/Fiesta no coincide con la evidencia auditada.");
  }

  return { fiesta, ceremony, addresses };
}

function buildLumiereRepairPlan(template, { validateAuthoringState } = {}) {
  if (typeof validateAuthoringState !== "function") {
    throw new Error("Falta la validación canónica de template authoring.");
  }

  const source = asObject(template);
  const expected = assertExpectedTemplateShape(source);
  const fieldKeys = new Set(
    (Array.isArray(source.fieldsSchema) ? source.fieldsSchema : []).map((field) =>
      normalizeText(field?.key)
    )
  );
  if (
    !fieldKeys.has("event_ceremony_start_time") ||
    !fieldKeys.has("event_party_start_time")
  ) {
    throw new Error("Faltan los campos dinámicos de hora auditados para Lumière.");
  }
  const defaults = { ...asObject(source.templateAuthoringDraft?.defaults) };
  const ceremonyTimeText = normalizeText(defaults.event_ceremony_start_time) || "19:30";
  const partyTimeText = normalizeText(defaults.event_party_start_time) || "19:30";

  let objetos = (Array.isArray(source.objetos) ? source.objetos : []).map((object) => {
    if (object === expected.ceremony) {
      return {
        ...object,
        id: CEREMONY_TITLE_ID,
      };
    }
    if (object === expected.fiesta) {
      return {
        ...object,
        x: 478,
      };
    }
    if (
      normalizeText(object?.id) === SHARED_ADDRESS_ID &&
      Number(object?.x) < 300
    ) {
      return {
        ...object,
        id: CEREMONY_ADDRESS_ID,
      };
    }
    return object;
  });

  if (!objetos.some((object) => normalizeText(object?.id) === CEREMONY_TIME_ID)) {
    objetos.push(
      buildTimeObject({
        id: CEREMONY_TIME_ID,
        texto: ceremonyTimeText,
        x: 196,
        y: 126,
      })
    );
  }
  if (!objetos.some((object) => normalizeText(object?.id) === PARTY_TIME_ID)) {
    objetos.push(
      buildTimeObject({
        id: PARTY_TIME_ID,
        texto: partyTimeText,
        x: 529,
        y: 126,
      })
    );
  }

  let fieldsSchema = replaceTextTarget(
    source.fieldsSchema,
    "event_ceremony_start_time",
    CEREMONY_TIME_ID
  );
  fieldsSchema = replaceTextTarget(
    fieldsSchema,
    "event_party_start_time",
    PARTY_TIME_ID
  );

  const status = validateAuthoringState({
    fieldsSchema,
    defaults,
    objetos,
  });
  if (!status.isReady) {
    throw new Error(`La reparación no valida: ${status.issues.join(" | ")}`);
  }

  const templateAuthoringDraft = {
    ...asObject(source.templateAuthoringDraft),
    fieldsSchema,
    defaults,
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
      duplicateTitleIdsBefore:
        normalizeText(expected.fiesta.id) === normalizeText(expected.ceremony.id),
      duplicateAddressIdsBefore:
        normalizeText(expected.addresses[0].id) === normalizeText(expected.addresses[1].id),
      ceremonyTimeId: CEREMONY_TIME_ID,
      partyTimeId: PARTY_TIME_ID,
      authoringReady: status.isReady,
      issues: status.issues,
    },
  };
}

async function loadAuthoringValidation() {
  const modulePath = path.resolve(
    __dirname,
    "../src/domain/templates/authoring/validation.js"
  );
  return import(pathToFileURL(modulePath).href);
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
  const { validateAuthoringState } = await loadAuthoringValidation();
  const db = admin.firestore();
  const ref = db.collection("plantillas").doc(TEMPLATE_ID);

  if (!apply) {
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("No existe la plantilla Lumière.");
    const plan = buildLumiereRepairPlan(snapshot.data(), { validateAuthoringState });
    console.log(JSON.stringify({ mode: "dry-run", changed: plan.changed, ...plan.summary }, null, 2));
    return;
  }

  let transactionSummary = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("No existe la plantilla Lumière.");
    const plan = buildLumiereRepairPlan(snapshot.data(), { validateAuthoringState });
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
  buildLumiereRepairPlan,
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Error reparando Lumière:", error);
    process.exit(1);
  });
}
