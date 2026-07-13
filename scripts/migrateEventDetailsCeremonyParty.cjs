#!/usr/bin/env node
const admin = require("firebase-admin");
const {
  normalizeEventDetailsDocumentContract,
} = require("../shared/eventDetailsMigration.cjs");

const COLLECTIONS = Object.freeze(["plantillas", "borradores"]);
const MAX_BATCH_OPS = 400;

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  return {
    dryRun: !apply,
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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (typeof value.toMillis === "function") {
    return JSON.stringify(value.toMillis());
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function chunk(values, size = MAX_BATCH_OPS) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

async function commitWrites(writes, dryRun) {
  if (dryRun || !writes.length) return;
  for (const group of chunk(writes)) {
    const batch = db().batch();
    group.forEach(({ ref, data }) => {
      batch.set(ref, data);
    });
    await batch.commit();
  }
}

async function collectCollectionWrites(collectionName) {
  const snapshot = await db().collection(collectionName).get();
  const writes = [];

  snapshot.docs.forEach((docSnap) => {
    const current = docSnap.data() || {};
    const normalized = normalizeEventDetailsDocumentContract(current);
    if (stableStringify(current) === stableStringify(normalized)) return;
    writes.push({
      ref: docSnap.ref,
      data: normalized,
    });
  });

  return {
    collectionName,
    scanned: snapshot.size,
    changed: writes.length,
    writes,
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const results = [];

  for (const collectionName of COLLECTIONS) {
    const result = await collectCollectionWrites(collectionName);
    results.push(result);
    await commitWrites(result.writes, dryRun);
  }

  const summary = results.map(({ collectionName, scanned, changed }) => ({
    collectionName,
    scanned,
    changed,
  }));

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
