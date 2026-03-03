#!/usr/bin/env node
const admin = require("firebase-admin");
const path = require("path");
const { pathToFileURL } = require("url");

const TEMPLATE_COLLECTION = "plantillas";
const TEMPLATE_CATALOG_COLLECTION = "plantillas_catalog";
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app";
const MAX_BATCH_OPS = 400;

function parseArgs(argv) {
  const runApply = argv.includes("--apply");
  const runDryRun = argv.includes("--dry-run");
  return {
    dryRun: runDryRun || !runApply,
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pickFirstTemplateByTypes(templates, types) {
  for (const type of types) {
    const found = templates.find((template) => normalizeText(template.tipo) === type);
    if (found) return found;
  }
  return templates[0] || null;
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function buildSeedTemplates(baseTemplates) {
  const baseBoda = pickFirstTemplateByTypes(baseTemplates, ["boda", "general", "cumple"]);
  const baseBautismo = pickFirstTemplateByTypes(baseTemplates, ["bautismo", "boda", "general"]);
  const baseCumple = pickFirstTemplateByTypes(baseTemplates, ["cumple", "boda", "general"]);

  const extractGalleryDefaults = (baseTemplate, maxItems = 12) => {
    const objetos = Array.isArray(baseTemplate?.objetos) ? baseTemplate.objetos : [];
    const galeria = objetos.find((obj) => normalizeText(obj?.tipo).toLowerCase() === "galeria");
    const cells = Array.isArray(galeria?.cells) ? galeria.cells : [];
    return cells
      .map((cell) => normalizeText(cell?.mediaUrl || cell?.url || cell?.src))
      .filter(Boolean)
      .slice(0, Math.max(1, Number(maxItems) || 12));
  };

  const commonPreviewFrom = (baseTemplate) => {
    const preview = asObject(baseTemplate?.preview);
    const previewUrl = normalizeText(preview.previewUrl || baseTemplate?.previewUrl) || null;
    return {
      previewUrl,
      viewportHints: "mobileFirst",
      aspectRatio: "9:16",
      suggestedHeightPx: 860,
    };
  };

  const commonRenderDataFrom = (baseTemplate) => ({
    portada: normalizeText(baseTemplate?.portada) || null,
    editor: normalizeText(baseTemplate?.editor) || "konva",
    objetos: cloneArray(baseTemplate?.objetos),
    secciones: cloneArray(baseTemplate?.secciones),
    ...(baseTemplate?.rsvp ? { rsvp: baseTemplate.rsvp } : {}),
  });

  const bodaTemplate = {
    id: "boda-premium-contrato-v1",
    slug: "boda-premium-contrato-v1",
    nombre: "Boda Premium Contrato",
    tipo: "boda",
    tags: ["boda", "romantica", "premium"],
    badges: ["Top", "Premium"],
    features: ["RSVP", "Galeria", "Countdown", "Regalos", "Ubicacion", "Dresscode"],
    rating: { value: 4.9, count: 128 },
    popularidad: { label: "98% recomendada", score: 98 },
    preview: commonPreviewFrom(baseBoda),
    fieldsSchema: [
      {
        key: "nombres",
        label: "Nombres",
        type: "text",
        group: "Datos principales",
        optional: false,
        validation: { maxLength: 120 },
        updateMode: "input",
        applyTargets: [{ scope: "objeto", id: "titulo-1769460640895", path: "texto", mode: "set" }],
      },
      {
        key: "fechaEvento",
        label: "Fecha del evento",
        type: "date",
        group: "Datos principales",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "horaEvento",
        label: "Hora del evento",
        type: "time",
        group: "Datos principales",
        optional: true,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "ubicacionCeremonia",
        label: "Ubicacion ceremonia",
        type: "location",
        group: "Ubicaciones",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "ubicacionFiesta",
        label: "Ubicacion fiesta",
        type: "location",
        group: "Ubicaciones",
        optional: true,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "obj-1769371806689-0", path: "texto", mode: "replace" }],
      },
      {
        key: "regalosTexto",
        label: "Texto de regalos",
        type: "textarea",
        group: "Regalos",
        optional: true,
        validation: { maxLength: 500 },
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "obj-1769287612566-0", path: "texto", mode: "replace" }],
      },
      {
        key: "dresscode",
        label: "Dresscode",
        type: "text",
        group: "Vestimenta",
        optional: true,
        validation: { maxLength: 120 },
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1753190827820", path: "texto", mode: "replace" }],
      },
      {
        key: "galeriaFotos",
        label: "Galeria de fotos",
        type: "images",
        group: "Galeria",
        optional: true,
        validation: { minItems: 1, maxItems: 12 },
        updateMode: "confirm",
        applyTargets: [{ scope: "objeto", id: "gal-mkx0rogs", path: "cells", mode: "set" }],
      },
    ],
    defaults: {
      nombres: "Ema y Fran",
      fechaEvento: "23 de Noviembre",
      horaEvento: "19:00 hs.",
      ubicacionCeremonia: "Iglesia Nuestra Señora del Carmen\nVilla Allende, Córdoba.",
      ubicacionFiesta: "Rincón Calina.\nUnquillo Córdoba",
      regalosTexto: "Si deseás realizarnos un regalo podés colaborar\ncon nuestra Luna de Miel...",
      dresscode: "Vestimenta formal, elegante",
      galeriaFotos: extractGalleryDefaults(baseBoda, 12),
    },
    galleryRules: {
      maxImages: 12,
      recommendedRatio: "4:5",
      recommendedSizeText: "Ideal 4:5, minimo 2048px",
      maxFileSizeMB: 8,
    },
    ...commonRenderDataFrom(baseBoda),
  };

  const bautismoTemplate = {
    id: "bautismo-clasico-contrato-v1",
    slug: "bautismo-clasico-contrato-v1",
    nombre: "Bautismo Clasico Contrato",
    tipo: "bautismo",
    tags: ["bautismo", "clasico"],
    badges: ["Nuevo"],
    features: ["Ubicacion", "RSVP"],
    rating: { value: 4.7, count: 42 },
    popularidad: { label: "92% recomendada", score: 92 },
    preview: commonPreviewFrom(baseBautismo),
    fieldsSchema: [
      {
        key: "nombres",
        label: "Nombre principal",
        type: "text",
        group: "Datos principales",
        optional: false,
        validation: { maxLength: 120 },
        updateMode: "input",
        applyTargets: [{ scope: "objeto", id: "titulo-1769460640895", path: "texto", mode: "set" }],
      },
      {
        key: "fechaEvento",
        label: "Fecha",
        type: "date",
        group: "Datos principales",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "horaEvento",
        label: "Hora",
        type: "time",
        group: "Datos principales",
        optional: true,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "ubicacionCeremonia",
        label: "Ubicacion",
        type: "location",
        group: "Ubicaciones",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "mensajeFamilia",
        label: "Mensaje de familia",
        type: "textarea",
        group: "Datos principales",
        optional: true,
        validation: { maxLength: 350 },
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "titulo-1770660627552", path: "texto", mode: "set" }],
      },
    ],
    defaults: {
      nombres: "Bautismo de Sofía",
      fechaEvento: "23 de Noviembre",
      horaEvento: "19:00 hs.",
      ubicacionCeremonia: "Iglesia Nuestra Señora del Carmen\nVilla Allende, Córdoba.",
      mensajeFamilia: "Bienvenidos a nuestra boda",
    },
    ...commonRenderDataFrom(baseBautismo),
  };

  const cumpleTemplate = {
    id: "cumple-color-contrato-v1",
    slug: "cumple-color-contrato-v1",
    nombre: "Cumple Color Contrato",
    tipo: "cumple",
    tags: ["cumple", "fiesta", "color"],
    badges: ["Top"],
    features: ["Galeria", "Ubicacion", "Countdown"],
    rating: { value: 4.8, count: 66 },
    popularidad: { label: "95% recomendada", score: 95 },
    preview: commonPreviewFrom(baseCumple),
    fieldsSchema: [
      {
        key: "nombres",
        label: "Nombre",
        type: "text",
        group: "Datos principales",
        optional: false,
        validation: { maxLength: 120 },
        updateMode: "input",
        applyTargets: [{ scope: "objeto", id: "titulo-1769460640895", path: "texto", mode: "set" }],
      },
      {
        key: "fechaEvento",
        label: "Fecha",
        type: "date",
        group: "Datos principales",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "horaEvento",
        label: "Hora",
        type: "time",
        group: "Datos principales",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1751493023855", path: "texto", mode: "replace" }],
      },
      {
        key: "ubicacionFiesta",
        label: "Ubicacion de la fiesta",
        type: "location",
        group: "Ubicaciones",
        optional: false,
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "obj-1769371806689-0", path: "texto", mode: "replace" }],
      },
      {
        key: "dresscode",
        label: "Dresscode",
        type: "text",
        group: "Vestimenta",
        optional: true,
        validation: { maxLength: 120 },
        updateMode: "blur",
        applyTargets: [{ scope: "objeto", id: "texto-1753190827820", path: "texto", mode: "replace" }],
      },
      {
        key: "galeriaFotos",
        label: "Galeria de fotos",
        type: "images",
        group: "Galeria",
        optional: true,
        validation: { minItems: 1, maxItems: 8 },
        updateMode: "confirm",
        applyTargets: [{ scope: "objeto", id: "gal-mkx0rogs", path: "cells", mode: "set" }],
      },
    ],
    defaults: {
      nombres: "Cumple de Martina",
      fechaEvento: "23 de Noviembre",
      horaEvento: "19:00 hs.",
      ubicacionFiesta: "Rincón Calina.\nUnquillo Córdoba",
      dresscode: "Vestimenta formal, elegante",
      galeriaFotos: extractGalleryDefaults(baseCumple, 8),
    },
    galleryRules: {
      maxImages: 8,
      recommendedRatio: "1:1",
      recommendedSizeText: "Ideal 1:1, minimo 1600px",
      maxFileSizeMB: 6,
    },
    ...commonRenderDataFrom(baseCumple),
  };

  return [bodaTemplate, bautismoTemplate, cumpleTemplate];
}

