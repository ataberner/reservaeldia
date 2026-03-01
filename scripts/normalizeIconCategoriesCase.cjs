#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    dryRun: true,
    includeArchived: !argv.includes("--no-archived"),
    limit: 0,
    batchSize: 200,
    sampleSize: 40,
    out: "",
  };

  if (argv.includes("--apply")) {
    args.dryRun = false;
  }
  if (argv.includes("--dry-run")) {
    args.dryRun = true;
  }

  for (const entry of argv) {
    if (entry.startsWith("--limit=")) {
      const parsed = Number(entry.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.limit = Math.floor(parsed);
    }
    if (entry.startsWith("--batch-size=")) {
      const parsed = Number(entry.slice("--batch-size=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.batchSize = Math.floor(parsed);
    }
    if (entry.startsWith("--sample-size=")) {
      const parsed = Number(entry.slice("--sample-size=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.sampleSize = Math.floor(parsed);
    }
    if (entry.startsWith("--out=")) {
      args.out = String(entry.slice("--out=".length) || "").trim();
    }
  }

  args.batchSize = Math.max(1, Math.min(450, args.batchSize));
  return args;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCategoryLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toRawCategoryList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  return [];
}

function toNormalizedCategoryList(value) {
  const out = [];
  const seen = new Set();
  for (const raw of toRawCategoryList(value)) {
    const normalized = normalizeCategoryLabel(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function buildNextCategories(data) {
  return toNormalizedCategoryList([
    ...toRawCategoryList(data.categoria),
    ...toRawCategoryList(data.categorias),
  ]);
}

function arraysEqualStrict(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (String(left[index]) !== String(right[index])) return false;
  }
  return true;
}

function buildPatch(data) {
  const nextCategories = buildNextCategories(data);
  const nextPrimary = nextCategories[0] || "";

  const currentCategoria =
    typeof data.categoria === "string" ? normalizeString(data.categoria) : "";
  const currentCategorias = Array.isArray(data.categorias)
    ? data.categorias.map((entry) => normalizeString(entry))
    : [];

  const changed =
    currentCategoria !== nextPrimary ||
    !arraysEqualStrict(currentCategorias, nextCategories);

  return {
    changed,
    nextPrimary,
    nextCategories,
    patch: changed
      ? {
          categoria: nextPrimary,
          categorias: nextCategories,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
          audit: {
            ...asObject(data.audit),
            updatedByUid: "script:normalizeIconCategoriesCase",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }
      : null,
  };
}

async function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

async function scanCollection(db, collectionName, args) {
  let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId());
  if (args.limit > 0) {
    query = query.limit(args.limit);
  }
  const snap = await query.get();

  const report = {
    collection: collectionName,
    scanned: snap.size,
    changed: 0,
    unchanged: 0,
    writes: 0,
    samples: [],
  };

  let batch = db.batch();
  let pendingWrites = 0;

  const flush = async () => {
    if (pendingWrites === 0) return;
    if (!args.dryRun) {
      await batch.commit();
    }
    report.writes += pendingWrites;
    batch = db.batch();
    pendingWrites = 0;
  };

  for (const docItem of snap.docs) {
    const data = asObject(docItem.data());
    const result = buildPatch(data);

    if (!result.changed) {
      report.unchanged += 1;
      continue;
    }

    report.changed += 1;
    if (report.samples.length < args.sampleSize) {
      report.samples.push({
        id: docItem.id,
        before: {
          categoria: typeof data.categoria === "string" ? data.categoria : "",
          categorias: Array.isArray(data.categorias) ? data.categorias : [],
        },
        after: {
          categoria: result.nextPrimary,
          categorias: result.nextCategories,
        },
      });
    }

    if (!args.dryRun && result.patch) {
      batch.set(docItem.ref, result.patch, { merge: true });
      pendingWrites += 1;
      if (pendingWrites >= args.batchSize) {
        await flush();
      }
    }
  }

  await flush();
  return report;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await initAdmin();

  const db = admin.firestore();
  const collections = ["iconos", ...(args.includeArchived ? ["iconos_archived"] : [])];

  const reports = [];
  for (const collectionName of collections) {
    const report = await scanCollection(db, collectionName, args);
    reports.push(report);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    includeArchived: args.includeArchived,
    limit: args.limit || null,
    batchSize: args.batchSize,
    totals: reports.reduce(
      (acc, report) => ({
        scanned: acc.scanned + report.scanned,
        changed: acc.changed + report.changed,
        unchanged: acc.unchanged + report.unchanged,
        writes: acc.writes + report.writes,
      }),
      { scanned: 0, changed: 0, unchanged: 0, writes: 0 }
    ),
    collections: reports,
  };

  const json = JSON.stringify(summary, null, 2);
  console.log(json);

  if (args.out) {
    const outputPath = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(outputPath, json, "utf8");
    console.log(`Reporte guardado en: ${outputPath}`);
  }
}

run().catch((error) => {
  console.error("normalizeIconCategoriesCase failed:", error);
  process.exit(1);
});
