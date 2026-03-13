#!/usr/bin/env node
const admin = require("firebase-admin");

const TEMPLATE_COLLECTION = "plantillas";
const TEMPLATE_CATALOG_COLLECTION = "plantillas_catalog";
const TEMPLATE_TAGS_COLLECTION = "plantillas_tags";
const MAX_BATCH_OPS = 400;

function parseArgs(argv) {
  const runApply = argv.includes("--apply");
  const runDryRun = argv.includes("--dry-run");
  return {
    dryRun: runDryRun || !runApply,
  };
}

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function db() {
  ensureApp();
  return admin.firestore();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeSlug(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeTagLabel(value) {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

function chunk(values, size = MAX_BATCH_OPS) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

async function commitBatchWrites(writes, dryRun) {
  if (!writes.length || dryRun) return;
  for (const group of chunk(writes)) {
    const batch = db().batch();
    group.forEach((write) => write(batch));
    await batch.commit();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const templatesSnap = await db().collection(TEMPLATE_COLLECTION).get();
  const catalogSnap = await db().collection(TEMPLATE_CATALOG_COLLECTION).get();

  const templateWrites = [];
  const catalogWrites = [];
  const tagCounts = new Map();
  let templatesUpdated = 0;
  let catalogUpdated = 0;

  templatesSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const hasEditorialState = normalizeText(data.estadoEditorial);
    const tags = Array.isArray(data.tags) ? data.tags : [];

    tags.forEach((entry) => {
      const label = normalizeTagLabel(entry);
      const tagId = sanitizeSlug(label);
      if (!label || !tagId) return;
      const current = tagCounts.get(tagId) || { label, usageCount: 0 };
      tagCounts.set(tagId, {
        label: current.label || label,
        usageCount: Number(current.usageCount || 0) + 1,
      });
    });

    if (hasEditorialState) return;
    templatesUpdated += 1;
    templateWrites.push((batch) => {
      batch.set(
        docSnap.ref,
        {
          estadoEditorial: "publicada",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

  catalogSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (normalizeText(data.estadoEditorial)) return;
    catalogUpdated += 1;
    catalogWrites.push((batch) => {
      batch.set(
        docSnap.ref,
        {
          estadoEditorial: "publicada",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

  const tagWrites = [...tagCounts.entries()].map(([tagId, entry]) => {
    const ref = db().collection(TEMPLATE_TAGS_COLLECTION).doc(tagId);
    return (batch) => {
      batch.set(
        ref,
        {
          slug: tagId,
          label: entry.label,
          usageCount: entry.usageCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    };
  });

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        templatesScanned: templatesSnap.size,
        catalogScanned: catalogSnap.size,
        templatesUpdated,
        catalogUpdated,
        tagDocsUpserted: tagWrites.length,
      },
      null,
      2
    )
  );

  await commitBatchWrites(templateWrites, args.dryRun);
  await commitBatchWrites(catalogWrites, args.dryRun);
  await commitBatchWrites(tagWrites, args.dryRun);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error ejecutando backfill editorial:", error);
    process.exit(1);
  });
