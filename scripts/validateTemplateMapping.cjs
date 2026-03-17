#!/usr/bin/env node
const admin = require("firebase-admin");
const path = require("path");
const { pathToFileURL } = require("url");

const TEMPLATE_COLLECTION = "plantillas";
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app";
const DATE_LIKE_FIELD_TYPES = new Set(["date", "datetime"]);
const TEXTUAL_TARGET_PATHS = new Set(["texto", "text", "title", "label"]);

function normalizeText(value) {
  return String(value || "").trim();
}

async function loadSharedContract() {
  const contractPath = path.resolve(__dirname, "../shared/templates/contract.js");
  const contractUrl = pathToFileURL(contractPath).href;
  const imported = await import(contractUrl);
  const resolved = imported?.default || imported;

  if (typeof resolved?.normalizeTemplateDocument !== "function") {
    throw new Error("Contrato de plantillas invalido: falta normalizeTemplateDocument.");
  }

  return {
    normalizeTemplateDocument: resolved.normalizeTemplateDocument,
  };
}

async function initAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: DEFAULT_BUCKET,
  });
}

function collectEntityIds(list) {
  if (!Array.isArray(list)) return new Set();
  return new Set(
    list
      .map((item) => normalizeText(item?.id))
      .filter(Boolean)
  );
}

function validateFieldMapping(field, context) {
  const safeField = field && typeof field === "object" ? field : {};
  const key = normalizeText(safeField.key) || "campo_sin_key";
  const type = normalizeText(safeField.type).toLowerCase();
  const targets = Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [];
  const objectIds = context?.objectIds instanceof Set ? context.objectIds : new Set();
  const sectionIds = context?.sectionIds instanceof Set ? context.sectionIds : new Set();

  if (!targets.length) {
    return {
      valid: false,
      key,
      reason: "Sin applyTargets",
    };
  }

  for (const target of targets) {
    const safeTarget = target && typeof target === "object" ? target : {};
    const scope = normalizeText(safeTarget.scope).toLowerCase();
    const targetId = normalizeText(safeTarget.id);
    const path = normalizeText(safeTarget.path);
    const transform =
      safeTarget.transform && typeof safeTarget.transform === "object"
        ? safeTarget.transform
        : null;
    const transformKind = normalizeText(transform?.kind).toLowerCase();

    if (!scope || !path) {
      return {
        valid: false,
        key,
        reason: "Target invalido (scope/path)",
      };
    }

    if ((scope === "objeto" || scope === "seccion") && !targetId) {
      return {
        valid: false,
        key,
        reason: "Target invalido (falta id)",
      };
    }

    if (transformKind === "date_to_countdown_iso") {
      if (!DATE_LIKE_FIELD_TYPES.has(type)) {
        return {
          valid: false,
          key,
          reason: "Transform countdown requiere campo date/datetime",
        };
      }

      if (path.toLowerCase() !== "fechaobjetivo") {
        return {
          valid: false,
          key,
          reason: "Transform countdown requiere path fechaObjetivo",
        };
      }
    }

    if (transformKind === "date_to_text") {
      if (!DATE_LIKE_FIELD_TYPES.has(type)) {
        return {
          valid: false,
          key,
          reason: "Transform date_to_text requiere campo date/datetime",
        };
      }

      if (!TEXTUAL_TARGET_PATHS.has(path.toLowerCase())) {
        return {
          valid: false,
          key,
          reason: "Transform date_to_text requiere path textual",
        };
      }
    }

    if (scope === "objeto" && targetId && !objectIds.has(targetId)) {
      return {
        valid: false,
        key,
        reason: `Target objeto inexistente (${targetId})`,
      };
    }

    if (scope === "seccion" && targetId && !sectionIds.has(targetId)) {
      return {
        valid: false,
        key,
        reason: `Target seccion inexistente (${targetId})`,
      };
    }
  }

  return {
    valid: true,
    key,
    reason: "",
  };
}

async function run() {
  await initAdmin();
  const db = admin.firestore();
  const contract = await loadSharedContract();

  const snapshot = await db.collection(TEMPLATE_COLLECTION).get();
  const issues = [];
  let templatesWithSchema = 0;
  let fieldsValidated = 0;

  for (const docSnapshot of snapshot.docs) {
    const templateId = docSnapshot.id;
    const normalized = contract.normalizeTemplateDocument(
      {
        id: templateId,
        ...docSnapshot.data(),
      },
      templateId
    );

    const fields = Array.isArray(normalized.fieldsSchema) ? normalized.fieldsSchema : [];
    if (!fields.length) continue;

    templatesWithSchema += 1;
    const objectIds = collectEntityIds(normalized.objetos);
    const sectionIds = collectEntityIds(normalized.secciones);

    for (const field of fields) {
      fieldsValidated += 1;
      const result = validateFieldMapping(field, { objectIds, sectionIds });
      if (result.valid) continue;

      issues.push({
        templateId,
        templateSlug: normalizeText(normalized.slug) || templateId,
        fieldKey: result.key,
        reason: result.reason,
      });
    }
  }

  const summary = {
    totalTemplates: snapshot.size,
    templatesWithSchema,
    fieldsValidated,
    issues: issues.length,
  };

  console.log("Template mapping validation summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (!issues.length) {
    console.log("OK: no se detectaron campos sin mapping.");
    return;
  }

  console.error("\nCampos con mapping incompleto:");
  issues.forEach((issue) => {
    console.error(
      `- ${issue.templateId} (${issue.templateSlug}) :: ${issue.fieldKey} -> ${issue.reason}`
    );
  });

  process.exitCode = 1;
}

run().catch((error) => {
  console.error("Error en validateTemplateMapping:", error);
  process.exit(1);
});