async function loadSharedContract() {
  const contractPath = path.resolve(__dirname, "../shared/templates/contract.js");
  const contractUrl = pathToFileURL(contractPath).href;
  const imported = await import(contractUrl);
  const resolved = imported?.default || imported;

  if (
    typeof resolved?.normalizeTemplateDocument !== "function" ||
    typeof resolved?.buildCatalogFromTemplate !== "function"
  ) {
    throw new Error("Contrato de plantillas invalido: faltan funciones requeridas.");
  }

  return {
    normalizeTemplateDocument: resolved.normalizeTemplateDocument,
    buildCatalogFromTemplate: resolved.buildCatalogFromTemplate,
  };
}

async function initAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: DEFAULT_BUCKET,
  });
}

async function commitTemplateWrites(db, writes, { dryRun }) {
  if (dryRun) return;

  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const [templateId, payload] of writes.entries()) {
    const updatedAt = admin.firestore.FieldValue.serverTimestamp();

    batch.set(
      db.collection(TEMPLATE_COLLECTION).doc(templateId),
      { ...payload.full, updatedAt },
      { merge: false }
    );
    ops += 1;

    batch.set(
      db.collection(TEMPLATE_CATALOG_COLLECTION).doc(templateId),
      { ...payload.catalog, updatedAt },
      { merge: false }
    );
    ops += 1;

    if (ops >= MAX_BATCH_OPS) {
      await flush();
    }
  }

  await flush();
}

