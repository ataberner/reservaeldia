#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    limit: 0,
    out: "",
  };
  argv.forEach((entry) => {
    if (entry.startsWith("--limit=")) {
      const parsed = Number(entry.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.limit = Math.floor(parsed);
    }
    if (entry.startsWith("--out=")) {
      args.out = String(entry.slice("--out=".length) || "").trim();
    }
  });
  return args;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return String(value || "").trim();
}

async function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

async function collectDocs(collectionName, limit) {
  const db = admin.firestore();
  let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId());
  if (limit > 0) {
    query = query.limit(limit);
  }
  const snap = await query.get();
  return snap.docs;
}

function auditDoc(doc) {
  const data = asObject(doc.data());
  const issues = [];

  if (!normalizeString(data.url)) {
    issues.push("missing_url");
  }
  if (!normalizeString(data.storagePath)) {
    issues.push("missing_storage_path");
  }
  if (!normalizeString(data.nombre)) {
    issues.push("missing_nombre");
  }

  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const categorias = Array.isArray(data.categorias) ? data.categorias : [];
  if (!keywords.length) issues.push("missing_keywords");
  if (!categorias.length && !normalizeString(data.categoria)) issues.push("missing_category");

  if (!Number.isFinite(Number(data.priority))) {
    issues.push("missing_priority");
  }
  if (typeof data.popular !== "boolean") {
    issues.push("missing_popular");
  }
  if (!Number.isFinite(Number(data.schemaVersion))) {
    issues.push("missing_schema_version");
  }

  const validation = asObject(data.validation);
  if (!normalizeString(validation.status)) {
    issues.push("missing_validation");
  }
  if (!normalizeString(data.hashSha256)) {
    issues.push("missing_hash");
  }

  return {
    id: doc.id,
    issues,
    status: normalizeString(data.status) || "active",
    format: normalizeString(data.format || data.formato),
    hashSha256: normalizeString(data.hashSha256),
    storagePath: normalizeString(data.storagePath),
    url: normalizeString(data.url),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await initAdmin();

  const [activeDocs, archivedDocs] = await Promise.all([
    collectDocs("iconos", args.limit),
    collectDocs("iconos_archived", args.limit),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      limit: args.limit || null,
    },
    totals: {
      active: activeDocs.length,
      archived: archivedDocs.length,
    },
    active: {
      issuesByCode: {},
      duplicateHashes: {},
      docsWithIssues: [],
    },
    archived: {
      issuesByCode: {},
      duplicateHashes: {},
      docsWithIssues: [],
    },
  };

  function pushAuditResult(bucket, item) {
    if (item.issues.length) {
      bucket.docsWithIssues.push(item);
    }
    item.issues.forEach((issueCode) => {
      bucket.issuesByCode[issueCode] = (bucket.issuesByCode[issueCode] || 0) + 1;
    });
    if (item.hashSha256) {
      bucket.duplicateHashes[item.hashSha256] = (bucket.duplicateHashes[item.hashSha256] || 0) + 1;
    }
  }

  activeDocs.forEach((docItem) => pushAuditResult(report.active, auditDoc(docItem)));
  archivedDocs.forEach((docItem) => pushAuditResult(report.archived, auditDoc(docItem)));

  report.active.duplicateHashes = Object.fromEntries(
    Object.entries(report.active.duplicateHashes).filter(([, count]) => count > 1)
  );
  report.archived.duplicateHashes = Object.fromEntries(
    Object.entries(report.archived.duplicateHashes).filter(([, count]) => count > 1)
  );

  const json = JSON.stringify(report, null, 2);
  console.log(json);

  if (args.out) {
    const target = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(target, json, "utf8");
    console.log(`Reporte guardado en: ${target}`);
  }
}

run().catch((error) => {
  console.error("auditIconCatalogV2 failed:", error);
  process.exit(1);
});