async function run() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  await initAdmin();

  const db = admin.firestore();
  const contract = await loadSharedContract();

  const existingSnapshot = await db.collection(TEMPLATE_COLLECTION).get();
  const writesById = new Map();
  const existingTemplatesNormalized = [];

  for (const docSnapshot of existingSnapshot.docs) {
    const templateId = docSnapshot.id;
    const raw = {
      id: templateId,
      ...docSnapshot.data(),
    };
    const normalizedFull = contract.normalizeTemplateDocument(raw, templateId);
    const normalizedCatalog = contract.buildCatalogFromTemplate(normalizedFull);

    writesById.set(templateId, {
      source: "backfill",
      full: normalizedFull,
      catalog: normalizedCatalog,
    });
    existingTemplatesNormalized.push(normalizedFull);
  }

  const seededTemplates = buildSeedTemplates(existingTemplatesNormalized);
  for (const seededTemplate of seededTemplates) {
    const templateId = normalizeText(seededTemplate.id);
    const normalizedFull = contract.normalizeTemplateDocument(seededTemplate, templateId);
    const normalizedCatalog = contract.buildCatalogFromTemplate(normalizedFull);

    writesById.set(templateId, {
      source: "seed",
      full: normalizedFull,
      catalog: normalizedCatalog,
    });
  }

  const totals = {
    existingTemplates: existingSnapshot.size,
    seedTemplates: seededTemplates.length,
    totalTemplatesToWrite: writesById.size,
    totalWriteOps: writesById.size * 2,
    dryRun,
  };

  console.log("Template contract seed/backfill summary:");
  console.log(JSON.stringify(totals, null, 2));

  if (dryRun) {
    const seededIds = seededTemplates.map((template) => template.id);
    console.log(`Seed templates (dry-run): ${seededIds.join(", ")}`);
    return;
  }

  await commitTemplateWrites(db, writesById, { dryRun });
  console.log("Seed/backfill completado correctamente.");
}

run().catch((error) => {
  console.error("Error en seedTemplateContracts:", error);
  process.exit(1);
});
